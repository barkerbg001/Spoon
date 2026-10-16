import { isMac } from '@/lib/api'
import { app } from './state'

export interface ShortcutDef {
  id: string
  label: string
  group: 'General' | 'Tabs' | 'Repository' | 'Views'
  /** Default binding in "Mod+Shift+K" form; Mod is Ctrl (Windows/Linux) or Cmd (macOS). */
  default: string
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'palette', label: 'Command palette', group: 'General', default: 'Mod+K' },
  { id: 'settings', label: 'Settings', group: 'General', default: 'Mod+,' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'General', default: 'Mod+/' },
  { id: 'toggleTheme', label: 'Toggle light/dark theme', group: 'General', default: 'Mod+Alt+L' },
  { id: 'oplog', label: 'Show Git operation log', group: 'General', default: 'Mod+Alt+O' },
  { id: 'open', label: 'Open repository', group: 'Tabs', default: 'Mod+O' },
  { id: 'clone', label: 'Clone repository', group: 'Tabs', default: 'Mod+Shift+N' },
  { id: 'init', label: 'Create repository', group: 'Tabs', default: 'Mod+Alt+N' },
  { id: 'newTab', label: 'New tab', group: 'Tabs', default: 'Mod+T' },
  { id: 'closeTab', label: 'Close tab', group: 'Tabs', default: 'Mod+W' },
  { id: 'nextTab', label: 'Next tab', group: 'Tabs', default: 'Ctrl+Tab' },
  { id: 'prevTab', label: 'Previous tab', group: 'Tabs', default: 'Ctrl+Shift+Tab' },
  { id: 'refresh', label: 'Refresh', group: 'Repository', default: 'F5' },
  { id: 'fetch', label: 'Fetch', group: 'Repository', default: 'Mod+Shift+F' },
  { id: 'pull', label: 'Pull', group: 'Repository', default: 'Mod+Shift+L' },
  { id: 'push', label: 'Push', group: 'Repository', default: 'Mod+Shift+U' },
  { id: 'newBranch', label: 'New branch', group: 'Repository', default: 'Mod+B' },
  { id: 'stash', label: 'Stash changes', group: 'Repository', default: 'Mod+Shift+S' },
  { id: 'terminal', label: 'Open terminal', group: 'Repository', default: 'Mod+Alt+T' },
  { id: 'find', label: 'Search history', group: 'Views', default: 'Mod+F' },
  { id: 'viewHistory', label: 'Show history', group: 'Views', default: 'Mod+1' },
  { id: 'viewChanges', label: 'Show changes', group: 'Views', default: 'Mod+2' },
  { id: 'viewPulls', label: 'Show pull requests', group: 'Views', default: 'Mod+3' },
  { id: 'commit', label: 'Commit (in the message box)', group: 'Views', default: 'Mod+Enter' }
]

export function bindingFor(id: string): string {
  return app.get().settings?.shortcuts[id] ?? SHORTCUTS.find((s) => s.id === id)?.default ?? ''
}

/** Human-readable form for the current platform. */
export function shortcutLabel(id: string): string {
  return formatBinding(bindingFor(id))
}

export function formatBinding(b: string): string {
  if (!b) return ''
  return b
    .split('+')
    .map((p) =>
      p === 'Mod'
        ? isMac()
          ? '⌘'
          : 'Ctrl'
        : p === 'Alt' && isMac()
          ? '⌥'
          : p === 'Shift' && isMac()
            ? '⇧'
            : p === 'Ctrl' && isMac()
              ? '⌃'
              : p
    )
    .join(isMac() ? '' : '+')
}

/** Convert a keyboard event into the binding format, or null for bare modifier presses. */
export function eventToBinding(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const parts: string[] = []
  const mod = isMac() ? e.metaKey : e.ctrlKey
  if (mod) parts.push('Mod')
  if (isMac() && e.ctrlKey) parts.push('Ctrl')
  if (!isMac() && e.metaKey) return null
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let key = e.code.startsWith('Key')
    ? e.code.slice(3)
    : e.code.startsWith('Digit')
      ? e.code.slice(5)
      : e.key
  if (key === ' ') key = 'Space'
  if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join('+')
}

/** Match against the effective bindings. "Ctrl" in a binding means the physical Ctrl key on every platform. */
export function matchShortcut(e: KeyboardEvent): string | null {
  const b = eventToBinding(e)
  if (!b) return null
  const alt = !isMac() ? b.replace(/^Mod\+/, 'Ctrl+') : b
  for (const s of SHORTCUTS) {
    const want = bindingFor(s.id)
    if (want === b || want === alt) return s.id
  }
  return null
}
