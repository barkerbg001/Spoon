import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDownToLine,
  Bug,
  CherryIcon,
  Copy,
  ExternalLink,
  FolderTree,
  GitBranchPlus,
  GitCompare,
  GitMerge,
  GitPullRequestArrow,
  ListRestart,
  PencilLine,
  RotateCcw,
  Search,
  Tag,
  Undo,
  X
} from 'lucide-react'
import type { Commit, RefLabel } from '@shared/types'
import { call } from '@/lib/api'
import { useStore } from '@/lib/store'
import { cn, fullDate, relativeTime, short } from '@/lib/utils'
import { app } from '@/app/state'
import { prompt } from '@/app/dialogs'
import { useRepo } from '@/app/repo/context'
import * as A from '@/app/repo/actions'
import { Button } from '@/components/ui/button'
import { EmptyState, Input, Select, Spinner, Tip } from '@/components/ui/primitives'
import { ContextMenu, type MenuItem } from '@/components/ui/menu'
import { Split } from '@/components/ui/split'
import { GraphCell, LANE_W, MAX_LANES } from './Graph'
import { RefBadge } from './RefBadge'
import { CommitDetails } from './CommitDetails'
import { interactiveRebase } from './InteractiveRebase'
import { emptyFilters, isSearching, useHistory, type HistoryFilters } from './useHistory'

const WORKTREE_ROW = 'WORKTREE'

export function HistoryView(): React.JSX.Element {
  const r = useRepo()
  const density = useStore(app, (s) => s.settings?.density ?? 'comfortable')
  const rowH = density === 'compact' ? 23 : 28
  const [filters, setFilters] = React.useState<HistoryFilters>(emptyFilters)
  const [draft, setDraft] = React.useState('')
  const h = useHistory(r.path, filters, r.historyVersion)
  const searching = isSearching(filters)
  const [selected, setSelected] = React.useState<string[]>([])
  const focus = selected[selected.length - 1] ?? null
  const anchor = React.useRef<string | null>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const t = setTimeout(
      () => setFilters((f) => (f.query === draft ? f : { ...f, query: draft })),
      300
    )
    return () => clearTimeout(t)
  }, [draft])

  // Ctrl/Cmd+F focuses search (dispatched by the global shortcut handler).
  React.useEffect(() => {
    const onFind = (): void => searchRef.current?.focus()
    window.addEventListener('spoon:find', onFind)
    return () => window.removeEventListener('spoon:find', onFind)
  }, [])

  const changeCount = r.status
    ? r.status.staged.length +
      r.status.unstaged.length +
      r.status.untracked.length +
      r.status.conflicted.length
    : 0
  const showWorktree = changeCount > 0 && !searching
  const offset = showWorktree ? 1 : 0
  const count = h.commits.length + offset + (h.hasMore ? 1 : 0)
  const headHash = r.status?.head.oid ?? null
  const currentBranch = r.status?.head.branch ?? null

  const graphWidth = searching
    ? 0
    : Math.min(MAX_LANES, Math.max(1, ...h.rows.map((x) => x.width))) * LANE_W + 4

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virt = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 25
  })
  React.useEffect(() => virt.measure(), [rowH, virt])

  const items = virt.getVirtualItems()
  const last = items[items.length - 1]
  React.useEffect(() => {
    if (last && last.index >= count - 1 - 40 && h.hasMore && !h.loading) h.loadMore()
  }, [last, count, h])

  const indexOf = (hash: string): number =>
    hash === WORKTREE_ROW ? 0 : h.commits.findIndex((c) => c.hash === hash) + offset
  const select = (
    hash: string,
    e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }
  ): void => {
    if (hash !== WORKTREE_ROW && e?.shiftKey && anchor.current && anchor.current !== WORKTREE_ROW) {
      const a = h.commits.findIndex((c) => c.hash === anchor.current)
      const b = h.commits.findIndex((c) => c.hash === hash)
      if (a >= 0 && b >= 0) {
        const range = h.commits.slice(Math.min(a, b), Math.max(a, b) + 1).map((c) => c.hash)
        setSelected(a < b ? range : range.reverse())
        return
      }
    }
    if ((e?.ctrlKey || e?.metaKey) && hash !== WORKTREE_ROW)
      setSelected((s) =>
        s.includes(hash)
          ? s.filter((x) => x !== hash)
          : [...s.filter((x) => x !== WORKTREE_ROW), hash]
      )
    else setSelected([hash])
    anchor.current = hash
  }

  const navigate = (hash: string): void => {
    const i = h.commits.findIndex((c) => c.hash === hash)
    if (i >= 0) {
      setSelected([hash])
      virt.scrollToIndex(i + offset, { align: 'center' })
    } else {
      setFilters({ ...emptyFilters, mode: 'hash', query: hash })
      setDraft(hash)
      setSelected([hash])
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowUp' &&
      e.key !== 'Home' &&
      e.key !== 'End' &&
      e.key !== 'PageDown' &&
      e.key !== 'PageUp'
    )
      return
    e.preventDefault()
    const cur = focus ? indexOf(focus) : -1
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowH) - 1)
    const delta =
      e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowUp'
          ? -1
          : e.key === 'PageDown'
            ? page
            : e.key === 'PageUp'
              ? -page
              : 0
    let i = e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : cur + delta
    i = Math.max(0, Math.min(h.commits.length + offset - 1, i))
    const hash = i < offset ? WORKTREE_ROW : h.commits[i - offset]?.hash
    if (hash) {
      select(hash, { shiftKey: e.shiftKey })
      virt.scrollToIndex(i, { align: 'auto' })
    }
  }

  const selectedCommits = selected
    .map((s) => h.commits.find((c) => c.hash === s))
    .filter((c): c is Commit => !!c)

  const menuFor = (c: Commit): MenuItem[] => {
    const multi = selected.includes(c.hash) && selectedCommits.length > 1 ? selectedCommits : null
    const isHead = c.hash === headHash
    const branches = c.refs.filter((x) => x.type === 'local' && x.name !== currentBranch)
    const remotes = c.refs.filter((x) => x.type === 'remote')
    const busyOp = r.status?.operation !== 'none'
    const opReason = 'Finish or abort the current operation first'
    if (multi) {
      return [
        {
          label: `Cherry-pick ${multi.length} commits`,
          icon: <CherryIcon />,
          disabled: busyOp,
          reason: opReason,
          onSelect: () => void A.cherryPick(r, multi)
        },
        {
          label: 'Compare the two selected commits',
          icon: <GitCompare />,
          disabled: multi.length !== 2,
          reason: 'Select exactly two commits',
          onSelect: () => r.setView({ kind: 'compare', from: multi[1]!.hash, to: multi[0]!.hash })
        },
        {
          label: 'Copy hashes',
          icon: <Copy />,
          onSelect: () => void A.copy(multi.map((x) => x.hash).join('\n'), 'Hashes copied')
        }
      ]
    }
    const out: MenuItem[] = []
    for (const b of branches)
      out.push({
        label: `Check out ${b.name}`,
        icon: <ArrowDownToLine />,
        onSelect: () => void A.checkout(r, b.name)
      })
    for (const b of remotes.slice(0, 3))
      out.push({
        label: `Check out ${b.name}`,
        icon: <ArrowDownToLine />,
        onSelect: () => void A.checkoutRemote(r, b.name)
      })
    out.push(
      {
        label: 'Check out commit (detached HEAD)…',
        icon: <ArrowDownToLine />,
        onSelect: () => void A.checkout(r, c.hash)
      },
      { type: 'separator' },
      {
        label: 'Create branch here…',
        icon: <GitBranchPlus />,
        onSelect: () => void A.createBranch(r, c.hash)
      },
      { label: 'Create tag here…', icon: <Tag />, onSelect: () => void A.createTag(r, c.hash) },
      { type: 'separator' }
    )
    const target = branches[0]?.name ?? remotes[0]?.name ?? c.hash
    out.push(
      {
        label: `Merge ${target.length === 40 ? short(target) : target} into ${currentBranch ?? 'HEAD'}…`,
        icon: <GitMerge />,
        disabled: isHead || busyOp,
        reason: isHead ? 'This is the current commit' : opReason,
        onSelect: () => void A.merge(r, target)
      },
      {
        label: `Rebase ${currentBranch ?? 'HEAD'} onto ${target.length === 40 ? short(target) : target}…`,
        icon: <GitPullRequestArrow />,
        disabled: isHead || busyOp,
        reason: isHead ? 'This is the current commit' : opReason,
        onSelect: () => void A.rebase(r, target)
      },
      {
        label: 'Interactive rebase from here…',
        icon: <ListRestart />,
        disabled: busyOp,
        reason: opReason,
        onSelect: () => void interactiveRebase(r, c)
      },
      {
        label: 'Cherry-pick',
        icon: <CherryIcon />,
        disabled: isHead || busyOp,
        reason: isHead ? 'Already on the current branch' : opReason,
        onSelect: () => void A.cherryPick(r, [c])
      },
      {
        label: 'Revert commit…',
        icon: <Undo />,
        disabled: busyOp,
        reason: opReason,
        onSelect: () => void A.revert(r, c)
      },
      {
        label: `Reset ${currentBranch ?? 'HEAD'} to here…`,
        icon: <RotateCcw />,
        disabled: isHead || busyOp,
        reason: isHead ? 'HEAD is already here' : opReason,
        onSelect: () => void A.reset(r, c)
      },
      { type: 'separator' },
      {
        label: 'Browse files at this commit',
        icon: <FolderTree />,
        onSelect: () => r.setView({ kind: 'tree', rev: c.hash })
      },
      {
        label: 'Compare with working tree',
        icon: <GitCompare />,
        onSelect: () => r.setView({ kind: 'compare', from: c.hash, to: 'WORKTREE' })
      },
      {
        label: 'Start bisect (this commit is good, HEAD is bad)…',
        icon: <Bug />,
        disabled: isHead || busyOp,
        reason: isHead ? 'Choose an older commit' : opReason,
        onSelect: () =>
          void A.run(
            r,
            'Bisect',
            () => call('bisect.start', { repo: r.path, bad: 'HEAD', good: c.hash }),
            {
              success:
                'Bisect started — test the checked-out commit, then mark it good or bad in the banner'
            }
          )
      },
      { type: 'separator' },
      { label: 'Copy hash', icon: <Copy />, onSelect: () => void A.copy(c.hash, 'Hash copied') },
      {
        label: 'Copy subject',
        icon: <PencilLine />,
        onSelect: () => void A.copy(c.subject, 'Subject copied')
      },
      {
        label: 'Open on hosting service',
        icon: <ExternalLink />,
        onSelect: () => void A.openInBrowser(r, { kind: 'commit', hash: c.hash })
      }
    )
    return out
  }

  const displayRefs = (refs: RefLabel[]): RefLabel[] => {
    const detachedHead = refs.some((x) => x.type === 'head') && !currentBranch
    const out: RefLabel[] = []
    if (detachedHead) out.push({ name: 'HEAD (detached)', type: 'head' })
    for (const x of refs) {
      if (x.type === 'head') continue
      if (x.type === 'local' && x.name === currentBranch)
        out.unshift({ name: x.name, type: 'head' })
      else out.push(x)
    }
    return out
  }

  const toolbar = (
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-2">
      <Select
        aria-label="Branches shown"
        value={filters.scope}
        onChange={(e) =>
          setFilters((f) => ({ ...f, scope: e.target.value as HistoryFilters['scope'] }))
        }
        className="h-7 text-[0.9em]"
      >
        <option value="all">All branches</option>
        <option value="current">Current branch</option>
      </Select>
      <Select
        aria-label="Search by"
        value={filters.mode}
        onChange={(e) =>
          setFilters((f) => ({ ...f, mode: e.target.value as HistoryFilters['mode'] }))
        }
        className="h-7 text-[0.9em]"
      >
        <option value="message">Message</option>
        <option value="author">Author</option>
        <option value="hash">Hash</option>
        <option value="path">Path</option>
      </Select>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setDraft('')}
          placeholder={`Search ${filters.mode}…`}
          aria-label="Search history"
          className="h-7 pl-7"
        />
        {draft && (
          <button
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent"
            aria-label="Clear search"
            onClick={() => setDraft('')}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Tip content="Committed on or after">
        <Input
          type="date"
          aria-label="Since date"
          value={filters.since}
          onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value }))}
          className="h-7 w-[8.5rem] text-[0.88em]"
        />
      </Tip>
      <Tip content="Committed on or before">
        <Input
          type="date"
          aria-label="Until date"
          value={filters.until}
          onChange={(e) => setFilters((f) => ({ ...f, until: e.target.value }))}
          className="h-7 w-[8.5rem] text-[0.88em]"
        />
      </Tip>
      {searching && (
        <Button size="sm" variant="ghost" onClick={() => (setFilters(emptyFilters), setDraft(''))}>
          Clear
        </Button>
      )}
    </div>
  )

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      {h.error ? (
        <EmptyState title="Could not load history">{h.error}</EmptyState>
      ) : !h.loading && h.commits.length === 0 && !showWorktree ? (
        <EmptyState title={searching ? 'No matching commits' : 'No commits yet'}>
          {searching
            ? 'Try a different search.'
            : 'Stage some files and create the first commit in the Changes view.'}
        </EmptyState>
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto outline-none"
          tabIndex={0}
          role="listbox"
          aria-label="Commit history"
          aria-multiselectable
          onKeyDown={onKeyDown}
        >
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {items.map((vi) => {
              const style: React.CSSProperties = {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: rowH,
                transform: `translateY(${vi.start}px)`
              }
              if (vi.index < offset) {
                return (
                  <div
                    key="wt"
                    style={style}
                    role="option"
                    aria-selected={selected.includes(WORKTREE_ROW)}
                    onMouseDown={() => select(WORKTREE_ROW)}
                    onDoubleClick={() => r.setView({ kind: 'changes' })}
                    className={cn(
                      'flex cursor-default items-center gap-2 pr-2',
                      selected.includes(WORKTREE_ROW) ? 'bg-primary/15' : 'hover:bg-accent/60'
                    )}
                  >
                    <span
                      style={{ width: graphWidth }}
                      className="flex shrink-0 justify-start pl-[3px]"
                    >
                      <span className="size-[9px] rounded-full border-2 border-dashed border-muted-foreground" />
                    </span>
                    <span className="font-medium">Uncommitted changes</span>
                    <span className="text-muted-foreground">({changeCount})</span>
                  </div>
                )
              }
              const c = h.commits[vi.index - offset]
              if (!c) {
                return (
                  <div
                    key="more"
                    style={style}
                    className="flex items-center justify-center text-muted-foreground"
                  >
                    <Spinner className="size-3.5" />
                  </div>
                )
              }
              const row = h.rows[vi.index - offset]
              const sel = selected.includes(c.hash)
              const refs = displayRefs(c.refs)
              return (
                <ContextMenu key={c.hash} items={() => menuFor(c)}>
                  <div
                    style={style}
                    role="option"
                    aria-selected={sel}
                    onMouseDown={(e) => {
                      if (e.button === 2 && sel) return
                      select(c.hash, e)
                    }}
                    className={cn(
                      'flex cursor-default items-center gap-2 pr-2 text-[0.95em]',
                      sel ? 'bg-primary/15' : 'hover:bg-accent/60',
                      focus === c.hash && 'shadow-[inset_2px_0_0_var(--primary)]'
                    )}
                  >
                    {!searching && row && (
                      <GraphCell
                        row={row}
                        height={rowH}
                        width={graphWidth}
                        head={c.hash === headHash}
                      />
                    )}
                    {searching && <span className="w-1" />}
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {refs.slice(0, 4).map((x) => (
                        <RefBadge key={x.type + x.name} r={x} />
                      ))}
                      {refs.length > 4 && (
                        <span
                          className="text-[11px] text-muted-foreground"
                          title={refs
                            .slice(4)
                            .map((x) => x.name)
                            .join(', ')}
                        >
                          +{refs.length - 4}
                        </span>
                      )}
                      <span
                        className={cn('truncate', c.parents.length > 1 && 'text-muted-foreground')}
                      >
                        {c.subject}
                      </span>
                    </span>
                    <span
                      className="w-36 shrink-0 truncate text-[0.92em] text-muted-foreground"
                      title={`${c.authorName} <${c.authorEmail}>`}
                    >
                      {c.authorName}
                    </span>
                    <span
                      className="w-24 shrink-0 truncate text-right text-[0.9em] text-muted-foreground"
                      title={fullDate(c.authorTime)}
                    >
                      {relativeTime(c.authorTime)}
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                      {short(c.hash)}
                    </span>
                  </div>
                </ContextMenu>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  let details: React.ReactNode
  if (selected.includes(WORKTREE_ROW)) {
    details = (
      <EmptyState title={`${changeCount} uncommitted change(s)`}>
        <Button className="mt-2" onClick={() => r.setView({ kind: 'changes' })}>
          Open Changes
        </Button>
      </EmptyState>
    )
  } else if (selectedCommits.length > 1) {
    details = (
      <EmptyState title={`${selectedCommits.length} commits selected`}>
        Right-click to cherry-pick them{selectedCommits.length === 2 ? ' or compare the two' : ''}.
      </EmptyState>
    )
  } else if (focus && focus !== WORKTREE_ROW)
    details = <CommitDetails hash={focus} onNavigate={navigate} />
  else details = <EmptyState title="Select a commit to see its details" />

  return (
    <Split
      id="history"
      direction="vertical"
      initial={360}
      min={120}
      first={list}
      second={details}
    />
  )
}

/** Ask for a revision and open a comparison view. */
export async function promptCompare(r: {
  setView: ReturnType<typeof useRepo>['setView']
}): Promise<void> {
  const v = await prompt({
    title: 'Compare',
    description: 'Compare two branches, tags or commits (use WORKTREE for the working tree).',
    fields: [
      { name: 'from', label: 'From', mono: true, placeholder: 'main' },
      { name: 'to', label: 'To', mono: true, initial: 'HEAD' }
    ],
    validate: (x) =>
      !String(x['from']).trim() || !String(x['to']).trim()
        ? 'Enter both revisions.'
        : /\s|^-/.test(String(x['from']) + String(x['to']))
          ? 'Invalid revision.'
          : null,
    confirmLabel: 'Compare'
  })
  if (v) r.setView({ kind: 'compare', from: String(v['from']).trim(), to: String(v['to']).trim() })
}
