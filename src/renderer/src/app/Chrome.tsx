import * as React from 'react'
import type { OpLogEntry } from '@shared/types'
import {
  AlertCircle,
  CheckCircle2,
  Command as CommandIcon,
  FolderGit2,
  GitBranch,
  Info,
  Moon,
  Plus,
  ScrollText,
  Sun,
  Trash2,
  X
} from 'lucide-react'
import { call, on } from '@/lib/api'
import { useStore } from '@/lib/store'
import { isDark } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Spinner, Tip } from '@/components/ui/primitives'
import { app, closeTab, dismissToast, newTab, toastError, updateSettings } from './state'
import { shortcutLabel } from './shortcuts'

export function TabBar(): React.JSX.Element {
  const tabs = useStore(app, (s) => s.tabs)
  const active = useStore(app, (s) => s.activeTab)
  const listRef = React.useRef<HTMLDivElement>(null)

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const i = tabs.findIndex((t) => t.id === active)
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    if (!next) return
    e.preventDefault()
    app.set({ activeTab: next.id })
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus()
    )
  }

  return (
    <div
      className="flex h-9 shrink-0 items-end gap-0.5 border-b bg-sidebar px-1.5 pt-1"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label="Open repositories"
        className="flex min-w-0 items-end gap-0.5 overflow-x-auto"
        onKeyDown={onKeyDown}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {tabs.map((t) => {
          const selected = t.id === active
          const name = t.summary?.name ?? (t.path ? t.path.split(/[\\/]/).pop() : 'New tab')
          return (
            <div
              key={t.id}
              data-tab={t.id}
              role="tab"
              tabIndex={selected ? 0 : -1}
              aria-selected={selected}
              title={t.path ?? undefined}
              onClick={() => app.set({ activeTab: t.id })}
              onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
              className={cn(
                'group flex h-8 max-w-56 min-w-28 cursor-default items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 text-[0.92em] select-none',
                selected
                  ? 'border-border bg-background text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-accent/60'
              )}
            >
              {t.path ? (
                <FolderGit2 className="size-3.5 shrink-0 text-primary" />
              ) : (
                <Plus className="size-3.5 shrink-0" />
              )}
              <span className="flex-1 truncate">{name}</span>
              {t.summary && t.summary.changeCount > 0 && (
                <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                  {t.summary.changeCount}
                </span>
              )}
              <button
                aria-label={`Close ${name}`}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.id)
                }}
                className={cn(
                  'rounded p-0.5 hover:bg-muted',
                  selected ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'
                )}
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}
      </div>
      <Tip content={`New tab (${shortcutLabel('newTab')})`}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New tab"
          className="mb-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => newTab()}
        >
          <Plus />
        </Button>
      </Tip>
      <div className="flex-1" />
    </div>
  )
}

export function StatusBar(): React.JSX.Element {
  const tab = useStore(app, (s) => s.tabs.find((t) => t.id === s.activeTab))
  const ops = useStore(app, (s) => s.ops)
  const settings = useStore(app, (s) => s.settings)
  const info = useStore(app, (s) => s.info)
  const head = tab?.summary?.head
  const op = ops[ops.length - 1]
  const pct = op?.progress?.percent

  return (
    <footer
      className="flex h-6 shrink-0 items-center gap-3 border-t bg-sidebar px-2 text-[0.82em] text-muted-foreground"
      aria-label="Status bar"
    >
      {head ? (
        <span
          className="flex items-center gap-1"
          title={head.upstream ? `Tracking ${head.upstream}` : 'No upstream branch'}
        >
          <GitBranch className="size-3.5" />
          {head.detached ? `Detached at ${head.oid?.slice(0, 8) ?? '?'}` : (head.branch ?? '?')}
          {head.unborn && ' (no commits yet)'}
          {(head.ahead > 0 || head.behind > 0) && (
            <span className="ml-1">
              ↑{head.ahead} ↓{head.behind}
            </span>
          )}
        </span>
      ) : (
        <span>{info?.git ? `Git ${info.git.version}` : info?.gitError ? 'Git not found' : ''}</span>
      )}
      {tab?.summary && tab.summary.operation !== 'none' && (
        <span className="font-medium text-amber-600 dark:text-amber-400">
          {tab.summary.operation} in progress
        </span>
      )}
      <div className="flex-1" />
      {op && (
        <span className="flex min-w-0 items-center gap-1.5" aria-live="polite">
          <Spinner className="size-3" />
          <span className="truncate">
            {op.label}
            {op.progress?.message ? ` — ${op.progress.message}` : ''}
          </span>
          {pct != null && (
            <span
              className="h-1.5 w-20 overflow-hidden rounded bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
          )}
          {ops.length > 1 && <span>(+{ops.length - 1})</span>}
          {op.cancellable && (
            <button
              className="rounded px-1 hover:bg-accent hover:text-foreground"
              onClick={() => void call('op.cancel', { opId: op.opId }).catch((e) => toastError(e))}
            >
              Cancel
            </button>
          )}
        </span>
      )}
      <button
        className="flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
        onClick={() => app.set({ paletteOpen: true })}
        title={`Command palette (${shortcutLabel('palette')})`}
      >
        <CommandIcon className="size-3" /> {shortcutLabel('palette')}
      </button>
      <button
        className="flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
        onClick={() => app.set((s) => ({ oplogOpen: !s.oplogOpen }))}
        title={`Git operation log (${shortcutLabel('oplog')})`}
      >
        <ScrollText className="size-3" /> Log
      </button>
      {settings && (
        <button
          className="rounded p-0.5 hover:bg-accent hover:text-foreground"
          aria-label={isDark(settings) ? 'Switch to light theme' : 'Switch to dark theme'}
          title={`Toggle theme (${shortcutLabel('toggleTheme')})`}
          onClick={() => void updateSettings({ theme: isDark(settings) ? 'light' : 'dark' })}
        >
          {isDark(settings) ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </button>
      )}
    </footer>
  )
}

export function Toasts(): React.JSX.Element {
  const toasts = useStore(app, (s) => s.toasts)
  return (
    <div
      className="pointer-events-none fixed right-3 bottom-9 z-[60] flex w-[min(420px,calc(100vw-1.5rem))] flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex gap-2.5 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
        >
          {t.kind === 'error' ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : t.kind === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[0.95em] font-medium break-words">{t.title}</div>
            {t.detail && (
              <pre className="mt-1 max-h-40 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                {t.detail}
              </pre>
            )}
            {t.action && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
              >
                {t.action.label}
              </Button>
            )}
          </div>
          <button
            aria-label="Dismiss notification"
            className="self-start rounded p-0.5 text-muted-foreground hover:bg-accent"
            onClick={() => dismissToast(t.id)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function OpLogPanel(): React.JSX.Element | null {
  const open = useStore(app, (s) => s.oplogOpen)
  const [entries, setEntries] = React.useState<OpLogEntry[]>([])
  const [expanded, setExpanded] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    void call('oplog.list', {}).then((l) => alive && setEntries(l))
    const off = on('oplog.updated', (e) =>
      setEntries((prev) => {
        const i = prev.findIndex((x) => x.id === e.id)
        if (i < 0) return [...prev, e].slice(-500)
        const next = prev.slice()
        next[i] = e
        return next
      })
    )
    return () => {
      alive = false
      off()
    }
  }, [open])

  if (!open) return null
  const rows = entries.slice().reverse()
  return (
    <section
      className="flex h-56 shrink-0 flex-col border-t bg-background"
      aria-label="Git operation log"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-2 text-[0.9em]">
        <ScrollText className="size-4 text-muted-foreground" />
        <span className="font-medium">Git operation log</span>
        <span className="text-muted-foreground">Credentials and tokens are redacted.</span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void call('oplog.clear', {})
              .then(() => setEntries([]))
              .catch((e) => toastError(e))
          }
        >
          <Trash2 /> Clear
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close operation log"
          onClick={() => app.set({ oplogOpen: false })}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[11.5px]">
        {rows.length === 0 && (
          <div className="p-3 font-sans text-muted-foreground">No Git commands have run yet.</div>
        )}
        {rows.map((e) => (
          <div key={e.id} className="border-b border-border/50">
            <button
              className="flex w-full items-center gap-2 px-2 py-0.5 text-left hover:bg-accent/50"
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              aria-expanded={expanded === e.id}
            >
              <span className="w-16 shrink-0 text-muted-foreground">
                {new Date(e.startedAt).toLocaleTimeString()}
              </span>
              <span
                className={cn(
                  'w-12 shrink-0',
                  e.running
                    ? 'text-primary'
                    : e.exitCode === 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-destructive'
                )}
              >
                {e.running ? 'running' : `exit ${e.exitCode ?? '?'}`}
              </span>
              <span className="w-14 shrink-0 text-right text-muted-foreground">
                {e.durationMs != null ? `${e.durationMs}ms` : ''}
              </span>
              <span className="truncate">{e.command}</span>
            </button>
            {expanded === e.id && (
              <div className="px-3 pb-2">
                {e.repo && <div className="text-muted-foreground">in {e.repo}</div>}
                <pre className="whitespace-pre-wrap text-muted-foreground">
                  {e.stderr || '(no error output)'}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
