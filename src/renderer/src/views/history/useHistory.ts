import * as React from 'react'
import type { Commit } from '@shared/types'
import { emptyGraphState, layoutGraph, type GraphRow, type GraphState } from '@shared/graph'
import { call } from '@/lib/api'

export interface HistoryFilters {
  scope: 'all' | 'current'
  mode: 'message' | 'author' | 'hash' | 'path'
  query: string
  since: string
  until: string
}

export const emptyFilters: HistoryFilters = {
  scope: 'all',
  mode: 'message',
  query: '',
  since: '',
  until: ''
}

export const isSearching = (f: HistoryFilters): boolean => !!(f.query.trim() || f.since || f.until)

const PAGE = 400

interface State {
  commits: Commit[]
  rows: GraphRow[]
  graph: GraphState
  hasMore: boolean
  loading: boolean
  error: string | null
}

/**
 * Incrementally loads history. Graph layout state is carried across pages so already-rendered
 * rows never move. A change of `version` reloads the same number of commits from the top.
 */
export function useHistory(
  repo: string,
  filters: HistoryFilters,
  version: number
): State & { loadMore: () => void } {
  const [st, setSt] = React.useState<State>({
    commits: [],
    rows: [],
    graph: emptyGraphState(),
    hasMore: true,
    loading: true,
    error: null
  })
  const ref = React.useRef(st)
  React.useLayoutEffect(() => {
    ref.current = st
  }, [st])
  const req = React.useRef(0)

  const search = React.useMemo(() => {
    const q = filters.query.trim()
    const s: {
      text?: string
      author?: string
      hash?: string
      path?: string
      since?: string
      until?: string
    } = {}
    if (q && filters.mode === 'message') s.text = q
    if (q && filters.mode === 'author') s.author = q
    if (q && filters.mode === 'hash') s.hash = /^[0-9a-fA-F]{4,64}$/.test(q) ? q : '0000'
    if (q && filters.mode === 'path') s.path = q.replace(/\\/g, '/').replace(/^\/+/, '')
    if (filters.since) s.since = filters.since
    if (filters.until) s.until = filters.until
    return Object.keys(s).length ? s : undefined
  }, [filters])

  const fetchPage = React.useCallback(
    async (reset: boolean): Promise<void> => {
      const id = ++req.current
      const cur = ref.current
      const skip = reset ? 0 : cur.commits.length
      const limit = reset ? Math.min(5000, Math.max(PAGE, cur.commits.length)) : PAGE
      setSt((s) => ({ ...s, loading: true }))
      try {
        const res = await call('history.log', {
          repo,
          skip,
          limit,
          allRefs: filters.scope === 'all',
          search
        })
        if (id !== req.current) return
        const prev = reset ? emptyGraphState() : cur.graph
        const { rows, state } = layoutGraph(res.commits, prev)
        setSt((s) => ({
          commits: reset ? res.commits : [...s.commits, ...res.commits],
          rows: reset ? rows : [...s.rows, ...rows],
          graph: state,
          hasMore: res.hasMore,
          loading: false,
          error: null
        }))
      } catch (e) {
        if (id !== req.current) return
        setSt((s) => ({ ...s, loading: false, error: (e as Error).message, hasMore: false }))
      }
    },
    [repo, filters.scope, search]
  )

  // Reset fully when filters change.
  React.useEffect(() => {
    ref.current = {
      commits: [],
      rows: [],
      graph: emptyGraphState(),
      hasMore: true,
      loading: true,
      error: null
    }
    setSt(ref.current)
    void fetchPage(true)
  }, [fetchPage])

  // Reload in place when refs change.
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    void fetchPage(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const loadMore = React.useCallback(() => {
    const s = ref.current
    if (!s.loading && s.hasMore) void fetchPage(false)
  }, [fetchPage])

  return { ...st, loadMore }
}
