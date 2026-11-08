import * as React from 'react'
import { BarChart3, RefreshCw, X } from 'lucide-react'
import type { StatsFiles, StatsOverview, StatsScope } from '@shared/types'
import { call, newOpId } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useRepo } from '@/app/repo/context'
import { Button } from '@/components/ui/button'
import { EmptyState, Input, Select, Spinner } from '@/components/ui/primitives'
import { bucketActivity, presetRange, type RangePreset } from './bucket'

// Data loading -----------------------------------------------------------------------------

interface Loaded<T> {
  data: T | null
  error: string | null
  loading: boolean
  /** The arguments the current `data` was computed for */
  forKey: string | null
}

/**
 * Loads statistics for one set of arguments. A new key (repository, scope, range) or refresh
 * cancels the Git process still running for the previous one and discards its late result, so a
 * slow query can never overwrite the view that is now showing. The previous numbers stay visible
 * (dimmed) while the next result loads.
 */
function useStats<T>(
  key: string,
  version: number,
  fn: (opId: string) => Promise<T>
): Loaded<T> & { cancel: () => void } {
  const [state, setState] = React.useState<Loaded<T>>({
    data: null,
    error: null,
    loading: true,
    forKey: null
  })
  const current = React.useRef<string | null>(null)
  const fnRef = React.useRef(fn)
  React.useLayoutEffect(() => {
    fnRef.current = fn
  })
  React.useEffect(() => {
    const opId = newOpId()
    current.current = opId
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current(opId)
      .then((data) => {
        if (current.current === opId) setState({ data, error: null, loading: false, forKey: key })
      })
      .catch((e: { code?: string; message?: string }) => {
        if (current.current !== opId) return
        setState((s) => ({
          ...s,
          loading: false,
          error: e.code === 'CANCELLED' ? 'Cancelled.' : (e.message ?? String(e))
        }))
      })
    return () => {
      if (current.current === opId) current.current = null
      void call('op.cancel', { opId }).catch(() => undefined)
    }
  }, [key, version])
  const cancel = React.useCallback(() => {
    const opId = current.current
    if (opId) void call('op.cancel', { opId }).catch(() => undefined)
  }, [])
  return { ...state, cancel }
}

// Small presentational pieces ------------------------------------------------------------------

const nf = new Intl.NumberFormat()
const fmt = (n: number): string => nf.format(n)

function Tile({
  label,
  value,
  hint,
  testId
}: {
  label: string
  value: React.ReactNode
  hint?: string
  testId?: string
}): React.JSX.Element {
  return (
    <div className="min-w-[8.5rem] flex-1 rounded-md border bg-card px-3 py-2" data-testid={testId}>
      <div className="text-[0.82em] text-muted-foreground">{label}</div>
      <div className="text-[1.45em] font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[0.78em] text-muted-foreground">{hint}</div>}
    </div>
  )
}

function Section({
  title,
  aside,
  children
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-[0.85em] text-muted-foreground">{aside}</span>
      </div>
      {children}
    </section>
  )
}

/**
 * Single-series bar chart. Bars use the accent color (validated against light and dark surfaces);
 * values are available on hover/focus, in the caption line, and in a table.
 */
function BarChart({
  label,
  bars,
  height = 120,
  unit = 'commits'
}: {
  label: string
  bars: { key: string; label: string; value: number }[]
  height?: number
  unit?: string
}): React.JSX.Element {
  const [hover, setHover] = React.useState<number | null>(null)
  const [table, setTable] = React.useState(false)
  const max = Math.max(1, ...bars.map((b) => b.value))
  const shown = hover !== null ? bars[hover] : null
  return (
    <figure className="space-y-1">
      <div className="flex items-center gap-2 text-[0.85em] text-muted-foreground">
        <span className="min-h-[1.3em] flex-1 tabular-nums" aria-live="polite">
          {shown ? `${shown.label}: ${fmt(shown.value)} ${unit}` : label}
        </span>
        <button className="underline-offset-2 hover:underline" onClick={() => setTable(!table)}>
          {table ? 'Hide values' : 'Show values'}
        </button>
      </div>
      <div
        role="img"
        aria-label={`${label}. ${bars.length} bars; largest ${fmt(max)} ${unit}.`}
        className="flex items-end gap-[2px] border-b border-border"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {bars.map((b, i) => (
          <div
            key={b.key}
            className="flex h-full min-w-[3px] flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            title={`${b.label}: ${fmt(b.value)} ${unit}`}
          >
            <div
              className={cn(
                'w-full rounded-t-[4px] bg-primary transition-opacity',
                hover !== null && hover !== i && 'opacity-55'
              )}
              style={{ height: b.value ? `${Math.max(2, (b.value / max) * 100)}%` : 0 }}
            />
          </div>
        ))}
      </div>
      {bars.length > 0 && bars.length <= 24 ? (
        // Short categorical axes (weekday, hour): a label under the bars, every bar or every 6th.
        <div className="flex gap-[2px] text-[0.75em] text-muted-foreground" aria-hidden>
          {bars.map((b, i) => (
            <span key={b.key} className="min-w-0 flex-1 text-center">
              {bars.length <= 12 || i % 6 === 0 ? b.label : ''}
            </span>
          ))}
        </div>
      ) : (
        bars.length > 0 && (
          <div className="flex justify-between text-[0.75em] text-muted-foreground">
            <span>{bars[0]!.label}</span>
            {bars.length > 1 && <span>{bars[bars.length - 1]!.label}</span>}
          </div>
        )
      )}
      {table && (
        <div className="max-h-48 overflow-auto rounded border">
          <table className="w-full text-[0.85em] tabular-nums">
            <tbody>
              {bars.map((b) => (
                <tr key={b.key} className="border-b last:border-0">
                  <td className="px-2 py-0.5">{b.label}</td>
                  <td className="px-2 py-0.5 text-right">{fmt(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  )
}

type SortKey = 'name' | 'commits' | 'merges' | 'added' | 'deleted' | 'fileChanges' | 'lastDate'

function SortHeader({
  k,
  label,
  sort,
  setSort,
  right
}: {
  k: SortKey
  label: string
  sort: { key: SortKey; desc: boolean }
  setSort: (s: { key: SortKey; desc: boolean }) => void
  right?: boolean
}): React.JSX.Element {
  const active = sort.key === k
  return (
    <th
      className={cn('px-2 py-1 font-medium', right && 'text-right')}
      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        className="hover:underline"
        onClick={() => setSort({ key: k, desc: active ? !sort.desc : k !== 'name' })}
      >
        {label}
        {active ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The view -------------------------------------------------------------------------------------

export function StatsView(): React.JSX.Element {
  const r = useRepo()
  const [scope, setScope] = React.useState<StatsScope>('head')
  const [preset, setPreset] = React.useState<RangePreset>('all')
  const [custom, setCustom] = React.useState<{ since: string; until: string }>({
    since: '',
    until: ''
  })
  const [manual, setManual] = React.useState(0)
  const range =
    preset === 'custom'
      ? { since: custom.since || null, until: custom.until || null }
      : presetRange(preset, new Date())
  const rangeError =
    range.since && range.until && range.since > range.until
      ? 'The start date is after the end date.'
      : null
  const key = JSON.stringify([r.path, scope, range.since, range.until])
  // Refs or HEAD moving (Spoon or external Git, via the watcher) bumps historyVersion.
  const version = r.historyVersion + manual

  const overview = useStats<StatsOverview | null>(key, version, (opId) =>
    rangeError
      ? Promise.resolve(null)
      : call('stats.overview', { repo: r.path, scope, ...range, opId })
  )
  const files = useStats<StatsFiles | null>(key, version, (opId) =>
    rangeError
      ? Promise.resolve(null)
      : call('stats.files', { repo: r.path, scope, ...range, opId })
  )
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: 'commits',
    desc: true
  })

  const o = overview.data
  const f = files.data
  const filesCurrent = files.forKey === overview.forKey
  const repoName = r.path.split(/[\\/]/).filter(Boolean).pop() ?? r.path
  const branchLabel = r.status?.head.detached
    ? `Detached HEAD (${r.status.head.oid?.slice(0, 7) ?? ''})`
    : `Current branch (${r.status?.head.branch ?? 'HEAD'})`
  const rangeText =
    range.since || range.until
      ? `${range.since ?? 'the first commit'} to ${range.until ?? 'today'}`
      : 'all time'

  const rows = React.useMemo(() => {
    if (!o) return []
    const lines = new Map(
      (filesCurrent && f ? f.contributors : []).map((c) => [c.email.toLowerCase(), c])
    )
    const list = o.contributors.map((c) => {
      const l = lines.get(c.email.toLowerCase())
      return {
        ...c,
        added: l?.added ?? null,
        deleted: l?.deleted ?? null,
        fileChanges: l?.fileChanges ?? null
      }
    })
    const dir = sort.desc ? -1 : 1
    return list.sort((a, b) => {
      const va = a[sort.key] ?? -1
      const vb = b[sort.key] ?? -1
      const c =
        typeof va === 'string' && typeof vb === 'string'
          ? va.localeCompare(vb)
          : Number(va) - Number(vb)
      return c * dir || a.name.localeCompare(b.name)
    })
  }, [o, f, filesCurrent, sort])

  const activity = React.useMemo(
    () =>
      o ? bucketActivity(o.days, range.since ?? o.firstDate, range.until ?? o.lastDate) : null,
    [o, range.since, range.until]
  )

  const header = (
    <div className="shrink-0 space-y-2 border-b bg-panel px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-1.5 font-semibold">
          <BarChart3 className="size-4 text-muted-foreground" /> Statistics
        </h1>
        <span className="truncate text-muted-foreground" title={r.path} data-selectable>
          {repoName}
        </span>
        <span className="flex-1" />
        <Select
          aria-label="Branches counted"
          value={scope}
          onChange={(e) => setScope(e.target.value as StatsScope)}
          className="h-7 text-[0.9em]"
        >
          <option value="head">{branchLabel}</option>
          <option value="local">All local branches ({r.refs?.branches.length ?? '…'})</option>
        </Select>
        <div role="group" aria-label="Date range" className="flex rounded-md border">
          {(
            [
              ['30d', 'Last 30 days'],
              ['90d', 'Last 90 days'],
              ['all', 'All time'],
              ['custom', 'Custom']
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              aria-pressed={preset === p}
              onClick={() => setPreset(p)}
              className={cn(
                'px-2 py-1 text-[0.88em] first:rounded-l-md last:rounded-r-md',
                preset === p ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <span className="flex items-center gap-1">
            <Input
              type="date"
              aria-label="From date"
              value={custom.since}
              onChange={(e) => setCustom((c) => ({ ...c, since: e.target.value }))}
              className="h-7 w-36 text-[0.88em]"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              aria-label="To date"
              value={custom.until}
              onChange={(e) => setCustom((c) => ({ ...c, until: e.target.value }))}
              className="h-7 w-36 text-[0.88em]"
            />
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setManual((n) => n + 1)}
          aria-label="Refresh statistics"
        >
          <RefreshCw className={cn(overview.loading && 'animate-spin')} />
        </Button>
      </div>
      <p className="text-[0.85em] text-muted-foreground" data-testid="stats-scope">
        {o ? o.scopeLabel : scope === 'head' ? branchLabel : 'All local branches'} · {rangeText} ·
        author dates in each author&apos;s time zone
        {o?.mailmap ? ' · .mailmap applied' : ''}
        {o?.shallow && (
          <span className="ml-1.5 rounded bg-modified/15 px-1.5 py-0.5 text-modified">
            Shallow clone: based on the available local history only
          </span>
        )}
      </p>
    </div>
  )

  let body: React.ReactNode
  if (rangeError) body = <EmptyState title="Check the date range">{rangeError}</EmptyState>
  else if (!o && overview.loading)
    body = (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Spinner /> Counting commits…
      </div>
    )
  else if (!o && overview.error)
    body = (
      <EmptyState title="Could not compute statistics">
        {overview.error}{' '}
        <button className="underline" onClick={() => setManual((n) => n + 1)}>
          Try again
        </button>
      </EmptyState>
    )
  else if (o && o.empty)
    body = (
      <EmptyState icon={<BarChart3 />} title="No history yet">
        {scope === 'local'
          ? 'There are no local branches with commits.'
          : 'This repository has no commits yet. Statistics appear after the first commit.'}
      </EmptyState>
    )
  else if (o && o.totalCommits === 0)
    body = (
      <EmptyState icon={<BarChart3 />} title="No commits in this range">
        Nothing was authored between {range.since ?? 'the first commit'} and{' '}
        {range.until ?? 'today'} on {o.scopeLabel}. Try a longer range.
      </EmptyState>
    )
  else if (o) {
    const nonMerge = o.totalCommits - o.mergeCommits
    body = (
      <div
        className={cn('space-y-5 p-3 transition-opacity', overview.loading && 'opacity-60')}
        aria-busy={overview.loading}
      >
        <div className="flex flex-wrap gap-2">
          <Tile
            testId="stat-total"
            label="Commits"
            value={fmt(o.totalCommits)}
            hint={`${fmt(nonMerge)} regular, ${fmt(o.mergeCommits)} merge`}
          />
          <Tile
            testId="stat-contributors"
            label="Contributors"
            value={fmt(o.contributors.length)}
            hint="Unique authors after .mailmap"
          />
          <Tile
            label="Active days"
            value={fmt(o.days.length)}
            hint="Days with at least one commit"
          />
          <Tile label="First commit" value={o.firstDate ?? '—'} />
          <Tile label="Latest commit" value={o.lastDate ?? '—'} />
        </div>

        {activity && (
          <Section title="Commit activity" aside={`commits per ${activity.unit}`}>
            <BarChart label={`Commits per ${activity.unit}, ${rangeText}`} bars={activity.bars} />
          </Section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="By weekday" aside="author's local time">
            <BarChart
              label="Commits by weekday"
              height={80}
              bars={o.weekday.map((v, i) => ({ key: String(i), label: WEEKDAYS[i]!, value: v }))}
            />
          </Section>
          <Section title="By hour" aside="author's local time">
            <BarChart
              label="Commits by hour of day"
              height={80}
              bars={o.hour.map((v, i) => ({
                key: String(i),
                label: `${String(i).padStart(2, '0')}:00`,
                value: v
              }))}
            />
          </Section>
        </div>

        <Section
          title="Contributors"
          aside="Commits exclude merges; line changes come from the file statistics below"
        >
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-[0.9em] tabular-nums" aria-label="Contributors">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <SortHeader k="name" label="Author" sort={sort} setSort={setSort} />
                  <SortHeader k="commits" label="Commits" sort={sort} setSort={setSort} right />
                  <SortHeader k="merges" label="Merges" sort={sort} setSort={setSort} right />
                  <th className="px-2 py-1 text-right font-medium">Share</th>
                  <SortHeader k="added" label="Lines +" sort={sort} setSort={setSort} right />
                  <SortHeader k="deleted" label="Lines −" sort={sort} setSort={setSort} right />
                  <SortHeader
                    k="fileChanges"
                    label="File changes"
                    sort={sort}
                    setSort={setSort}
                    right
                  />
                  <SortHeader k="lastDate" label="Active" sort={sort} setSort={setSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.email + c.name} className="border-b last:border-0">
                    <td className="px-2 py-1">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[0.85em] text-muted-foreground" data-selectable>
                        {c.email}
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right">{fmt(c.commits)}</td>
                    <td className="px-2 py-1 text-right">{fmt(c.merges)}</td>
                    <td className="px-2 py-1 text-right text-muted-foreground">
                      {nonMerge ? `${Math.round((c.commits / nonMerge) * 100)}%` : '—'}
                    </td>
                    <td className="px-2 py-1 text-right text-added">
                      {c.added === null ? '…' : fmt(c.added)}
                    </td>
                    <td className="px-2 py-1 text-right text-removed">
                      {c.deleted === null ? '…' : fmt(c.deleted)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {c.fileChanges === null ? '…' : fmt(c.fileChanges)}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                      {c.firstDate === c.lastDate ? c.firstDate : `${c.firstDate} – ${c.lastDate}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Files and lines"
          aside={
            f && filesCurrent
              ? `${fmt(f.commitsAnalysed)} non-merge commits analysed${f.cached ? ' (cached)' : ` in ${(f.elapsedMs / 1000).toFixed(1)} s`}`
              : undefined
          }
        >
          {files.loading && (
            <div className="flex items-center gap-2 text-[0.9em] text-muted-foreground">
              <Spinner /> Analysing file changes (this reads every commit&apos;s diff)…
              <Button size="sm" variant="ghost" onClick={files.cancel}>
                <X /> Cancel
              </Button>
            </div>
          )}
          {!files.loading && files.error && (
            <div className="text-[0.9em] text-muted-foreground">
              File statistics unavailable: {files.error}{' '}
              <button className="underline" onClick={() => setManual((n) => n + 1)}>
                Run again
              </button>
            </div>
          )}
          {f && filesCurrent && (
            <div className={cn('space-y-3', files.loading && 'opacity-60')}>
              <div className="flex flex-wrap gap-2">
                <Tile
                  testId="stat-files-changed"
                  label="Files changed"
                  value={fmt(f.filesChanged)}
                  hint={`${fmt(f.fileChanges)} file changes in total`}
                />
                <Tile
                  testId="stat-lines"
                  label="Lines"
                  value={
                    <span>
                      <span className="text-added">+{fmt(f.linesAdded)}</span>{' '}
                      <span className="text-removed">−{fmt(f.linesDeleted)}</span>
                    </span>
                  }
                  hint="Text files, merges excluded"
                />
                <Tile label="Binary changes" value={fmt(f.binaryChanges)} hint="No line counts" />
                <Tile label="Renames" value={fmt(f.renames)} hint="Detected with -M" />
              </div>
              <div className="overflow-auto rounded-md border">
                <table className="w-full text-[0.9em] tabular-nums" aria-label="Most changed files">
                  <thead className="border-b bg-muted/40 text-left">
                    <tr>
                      <th className="px-2 py-1 font-medium">Most frequently changed files</th>
                      <th className="px-2 py-1 text-right font-medium">Commits</th>
                      <th className="px-2 py-1 text-right font-medium">Lines +</th>
                      <th className="px-2 py-1 text-right font-medium">Lines −</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.topFiles.map((t) => (
                      <tr key={t.path} className="border-b last:border-0">
                        <td className="px-2 py-1 font-mono text-[0.92em]" data-selectable>
                          {t.path}
                          {t.binary && (
                            <span className="ml-1.5 text-[0.85em] text-muted-foreground">
                              (binary)
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">{fmt(t.commits)}</td>
                        <td className="px-2 py-1 text-right text-added">{fmt(t.added)}</td>
                        <td className="px-2 py-1 text-right text-removed">{fmt(t.deleted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        <details className="rounded-md border bg-muted/30 px-3 py-2 text-[0.88em] text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground/80">
            How these numbers are counted
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Each commit is counted once, even when several branches contain it. &quot;Current
              branch&quot; counts what HEAD can reach; &quot;All local branches&quot; counts what
              any branch under refs/heads can reach (not remote-tracking branches or tags).
            </li>
            <li>
              Dates are author dates on the author&apos;s own clock (the time zone recorded in the
              commit). A range includes both its start and end day, from 00:00 to 23:59. Presets end
              today, by your computer&apos;s calendar.
            </li>
            <li>
              Authors are merged through the repository&apos;s .mailmap and grouped by e-mail.
            </li>
            <li>
              Merge commits count towards the total and are listed separately; contributor commits
              and all line and file numbers exclude merges, because a merge&apos;s diff repeats work
              already counted in the merged commits.
            </li>
            <li>
              A file change is one file in one commit. A rename counts once, for the new name, with
              only the edited lines; older changes are credited to the newest name. Binary files
              count as file changes without line numbers.
            </li>
            <li>Only history present on this computer is counted.</li>
          </ul>
        </details>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </div>
  )
}
