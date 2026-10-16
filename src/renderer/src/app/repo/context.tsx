import * as React from 'react'
import type { RefsSnapshot, RepoStatus } from '@shared/types'
import { call, on } from '@/lib/api'
import { Store, useStore } from '@/lib/store'
import { app, setView, updateTab, type RepoView } from '../state'

export interface RepoContextValue {
  tabId: string
  path: string
  view: RepoView
  setView: (v: RepoView) => void
  status: RepoStatus | null
  refs: RefsSnapshot | null
  error: string | null
  /** Incremented whenever refs/history may have changed */
  historyVersion: number
  /** Incremented whenever the working tree/index may have changed */
  statusVersion: number
  refresh: (scope?: 'worktree' | 'refs' | 'all') => Promise<void>
}

const Ctx = React.createContext<RepoContextValue | null>(null)

/** The repository of the active tab, for global commands (palette, shortcuts). */
export const activeRepo = new Store<{ ctx: RepoContextValue | null }>({ ctx: null })

export function useRepo(): RepoContextValue {
  const v = React.useContext(Ctx)
  if (!v) throw new Error('useRepo outside RepoProvider')
  return v
}

export function RepoProvider({
  tabId,
  path,
  view,
  children
}: {
  tabId: string
  path: string
  view: RepoView
  children: React.ReactNode
}): React.JSX.Element {
  const [status, setStatus] = React.useState<RepoStatus | null>(null)
  const [refs, setRefs] = React.useState<RefsSnapshot | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = React.useState(0)
  const [statusVersion, setStatusVersion] = React.useState(0)
  const inflight = React.useRef<Promise<void> | null>(null)
  const queued = React.useRef<'worktree' | 'refs' | 'all' | null>(null)

  const load = React.useCallback(
    async (scope: 'worktree' | 'refs' | 'all'): Promise<void> => {
      try {
        const [s, r] = await Promise.all([
          call('repo.status', { repo: path }),
          scope === 'worktree' ? Promise.resolve(null) : call('repo.refs', { repo: path })
        ])
        setStatus(s)
        setStatusVersion((v) => v + 1)
        if (r) {
          setRefs(r)
          setHistoryVersion((v) => v + 1)
        }
        setError(null)
        updateTab(tabId, {
          summary: {
            ...(app.get().tabs.find((t) => t.id === tabId)?.summary ?? {
              path,
              name: path,
              gitDir: '',
              commonDir: '',
              bare: false,
              isLinkedWorktree: false
            }),
            head: s.head,
            operation: s.operation,
            changeCount:
              s.staged.length + s.unstaged.length + s.untracked.length + s.conflicted.length
          }
        })
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [path, tabId]
  )

  // Coalesce refresh requests so bursts of filesystem events cause at most one extra reload.
  const refresh = React.useCallback(
    async (scope: 'worktree' | 'refs' | 'all' = 'all'): Promise<void> => {
      if (inflight.current) {
        queued.current = queued.current && queued.current !== scope ? 'all' : scope
        return inflight.current
      }
      const run = async (s: 'worktree' | 'refs' | 'all'): Promise<void> => {
        await load(s)
        const next = queued.current
        queued.current = null
        if (next) await run(next)
      }
      inflight.current = run(scope).finally(() => (inflight.current = null))
      return inflight.current
    },
    [load]
  )

  React.useEffect(() => {
    void refresh('all')
    const off = on('repo.changed', (e) => {
      if (e.repo.toLowerCase() === path.toLowerCase())
        void refresh(e.scope === 'worktree' ? 'worktree' : 'all')
    })
    const onFocus = (): void => {
      if (app.get().activeTab === tabId) void refresh('all')
    }
    window.addEventListener('focus', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [path, refresh, tabId])

  const value = React.useMemo<RepoContextValue>(
    () => ({
      tabId,
      path,
      view,
      setView: (v) => setView(tabId, v),
      status,
      refs,
      error,
      historyVersion,
      statusVersion,
      refresh
    }),
    [tabId, path, view, status, refs, error, historyVersion, statusVersion, refresh]
  )

  const isActive = useStore(app, (s) => s.activeTab === tabId)
  React.useEffect(() => {
    if (isActive) activeRepo.set({ ctx: value })
  }, [isActive, value])
  React.useEffect(
    () => () => {
      if (activeRepo.get().ctx?.tabId === tabId) activeRepo.set({ ctx: null })
    },
    [tabId]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
