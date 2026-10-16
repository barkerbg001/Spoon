import * as React from 'react'
import { Copy, ExternalLink, FileClock, FolderTree, History, ShieldCheck } from 'lucide-react'
import type { CommitDetails as Details, CommitFile, DiffSource, RefLabel } from '@shared/types'
import { call } from '@/lib/api'
import { cn, fullDate, hueOf, initials, relativeTime, short } from '@/lib/utils'
import { useRepo } from '@/app/repo/context'
import * as A from '@/app/repo/actions'
import { EmptyState, Spinner } from '@/components/ui/primitives'
import { ContextMenu, type MenuItem } from '@/components/ui/menu'
import { Split } from '@/components/ui/split'
import { PathLabel, StatusChip } from '@/components/FileStatus'
import { DiffView } from '../diff/DiffView'
import { useDiff } from '../diff/useDiff'
import { RefBadge } from './RefBadge'

export function Avatar({
  name,
  email,
  size = 28
}: {
  name: string
  email: string
  size?: number
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${hueOf(email || name)} 45% 45%)` }}
    >
      {initials(name)}
    </span>
  )
}

/** File list on the left, diff on the right. Used for commits, stashes and comparisons. */
export function FilesAndDiff({
  id,
  files,
  sourceFor,
  top,
  menuFor,
  loading
}: {
  id: string
  files: CommitFile[]
  sourceFor: (f: CommitFile) => DiffSource
  top?: React.ReactNode
  menuFor?: (f: CommitFile) => MenuItem[]
  loading?: boolean
}): React.JSX.Element {
  const r = useRepo()
  const [sel, setSel] = React.useState<string | null>(null)
  React.useEffect(() => setSel(files[0]?.path ?? null), [files])
  const file = files.find((f) => f.path === sel) ?? null
  const diff = useDiff(r.path, file ? sourceFor(file) : null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = files.findIndex((f) => f.path === sel)
    const next =
      files[Math.max(0, Math.min(files.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next) setSel(next.path)
  }

  const left = (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      {top}
      <div className="sticky top-0 z-[1] border-y bg-sidebar px-2 py-1 text-[0.85em] font-semibold tracking-wide text-muted-foreground uppercase">
        Files <span className="font-normal">({files.length})</span>
      </div>
      {loading ? (
        <div className="p-4">
          <Spinner />
        </div>
      ) : files.length === 0 ? (
        <p className="p-3 text-[0.9em] text-muted-foreground">No file changes.</p>
      ) : (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Changed files"
          tabIndex={0}
          onKeyDown={onKey}
          className="outline-none"
        >
          {files.map((f) => {
            const row = (
              <div
                key={f.path}
                role="option"
                aria-selected={sel === f.path}
                onMouseDown={() => setSel(f.path)}
                className={cn(
                  'row-h flex cursor-default items-center gap-1.5 px-2 text-[0.95em]',
                  sel === f.path ? 'bg-primary/15' : 'hover:bg-accent/60'
                )}
              >
                <StatusChip code={f.status[0] ?? 'M'} />
                <PathLabel path={f.path} origPath={f.origPath} />
                <span className="ml-auto shrink-0 font-mono text-[10px]">
                  {f.binary ? (
                    <span className="text-muted-foreground">bin</span>
                  ) : (
                    <>
                      <span className="text-added">+{f.additions ?? 0}</span>{' '}
                      <span className="text-removed">−{f.deletions ?? 0}</span>
                    </>
                  )}
                </span>
              </div>
            )
            return menuFor ? (
              <ContextMenu key={f.path} items={() => menuFor(f)}>
                {row}
              </ContextMenu>
            ) : (
              row
            )
          })}
        </div>
      )}
    </div>
  )
  return (
    <Split
      id={`files-${id}`}
      initial={340}
      min={220}
      first={left}
      second={
        <DiffView
          repo={r.path}
          state={diff}
          header={file ? <PathLabel path={file.path} origPath={file.origPath} /> : null}
        />
      }
    />
  )
}

export function CommitDetails({
  hash,
  onNavigate
}: {
  hash: string
  onNavigate: (hash: string) => void
}): React.JSX.Element {
  const r = useRepo()
  const [d, setD] = React.useState<Details | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    setD(null)
    call('history.commit', { repo: r.path, hash })
      .then((x) => alive && (setD(x), setError(null)))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [r.path, hash])

  if (error) return <EmptyState title="Could not load commit">{error}</EmptyState>

  const menuFor = (f: CommitFile): MenuItem[] => [
    {
      label: 'File history',
      icon: <History />,
      onSelect: () => r.setView({ kind: 'fileHistory', path: f.path })
    },
    {
      label: 'Blame at this commit',
      icon: <FileClock />,
      disabled: f.status.startsWith('D'),
      reason: 'The file was deleted in this commit',
      onSelect: () => r.setView({ kind: 'blame', path: f.path, rev: hash })
    },
    {
      label: 'Browse files at this commit',
      icon: <FolderTree />,
      onSelect: () => r.setView({ kind: 'tree', rev: hash })
    },
    {
      label: 'Compare with working tree',
      onSelect: () => r.setView({ kind: 'compare', from: hash, to: 'WORKTREE' })
    },
    { type: 'separator' },
    { label: 'Copy path', icon: <Copy />, onSelect: () => void A.copy(f.path, 'Path copied') }
  ]

  const message = d?.message ?? ''
  const nl = message.indexOf('\n')
  const subject = nl >= 0 ? message.slice(0, nl) : message
  const body = nl >= 0 ? message.slice(nl + 1).trim() : ''

  const top = d ? (
    <div className="space-y-2 p-3" data-selectable>
      <div className="flex items-start gap-2.5">
        <Avatar name={d.authorName} email={d.authorEmail} size={32} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug break-words">{subject}</div>
          <div className="text-[0.88em] text-muted-foreground">
            {d.authorName} &lt;{d.authorEmail}&gt; ·{' '}
            <span title={fullDate(d.authorTime)}>{relativeTime(d.authorTime)}</span>
          </div>
          {(d.committerName !== d.authorName || d.committerEmail !== d.authorEmail) && (
            <div className="text-[0.85em] text-muted-foreground">
              Committed by {d.committerName} ·{' '}
              <span title={fullDate(d.committerTime)}>{relativeTime(d.committerTime)}</span>
            </div>
          )}
        </div>
      </div>
      {body && (
        <pre className="max-h-48 overflow-auto rounded bg-muted/50 p-2 font-sans text-[0.92em] whitespace-pre-wrap">
          {body}
        </pre>
      )}
      {d.refs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {d.refs.map((ref: RefLabel) => (
            <RefBadge key={ref.type + ref.name} r={ref} />
          ))}
        </div>
      )}
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5 text-[0.88em]">
        <dt className="text-muted-foreground">Commit</dt>
        <dd className="flex items-center gap-1 font-mono text-[11px]">
          {d.hash}
          <button
            className="rounded p-0.5 hover:bg-accent"
            aria-label="Copy commit hash"
            onClick={() => void A.copy(d.hash, 'Hash copied')}
          >
            <Copy className="size-3" />
          </button>
        </dd>
        <dt className="text-muted-foreground">Parent{d.parents.length > 1 ? 's' : ''}</dt>
        <dd className="flex flex-wrap gap-1.5 font-mono text-[11px]">
          {d.parents.length === 0 ? (
            <span className="font-sans text-muted-foreground">none (root commit)</span>
          ) : (
            d.parents.map((p) => (
              <button
                key={p}
                className="text-primary hover:underline"
                onClick={() => onNavigate(p)}
              >
                {short(p)}
              </button>
            ))
          )}
        </dd>
        {d.signature && (
          <>
            <dt className="text-muted-foreground">Signature</dt>
            <dd className="flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-muted-foreground" /> Signed ({d.signature}) —
              verify with <code className="font-mono">git log --show-signature</code>
            </dd>
          </>
        )}
      </dl>
      <button
        className="inline-flex items-center gap-1 text-[0.85em] text-primary hover:underline"
        onClick={() => void A.openInBrowser(r, { kind: 'commit', hash: d.hash })}
      >
        <ExternalLink className="size-3" /> Open on hosting service
      </button>
      {d.parents.length > 1 && (
        <p className="text-[0.85em] text-muted-foreground">
          Merge commit: files are shown relative to the first parent.
        </p>
      )}
    </div>
  ) : (
    <div className="p-4">
      <Spinner />
    </div>
  )

  return (
    <FilesAndDiff
      id="commit"
      files={d?.files ?? []}
      loading={!d}
      top={top}
      sourceFor={(f) => ({ kind: 'commit', hash, path: f.path, origPath: f.origPath })}
      menuFor={menuFor}
    />
  )
}
