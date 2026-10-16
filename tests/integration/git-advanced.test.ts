import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { getStatus, resolveRepo } from '../../src/main/git/repo'
import * as branches from '../../src/main/git/branches'
import * as ops from '../../src/main/git/ops'
import * as conflicts from '../../src/main/git/conflicts'
import * as extras from '../../src/main/git/extras'
import { cancelOp, git } from '../../src/main/git/runner'
import { parseConflicts, resolveSegments } from '../../src/shared/conflict'
import { cleanup, newRepo, openCtx, sh, tempDir, write } from './helpers'

afterAll(cleanup)

const fileUrl = (p: string): string => `file://${p.replace(/\\/g, '/')}`
const noop = (): void => undefined

async function withRemote(): Promise<{
  a: Awaited<ReturnType<typeof newRepo>>
  bare: string
  b: Awaited<ReturnType<typeof newRepo>>
}> {
  const a = await newRepo({ 'f.txt': 'base\n' })
  const bare = tempDir('remote')
  sh(bare, 'init', '--bare', '-q')
  await branches.addRemote(a, 'origin', bare)
  await branches.push(
    a,
    {
      repo: a.root,
      remote: 'origin',
      branch: 'main',
      setUpstream: true,
      forceWithLease: false,
      tags: false,
      opId: 'p1'
    },
    noop
  )
  const dir = tempDir('clone')
  sh(dir, 'clone', '-q', bare, 'b')
  const b = await openCtx(join(dir, 'b'))
  return { a, bare, b }
}

describe('remotes', () => {
  it('pushes, fetches and pulls against a local bare remote with upstream tracking', async () => {
    const { a, b } = await withRemote()
    const sa = await getStatus(a)
    expect(sa.head.upstream).toBe('origin/main')
    write(b.root, 'g.txt', 'from b\n')
    sh(b.root, 'add', '.')
    sh(b.root, 'commit', '-qm', 'from b')
    await branches.push(
      b,
      {
        repo: b.root,
        remote: 'origin',
        branch: 'main',
        setUpstream: false,
        forceWithLease: false,
        tags: false,
        opId: 'p2'
      },
      noop
    )
    const progress: string[] = []
    await branches.fetch(
      a,
      { repo: a.root, all: true, prune: false, tags: false, opId: 'f1' },
      (p) => progress.push(p.message)
    )
    expect((await getStatus(a)).head.behind).toBe(1)
    await branches.pull(a, { repo: a.root, strategy: 'ff-only', opId: 'pl' }, noop)
    expect(existsSync(join(a.root, 'g.txt'))).toBe(true)
    const refs = await branches.refsSnapshot(a)
    expect(refs.remoteBranches.map((r) => r.name)).toContain('origin/main')
    expect(refs.remotes[0]).toMatchObject({ name: 'origin' })
  })

  it('rejects non-fast-forward pushes and protects force pushes with a lease', async () => {
    const { a, b } = await withRemote()
    write(b.root, 'f.txt', 'b\n')
    sh(b.root, 'commit', '-qam', 'b change')
    sh(b.root, 'push', '-q')
    write(a.root, 'f.txt', 'a\n')
    sh(a.root, 'commit', '-qam', 'a change')
    await expect(
      branches.push(
        a,
        {
          repo: a.root,
          remote: 'origin',
          branch: 'main',
          setUpstream: false,
          forceWithLease: false,
          tags: false,
          opId: 'x'
        },
        noop
      )
    ).rejects.toMatchObject({ message: expect.stringContaining('remote has commits') })
    // A has not fetched B's commit, so the lease (origin/main) is stale and the force push is refused.
    await expect(
      branches.push(
        a,
        {
          repo: a.root,
          remote: 'origin',
          branch: 'main',
          setUpstream: false,
          forceWithLease: true,
          tags: false,
          opId: 'y'
        },
        noop
      )
    ).rejects.toBeTruthy()
    await branches.fetch(a, { repo: a.root, all: true, prune: false, tags: false, opId: 'z' }, noop)
    await branches.push(
      a,
      {
        repo: a.root,
        remote: 'origin',
        branch: 'main',
        setUpstream: false,
        forceWithLease: true,
        tags: false,
        opId: 'w'
      },
      noop
    )
  })

  it('clones with progress and cleans up on cancellation', async () => {
    const src = await newRepo()
    for (let i = 0; i < 30; i++) write(src.root, `f${i}.txt`, `${i}\n`.repeat(2000))
    sh(src.root, 'add', '.')
    sh(src.root, 'commit', '-qm', 'many')
    const dest = tempDir('cl')
    const promise = git(
      ['clone', '--progress', '--no-local', '--', fileUrl(src.root), join(dest, 'c')],
      { cwd: dest, opId: 'clone-1', onProgress: noop }
    )
    cancelOp('clone-1')
    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})

describe('merge and conflict resolution', () => {
  async function conflicted(): Promise<Awaited<ReturnType<typeof newRepo>>> {
    const ctx = await newRepo({ 'f.txt': 'one\ntwo\nthree\n' })
    sh(ctx.root, 'checkout', '-qb', 'feature')
    write(ctx.root, 'f.txt', 'one\nFEATURE\nthree\n')
    sh(ctx.root, 'commit', '-qam', 'feature edit')
    sh(ctx.root, 'checkout', '-q', 'main')
    write(ctx.root, 'f.txt', 'one\nMAIN\nthree\n')
    sh(ctx.root, 'commit', '-qam', 'main edit')
    return ctx
  }

  it('stops with conflicts, labels sides, resolves, and continues', async () => {
    const ctx = await conflicted()
    const r = await ops.merge(ctx, { repo: ctx.root, ref: 'feature', mode: 'default' })
    expect(r.exitCode).toBe(1)
    const s = await getStatus(ctx)
    expect(s.operation).toBe('merge')
    expect(s.conflicted.map((c) => c.path)).toEqual(['f.txt'])
    const c = await conflicts.getConflict(ctx, 'f.txt')
    expect(c.ours).toContain('MAIN')
    expect(c.theirs).toContain('FEATURE')
    expect(c.base).toContain('two')
    expect(c.oursLabel).toContain('main')
    expect(c.theirsLabel).toContain('feature')
    expect(c.markerCount).toBe(1)
    const segs = parseConflicts(c.result!)
    const merged = resolveSegments(segs, ['ours-theirs'])
    await expect(ops.control(ctx, 'continue')).rejects.toMatchObject({ code: 'CONFLICT' })
    await conflicts.saveResolution(ctx, 'f.txt', merged, true)
    const done = await ops.control(ctx, 'continue')
    expect(done.exitCode).toBe(0)
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toBe('one\nMAIN\nFEATURE\nthree\n')
    expect((await getStatus(ctx)).operation).toBe('none')
  })

  it('aborts a merge and handles delete/modify conflicts by taking a side', async () => {
    const ctx = await conflicted()
    await ops.merge(ctx, { repo: ctx.root, ref: 'feature', mode: 'no-ff' })
    await ops.control(ctx, 'abort')
    expect((await getStatus(ctx)).operation).toBe('none')

    sh(ctx.root, 'checkout', '-qb', 'deleter', 'feature')
    sh(ctx.root, 'rm', '-q', 'f.txt')
    sh(ctx.root, 'commit', '-qm', 'delete f')
    sh(ctx.root, 'checkout', '-q', 'main')
    await ops.merge(ctx, { repo: ctx.root, ref: 'deleter', mode: 'default' })
    const c = await conflicts.getConflict(ctx, 'f.txt')
    expect(c.type).toBe('deleted by them')
    expect(c.theirs).toBeNull()
    await conflicts.takeSide(ctx, 'f.txt', 'theirs')
    expect(existsSync(join(ctx.root, 'f.txt'))).toBe(false)
    expect((await getStatus(ctx)).conflicted).toHaveLength(0)
    await ops.control(ctx, 'continue')
  })

  it('labels rebase conflicts correctly (ours = base being rebased onto)', async () => {
    const ctx = await conflicted()
    sh(ctx.root, 'checkout', '-q', 'feature')
    const r = await ops.rebase(ctx, 'main')
    expect(r.exitCode).toBe(1)
    const s = await getStatus(ctx)
    expect(s.operation).toMatch(/rebase/)
    const c = await conflicts.getConflict(ctx, 'f.txt')
    expect(c.oursLabel).toMatch(/Base being rebased onto/)
    expect(c.theirsLabel).toMatch(/feature/)
    expect(c.ours).toContain('MAIN')
    await conflicts.takeSide(ctx, 'f.txt', 'theirs')
    await ops.control(ctx, 'continue')
    expect((await getStatus(ctx)).operation).toBe('none')
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toContain('FEATURE')
  })
})

describe('history rewriting', () => {
  async function linear(
    n: number
  ): Promise<{ ctx: Awaited<ReturnType<typeof newRepo>>; hashes: string[] }> {
    const ctx = await newRepo()
    for (let i = 1; i <= n; i++) {
      write(ctx.root, `f${i}.txt`, `${i}\n`)
      sh(ctx.root, 'add', '.')
      sh(ctx.root, 'commit', '-qm', `commit ${i}`)
    }
    const hashes = sh(ctx.root, 'rev-list', '--reverse', `HEAD~${n}..HEAD`).trim().split('\n')
    return { ctx, hashes }
  }

  it('reorders, rewords, squashes, fixes up and drops commits', async () => {
    const { ctx, hashes } = await linear(5)
    const r = await ops.interactiveRebase(ctx, {
      repo: ctx.root,
      base: 'HEAD~5',
      todo: [
        { action: 'pick', hash: hashes[1]!, subject: 'commit 2' },
        {
          action: 'reword',
          hash: hashes[0]!,
          subject: 'commit 1',
          message: 'first commit, reworded\n\nWith a body.'
        },
        { action: 'squash', hash: hashes[2]!, subject: 'commit 3', message: 'combined 1+3' },
        { action: 'fixup', hash: hashes[3]!, subject: 'commit 4' },
        { action: 'drop', hash: hashes[4]!, subject: 'commit 5' }
      ]
    })
    expect(r.exitCode).toBe(0)
    const subjects = sh(ctx.root, 'log', '--format=%s', '-n', '3').trim().split('\n')
    expect(subjects).toEqual(['combined 1+3', 'commit 2', 'initial'])
    expect(existsSync(join(ctx.root, 'f5.txt'))).toBe(false)
    expect(existsSync(join(ctx.root, 'f4.txt'))).toBe(true)
    expect((await getStatus(ctx)).operation).toBe('none')
  })

  it('stops at an "edit" step, then continues; and can abort', async () => {
    const { ctx, hashes } = await linear(3)
    const r = await ops.interactiveRebase(ctx, {
      repo: ctx.root,
      base: 'HEAD~3',
      todo: [
        { action: 'pick', hash: hashes[0]!, subject: 'commit 1' },
        { action: 'edit', hash: hashes[1]!, subject: 'commit 2' },
        { action: 'pick', hash: hashes[2]!, subject: 'commit 3' }
      ]
    })
    expect((await getStatus(ctx)).operation).toBe('rebase-interactive')
    expect(r.exitCode).toBe(0)
    await ops.control(ctx, 'continue')
    expect((await getStatus(ctx)).operation).toBe('none')

    const before = sh(ctx.root, 'rev-parse', 'HEAD').trim()
    const h = sh(ctx.root, 'rev-list', '--reverse', 'HEAD~2..HEAD').trim().split('\n')
    await ops.interactiveRebase(ctx, {
      repo: ctx.root,
      base: 'HEAD~2',
      todo: [
        { action: 'edit', hash: h[0]!, subject: 'a' },
        { action: 'pick', hash: h[1]!, subject: 'b' }
      ]
    })
    await ops.control(ctx, 'abort')
    expect(sh(ctx.root, 'rev-parse', 'HEAD').trim()).toBe(before)
  })

  it('refuses interactive rebase with a dirty working tree', async () => {
    const { ctx, hashes } = await linear(2)
    write(ctx.root, 'f1.txt', 'dirty\n')
    await expect(
      ops.interactiveRebase(ctx, {
        repo: ctx.root,
        base: 'HEAD~2',
        todo: [{ action: 'pick', hash: hashes[0]!, subject: '' }]
      })
    ).rejects.toMatchObject({ message: expect.stringContaining('clean working tree') })
  })

  it('cherry-picks, reverts and resets', async () => {
    const { ctx } = await linear(2)
    sh(ctx.root, 'checkout', '-qb', 'other', 'HEAD~2')
    const pick = sh(ctx.root, 'rev-parse', 'main').trim()
    expect((await ops.cherryPick(ctx, [pick], false)).exitCode).toBe(0)
    expect(existsSync(join(ctx.root, 'f2.txt'))).toBe(true)
    expect((await ops.revert(ctx, 'HEAD', false)).exitCode).toBe(0)
    expect(existsSync(join(ctx.root, 'f2.txt'))).toBe(false)
    const preview = await ops.previewCommits(ctx, 'HEAD~2', 'HEAD', 10)
    expect(preview).toHaveLength(2)
    await ops.reset(ctx, 'HEAD~2', 'hard')
    expect(sh(ctx.root, 'log', '-1', '--format=%s').trim()).toBe('initial')
  })
})

describe('stash, worktrees, submodules, bisect and flow', () => {
  it('stashes, lists, inspects, applies, pops and drops', async () => {
    const ctx = await newRepo({ 'f.txt': '1\n' })
    write(ctx.root, 'f.txt', '2\n')
    write(ctx.root, 'u.txt', 'untracked\n')
    await ops.stashPush(ctx, {
      repo: ctx.root,
      message: 'wip',
      includeUntracked: true,
      keepIndex: false
    })
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toBe('1\n')
    expect(existsSync(join(ctx.root, 'u.txt'))).toBe(false)
    const list = await branches.listStashes(ctx)
    expect(list[0]!.message).toContain('wip')
    const files = await ops.stashFiles(ctx, 0)
    expect(files.map((f) => f.path).sort()).toEqual(['f.txt', 'u.txt'])

    // Apply keeps the stash; Git refuses to restore untracked files over existing ones,
    // so drop after verifying instead of apply→clean→pop on the same -u stash.
    await ops.stashApply(ctx, 0, false, false)
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toBe('2\n')
    expect(existsSync(join(ctx.root, 'u.txt'))).toBe(true)
    await ops.stashDrop(ctx, 0)
    expect((await branches.listStashes(ctx)).length).toBe(0)

    write(ctx.root, 'f.txt', '3\n')
    await ops.stashPush(ctx, {
      repo: ctx.root,
      message: 'pop-me',
      includeUntracked: false,
      keepIndex: false
    })
    await ops.stashApply(ctx, 0, true, false)
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toBe('3\n')
    expect((await branches.listStashes(ctx)).length).toBe(0)

    write(ctx.root, 'f.txt', '4\n')
    await expect(
      ops.stashPush(ctx, { repo: ctx.root, includeUntracked: false, keepIndex: false })
    ).resolves.toBeUndefined()
    await ops.stashDrop(ctx, 0)
    await expect(
      ops.stashPush(ctx, { repo: ctx.root, includeUntracked: false, keepIndex: false })
    ).rejects.toBeTruthy()
  })

  it('adds, lists, opens and removes linked worktrees', async () => {
    const ctx = await newRepo()
    const wtPath = join(tempDir('wt'), 'linked tree')
    await extras.addWorktree(ctx, { repo: ctx.root, path: wtPath, newBranch: 'wt-branch' })
    const refs = await branches.refsSnapshot(ctx)
    expect(refs.worktrees).toHaveLength(2)
    expect(refs.worktrees[1]!.branch).toBe('wt-branch')
    const linked = await resolveRepo(wtPath)
    expect(linked.linked).toBe(true)
    expect(linked.commonDir.toLowerCase()).toBe(ctx.commonDir.toLowerCase())
    expect((await getStatus(linked)).isLinkedWorktree).toBe(true)
    await extras.removeWorktree(ctx, wtPath, false)
    expect((await branches.refsSnapshot(ctx)).worktrees).toHaveLength(1)
  })

  it('adds and updates submodules', async () => {
    const sub = await newRepo({ 'lib.txt': 'lib\n' })
    const ctx = await newRepo()
    await extras.submoduleAdd(
      ctx,
      { repo: ctx.root, url: fileUrl(sub.root), path: 'vendor/lib', opId: 's1' },
      noop
    )
    sh(ctx.root, 'commit', '-qm', 'add submodule')
    const refs = await branches.refsSnapshot(ctx)
    expect(refs.submodules[0]).toMatchObject({ path: 'vendor/lib', state: ' ' })
    const dir = tempDir('subclone')
    sh(dir, 'clone', '-q', ctx.root, 'c')
    const clone = await openCtx(join(dir, 'c'))
    expect((await branches.refsSnapshot(clone)).submodules[0]!.state).toBe('-')
    await extras.submoduleUpdate(
      clone,
      { repo: clone.root, init: true, recursive: true, opId: 's2' },
      noop
    )
    expect((await branches.refsSnapshot(clone)).submodules[0]!.state).toBe(' ')
  })

  it('runs a bisect session', async () => {
    const ctx = await newRepo({ 'v.txt': 'ok\n' })
    for (let i = 1; i <= 6; i++) {
      write(ctx.root, 'v.txt', i >= 4 ? `broken ${i}\n` : `ok ${i}\n`)
      sh(ctx.root, 'commit', '-qam', `step ${i}`)
    }
    await ops.bisectStart(ctx, 'HEAD', 'HEAD~6')
    expect((await getStatus(ctx)).bisecting).toBe(true)
    for (let i = 0; i < 6; i++) {
      const content = readFileSync(join(ctx.root, 'v.txt'), 'utf8')
      const r = await ops.bisectMark(ctx, content.includes('broken') ? 'bad' : 'good')
      if (/is the first bad commit/.test(r.stdout)) {
        expect(r.stdout).toContain('step 4')
        break
      }
    }
    expect(await ops.bisectLog(ctx)).toContain('git bisect')
    await ops.bisectReset(ctx)
    expect((await getStatus(ctx)).bisecting).toBe(false)
  })

  it('implements git-flow feature and release branches', async () => {
    const ctx = await newRepo()
    await expect(
      ops.flowStart(ctx, {
        repo: ctx.root,
        kind: 'feature',
        name: 'login',
        develop: 'develop',
        main: 'main'
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('does not exist')
    })
    sh(ctx.root, 'branch', 'develop')
    await ops.flowStart(ctx, {
      repo: ctx.root,
      kind: 'feature',
      name: 'login',
      develop: 'develop',
      main: 'main'
    })
    write(ctx.root, 'login.txt', 'x\n')
    sh(ctx.root, 'add', '.')
    sh(ctx.root, 'commit', '-qm', 'login')
    const r = await ops.flowFinish(ctx, {
      repo: ctx.root,
      branch: 'feature/login',
      develop: 'develop',
      main: 'main',
      deleteBranch: true
    })
    expect(r.exitCode).toBe(0)
    expect(sh(ctx.root, 'branch', '--show-current').trim()).toBe('develop')
    await ops.flowStart(ctx, {
      repo: ctx.root,
      kind: 'release',
      name: '1.0',
      develop: 'develop',
      main: 'main'
    })
    await ops.flowFinish(ctx, {
      repo: ctx.root,
      branch: 'release/1.0',
      develop: 'develop',
      main: 'main',
      deleteBranch: true
    })
    expect(sh(ctx.root, 'tag').trim()).toBe('1.0')
    expect(sh(ctx.root, 'show', 'main:login.txt')).toBe('x\n')
  })

  it('reads and edits .gitignore and repository identity', async () => {
    const ctx = await newRepo()
    await extras.appendGitignore(ctx, 'node_modules/')
    await extras.appendGitignore(ctx, 'node_modules/')
    expect(await extras.readGitignore(ctx)).toBe('node_modules/\n')
    await extras.setIdentity(ctx, ctx.root, {
      repo: ctx.root,
      scope: 'local',
      name: 'Repo User',
      email: 'repo@example.invalid'
    })
    const id = await extras.getIdentity(ctx, ctx.root)
    expect(id.local.name).toBe('Repo User')
    expect(id.global.email).toBe('test@spoon.invalid')
  })
})
