import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  StatsContributor,
  StatsFileContributor,
  StatsFiles,
  StatsOverview,
  StatsScope,
  StatsTopFile
} from '@shared/types'
import { rgit, type RepoCtx } from './repo'

/**
 * Repository statistics (read-only).
 *
 * Counting rules (also documented in docs/workflows.md):
 * - Scope: "head" = commits reachable from HEAD (current branch or detached HEAD); "local" = commits
 *   reachable from any local branch (refs/heads). Git walks each commit once, so a commit reachable
 *   from several branches is counted once.
 * - Date: the author date in the author's own recorded time zone (`%ai`), i.e. the wall-clock time
 *   the author saw. The range is inclusive: `since` 00:00:00 through `until` 23:59:59 of that clock.
 *   Activity, weekday and hour charts use the same date.
 * - People: `.mailmap` is applied (`%aN`/`%aE`); contributors are grouped by mapped e-mail
 *   (case-insensitive) and shown with their most frequent mapped name.
 * - Merge commits (more than one parent) are included in the total and reported separately;
 *   contributor "commits" exclude merges, and line/file statistics exclude merges because a merge's
 *   diff repeats changes already counted in the merged commits.
 * - File statistics: `git log --numstat -M` against the first parent (root commits against the
 *   empty tree). A rename is one file change credited to the new path, and its line counts are only
 *   the edited lines. Binary files count as file changes with no line counts.
 */

const FMT = '%H%x1f%P%x1f%aN%x1f%aE%x1f%ai'
const MAX_TOP_FILES = 50

export interface StatsArgs {
  scope: StatsScope
  since?: string | null
  until?: string | null
  opId?: string
}

interface RawCommit {
  hash: string
  merge: boolean
  name: string
  email: string
  /** YYYY-MM-DD in the author's time zone */
  date: string
  hour: number
}

function parseAuthorDate(ai: string): { date: string; hour: number } {
  // "2026-11-08 08:35:47 +0200"
  return { date: ai.slice(0, 10), hour: Number(ai.slice(11, 13)) }
}

/** Monday = 0 … Sunday = 6, for a calendar date (independent of any time zone). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const sun0 = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
  return (sun0 + 6) % 7
}

async function scopeRevs(
  ctx: RepoCtx,
  scope: StatsScope
): Promise<{ opts: string[]; revs: string[]; label: string; refs: string[]; empty: boolean }> {
  if (scope === 'local') {
    const r = await rgit(ctx, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
    const refs = r.stdout.split('\n').filter(Boolean)
    return {
      opts: ['--branches'],
      revs: [],
      label: `All local branches (${refs.length})`,
      refs,
      empty: refs.length === 0
    }
  }
  const head = await rgit(ctx, ['rev-parse', '--verify', '--quiet', 'HEAD'], {
    okCodes: [0, 1, 128]
  })
  const oid = head.exitCode === 0 ? head.stdout.trim() : ''
  const sym = await rgit(ctx, ['symbolic-ref', '-q', '--short', 'HEAD'], { okCodes: [0, 1, 128] })
  const branch = sym.exitCode === 0 ? sym.stdout.trim() : ''
  const label = branch
    ? branch
    : oid
      ? `Detached HEAD at ${oid.slice(0, 7)}`
      : 'HEAD (no commits yet)'
  return { opts: [], revs: ['HEAD'], label, refs: branch ? [branch] : [], empty: !oid }
}

const inRange = (date: string, since?: string | null, until?: string | null): boolean =>
  (!since || date >= since) && (!until || date <= until)

async function listCommits(
  ctx: RepoCtx,
  a: StatsArgs
): Promise<{
  commits: RawCommit[]
  label: string
  refs: string[]
  empty: boolean
}> {
  const s = await scopeRevs(ctx, a.scope)
  if (s.empty) return { commits: [], label: s.label, refs: s.refs, empty: true }
  // No --since/--until: Git filters those on the committer date, but statistics use the author
  // date, so the range is applied here.
  const out = await rgit(
    ctx,
    ['log', '-z', `--format=${FMT}`, ...s.opts, '--end-of-options', ...s.revs, '--'],
    { opId: a.opId }
  )
  const commits: RawCommit[] = []
  for (const rec of out.stdout.split('\0')) {
    if (!rec) continue
    const f = rec.replace(/^\n/, '').split('\x1f')
    if (f.length < 5) continue
    const { date, hour } = parseAuthorDate(f[4]!)
    if (!inRange(date, a.since, a.until)) continue
    commits.push({
      hash: f[0]!,
      merge: f[1]!.trim().split(' ').filter(Boolean).length > 1,
      name: f[2]!,
      email: f[3]!,
      date,
      hour
    })
  }
  return { commits, label: s.label, refs: s.refs, empty: false }
}

async function isShallow(ctx: RepoCtx): Promise<boolean> {
  const r = await rgit(ctx, ['rev-parse', '--is-shallow-repository'], { okCodes: [0, 128, 129] })
  if (r.exitCode === 0) return r.stdout.trim() === 'true'
  return existsSync(join(ctx.commonDir, 'shallow'))
}

const keyOf = (email: string, name: string): string => (email || name).toLowerCase()

/** Pick the most frequent display name per contributor. */
class Names {
  private counts = new Map<string, Map<string, number>>()
  add(key: string, name: string): void {
    const m = this.counts.get(key) ?? new Map<string, number>()
    m.set(name, (m.get(name) ?? 0) + 1)
    this.counts.set(key, m)
  }
  best(key: string): string {
    const m = this.counts.get(key)
    if (!m) return key
    return [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0]
  }
}

export async function overview(ctx: RepoCtx, a: StatsArgs): Promise<StatsOverview> {
  const started = Date.now()
  const [{ commits, label, refs, empty }, shallow] = await Promise.all([
    listCommits(ctx, a),
    isShallow(ctx)
  ])
  const people = new Map<string, StatsContributor>()
  const names = new Names()
  const days = new Map<string, number>()
  const weekday = Array<number>(7).fill(0)
  const hour = Array<number>(24).fill(0)
  let merges = 0
  for (const c of commits) {
    const key = keyOf(c.email, c.name)
    names.add(key, c.name)
    const p = people.get(key) ?? {
      name: c.name,
      email: c.email,
      commits: 0,
      merges: 0,
      firstDate: c.date,
      lastDate: c.date
    }
    if (c.merge) p.merges++
    else p.commits++
    if (c.date < p.firstDate) p.firstDate = c.date
    if (c.date > p.lastDate) p.lastDate = c.date
    people.set(key, p)
    if (c.merge) merges++
    days.set(c.date, (days.get(c.date) ?? 0) + 1)
    weekday[weekdayOf(c.date)]!++
    if (c.hour >= 0 && c.hour < 24) hour[c.hour]!++
  }
  const contributors = [...people.entries()]
    .map(([key, p]) => ({ ...p, name: names.best(key) }))
    .sort((x, y) => y.commits + y.merges - (x.commits + x.merges) || x.name.localeCompare(y.name))
  const dayList = [...days.entries()]
    .map(([date, n]) => ({ date, commits: n }))
    .sort((x, y) => x.date.localeCompare(y.date))
  return {
    scope: a.scope,
    scopeLabel: label,
    refs,
    since: a.since ?? null,
    until: a.until ?? null,
    shallow,
    empty,
    mailmap: existsSync(join(ctx.root, '.mailmap')),
    totalCommits: commits.length,
    mergeCommits: merges,
    contributors,
    days: dayList,
    weekday,
    hour,
    firstDate: dayList[0]?.date ?? null,
    lastDate: dayList[dayList.length - 1]?.date ?? null,
    elapsedMs: Date.now() - started
  }
}

interface NumstatEntry {
  added: number | null
  deleted: number | null
  path: string
  oldPath?: string
}

/** Parse `git log -z --numstat --format=%x1e<header>` output. */
export function parseNumstatLog(out: string): { header: string; files: NumstatEntry[] }[] {
  const result: { header: string; files: NumstatEntry[] }[] = []
  for (const rec of out.split('\x1e')) {
    if (!rec) continue
    const nul = rec.indexOf('\0')
    const header = nul < 0 ? rec : rec.slice(0, nul)
    const tokens = nul < 0 ? [] : rec.slice(nul + 1).split('\0')
    const files: NumstatEntry[] = []
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!.replace(/^\n+/, '')
      const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(t)
      if (!m) continue
      const added = m[1] === '-' ? null : Number(m[1])
      const deleted = m[2] === '-' ? null : Number(m[2])
      if (m[3] === '') {
        const oldPath = tokens[++i]
        const path = tokens[++i]
        if (oldPath !== undefined && path !== undefined)
          files.push({ added, deleted, path, oldPath })
      } else files.push({ added, deleted, path: m[3]! })
    }
    result.push({ header, files })
  }
  return result
}

// Results are cached by everything that determines them: the exact commits the scope starts from,
// the range and the .mailmap content. Any new commit, branch move or .mailmap edit changes the key.
const cache = new Map<string, StatsFiles>()
const CACHE_ENTRIES = 24

async function cacheKey(ctx: RepoCtx, a: StatsArgs): Promise<string> {
  const tips =
    a.scope === 'local'
      ? (await rgit(ctx, ['for-each-ref', '--format=%(objectname)', 'refs/heads'])).stdout
      : (await rgit(ctx, ['rev-parse', '--verify', '--quiet', 'HEAD'], { okCodes: [0, 1, 128] }))
          .stdout
  let mailmap = ''
  try {
    mailmap = readFileSync(join(ctx.root, '.mailmap'), 'utf8')
  } catch {
    /* none */
  }
  return createHash('sha1')
    .update(JSON.stringify([ctx.commonDir, a.scope, a.since ?? '', a.until ?? '', tips, mailmap]))
    .digest('hex')
}

export async function fileStats(ctx: RepoCtx, a: StatsArgs): Promise<StatsFiles> {
  const started = Date.now()
  const key = await cacheKey(ctx, a)
  const hit = cache.get(key)
  if (hit) return { ...hit, cached: true, elapsedMs: Date.now() - started }
  const result = await computeFileStats(ctx, a, started)
  cache.set(key, result)
  if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value!)
  return result
}

async function computeFileStats(ctx: RepoCtx, a: StatsArgs, started: number): Promise<StatsFiles> {
  const { commits } = await listCommits(ctx, a)
  const nonMerge = commits.filter((c) => !c.merge)
  const empty: StatsFiles = {
    commitsAnalysed: 0,
    fileChanges: 0,
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    binaryChanges: 0,
    renames: 0,
    contributors: [],
    topFiles: [],
    elapsedMs: 0,
    cached: false
  }
  if (nonMerge.length === 0) return { ...empty, elapsedMs: Date.now() - started }
  // Only the commits in range are diffed: their ids go in on stdin, newest first.
  const out = await rgit(
    ctx,
    [
      'log',
      '-z',
      '--no-walk=unsorted',
      '--stdin',
      '--numstat',
      '-M',
      '--no-ext-diff',
      '--no-textconv',
      '--format=%x1e%H%x1f%aN%x1f%aE',
      '--'
    ],
    { input: nonMerge.map((c) => c.hash).join('\n') + '\n', opId: a.opId }
  )
  const people = new Map<string, StatsFileContributor>()
  const names = new Names()
  const files = new Map<string, StatsTopFile>()
  // Newest first: when a rename old -> new is seen, older changes to `old` belong to the newest
  // name of that file.
  const renamedTo = new Map<string, string>()
  const canonical = (p: string): string => renamedTo.get(p) ?? p
  let fileChanges = 0
  let added = 0
  let deleted = 0
  let binary = 0
  let renames = 0
  for (const rec of parseNumstatLog(out.stdout)) {
    const [, name = '', email = ''] = rec.header.split('\x1f')
    const key = keyOf(email, name)
    names.add(key, name)
    const p = people.get(key) ?? { name, email, added: 0, deleted: 0, fileChanges: 0 }
    for (const f of rec.files) {
      const path = canonical(f.path)
      if (f.oldPath !== undefined && f.oldPath !== f.path) {
        renames++
        renamedTo.set(f.oldPath, path)
      }
      fileChanges++
      p.fileChanges++
      const isBinary = f.added === null || f.deleted === null
      if (isBinary) binary++
      const entry = files.get(path) ?? { path, commits: 0, added: 0, deleted: 0, binary: false }
      entry.commits++
      if (isBinary) entry.binary = true
      else {
        entry.added += f.added!
        entry.deleted += f.deleted!
        added += f.added!
        deleted += f.deleted!
        p.added += f.added!
        p.deleted += f.deleted!
      }
      files.set(path, entry)
    }
    people.set(key, p)
  }
  const contributors = [...people.entries()]
    .map(([key, v]) => ({ ...v, name: names.best(key) }))
    .sort((x, y) => y.added + y.deleted - (x.added + x.deleted) || x.name.localeCompare(y.name))
  const topFiles = [...files.values()]
    .sort((x, y) => y.commits - x.commits || x.path.localeCompare(y.path))
    .slice(0, MAX_TOP_FILES)
  return {
    commitsAnalysed: nonMerge.length,
    fileChanges,
    filesChanged: files.size,
    linesAdded: added,
    linesDeleted: deleted,
    binaryChanges: binary,
    renames,
    contributors,
    topFiles,
    elapsedMs: Date.now() - started,
    cached: false
  }
}
