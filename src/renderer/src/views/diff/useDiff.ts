import * as React from 'react'
import type { DiffResult, DiffSource } from '@shared/types'
import { call } from '@/lib/api'
import { useStore } from '@/lib/store'
import { app } from '@/app/state'

export interface DiffState {
  diff: DiffResult | null
  loading: boolean
  error: string | null
  loadAll: () => void
  reload: () => void
  options: { ignoreWhitespace: boolean; context: number; maxBytes: number }
}

const DEFAULT_MAX = 1_000_000
const FULL_MAX = 50_000_000

/** Loads a diff on demand. `version` forces a reload when the underlying data may have changed. */
export function useDiff(repo: string, source: DiffSource | null, version = 0): DiffState {
  const ignoreWhitespace = useStore(app, (s) => s.settings?.diffIgnoreWhitespace ?? false)
  const context = useStore(app, (s) => s.settings?.diffContext ?? 3)
  const [maxBytes, setMaxBytes] = React.useState(DEFAULT_MAX)
  const [diff, setDiff] = React.useState<DiffResult | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [nonce, setNonce] = React.useState(0)
  const key = source ? JSON.stringify(source) : ''

  React.useEffect(() => setMaxBytes(DEFAULT_MAX), [key])

  React.useEffect(() => {
    if (!source) {
      setDiff(null)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    call('diff.get', { repo, source, options: { ignoreWhitespace, context, maxBytes } })
      .then((d) => {
        if (!alive) return
        setDiff(d)
        setError(null)
      })
      .catch((e: Error) => {
        if (!alive) return
        setDiff(null)
        setError(e.message)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, key, ignoreWhitespace, context, maxBytes, version, nonce])

  return {
    diff: diff && JSON.stringify(diff.source) === key ? diff : loading ? null : diff,
    loading,
    error,
    loadAll: () => setMaxBytes(FULL_MAX),
    reload: () => setNonce((n) => n + 1),
    options: { ignoreWhitespace, context, maxBytes }
  }
}

/** Revisions for the "before" and "after" sides of a diff source, used for image/blob comparisons. */
export function sidesOf(source: DiffSource): {
  old: string | null
  new: string | null
  oldPath: string
  newPath: string
} {
  switch (source.kind) {
    case 'unstaged':
      return { old: ':', new: 'WORKTREE', oldPath: source.path, newPath: source.path }
    case 'untracked':
      return { old: null, new: 'WORKTREE', oldPath: source.path, newPath: source.path }
    case 'staged':
      return {
        old: 'HEAD',
        new: ':',
        oldPath: source.origPath ?? source.path,
        newPath: source.path
      }
    case 'commit':
      return {
        old: `${source.hash}^`,
        new: source.hash,
        oldPath: source.origPath ?? source.path,
        newPath: source.path
      }
    case 'compare':
      return {
        old: source.from,
        new: source.to,
        oldPath: source.origPath ?? source.path,
        newPath: source.path
      }
    case 'stash':
      return { old: `${source.ref}^`, new: source.ref, oldPath: source.path, newPath: source.path }
  }
}
