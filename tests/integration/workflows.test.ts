import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { getStatus } from '../../src/main/git/repo'
import * as branches from '../../src/main/git/branches'
import * as changes from '../../src/main/git/changes'
import * as history from '../../src/main/git/history'
import * as ops from '../../src/main/git/ops'
import {
  peekRedo,
  peekUndo,
  recordUndo,
  runRedo,
  runUndo,
  type RestoreMode
} from '../../src/main/git/undo'
import { cleanup, newRepo, openCtx, sh, tempDir, write } from './helpers'

afterAll(cleanup)

const noop = (): void => undefined
type Ctx = Awaited<ReturnType<typeof newRepo>>

async function withRemote(): Promise<{ a: Ctx; bare: string; b: Ctx }> {
  const a = await newRepo({ 'f.txt': 'base\n' })
  const bare = tempDir('remote')
  sh(bare, 'init', '--bare', '-q')
  await branches.addRemote(a, 'origin', bare)
  await branches.push(a, pushArgs(a, { setUpstream: true }), noop)
  const dir = tempDir('clone')
  sh(dir, 'clone', '-q', bare, 'b')
  const b = await openCtx(join(dir, 'b'))
  return { a, bare, b }
}

function pushArgs(
  ctx: Ctx,
  o: Partial<Parameters<typeof branches.push>[1]> = {}
): Parameters<typeof branches.push>[1] {
  return {
    repo: ctx.root,
    remote: 'origin',
    branch: 'main',
    setUpstream: false,
    forceWithLease: false,
    tags: false,
    opId: `p-${Math.random()}`,
    ...o
  }
}

const head = (dir: string, rev = 'HEAD'): string => sh(dir, 'rev-parse', rev).trim()
const subjects = (dir: string, rev = 'HEAD'): string[] =>
  sh(dir, 'log', '--format=%s', rev).trim().split('\n')

describe('push: explicit lease and rejected pushes', () => {
  it('pins force-with-lease to the reviewed commit even after a background fetch', async () => {
    const { a, bare, b } = await withRemote()
    // A rewrites its commit and reviews the remote at its current position.
    write(a.root, 'f.txt', 'rewritten\n')
    sh(a.root, 'commit', '-q', '--amend', '-am', 'rewritten')
    const reviewed = head(a.root, 'refs/remotes/origin/main')
    // Meanwhile B pushes, and A fetches in the background (auto-fetch).
    write(b.root, 'g.txt', 'from b\n')
    sh(b.root, 'add', '.')
    sh(b.root, 'commit', '-qm', 'from b')
    sh(b.root, 'push', '-q')
    await branches.fetch(a, { repo: a.root, all: true, prune: false, tags: false, opId: 'f' }, noop)
    const bTip = head(bare, 'main')
    await expect(
      branches.push(a, pushArgs(a, { forceWithLease: true, expectedRemoteOid: reviewed }), noop)
    ).rejects.toMatchObject({ code: 'LEASE_REJECTED' })
    // B's commit survived.
    expect(head(bare, 'main')).toBe(bTip)
    // Forcing against the commit actually shown now is allowed.
    await branches.push(a, pushArgs(a, { forceWithLease: true, expectedRemoteOid: bTip }), noop)
    expect(head(bare, 'main')).toBe(head(a.root))
  })

  it('treats a null expected commit as "must not exist on the remote"', async () => {
    const { a, bare } = await withRemote()
    sh(bare, 'branch', 'taken', 'main')
    sh(a.root, 'checkout', '-qb', 'taken')
    write(a.root, 'x.txt', 'x\n')
    sh(a.root, 'add', '.')
    sh(a.root, 'commit', '-qm', 'x')
    await expect(
      branches.push(
        a,
        pushArgs(a, { branch: 'taken', forceWithLease: true, expectedRemoteOid: null }),
        noop
      )
    ).rejects.toMatchObject({ code: 'LEASE_REJECTED' })
  })

  it('reports a rejected push, then recovers with fetch + rebase + push', async () => {
    const { a, bare, b } = await withRemote()
    write(b.root, 'b.txt', 'b\n')
    sh(b.root, 'add', '.')
    sh(b.root, 'commit', '-qm', 'b change')
    sh(b.root, 'push', '-q')
    write(a.root, 'a file.txt', 'a\n')
    sh(a.root, 'add', '.')
    sh(a.root, 'commit', '-qm', 'a change')
    await expect(branches.push(a, pushArgs(a), noop)).rejects.toMatchObject({
      code: 'PUSH_REJECTED'
    })
    await branches.fetch(
      a,
      { repo: a.root, remote: 'origin', all: false, prune: false, tags: false, opId: 'f' },
      noop
    )
    expect((await ops.rebase(a, 'origin/main')).exitCode).toBe(0)
    await branches.push(a, pushArgs(a), noop)
    expect(subjects(bare, 'main')).toEqual(['a change', 'b change', 'initial'])
  })
})

describe('pull', () => {
  it('stops a conflicting pull --rebase as an operation (not an error) and aborts cleanly', async () => {
    const { a, b } = await withRemote()
    write(b.root, 'f.txt', 'theirs\n')
    sh(b.root, 'commit', '-qam', 'theirs')
    sh(b.root, 'push', '-q')
    write(a.root, 'f.txt', 'ours\n')
    sh(a.root, 'commit', '-qam', 'ours')
    const before = head(a.root)
    const res = await branches.pull(a, { repo: a.root, strategy: 'rebase', opId: 'pl' }, noop)
    expect(res.exitCode).toBe(1)
    const st = await getStatus(a)
    expect(st.operation).toMatch(/^rebase/)
    expect(st.conflicted.map((f) => f.path)).toEqual(['f.txt'])
    await ops.control(a, 'abort')
    expect((await getStatus(a)).operation).toBe('none')
    expect(head(a.root)).toBe(before)
    expect(readFileSync(join(a.root, 'f.txt'), 'utf8')).toBe('ours\n')
  })

  it('explains a diverged fast-forward-only pull', async () => {
    const { a, b } = await withRemote()
    write(b.root, 'b.txt', 'b\n')
    sh(b.root, 'add', '.')
    sh(b.root, 'commit', '-qm', 'b')
    sh(b.root, 'push', '-q')
    write(a.root, 'a.txt', 'a\n')
    sh(a.root, 'add', '.')
    sh(a.root, 'commit', '-qm', 'a')
    await expect(
      branches.pull(a, { repo: a.root, strategy: 'ff-only', opId: 'pl' }, noop)
    ).rejects.toMatchObject({ code: 'DIVERGED' })
  })
})

describe('history search and published-commit detection', () => {
  it('finds commits that add or remove text (pickaxe)', async () => {
    const ctx = await newRepo({ 'a.txt': 'one\n' })
    write(ctx.root, 'a.txt', 'one\nneedle_42\n')
    sh(ctx.root, 'commit', '-qam', 'add needle')
    write(ctx.root, 'b.txt', 'unrelated\n')
    sh(ctx.root, 'add', '.')
    sh(ctx.root, 'commit', '-qm', 'other')
    const res = await history.log(ctx, {
      repo: ctx.root,
      skip: 0,
      limit: 50,
      allRefs: true,
      search: { content: 'needle_42' }
    })
    expect(res.commits.map((c) => c.subject)).toEqual(['add needle'])
  })

  it('reports which remote branches already contain HEAD', async () => {
    const { a } = await withRemote()
    expect(await history.remoteContains(a, 'HEAD')).toEqual(['origin/main'])
    write(a.root, 'f.txt', 'local\n')
    sh(a.root, 'commit', '-qam', 'local only')
    expect(await history.remoteContains(a, 'HEAD')).toEqual([])
  })
})

describe('undo', () => {
  const rec = <T>(ctx: Ctx, label: string, mode: RestoreMode, fn: () => Promise<T>): Promise<T> =>
    recordUndo(ctx, label, mode, fn)

  it('undoes a commit and keeps its changes staged; unstaged work is untouched', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n', 'b.txt': 'b\n' })
    const before = head(ctx.root)
    write(ctx.root, 'ünïcode file.txt', 'new\n')
    await changes.stage(ctx, ['ünïcode file.txt'])
    write(ctx.root, 'b.txt', 'unstaged edit\n')
    await rec(ctx, 'Commit', 'soft', () =>
      changes.commit(ctx, {
        repo: ctx.root,
        message: 'add file',
        amend: false,
        signoff: false,
        noVerify: false,
        sign: 'config',
        allowEmpty: false
      })
    )
    const preview = await peekUndo(ctx)
    expect(preview?.label).toBe('Commit')
    expect(preview?.blockedReason).toBeNull()
    expect(preview?.changes[0]).toMatch(/^Move main from [0-9a-f]{7} back to [0-9a-f]{7}$/)
    await runUndo(ctx)
    expect(head(ctx.root)).toBe(before)
    expect(
      sh(ctx.root, '-c', 'core.quotepath=false', 'diff', '--cached', '--name-only').trim()
    ).toBe('ünïcode file.txt')
    expect(sh(ctx.root, 'diff', '--name-only').trim()).toBe('b.txt')
    expect(await peekUndo(ctx)).toBeNull()
  })

  it('undoes an amend back to the original commit', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n' })
    const original = head(ctx.root)
    write(ctx.root, 'a.txt', 'amended\n')
    await changes.stage(ctx, ['a.txt'])
    await rec(ctx, 'Amend commit', 'soft', () =>
      changes.commit(ctx, {
        repo: ctx.root,
        message: 'initial (amended)',
        amend: true,
        signoff: false,
        noVerify: false,
        sign: 'config',
        allowEmpty: false
      })
    )
    expect(head(ctx.root)).not.toBe(original)
    await runUndo(ctx)
    expect(head(ctx.root)).toBe(original)
    expect(sh(ctx.root, 'diff', '--cached', '--name-only').trim()).toBe('a.txt')
  })

  it('undoes a merge but keeps an unrelated dirty file', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n', 'dirty.txt': 'clean\n' })
    sh(ctx.root, 'checkout', '-qb', 'feature')
    write(ctx.root, 'f.txt', 'feature\n')
    sh(ctx.root, 'add', '.')
    sh(ctx.root, 'commit', '-qm', 'feature work')
    sh(ctx.root, 'checkout', '-q', 'main')
    write(ctx.root, 'm.txt', 'main\n')
    sh(ctx.root, 'add', '.')
    sh(ctx.root, 'commit', '-qm', 'main work')
    const before = head(ctx.root)
    write(ctx.root, 'dirty.txt', 'local edit\n')
    const res = await rec(ctx, 'Merge feature', 'keep', () =>
      ops.merge(ctx, { repo: ctx.root, ref: 'feature', mode: 'no-ff' })
    )
    expect(res.exitCode).toBe(0)
    await runUndo(ctx)
    expect(head(ctx.root)).toBe(before)
    expect(readFileSync(join(ctx.root, 'dirty.txt'), 'utf8')).toBe('local edit\n')
    expect(sh(ctx.root, 'status', '--porcelain').trim()).toBe('M dirty.txt')
  })

  it('restores a deleted branch and a renamed current branch', async () => {
    const ctx = await newRepo()
    sh(ctx.root, 'branch', 'topic')
    const topic = head(ctx.root, 'topic')
    await rec(ctx, 'Delete branch topic', 'keep', () => branches.deleteBranch(ctx, 'topic', true))
    expect(sh(ctx.root, 'branch', '--list', 'topic').trim()).toBe('')
    await runUndo(ctx)
    expect(head(ctx.root, 'topic')).toBe(topic)

    await rec(ctx, 'Rename', 'keep', () => branches.renameBranch(ctx, 'main', 'trunk'))
    expect(sh(ctx.root, 'branch', '--show-current').trim()).toBe('trunk')
    await runUndo(ctx)
    expect(sh(ctx.root, 'branch', '--show-current').trim()).toBe('main')
    expect(sh(ctx.root, 'branch', '--list', 'trunk').trim()).toBe('')
  })

  it('undoes "create branch and check out" by switching back and deleting it', async () => {
    const ctx = await newRepo()
    await rec(ctx, 'Create branch', 'keep', () =>
      branches.createBranch(ctx, { repo: ctx.root, name: 'feature/x', checkout: true })
    )
    expect(sh(ctx.root, 'branch', '--show-current').trim()).toBe('feature/x')
    const p = await peekUndo(ctx)
    expect(p?.changes).toEqual(
      expect.arrayContaining(['Switch back to main', expect.stringMatching(/^Delete feature\/x/)])
    )
    await runUndo(ctx)
    expect(sh(ctx.root, 'branch', '--show-current').trim()).toBe('main')
    expect(sh(ctx.root, 'branch', '--list', 'feature/x').trim()).toBe('')
  })

  it('undoes an interactive rebase, restoring the original order and contents', async () => {
    const ctx = await newRepo({ 'f.txt': '0\n' })
    for (const n of ['1', '2', '3']) {
      write(ctx.root, `c${n}.txt`, `${n}\n`)
      sh(ctx.root, 'add', '.')
      sh(ctx.root, 'commit', '-qm', `c${n}`)
    }
    const original = head(ctx.root)
    const list = sh(ctx.root, 'log', '--reverse', '--format=%H %s', 'HEAD~3..HEAD')
      .trim()
      .split('\n')
      .map((l) => ({ hash: l.slice(0, 40), subject: l.slice(41) }))
    await rec(ctx, 'Interactive rebase', 'keep', () =>
      ops.interactiveRebase(ctx, {
        repo: ctx.root,
        base: 'HEAD~3',
        todo: [
          { action: 'pick', ...list[2]! },
          { action: 'pick', ...list[0]! },
          { action: 'drop', ...list[1]! }
        ]
      })
    )
    expect(subjects(ctx.root)).toEqual(['c1', 'c3', 'initial'])
    await runUndo(ctx)
    expect(head(ctx.root)).toBe(original)
    expect(subjects(ctx.root)).toEqual(['c3', 'c2', 'c1', 'initial'])
    expect(readFileSync(join(ctx.root, 'c2.txt'), 'utf8')).toBe('2\n')
  })

  it('undoes a soft reset without losing the staged result', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n' })
    write(ctx.root, 'a.txt', 'b\n')
    sh(ctx.root, 'commit', '-qam', 'second')
    const tip = head(ctx.root)
    await rec(ctx, 'Reset', 'soft', () => ops.reset(ctx, 'HEAD~1', 'soft'))
    await runUndo(ctx)
    expect(head(ctx.root)).toBe(tip)
    expect(sh(ctx.root, 'status', '--porcelain').trim()).toBe('')
  })

  it('refuses to undo once the repository moved on, and never overwrites later work', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n' })
    write(ctx.root, 'a.txt', 'b\n')
    await changes.stage(ctx, ['a.txt'])
    await rec(ctx, 'Commit', 'soft', () =>
      changes.commit(ctx, {
        repo: ctx.root,
        message: 'tracked by spoon',
        amend: false,
        signoff: false,
        noVerify: false,
        sign: 'config',
        allowEmpty: false
      })
    )
    // Another tool commits on top.
    write(ctx.root, 'a.txt', 'c\n')
    sh(ctx.root, 'commit', '-qam', 'outside spoon')
    const tip = head(ctx.root)
    const p = await peekUndo(ctx)
    expect(p?.blockedReason).toMatch(/changed after "Commit"/)
    await expect(runUndo(ctx)).rejects.toMatchObject({ code: 'STALE' })
    expect(head(ctx.root)).toBe(tip)
  })

  it('does not record an operation that stopped with conflicts', async () => {
    const ctx = await newRepo({ 'f.txt': 'base\n' })
    sh(ctx.root, 'checkout', '-qb', 'other')
    write(ctx.root, 'f.txt', 'theirs\n')
    sh(ctx.root, 'commit', '-qam', 'theirs')
    sh(ctx.root, 'checkout', '-q', 'main')
    write(ctx.root, 'f.txt', 'ours\n')
    sh(ctx.root, 'commit', '-qam', 'ours')
    const r = await rec(ctx, 'Merge other', 'keep', () =>
      ops.merge(ctx, { repo: ctx.root, ref: 'other', mode: 'default' })
    )
    expect(r.exitCode).toBe(1)
    expect(await peekUndo(ctx)).toBeNull()
    await ops.control(ctx, 'abort')
  })
})

describe('redo', () => {
  const commitArgs = (ctx: Ctx, message: string): Parameters<typeof changes.commit>[1] => ({
    repo: ctx.root,
    message,
    amend: false,
    signoff: false,
    noVerify: false,
    sign: 'config',
    allowEmpty: false
  })

  it('redoes an undone commit, keeping the index consistent both ways', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n' })
    write(ctx.root, 'a.txt', 'b\n')
    await changes.stage(ctx, ['a.txt'])
    await recordUndo(ctx, 'Commit', 'soft', () => changes.commit(ctx, commitArgs(ctx, 'second')))
    const tip = head(ctx.root)
    await runUndo(ctx)
    expect(sh(ctx.root, 'diff', '--cached', '--name-only').trim()).toBe('a.txt')
    const p = await peekRedo(ctx)
    expect(p).toMatchObject({ label: 'Commit', blockedReason: null })
    expect(p?.changes[0]).toMatch(/^Move main from [0-9a-f]{7} to [0-9a-f]{7}$/)
    await runRedo(ctx)
    expect(head(ctx.root)).toBe(tip)
    expect(sh(ctx.root, 'status', '--porcelain').trim()).toBe('')
    expect(await peekRedo(ctx)).toBeNull()
    // ...and it can be undone again.
    expect((await peekUndo(ctx))?.label).toBe('Commit')
  })

  it('redoes an interactive rebase and a create-and-checkout', async () => {
    const ctx = await newRepo({ 'f.txt': '0\n' })
    for (const n of ['1', '2']) {
      write(ctx.root, `c${n}.txt`, `${n}\n`)
      sh(ctx.root, 'add', '.')
      sh(ctx.root, 'commit', '-qm', `c${n}`)
    }
    const list = sh(ctx.root, 'log', '--reverse', '--format=%H %s', 'HEAD~2..HEAD')
      .trim()
      .split('\n')
      .map((l) => ({ hash: l.slice(0, 40), subject: l.slice(41) }))
    await recordUndo(ctx, 'Interactive rebase', 'keep', () =>
      ops.interactiveRebase(ctx, {
        repo: ctx.root,
        base: 'HEAD~2',
        todo: [
          { action: 'pick', ...list[1]! },
          { action: 'pick', ...list[0]! }
        ]
      })
    )
    const rebased = head(ctx.root)
    await runUndo(ctx)
    expect(subjects(ctx.root)).toEqual(['c2', 'c1', 'initial'])
    await runRedo(ctx)
    expect(head(ctx.root)).toBe(rebased)
    expect(subjects(ctx.root)).toEqual(['c1', 'c2', 'initial'])

    await recordUndo(ctx, 'Create branch', 'keep', () =>
      branches.createBranch(ctx, { repo: ctx.root, name: 'topic', checkout: true })
    )
    await runUndo(ctx)
    expect(sh(ctx.root, 'branch', '--show-current').trim()).toBe('main')
    await runRedo(ctx)
    expect(sh(ctx.root, 'branch', '--show-current').trim()).toBe('topic')
  })

  it('drops redo after a new operation and refuses it after outside changes', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n' })
    write(ctx.root, 'a.txt', 'b\n')
    await changes.stage(ctx, ['a.txt'])
    await recordUndo(ctx, 'Commit', 'soft', () => changes.commit(ctx, commitArgs(ctx, 'one')))
    await runUndo(ctx)
    // A new recorded operation clears the redo history.
    await recordUndo(ctx, 'Commit', 'soft', () => changes.commit(ctx, commitArgs(ctx, 'two')))
    expect(await peekRedo(ctx)).toBeNull()

    await runUndo(ctx)
    sh(ctx.root, 'commit', '-qm', 'outside spoon')
    const tip = head(ctx.root)
    expect((await peekRedo(ctx))?.blockedReason).toMatch(/changed after "Commit"/)
    await expect(runRedo(ctx)).rejects.toMatchObject({ code: 'STALE' })
    expect(head(ctx.root)).toBe(tip)
  })
})

describe('commit with "stage all"', () => {
  const args = (ctx: Ctx): Parameters<typeof changes.commit>[1] => ({
    repo: ctx.root,
    message: 'msg',
    amend: false,
    signoff: false,
    noVerify: false,
    sign: 'config',
    allowEmpty: false,
    stageAllIfNothingStaged: true
  })

  it('commits only the staged file when something is already staged (stale UI view)', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n', 'b.txt': 'b\n' })
    write(ctx.root, 'a.txt', 'a2\n')
    write(ctx.root, 'b.txt', 'b2\n')
    write(ctx.root, 'notes.txt', 'untracked\n')
    sh(ctx.root, 'add', 'a.txt')
    await changes.commit(ctx, args(ctx))
    expect(sh(ctx.root, 'show', '--name-only', '--format=', 'HEAD').trim()).toBe('a.txt')
    const st = sh(ctx.root, 'status', '--porcelain')
    expect(st).toContain(' M b.txt')
    expect(st).toContain('?? notes.txt')
  })

  it('stages everything when the index really is empty', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n' })
    write(ctx.root, 'a.txt', 'a2\n')
    write(ctx.root, 'new file.txt', 'n\n')
    await changes.commit(ctx, args(ctx))
    expect(
      sh(ctx.root, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort()
    ).toEqual(['a.txt', 'new file.txt'])
    expect(sh(ctx.root, 'status', '--porcelain').trim()).toBe('')
  })
})
