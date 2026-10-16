import type { AppInfo, OpProgress, RecentRepo, RepoSummary, Settings } from '@shared/types'
import { ApiError, call } from '@/lib/api'
import { Store } from '@/lib/store'
import { applyTheme } from '@/lib/theme'

export type RepoView =
  | { kind: 'history' }
  | { kind: 'changes' }
  | { kind: 'fileHistory'; path: string }
  | { kind: 'blame'; path: string; rev?: string }
  | { kind: 'tree'; rev: string }
  | { kind: 'reflog' }
  | { kind: 'compare'; from: string; to: string }
  | { kind: 'pulls' }
  | { kind: 'stash'; index: number; hash: string; message: string }
  | { kind: 'repoSettings' }

export interface Tab {
  id: string
  path: string | null
  summary: RepoSummary | null
  view: RepoView
}

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  title: string
  detail?: string
  action?: { label: string; run: () => void }
}

export interface ActiveOp {
  opId: string
  label: string
  repo: string | null
  progress?: OpProgress
  cancellable: boolean
}

interface AppState {
  info: AppInfo | null
  settings: Settings | null
  recents: RecentRepo[]
  tabs: Tab[]
  activeTab: string
  toasts: Toast[]
  ops: ActiveOp[]
  paletteOpen: boolean
  settingsOpen: boolean
  settingsSection: string
  cloneOpen: boolean
  initOpen: boolean
  shortcutsOpen: boolean
  oplogOpen: boolean
}

const firstTab: Tab = { id: 't1', path: null, summary: null, view: { kind: 'history' } }

export const app = new Store<AppState>({
  info: null,
  settings: null,
  recents: [],
  tabs: [firstTab],
  activeTab: firstTab.id,
  toasts: [],
  ops: [],
  paletteOpen: false,
  settingsOpen: false,
  settingsSection: 'appearance',
  cloneOpen: false,
  initOpen: false,
  shortcutsOpen: false,
  oplogOpen: false
})

let toastSeq = 0
export function toast(t: Omit<Toast, 'id'>): void {
  const id = ++toastSeq
  app.set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }))
  setTimeout(() => dismissToast(id), t.kind === 'error' ? 12000 : 4000)
}
export function dismissToast(id: number): void {
  app.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

export function toastError(e: unknown, title?: string): void {
  if (e instanceof ApiError) {
    if (e.code === 'CANCELLED') return toast({ kind: 'info', title: 'Cancelled' })
    toast({ kind: 'error', title: title ? `${title}: ${e.message}` : e.message, detail: e.detail })
  } else toast({ kind: 'error', title: title ?? 'Unexpected error', detail: String(e) })
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const prev = app.get().settings
  if (prev) {
    const optimistic = { ...prev, ...patch }
    app.set({ settings: optimistic })
    applyTheme(optimistic)
  }
  try {
    const next = await call('settings.set', patch)
    app.set({ settings: next })
    applyTheme(next)
  } catch (e) {
    toastError(e, 'Could not save settings')
  }
}

export async function loadRecents(): Promise<void> {
  app.set({ recents: await call('recents.list', {}) })
}

let tabSeq = 1
export function newTab(): string {
  const id = `t${++tabSeq}`
  app.set((s) => ({
    tabs: [...s.tabs, { id, path: null, summary: null, view: { kind: 'history' } }],
    activeTab: id
  }))
  return id
}

export function closeTab(id: string): void {
  const s = app.get()
  const tab = s.tabs.find((t) => t.id === id)
  if (tab?.path) void call('repo.close', { repo: tab.path }).catch(() => undefined)
  let tabs = s.tabs.filter((t) => t.id !== id)
  if (tabs.length === 0)
    tabs = [{ id: `t${++tabSeq}`, path: null, summary: null, view: { kind: 'history' } }]
  const idx = s.tabs.findIndex((t) => t.id === id)
  const active = s.activeTab === id ? tabs[Math.min(idx, tabs.length - 1)]!.id : s.activeTab
  app.set({ tabs, activeTab: active })
  persistTabs()
}

export function updateTab(id: string, patch: Partial<Tab>): void {
  app.set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  if ('path' in patch) persistTabs()
}

export function setView(tabId: string, view: RepoView): void {
  updateTab(tabId, { view })
}

export function activeTab(): Tab {
  const s = app.get()
  return s.tabs.find((t) => t.id === s.activeTab) ?? s.tabs[0]!
}

function persistTabs(): void {
  const paths = app
    .get()
    .tabs.map((t) => t.path)
    .filter((p): p is string => !!p)
  localStorage.setItem('spoon:tabs', JSON.stringify(paths))
}

export function savedTabs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem('spoon:tabs') ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Open a repository in the given (or a new) tab, handling trust prompts. */
export async function openRepository(path: string, tabId?: string): Promise<boolean> {
  const existing = app.get().tabs.find((t) => t.path && t.path.toLowerCase() === path.toLowerCase())
  if (existing) {
    app.set({ activeTab: existing.id })
    return true
  }
  try {
    const summary = await call('repo.open', { path })
    attachSummary(summary, tabId)
    return true
  } catch (e) {
    if (e instanceof ApiError && e.code === 'UNSAFE_REPOSITORY') {
      trustRequest.set({ request: { path, tabId, detail: e.detail ?? '' } })
      return false
    }
    toastError(e, 'Could not open repository')
    return false
  } finally {
    void loadRecents()
  }
}

export function attachSummary(summary: RepoSummary, tabId?: string): void {
  let id = tabId ?? activeTab().id
  const target = app.get().tabs.find((t) => t.id === id)
  if (target?.path) id = newTab()
  updateTab(id, {
    path: summary.path,
    summary,
    view: { kind: summary.changeCount > 0 ? 'changes' : 'history' }
  })
  app.set({ activeTab: id })
}

export const trustRequest = new Store<{
  request: { path: string; tabId?: string; detail: string } | null
}>({ request: null })

export function startOp(op: ActiveOp): void {
  app.set((s) => ({ ops: [...s.ops, op] }))
}
export function endOp(opId: string): void {
  app.set((s) => ({ ops: s.ops.filter((o) => o.opId !== opId) }))
}
export function progressOp(p: OpProgress): void {
  app.set((s) => ({ ops: s.ops.map((o) => (o.opId === p.opId ? { ...o, progress: p } : o)) }))
}
