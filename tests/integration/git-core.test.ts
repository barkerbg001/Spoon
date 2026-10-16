import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { getStatus, resolveRepo } from '../../src/main/git/repo'
import * as changes from '../../src/main/git/changes'
import * as history from '../../src/main/git/history'
import * as branches from '../../src/main/git/branches'
import { layoutGraph } from '../../src/shared/graph'
import { cleanup, newRepo, sh, tempDir, write } from './helpers'

afterAll(cleanup)

const opts = { ignoreWhitespace: false, context: 3, maxBytes: 1_000_000 }

describe('repository basics', () => {
  it('detects non-repositories and bare repositories with clear errors', async () => {
    const plain = tempDir('plain')
    await expect(resolveRepo(plain)).rejects.toMatchObject({ code: 'NOT_A_REPOSITORY' })
    const bare = tempDir('bare')
    sh(bare, 'init', '--bare', '-q')
    await expect(resolveRepo(bare)).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('reports status for unicode, spaces and unusual file names', async () => {
    const ctx = await newRepo()
    const names = [
      'spaced name.txt',
      'ünïcødé-文件.md',
      'brackets[1].txt',
      'star*.txt'.replace('*', '_'),
      'dir with space/inner file.txt',
      '-leading-dash.txt'
    ]
    for (const n of names) write(ctx.root, n, 'x\n')
    const s = await getStatus(ctx)
    expect(s.untracked.map((f) => f.path).sort()).toEqual([...names].sort())
    await changes.stage(ctx, names)
    const s2 = await getStatus(ctx)
    expect(s2.staged.map((f) => f.path).sort()).toEqual([...names].sort())
    await changes.unstage(ctx, ['brackets[1].txt'])
    const s3 = await getStatus(ctx)
    expect(s3.untracked.map((f) => f.path)).toEqual(['brackets[1].txt'])
  })

  it('tracks renames, deletions and modifications separately for index and worktree', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n', 'b.txt': 'b\n', 'c.txt': 'c\n' })
    sh(ctx.root, 'mv', 'a.txt', 'renamed.txt')
    write(ctx.root, 'b.txt', 'b2\n')
    sh(ctx.root, 'add', 'b.txt')
    write(ctx.root, 'b.txt', 'b3\n')
    sh(ctx.root, 'rm', '-q', 'c.txt')
    const s = await getStatus(ctx)
    const rename = s.staged.find((f) => f.path === 'renamed.txt')
    expect(rename?.index).toBe('R')
    expect(rename?.origPath).toBe('a.txt')
    expect(s.staged.find((f) => f.path === 'b.txt')?.index).toBe('M')
    expect(s.unstaged.find((f) => f.path === 'b.txt')?.worktree).toBe('M')
    expect(s.staged.find((f) => f.path === 'c.txt')?.index).toBe('D')
  })

  it('handles an empty repository (unborn HEAD)', async () => {
    const dir = tempDir()
    sh(dir, 'init', '-q')
    const ctx = await resolveRepo(dir)
    const s = await getStatus(ctx)
    expect(s.head.unborn).toBe(true)
    const l = await history.log(ctx, { repo: dir, skip: 0, limit: 10, allRefs: true })
    expect(l.commits).toEqual([])
    write(dir, 'f.txt', 'x\n')
    await changes.stage(ctx, ['f.txt'])
    await changes.unstage(ctx, ['f.txt'])
    expect((await getStatus(ctx)).untracked).toHaveLength(1)
  })
})

describe('partial staging', () => {
  const base = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n') + '\n'

  it('stages selected lines only and preserves unrelated changes', async () => {
    const ctx = await newRepo({ 'f.txt': base })
    const lines = base.split('\n')
    lines[1] = 'line 2 CHANGED'
    lines[25] = 'line 26 CHANGED'
    writeFileSync(join(ctx.root, 'f.txt'), lines.join('\n'))
    const d = await changes.getDiff(ctx, { kind: 'unstaged', path: 'f.txt' }, opts)
    expect(d.file?.hunks).toHaveLength(2)
    // Select only the "+" line of the first hunk (and its "-" line).
    const h0 = d.file!.hunks[0]!
    const sel = h0.lines.flatMap((l, i) =>
      l.type !== 'context' ? [[0, i] as [number, number]] : []
    )
    await changes.applyPartial(ctx, {
      repo: ctx.root,
      path: 'f.txt',
      mode: 'stage',
      fingerprint: d.fingerprint,
      selection: sel,
      options: opts
    })
    const cached = sh(ctx.root, 'diff', '--cached')
    expect(cached).toContain('+line 2 CHANGED')
    expect(cached).not.toContain('line 26 CHANGED')
    const unstaged = sh(ctx.root, 'diff')
    expect(unstaged).toContain('+line 26 CHANGED')
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toContain('line 2 CHANGED')
  })

  it('stages a single added line out of several in one hunk', async () => {
    const ctx = await newRepo({ 'f.txt': 'a\nb\nc\n' })
    writeFileSync(join(ctx.root, 'f.txt'), 'a\nX\nY\nb\nc\n')
    const d = await changes.getDiff(ctx, { kind: 'unstaged', path: 'f.txt' }, opts)
    const idx = d.file!.hunks[0]!.lines.findIndex((l) => l.content === 'Y')
    await changes.applyPartial(ctx, {
      repo: ctx.root,
      path: 'f.txt',
      mode: 'stage',
      fingerprint: d.fingerprint,
      selection: [[0, idx]],
      options: opts
    })
    expect(sh(ctx.root, 'show', ':f.txt')).toBe('a\nY\nb\nc\n')
  })

  it('unstages and discards selected lines', async () => {
    const ctx = await newRepo({ 'f.txt': 'a\nb\nc\n' })
    writeFileSync(join(ctx.root, 'f.txt'), 'a\nB1\nB2\nc\n')
    sh(ctx.root, 'add', 'f.txt')
    const staged = await changes.getDiff(ctx, { kind: 'staged', path: 'f.txt' }, opts)
    const lines = staged.file!.hunks[0]!.lines
    const b2 = lines.findIndex((l) => l.content === 'B2')
    await changes.applyPartial(ctx, {
      repo: ctx.root,
      path: 'f.txt',
      mode: 'unstage',
      fingerprint: staged.fingerprint,
      selection: [[0, b2]],
      options: opts
    })
    expect(sh(ctx.root, 'show', ':f.txt')).toBe('a\nB1\nc\n')
    // Discard the remaining unstaged addition of B2 from the working tree.
    const un = await changes.getDiff(ctx, { kind: 'unstaged', path: 'f.txt' }, opts)
    const sel = un.file!.hunks[0]!.lines.flatMap((l, i) =>
      l.type === 'add' ? [[0, i] as [number, number]] : []
    )
    await changes.applyPartial(ctx, {
      repo: ctx.root,
      path: 'f.txt',
      mode: 'discard',
      fingerprint: un.fingerprint,
      selection: sel,
      options: opts
    })
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toBe(sh(ctx.root, 'show', ':f.txt'))
  })

  it('rejects stale selections', async () => {
    const ctx = await newRepo({ 'f.txt': 'a\n' })
    writeFileSync(join(ctx.root, 'f.txt'), 'a\nb\n')
    const d = await changes.getDiff(ctx, { kind: 'unstaged', path: 'f.txt' }, opts)
    writeFileSync(join(ctx.root, 'f.txt'), 'a\nb\nc\n')
    await expect(
      changes.applyPartial(ctx, {
        repo: ctx.root,
        path: 'f.txt',
        mode: 'stage',
        fingerprint: d.fingerprint,
        selection: [[0, 1]],
        options: opts
      })
    ).rejects.toMatchObject({ code: 'STALE' })
  })

  it('handles files without a trailing newline', async () => {
    const ctx = await newRepo({ 'f.txt': 'a\nb' })
    writeFileSync(join(ctx.root, 'f.txt'), 'a\nb\nc')
    const d = await changes.getDiff(ctx, { kind: 'unstaged', path: 'f.txt' }, opts)
    const sel = d.file!.hunks[0]!.lines.flatMap((l, i) =>
      l.type !== 'context' ? [[0, i] as [number, number]] : []
    )
    await changes.applyPartial(ctx, {
      repo: ctx.root,
      path: 'f.txt',
      mode: 'stage',
      fingerprint: d.fingerprint,
      selection: sel,
      options: opts
    })
    expect(sh(ctx.root, 'show', ':f.txt')).toBe('a\nb\nc')
  })
})

describe('commits and history', () => {
  it('commits, amends, and surfaces hook failures', async () => {
    const ctx = await newRepo()
    write(ctx.root, 'x.txt', '1\n')
    await changes.stage(ctx, ['x.txt'])
    await changes.commit(ctx, {
      repo: ctx.root,
      message: 'add x',
      amend: false,
      signoff: false,
      noVerify: false,
      sign: 'config',
      allowEmpty: false
    })
    expect(await changes.lastMessage(ctx)).toBe('add x')
    await changes.commit(ctx, {
      repo: ctx.root,
      message: 'add x (amended)',
      amend: true,
      signoff: false,
      noVerify: false,
      sign: 'never',
      allowEmpty: false
    })
    expect(sh(ctx.root, 'rev-list', '--count', 'HEAD').trim()).toBe('2')
    expect(await changes.lastMessage(ctx)).toBe('add x (amended)')

    write(
      ctx.root,
      '.git/hooks/pre-commit',
      '#!/bin/sh\necho "lint failed: missing semicolon" >&2\nexit 1\n'
    )
    chmodSync(join(ctx.root, '.git/hooks/pre-commit'), 0o755)
    write(ctx.root, 'y.txt', '1\n')
    await changes.stage(ctx, ['y.txt'])
    await expect(
      changes.commit(ctx, {
        repo: ctx.root,
        message: 'blocked',
        amend: false,
        signoff: false,
        noVerify: false,
        sign: 'config',
        allowEmpty: false
      })
    ).rejects.toMatchObject({ detail: expect.stringContaining('lint failed') })
    await changes.commit(ctx, {
      repo: ctx.root,
      message: 'bypass',
      amend: false,
      signoff: false,
      noVerify: true,
      sign: 'config',
      allowEmpty: false
    })
  })

  it('loads history incrementally with a stable graph, details, blame, tree and reflog', async () => {
    const ctx = await newRepo()
    for (let i = 0; i < 12; i++) {
      write(ctx.root, 'n.txt', `${i}\n`)
      sh(ctx.root, 'add', '-A')
      sh(ctx.root, 'commit', '-qm', `c${i}`)
      if (i === 5) {
        sh(ctx.root, 'checkout', '-qb', 'side')
        write(ctx.root, 's.txt', 'side\n')
        sh(ctx.root, 'add', '.')
        sh(ctx.root, 'commit', '-qm', 'side work')
        sh(ctx.root, 'checkout', '-q', 'main')
      }
    }
    sh(ctx.root, 'merge', '--no-ff', '-q', '-m', 'merge side', 'side')
    sh(ctx.root, 'tag', 'v1')
    const all = await history.log(ctx, { repo: ctx.root, skip: 0, limit: 1000, allRefs: true })
    const p1 = await history.log(ctx, { repo: ctx.root, skip: 0, limit: 5, allRefs: true })
    const p2 = await history.log(ctx, { repo: ctx.root, skip: 5, limit: 1000, allRefs: true })
    expect([...p1.commits, ...p2.commits].map((c) => c.hash)).toEqual(
      all.commits.map((c) => c.hash)
    )
    expect(p1.hasMore).toBe(true)
    const full = layoutGraph(all.commits)
    const a = layoutGraph(p1.commits)
    const b = layoutGraph(p2.commits, a.state)
    expect([...a.rows, ...b.rows]).toEqual(full.rows)
    expect(all.commits[0]!.refs.map((r) => r.type)).toEqual(
      expect.arrayContaining(['head', 'local', 'tag'])
    )

    const found = await history.log(ctx, {
      repo: ctx.root,
      skip: 0,
      limit: 50,
      allRefs: true,
      search: { text: 'SIDE WORK' }
    })
    expect(found.commits.map((c) => c.subject)).toEqual(['side work'])
    const byHash = await history.log(ctx, {
      repo: ctx.root,
      skip: 0,
      limit: 50,
      allRefs: true,
      search: { hash: all.commits[3]!.hash.slice(0, 8) }
    })
    expect(byHash.commits[0]!.hash).toBe(all.commits[3]!.hash)
    const byPath = await history.log(ctx, {
      repo: ctx.root,
      skip: 0,
      limit: 50,
      allRefs: true,
      search: { path: 's.txt' }
    })
    expect(byPath.commits.map((c) => c.subject)).toEqual(['side work'])

    const details = await history.commitDetails(ctx, all.commits[0]!.hash)
    expect(details.parents).toHaveLength(2)
    expect(details.files.map((f) => f.path)).toContain('s.txt')

    const blame = await history.blame(ctx, 'n.txt')
    expect(blame[0]!.summary).toBe('c11')
    const tree = await history.tree(ctx, 'HEAD')
    expect(tree.map((t) => t.name)).toEqual(expect.arrayContaining(['README.md', 'n.txt', 's.txt']))
    const reflog = await history.reflog(ctx, 'HEAD', 10)
    expect(reflog.length).toBeGreaterThan(0)
    const fileLog = await history.fileLog(ctx, 'n.txt', 100)
    expect(fileLog).toHaveLength(12)
    // HEAD is the merge; its first parent is c11 and the one before is c10.
    const blob = await history.blob(ctx, 'HEAD~2', 'n.txt')
    expect(blob).toMatchObject({ kind: 'text', text: '10\n' })
  })

  it('handles shallow clones', async () => {
    const src = await newRepo()
    for (let i = 0; i < 4; i++) {
      write(src.root, 'f.txt', `${i}\n`)
      sh(src.root, 'add', '-A')
      sh(src.root, 'commit', '-qm', `c${i}`)
    }
    const dir = tempDir('shallow')
    sh(dir, 'clone', '-q', '--depth', '2', `file://${src.root.replace(/\\/g, '/')}`, 'clone')
    const ctx = await resolveRepo(join(dir, 'clone'))
    const s = await getStatus(ctx)
    expect(s.isShallow).toBe(true)
    const l = await history.log(ctx, { repo: ctx.root, skip: 0, limit: 100, allRefs: true })
    expect(l.commits).toHaveLength(2)
    expect(() => layoutGraph(l.commits)).not.toThrow()
  })

  it('reports binary files and refuses to load oversized diffs fully', async () => {
    const ctx = await newRepo()
    writeFileSync(join(ctx.root, 'bin.dat'), Buffer.from([0, 1, 2, 3, 0, 255]))
    write(ctx.root, 'big.txt', Array.from({ length: 50_000 }, (_, i) => `line ${i}`).join('\n'))
    sh(ctx.root, 'add', '.')
    const bin = await changes.getDiff(ctx, { kind: 'staged', path: 'bin.dat' }, opts)
    expect(bin.file?.binary).toBe(true)
    const big = await changes.getDiff(
      ctx,
      { kind: 'staged', path: 'big.txt' },
      { ...opts, maxBytes: 20_000 }
    )
    expect(big.truncated).toBe(true)
    expect(big.file?.hunks[0]?.lines.length).toBeLessThan(5000)
  })
})

describe('branches and tags', () => {
  it('creates, renames, checks out and deletes branches and tags', async () => {
    const ctx = await newRepo()
    await branches.createBranch(ctx, { repo: ctx.root, name: 'feature/x', checkout: true })
    expect((await getStatus(ctx)).head.branch).toBe('feature/x')
    await branches.renameBranch(ctx, 'feature/x', 'feature/y')
    await branches.checkout(ctx, 'main')
    await branches.createTag(ctx, {
      repo: ctx.root,
      name: 'v1.0',
      target: 'HEAD',
      message: 'Release 1.0',
      sign: false
    })
    await branches.createTag(ctx, { repo: ctx.root, name: 'light', target: 'HEAD', sign: false })
    const refs = await branches.refsSnapshot(ctx)
    expect(refs.branches.map((b) => b.name).sort()).toEqual(['feature/y', 'main'])
    expect(refs.tags.find((t) => t.name === 'v1.0')?.annotated).toBe(true)
    expect(refs.tags.find((t) => t.name === 'light')?.annotated).toBe(false)
    await branches.deleteBranch(ctx, 'feature/y', false)
    await branches.deleteTag(ctx, 'light')
    const after = await branches.refsSnapshot(ctx)
    expect(after.branches.map((b) => b.name)).toEqual(['main'])
    expect(after.head.branch).toBe('main')
  })

  it('refuses a checkout that would overwrite local changes with an actionable error', async () => {
    const ctx = await newRepo({ 'f.txt': '1\n' })
    sh(ctx.root, 'checkout', '-qb', 'other')
    write(ctx.root, 'f.txt', 'other\n')
    sh(ctx.root, 'commit', '-qam', 'other')
    sh(ctx.root, 'checkout', '-q', 'main')
    write(ctx.root, 'f.txt', 'dirty\n')
    await expect(branches.checkout(ctx, 'other')).rejects.toMatchObject({
      message: expect.stringContaining('uncommitted changes')
    })
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toBe('dirty\n')
  })

  it('discards tracked and untracked changes only when explicitly asked', async () => {
    const ctx = await newRepo({ 'f.txt': '1\n' })
    write(ctx.root, 'f.txt', '2\n')
    write(ctx.root, 'new.txt', 'n\n')
    await changes.discard(ctx, ['f.txt'], ['new.txt'])
    expect(readFileSync(join(ctx.root, 'f.txt'), 'utf8')).toBe('1\n')
    expect(existsSync(join(ctx.root, 'new.txt'))).toBe(false)
    expect(() => changes.insideRepo(ctx, '../escape.txt')).toThrow()
  })
})
