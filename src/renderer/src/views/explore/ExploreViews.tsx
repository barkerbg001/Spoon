import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowLeft,
  Copy,
  File,
  FileClock,
  Folder,
  FolderGit2,
  GitBranchPlus,
  History,
  RotateCcw,
  ArrowDownToLine
} from 'lucide-react'
import type {
  BlameLine,
  BlobContent,
  CommitFile,
  FileLogEntry,
  ReflogEntry,
  TreeEntry
} from '@shared/types'
import { call } from '@/lib/api'
import { highlightLine, languageFor } from '@/lib/highlight'
import { cn, formatBytes, fullDate, relativeTime, short } from '@/lib/utils'
import { useRepo } from '@/app/repo/context'
import * as A from '@/app/repo/actions'
import { Button } from '@/components/ui/button'
import { EmptyState, Input, Select, Spinner } from '@/components/ui/primitives'
import { ContextMenu, type MenuItem } from '@/components/ui/menu'
import { Split } from '@/components/ui/split'
import { DiffView } from '../diff/DiffView'
import { useDiff } from '../diff/useDiff'
import { CommitDetails, FilesAndDiff } from '../history/CommitDetails'

function ViewHeader({
  title,
  children
}: {
  title: React.ReactNode
  children?: React.ReactNode
}): React.JSX.Element {
  const r = useRepo()
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => r.setView({ kind: 'history' })}
        aria-label="Back to history"
      >
        <ArrowLeft /> History
      </Button>
      <div className="min-w-0 flex-1 truncate font-medium">{title}</div>
      {children}
    </div>
  )
}

function useLoad<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList
): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = React.useState<{
    data: T | null
    error: string | null
    loading: boolean
  }>({ data: null, error: null, loading: true })
  React.useEffect(() => {
    let alive = true
    setState({ data: null, error: null, loading: true })
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

// File history ------------------------------------------------------------------------

export function FileHistoryView({ path }: { path: string }): React.JSX.Element {
  const r = useRepo()
  const { data, error, loading } = useLoad(
    () => call('history.fileLog', { repo: r.path, path, limit: 2000 }),
    [r.path, path, r.historyVersion]
  )
  const [sel, setSel] = React.useState<FileLogEntry | null>(null)
  React.useEffect(() => setSel(data?.[0] ?? null), [data])
  const diff = useDiff(
    r.path,
    sel ? { kind: 'commit', hash: sel.hash, path: sel.path, origPath: sel.origPath } : null
  )

  const list = (
    <div
      className="min-h-0 flex-1 overflow-auto"
      role="listbox"
      aria-label="File history"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!data || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
        e.preventDefault()
        const i = data.findIndex((c) => c.hash === sel?.hash)
        setSel(
          data[Math.max(0, Math.min(data.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] ?? null
        )
      }}
    >
      {loading && (
        <div className="p-4">
          <Spinner />
        </div>
      )}
      {error && <EmptyState title="Could not load file history">{error}</EmptyState>}
      {data?.length === 0 && (
        <EmptyState title="No history">This file has no committed history.</EmptyState>
      )}
      {data?.map((c) => (
        <div
          key={c.hash}
          role="option"
          aria-selected={sel?.hash === c.hash}
          onMouseDown={() => setSel(c)}
          className={cn(
            'cursor-default border-b px-3 py-1.5',
            sel?.hash === c.hash ? 'bg-primary/15' : 'hover:bg-accent/60'
          )}
        >
          <div className="truncate">{c.subject}</div>
          <div className="flex gap-2 text-[0.85em] text-muted-foreground">
            <span className="font-mono">{short(c.hash)}</span>
            <span className="truncate">{c.authorName}</span>
            <span className="ml-auto shrink-0" title={fullDate(c.authorTime)}>
              {relativeTime(c.authorTime)}
            </span>
          </div>
          {c.path !== path && (
            <div className="truncate text-[0.82em] text-renamed">as {c.path}</div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={
          <>
            File history: <span className="font-mono text-[0.92em]">{path}</span>
          </>
        }
      >
        <Button size="sm" variant="outline" onClick={() => r.setView({ kind: 'blame', path })}>
          <FileClock /> Blame
        </Button>
      </ViewHeader>
      <Split
        id="filehistory"
        initial={340}
        first={list}
        second={
          <DiffView
            repo={r.path}
            state={diff}
            header={
              sel ? (
                <span className="font-mono text-[0.9em]">
                  {short(sel.hash)} · {sel.path}
                </span>
              ) : null
            }
          />
        }
      />
    </div>
  )
}

// Blame ---------------------------------------------------------------------------------

export function BlameView({ path, rev }: { path: string; rev?: string }): React.JSX.Element {
  const r = useRepo()
  const { data, error, loading } = useLoad(
    () => call('history.blame', { repo: r.path, path, rev }),
    [r.path, path, rev, r.historyVersion]
  )
  const [sel, setSel] = React.useState<string | null>(null)
  const lang = languageFor(path)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const lines = React.useMemo(() => data ?? [], [data])
  const virt = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 40
  })
  const [minT, maxT] = React.useMemo(() => {
    const ts = lines.map((l) => l.authorTime).filter((t) => t > 0)
    return ts.length ? [Math.min(...ts), Math.max(...ts)] : [0, 1]
  }, [lines])

  const age = (l: BlameLine): number => (maxT === minT ? 1 : (l.authorTime - minT) / (maxT - minT))
  const uncommitted = (l: BlameLine): boolean => /^0+$/.test(l.hash)

  const body = (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" data-selectable>
      {loading && (
        <div className="p-4">
          <Spinner />
        </div>
      )}
      {error && <EmptyState title="Could not compute blame">{error}</EmptyState>}
      <div
        style={{
          height: virt.getTotalSize(),
          position: 'relative',
          width: 'max-content',
          minWidth: '100%'
        }}
      >
        {virt.getVirtualItems().map((vi) => {
          const l = lines[vi.index]!
          const first = vi.index === 0 || lines[vi.index - 1]!.hash !== l.hash
          return (
            <div
              key={vi.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 20,
                transform: `translateY(${vi.start}px)`
              }}
              className={cn(
                'diff-line flex',
                first && vi.index > 0 && 'border-t border-border/60',
                sel === l.hash && 'bg-primary/10'
              )}
            >
              <button
                className="flex w-72 shrink-0 items-center gap-2 overflow-hidden px-2 text-left font-sans text-[11px] hover:bg-accent"
                style={{
                  boxShadow: `inset 3px 0 0 color-mix(in oklab, var(--primary) ${Math.round(15 + age(l) * 85)}%, transparent)`
                }}
                onClick={() => !uncommitted(l) && setSel(l.hash)}
                title={
                  uncommitted(l)
                    ? 'Not committed yet'
                    : `${l.hash}\n${l.author}, ${fullDate(l.authorTime)}\n${l.summary}`
                }
              >
                {first &&
                  (uncommitted(l) ? (
                    <span className="text-muted-foreground italic">Not committed yet</span>
                  ) : (
                    <>
                      <span className="font-mono text-muted-foreground">{short(l.hash)}</span>
                      <span className="w-24 shrink-0 truncate">{l.author}</span>
                      <span className="truncate text-muted-foreground">{l.summary}</span>
                    </>
                  ))}
              </button>
              <span className="w-12 shrink-0 select-none px-1.5 text-right text-muted-foreground/70">
                {l.line}
              </span>
              <span
                className="pr-4"
                dangerouslySetInnerHTML={{ __html: highlightLine(l.content, lang) }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={
          <>
            Blame: <span className="font-mono text-[0.92em]">{path}</span>
            {rev && (
              <span className="text-muted-foreground">
                {' '}
                at {rev.length >= 40 ? short(rev) : rev}
              </span>
            )}
          </>
        }
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => r.setView({ kind: 'fileHistory', path })}
        >
          <History /> File history
        </Button>
      </ViewHeader>
      <Split
        id="blame"
        initial={900}
        min={300}
        collapsed={!sel}
        first={body}
        second={sel ? <CommitDetails hash={sel} onNavigate={setSel} /> : null}
      />
    </div>
  )
}

// Tree browser ------------------------------------------------------------------------------

export function TreeView({ rev }: { rev: string }): React.JSX.Element {
  const r = useRepo()
  const [dir, setDir] = React.useState('')
  const [revInput, setRevInput] = React.useState(rev)
  const [file, setFile] = React.useState<TreeEntry | null>(null)
  const { data, error, loading } = useLoad(
    () => call('history.tree', { repo: r.path, rev, path: dir || undefined }),
    [r.path, rev, dir]
  )
  const sorted = React.useMemo(
    () =>
      [...(data ?? [])].sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1
      ),
    [data]
  )
  const crumbs = dir ? dir.split('/') : []

  const menuFor = (e: TreeEntry): MenuItem[] => [
    {
      label: 'File history',
      icon: <History />,
      disabled: e.type !== 'blob',
      onSelect: () => r.setView({ kind: 'fileHistory', path: e.path })
    },
    {
      label: 'Blame at this revision',
      icon: <FileClock />,
      disabled: e.type !== 'blob',
      onSelect: () => r.setView({ kind: 'blame', path: e.path, rev })
    },
    { label: 'Copy path', icon: <Copy />, onSelect: () => void A.copy(e.path, 'Path copied') }
  ]

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav
        aria-label="Folder path"
        className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1 text-[0.9em]"
      >
        <button className="rounded px-1 hover:bg-accent" onClick={() => setDir('')}>
          /
        </button>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <button
              className="rounded px-1 hover:bg-accent"
              onClick={() => setDir(crumbs.slice(0, i + 1).join('/'))}
            >
              {c}
            </button>
            {i < crumbs.length - 1 && <span className="text-muted-foreground">/</span>}
          </React.Fragment>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto" role="listbox" aria-label="Files">
        {loading && (
          <div className="p-4">
            <Spinner />
          </div>
        )}
        {error && <EmptyState title="Could not list files">{error}</EmptyState>}
        {dir && (
          <div
            className="row-h flex cursor-default items-center gap-2 px-2 hover:bg-accent/60"
            onDoubleClick={() => setDir(crumbs.slice(0, -1).join('/'))}
            onClick={() => setDir(crumbs.slice(0, -1).join('/'))}
          >
            <Folder className="size-4 text-muted-foreground" /> ..
          </div>
        )}
        {sorted.map((e) => (
          <ContextMenu key={e.path} items={() => menuFor(e)}>
            <div
              role="option"
              aria-selected={file?.path === e.path}
              className={cn(
                'row-h flex cursor-default items-center gap-2 px-2',
                file?.path === e.path ? 'bg-primary/15' : 'hover:bg-accent/60'
              )}
              onClick={() => (e.type === 'tree' ? setDir(e.path) : setFile(e))}
            >
              {e.type === 'tree' ? (
                <Folder className="size-4 text-muted-foreground" />
              ) : e.type === 'commit' ? (
                <FolderGit2 className="size-4 text-muted-foreground" />
              ) : (
                <File className="size-4 text-muted-foreground" />
              )}
              <span className="truncate">{e.name}</span>
              <span className="ml-auto shrink-0 text-[0.85em] text-muted-foreground">
                {e.type === 'commit'
                  ? `submodule @ ${short(e.hash)}`
                  : e.size != null
                    ? formatBytes(e.size)
                    : ''}
              </span>
            </div>
          </ContextMenu>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader title="Browse files">
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => (
            e.preventDefault(),
            revInput.trim() &&
              !/\s|^-/.test(revInput) &&
              r.setView({ kind: 'tree', rev: revInput.trim() })
          )}
        >
          <Input
            value={revInput}
            onChange={(e) => setRevInput(e.target.value)}
            aria-label="Revision"
            className="h-7 w-56 font-mono text-[12px]"
          />
          <Button size="sm" variant="outline" type="submit">
            Go
          </Button>
        </form>
      </ViewHeader>
      <Split
        id="tree"
        initial={360}
        first={list}
        second={
          file ? (
            <BlobPreview rev={rev} entry={file} />
          ) : (
            <EmptyState title="Select a file to preview it" />
          )
        }
      />
    </div>
  )
}

function BlobPreview({ rev, entry }: { rev: string; entry: TreeEntry }): React.JSX.Element {
  const r = useRepo()
  const { data, error, loading } = useLoad<BlobContent>(
    () => call('history.blob', { repo: r.path, rev, path: entry.path }),
    [r.path, rev, entry.path]
  )
  const lang = languageFor(entry.path)
  if (loading)
    return (
      <div className="p-4">
        <Spinner />
      </div>
    )
  if (error || !data) return <EmptyState title="Could not load file">{error}</EmptyState>
  if (data.kind === 'image' && data.dataUrl)
    return (
      <div className="checkerboard m-4 flex items-center justify-center rounded border p-2">
        <img src={data.dataUrl} alt={entry.name} className="max-h-[70vh] max-w-full" />
      </div>
    )
  if (data.kind !== 'text')
    return (
      <EmptyState
        title={
          data.kind === 'too-large'
            ? 'File too large to preview'
            : data.kind === 'missing'
              ? 'File not found'
              : 'Binary file'
        }
      >
        {formatBytes(data.size)}. Content is never rendered or executed.
      </EmptyState>
    )
  const lines = (data.text ?? '').split('\n')
  return (
    <div className="min-h-0 flex-1 overflow-auto py-1" data-selectable>
      {lines.map((l, i) => (
        <div key={i} className="diff-line flex">
          <span className="w-12 shrink-0 select-none px-1.5 text-right text-muted-foreground/70">
            {i + 1}
          </span>
          <span className="pr-4" dangerouslySetInnerHTML={{ __html: highlightLine(l, lang) }} />
        </div>
      ))}
    </div>
  )
}

// Reflog ------------------------------------------------------------------------------------

export function ReflogView(): React.JSX.Element {
  const r = useRepo()
  const [ref, setRef] = React.useState('HEAD')
  const { data, error, loading } = useLoad(
    () => call('history.reflog', { repo: r.path, ref, limit: 1000 }),
    [r.path, ref, r.historyVersion]
  )
  const [sel, setSel] = React.useState<string | null>(null)

  const asCommit = (e: ReflogEntry): Parameters<typeof A.reset>[1] => ({
    hash: e.hash,
    parents: [],
    authorName: '',
    authorEmail: '',
    authorTime: e.date,
    committerName: '',
    committerTime: e.date,
    refs: [],
    subject: e.subject
  })
  const menuFor = (e: ReflogEntry): MenuItem[] => [
    {
      label: 'Create branch here…',
      icon: <GitBranchPlus />,
      onSelect: () => void A.createBranchAt(r, e.hash, e.subject)
    },
    {
      label: 'Check out (detached HEAD)',
      icon: <ArrowDownToLine />,
      onSelect: () => void A.checkout(r, e.hash)
    },
    {
      label: `Reset ${r.status?.head.branch ?? 'HEAD'} to here…`,
      icon: <RotateCcw />,
      disabled: r.status?.operation !== 'none',
      reason: 'Finish the current operation first',
      onSelect: () => void A.reset(r, asCommit(e))
    },
    { type: 'separator' },
    { label: 'Copy hash', icon: <Copy />, onSelect: () => void A.copy(e.hash, 'Hash copied') }
  ]

  const list = (
    <div className="min-h-0 flex-1 overflow-auto" role="listbox" aria-label="Reflog">
      {loading && (
        <div className="p-4">
          <Spinner />
        </div>
      )}
      {error && <EmptyState title="Could not read the reflog">{error}</EmptyState>}
      {data?.length === 0 && <EmptyState title="Reflog is empty" />}
      {data?.map((e) => (
        <ContextMenu key={e.selector} items={() => menuFor(e)}>
          <div
            role="option"
            aria-selected={sel === e.hash}
            onMouseDown={(ev) => ev.button === 0 && setSel(e.hash)}
            className={cn(
              'flex cursor-default items-center gap-2 border-b px-3 py-1',
              sel === e.hash ? 'bg-primary/15' : 'hover:bg-accent/60'
            )}
          >
            <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">
              {e.selector}
            </span>
            <span className="w-16 shrink-0 font-mono text-[11px]">{short(e.hash)}</span>
            <span className="min-w-0 flex-1 truncate">{e.subject}</span>
            <span className="shrink-0 text-[0.85em] text-muted-foreground" title={fullDate(e.date)}>
              {relativeTime(e.date)}
            </span>
          </div>
        </ContextMenu>
      ))}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader title="Reflog — recover lost commits and branches">
        <Select
          aria-label="Reference"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="h-7 text-[0.9em]"
        >
          <option value="HEAD">HEAD</option>
          {r.refs?.branches.map((b) => (
            <option key={b.name} value={`refs/heads/${b.name}`}>
              {b.name}
            </option>
          ))}
        </Select>
      </ViewHeader>
      <p className="border-b bg-muted/40 px-3 py-1 text-[0.85em] text-muted-foreground">
        Right-click an entry to create a branch at it. Reflog entries expire (by default after 90
        days, 30 for unreachable commits).
      </p>
      <Split
        id="reflog"
        direction="vertical"
        initial={320}
        first={list}
        second={
          sel ? (
            <CommitDetails hash={sel} onNavigate={setSel} />
          ) : (
            <EmptyState title="Select an entry" />
          )
        }
      />
    </div>
  )
}

// Compare -----------------------------------------------------------------------------------

export function CompareView({ from, to }: { from: string; to: string }): React.JSX.Element {
  const r = useRepo()
  const [f, setF] = React.useState(from)
  const [t, setT] = React.useState(to)
  const toWorktree = to === 'WORKTREE'
  const files = useLoad<CommitFile[]>(
    () => call('history.compareFiles', { repo: r.path, from, to: toWorktree ? null : to }),
    [r.path, from, to, r.historyVersion, toWorktree ? r.statusVersion : 0]
  )
  const commits = useLoad(
    () =>
      toWorktree
        ? Promise.resolve([])
        : call('op.previewCommits', { repo: r.path, from, to, limit: 1000 }),
    [r.path, from, to]
  )
  const valid = (s: string): boolean => !!s.trim() && !/\s|^-/.test(s)

  const top = (
    <div className="border-b p-2 text-[0.88em] text-muted-foreground">
      {files.error ? (
        <span className="text-destructive">{files.error}</span>
      ) : toWorktree ? (
        'Changes between the revision and your working tree (including uncommitted changes).'
      ) : (
        `${commits.data?.length ?? '…'}${commits.data?.length === 1000 ? '+' : ''} commit(s) in ${to} that are not in ${from}.`
      )}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader title="Compare">
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => (
            e.preventDefault(),
            valid(f) && valid(t) && r.setView({ kind: 'compare', from: f.trim(), to: t.trim() })
          )}
        >
          <Input
            value={f}
            onChange={(e) => setF(e.target.value)}
            aria-label="From revision"
            className="h-7 w-40 font-mono text-[12px]"
          />
          <span className="text-muted-foreground">…</span>
          <Input
            value={t}
            onChange={(e) => setT(e.target.value)}
            aria-label="To revision (WORKTREE for working tree)"
            className="h-7 w-40 font-mono text-[12px]"
          />
          <Button size="sm" variant="outline" type="submit">
            Compare
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() =>
              r.setView({
                kind: 'compare',
                from: to === 'WORKTREE' ? from : to,
                to: to === 'WORKTREE' ? 'WORKTREE' : from
              })
            }
            disabled={toWorktree}
          >
            Swap
          </Button>
        </form>
      </ViewHeader>
      <FilesAndDiff
        id="compare"
        files={files.data ?? []}
        loading={files.loading}
        top={top}
        sourceFor={(x) => ({ kind: 'compare', from, to, path: x.path, origPath: x.origPath })}
      />
    </div>
  )
}
