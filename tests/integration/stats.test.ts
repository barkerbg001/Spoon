import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as stats from '../../src/main/git/stats'
import type { RepoCtx } from '../../src/main/git/repo'
import { discoverGit } from '../../src/main/git/runner'
import { cleanup, openCtx, sh, tempDir, write } from './helpers'
import { STATS_EXPECTED, buildStatsFixture } from './statsFixture'

afterAll(cleanup)

let ctx: RepoCtx
let dir: string
beforeAll(async () => {
  await discoverGit()
  dir = tempDir('stats')
  buildStatsFixture(dir)
  ctx = await openCtx(dir)
})

const byEmail = <T extends { email: string }>(list: T[], email: string): T | undefined =>
  list.find((c) => c.email === email)

describe('repository statistics: overview', () => {
  it('counts the current branch with merges reported separately and .mailmap applied', async () => {
    const o = await stats.overview(ctx, { scope: 'head' })
    expect(o.scopeLabel).toBe('main')
    expect(o.totalCommits).toBe(STATS_EXPECTED.head.total)
    expect(o.mergeCommits).toBe(STATS_EXPECTED.head.merges)
    expect(o.contributors).toHaveLength(STATS_EXPECTED.head.contributors)
    expect(o.mailmap).toBe(true)
    expect(o.shallow).toBe(false)
    // The alias alice@old.example is mapped onto Alice: 2 commits + the merge.
    expect(byEmail(o.contributors, 'alice@example.com')).toMatchObject({
      name: 'Alice',
      commits: 2,
      merges: 1,
      firstDate: '2026-01-05',
      lastDate: '2026-03-01'
    })
    expect(byEmail(o.contributors, 'alice@old.example')).toBeUndefined()
    expect(byEmail(o.contributors, 'bob@example.com')).toMatchObject({ commits: 2, merges: 0 })
    expect(byEmail(o.contributors, 'carol@example.com')).toMatchObject({ commits: 1 })
    // Cross-check with Git itself.
    expect(Number(sh(dir, 'rev-list', '--count', 'HEAD').trim())).toBe(o.totalCommits)
    expect(Number(sh(dir, 'rev-list', '--count', '--merges', 'HEAD').trim())).toBe(o.mergeCommits)
    const shortlog = sh(dir, 'shortlog', '-sne', '--no-merges', 'HEAD')
    expect(shortlog).toMatch(/\s2\tAlice <alice@example\.com>/)
    expect(shortlog).not.toContain('alice@old.example')
  })

  it('deduplicates commits reachable from several local branches', async () => {
    const o = await stats.overview(ctx, { scope: 'local' })
    expect(o.scopeLabel).toBe('All local branches (3)')
    expect(o.refs.sort()).toEqual(['feature', 'main', 'other'])
    expect(o.totalCommits).toBe(STATS_EXPECTED.local.total)
    expect(o.contributors).toHaveLength(STATS_EXPECTED.local.contributors)
    expect(Number(sh(dir, 'rev-list', '--count', '--branches').trim())).toBe(o.totalCommits)
    // Activity sums to the total; c1..c3 appear once although three branches contain them.
    expect(o.days.reduce((n, d) => n + d.commits, 0)).toBe(o.totalCommits)
    expect(o.days.find((d) => d.date === '2026-01-05')?.commits).toBe(1)
  })

  it('filters by the author date in the author time zone, inclusive at both ends', async () => {
    const feb = await stats.overview(ctx, {
      scope: 'head',
      since: '2026-02-01',
      until: '2026-02-28'
    })
    expect(feb.totalCommits).toBe(3) // c3, c4, c5
    expect(feb.contributors.map((c) => c.email).sort()).toEqual([
      'bob@example.com',
      'carol@example.com'
    ])
    // c2 is 2026-01-06 23:30 at -05:00 (already 2026-01-07 in UTC): it belongs to 2026-01-06.
    const jan6 = await stats.overview(ctx, {
      scope: 'head',
      since: '2026-01-06',
      until: '2026-01-06'
    })
    expect(jan6.totalCommits).toBe(1)
    expect(jan6.hour[23]).toBe(1)
    const jan7 = await stats.overview(ctx, {
      scope: 'head',
      since: '2026-01-07',
      until: '2026-01-31'
    })
    expect(jan7.totalCommits).toBe(0)
    expect(jan7.empty).toBe(false)
  })

  it('reports weekday and hour from the author clock', async () => {
    const o = await stats.overview(ctx, { scope: 'head' })
    expect(stats.weekdayOf('2026-01-05')).toBe(0) // Monday
    expect(o.weekday.reduce((a, b) => a + b, 0)).toBe(o.totalCommits)
    expect(o.hour[10]).toBe(1) // c1 10:00 +00:00
    expect(o.hour[9]).toBe(1) // c3 09:00 +01:00 (08:00 UTC)
  })

  it('handles detached HEAD and an empty repository', async () => {
    const detachedDir = tempDir('stats-detached')
    buildStatsFixture(detachedDir)
    sh(detachedDir, 'checkout', '-q', '--detach', 'HEAD~1')
    const d = await stats.overview(await openCtx(detachedDir), { scope: 'head' })
    expect(d.scopeLabel).toMatch(/^Detached HEAD at [0-9a-f]{7}$/)
    expect(d.totalCommits).toBe(Number(sh(detachedDir, 'rev-list', '--count', 'HEAD').trim()))

    const emptyDir = tempDir('stats-empty')
    sh(emptyDir, 'init', '-q')
    const ectx = await openCtx(emptyDir)
    const e = await stats.overview(ectx, { scope: 'head' })
    expect(e).toMatchObject({ empty: true, totalCommits: 0, contributors: [] })
    expect((await stats.overview(ectx, { scope: 'local' })).empty).toBe(true)
    expect((await stats.fileStats(ectx, { scope: 'head' })).fileChanges).toBe(0)
  })

  it('labels shallow clones', async () => {
    const parent = tempDir('stats-shallow')
    sh(parent, 'clone', '-q', '--depth', '2', `file://${dir.replace(/\\/g, '/')}`, 'c')
    const s = await stats.overview(await openCtx(`${parent}/c`), { scope: 'head' })
    expect(s.shallow).toBe(true)
  })
})

describe('repository statistics: files and lines', () => {
  it('counts file changes, lines, renames and binary files (merges excluded)', async () => {
    const f = await stats.fileStats(ctx, { scope: 'head' })
    expect(f).toMatchObject(STATS_EXPECTED.files)
    const readme = f.topFiles[0]!
    expect(readme).toMatchObject({ path: 'README.md', commits: 3, added: 5, deleted: 1 })
    // The rename is followed: app.ts's earlier change is credited to src/app.ts.
    expect(f.topFiles.find((x) => x.path === 'src/app.ts')).toMatchObject({ commits: 2, added: 3 })
    expect(f.topFiles.find((x) => x.path === 'app.ts')).toBeUndefined()
    expect(f.topFiles.find((x) => x.path === 'logo.png')).toMatchObject({ binary: true, added: 0 })
    expect(byEmail(f.contributors, 'alice@example.com')).toMatchObject({ added: 5, deleted: 0 })
    expect(byEmail(f.contributors, 'bob@example.com')).toMatchObject({ added: 3, deleted: 1 })
    expect(byEmail(f.contributors, 'carol@example.com')).toMatchObject({ added: 1, deleted: 0 })

    // Independent cross-check of the line totals with git log --numstat.
    let added = 0
    let deleted = 0
    for (const line of sh(dir, 'log', '--no-merges', '-M', '--numstat', '--format=', 'HEAD').split(
      '\n'
    )) {
      const m = /^(\d+)\t(\d+)\t/.exec(line)
      if (m) {
        added += Number(m[1])
        deleted += Number(m[2])
      }
    }
    expect([f.linesAdded, f.linesDeleted]).toEqual([added, deleted])
  })

  it('analyses only commits inside the date range', async () => {
    const f = await stats.fileStats(ctx, { scope: 'local', since: '2026-03-01' })
    // Only Dave's f1 (the merge on 03-01 is excluded from line statistics).
    expect(f).toMatchObject({ commitsAnalysed: 1, fileChanges: 1, linesAdded: 1 })
  })

  it('is cancellable', async () => {
    const big = tempDir('stats-cancel')
    sh(big, 'init', '-q')
    for (let i = 0; i < 30; i++) {
      write(big, `f${i}.txt`, `${i}\n`)
      sh(big, 'add', '.')
      sh(big, 'commit', '-qm', `c${i}`)
    }
    const bctx = await openCtx(big)
    const { cancelOp } = await import('../../src/main/git/runner')
    const p = stats.fileStats(bctx, { scope: 'head', opId: 'stats-cancel' })
    setTimeout(() => cancelOp('stats-cancel'), 0)
    // Either it was cancelled or it finished before the cancel landed; never a wrong result.
    const r = await p.catch((e: { code: string }) => e.code)
    if (typeof r === 'string') expect(r).toBe('CANCELLED')
    else expect(r.commitsAnalysed).toBe(30)

    // A cancel that arrives between two Git processes of the same operation still stops it
    // (statistics run several processes in sequence).
    cancelOp('stats-cancel-early')
    await expect(
      stats.fileStats(bctx, { scope: 'local', opId: 'stats-cancel-early' })
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(
      stats.overview(bctx, { scope: 'local', opId: 'stats-cancel-early' })
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    // Other operations are unaffected.
    expect((await stats.overview(bctx, { scope: 'local', opId: 'stats-other' })).totalCommits).toBe(
      30
    )
  })
})

describe('repository statistics: cache', () => {
  it('reuses file statistics only while branch tips, range and .mailmap are unchanged', async () => {
    const d = tempDir('stats-cache')
    buildStatsFixture(d)
    const c = await openCtx(d)
    const first = await stats.fileStats(c, { scope: 'head' })
    expect(first.cached).toBe(false)
    const again = await stats.fileStats(c, { scope: 'head' })
    expect(again).toMatchObject({ cached: true, linesAdded: first.linesAdded })
    // A different range is a different result.
    expect((await stats.fileStats(c, { scope: 'head', since: '2026-02-01' })).cached).toBe(false)
    // A new commit moves HEAD: recomputed, and the new lines are counted.
    write(d, 'new.txt', 'a\nb\n')
    sh(d, 'add', 'new.txt')
    sh(d, 'commit', '-qm', 'more')
    const after = await stats.fileStats(c, { scope: 'head' })
    expect(after).toMatchObject({ cached: false, linesAdded: first.linesAdded + 2 })
    // Editing .mailmap changes how people are grouped: recomputed.
    write(d, '.mailmap', 'Robert <bob@example.com>\n')
    const remapped = await stats.fileStats(c, { scope: 'head' })
    expect(remapped.cached).toBe(false)
    expect(remapped.contributors.map((x) => x.name)).toContain('Robert')
  })
})
