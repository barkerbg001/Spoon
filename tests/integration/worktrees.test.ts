import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import * as extras from '../../src/main/git/extras'
import { cleanup, newRepo, openCtx, sh, tempDir, write } from './helpers'

afterAll(cleanup)

describe('worktree safety', () => {
  it('lists uncommitted changes before removal and refuses a dirty remove without force', async () => {
    const ctx = await newRepo({ 'a.txt': 'a\n' })
    const parent = tempDir('wt')
    const wt = join(parent, 'feature wörktree')
    await extras.addWorktree(ctx, { repo: ctx.root, path: wt, newBranch: 'feature' })
    write(wt, 'a.txt', 'changed\n')
    write(wt, 'new file.txt', 'n\n')

    const st = await extras.worktreeStatus(ctx, wt)
    expect(st).toMatchObject({ branch: 'feature', main: false, current: false, missing: false })
    expect(st.changes.sort()).toEqual(['modified   a.txt', 'untracked  new file.txt'])

    await expect(extras.removeWorktree(ctx, wt, false)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('uncommitted changes')
    })
    expect(existsSync(join(wt, 'new file.txt'))).toBe(true)

    await extras.removeWorktree(ctx, wt, true)
    expect(existsSync(wt)).toBe(false)
    // The branch survives the worktree.
    expect(sh(ctx.root, 'branch', '--list', 'feature').trim()).toBe('feature')
  })

  it('removes a clean worktree, and refuses the main worktree, the current one and unknown folders', async () => {
    const ctx = await newRepo()
    const wt = join(tempDir('wt'), 'clean')
    await extras.addWorktree(ctx, { repo: ctx.root, path: wt, newBranch: 'clean' })
    const linked = await openCtx(wt)

    await expect(extras.removeWorktree(ctx, ctx.root, true)).rejects.toMatchObject({
      message: expect.stringContaining('main worktree')
    })
    await expect(extras.removeWorktree(linked, wt, true)).rejects.toMatchObject({
      message: expect.stringContaining('working in')
    })
    const stranger = tempDir('not-a-worktree')
    mkdirSync(join(stranger, 'x'), { recursive: true })
    await expect(extras.worktreeStatus(ctx, stranger)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(extras.removeWorktree(ctx, stranger, true)).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
    expect(existsSync(join(stranger, 'x'))).toBe(true)

    expect((await extras.worktreeStatus(ctx, wt)).changes).toEqual([])
    await extras.removeWorktree(ctx, wt, false)
    expect(existsSync(wt)).toBe(false)
  })

  it('requires force for a locked worktree', async () => {
    const ctx = await newRepo()
    const wt = join(tempDir('wt'), 'locked')
    await extras.addWorktree(ctx, { repo: ctx.root, path: wt, newBranch: 'locked' })
    sh(ctx.root, 'worktree', 'lock', wt)
    expect((await extras.worktreeStatus(ctx, wt)).locked).toBe(true)
    await expect(extras.removeWorktree(ctx, wt, false)).rejects.toMatchObject({
      message: expect.stringContaining('locked')
    })
    await extras.removeWorktree(ctx, wt, true)
    expect(existsSync(wt)).toBe(false)
  })
})
