import { call } from '@/lib/api'
import { isDark } from '@/lib/theme'
import { app, closeTab, newTab, toastError, updateSettings } from './state'
import { activeRepo, type RepoContextValue } from './repo/context'
import * as A from './repo/actions'
import { pickAndOpen } from './Welcome'
import { promptCompare } from '@/views/history/HistoryView'

export interface Command {
  id: string
  label: string
  group: string
  /** Matching shortcut id in shortcuts.ts */
  shortcut?: string
  needsRepo?: boolean
  run: (r: RepoContextValue | null) => void
  keywords?: string
}

const cycleTab = (d: 1 | -1): void => {
  const s = app.get()
  const i = s.tabs.findIndex((t) => t.id === s.activeTab)
  const next = s.tabs[(i + d + s.tabs.length) % s.tabs.length]
  if (next) app.set({ activeTab: next.id })
}

export const COMMANDS: Command[] = [
  {
    id: 'open',
    label: 'Open repository…',
    group: 'Repositories',
    shortcut: 'open',
    run: () => void pickAndOpen()
  },
  {
    id: 'clone',
    label: 'Clone repository…',
    group: 'Repositories',
    shortcut: 'clone',
    run: () => app.set({ cloneOpen: true })
  },
  {
    id: 'init',
    label: 'Create repository…',
    group: 'Repositories',
    shortcut: 'init',
    run: () => app.set({ initOpen: true })
  },
  { id: 'newTab', label: 'New tab', group: 'Tabs', shortcut: 'newTab', run: () => void newTab() },
  {
    id: 'closeTab',
    label: 'Close tab',
    group: 'Tabs',
    shortcut: 'closeTab',
    run: () => closeTab(app.get().activeTab)
  },
  { id: 'nextTab', label: 'Next tab', group: 'Tabs', shortcut: 'nextTab', run: () => cycleTab(1) },
  {
    id: 'prevTab',
    label: 'Previous tab',
    group: 'Tabs',
    shortcut: 'prevTab',
    run: () => cycleTab(-1)
  },

  {
    id: 'refresh',
    label: 'Refresh',
    group: 'Repository',
    shortcut: 'refresh',
    needsRepo: true,
    run: (r) => void r!.refresh('all')
  },
  {
    id: 'fetch',
    label: 'Fetch all remotes',
    group: 'Repository',
    shortcut: 'fetch',
    needsRepo: true,
    run: (r) => void A.fetchAll(r!)
  },
  {
    id: 'pull',
    label: 'Pull',
    group: 'Repository',
    shortcut: 'pull',
    needsRepo: true,
    run: (r) => void A.pull(r!)
  },
  {
    id: 'push',
    label: 'Push…',
    group: 'Repository',
    shortcut: 'push',
    needsRepo: true,
    run: (r) => void A.push(r!)
  },
  {
    id: 'newBranch',
    label: 'New branch…',
    group: 'Repository',
    shortcut: 'newBranch',
    needsRepo: true,
    run: (r) => void A.createBranch(r!)
  },
  {
    id: 'stash',
    label: 'Stash changes…',
    group: 'Repository',
    shortcut: 'stash',
    needsRepo: true,
    run: (r) => void A.stash(r!)
  },
  {
    id: 'addRemote',
    label: 'Add remote…',
    group: 'Repository',
    needsRepo: true,
    run: (r) => void A.addRemote(r!)
  },
  {
    id: 'addWorktree',
    label: 'Add worktree…',
    group: 'Repository',
    needsRepo: true,
    run: (r) => void A.addWorktree(r!)
  },
  {
    id: 'compare',
    label: 'Compare branches or commits…',
    group: 'Repository',
    needsRepo: true,
    run: (r) => void promptCompare(r!)
  },
  {
    id: 'terminal',
    label: 'Open terminal here',
    group: 'Repository',
    shortcut: 'terminal',
    needsRepo: true,
    run: (r) => void call('shell.openTerminal', { repo: r!.path }).catch((e) => toastError(e))
  },
  {
    id: 'editor',
    label: 'Open in editor',
    group: 'Repository',
    needsRepo: true,
    run: (r) => void call('shell.openEditor', { repo: r!.path }).catch((e) => toastError(e))
  },
  {
    id: 'explorer',
    label: 'Show in file manager',
    group: 'Repository',
    needsRepo: true,
    run: (r) => void call('shell.showInFolder', { repo: r!.path }).catch((e) => toastError(e))
  },
  {
    id: 'web',
    label: 'Open on hosting service',
    group: 'Repository',
    needsRepo: true,
    run: (r) => void A.openInBrowser(r!, { kind: 'repo' })
  },

  {
    id: 'viewHistory',
    label: 'Show history',
    group: 'Views',
    shortcut: 'viewHistory',
    needsRepo: true,
    run: (r) => r!.setView({ kind: 'history' })
  },
  {
    id: 'viewChanges',
    label: 'Show changes',
    group: 'Views',
    shortcut: 'viewChanges',
    needsRepo: true,
    run: (r) => r!.setView({ kind: 'changes' })
  },
  {
    id: 'viewPulls',
    label: 'Show pull requests',
    group: 'Views',
    shortcut: 'viewPulls',
    needsRepo: true,
    run: (r) => r!.setView({ kind: 'pulls' })
  },
  {
    id: 'viewReflog',
    label: 'Show reflog',
    group: 'Views',
    needsRepo: true,
    run: (r) => r!.setView({ kind: 'reflog' })
  },
  {
    id: 'viewTree',
    label: 'Browse files at HEAD',
    group: 'Views',
    needsRepo: true,
    run: (r) => r!.setView({ kind: 'tree', rev: 'HEAD' })
  },
  {
    id: 'repoSettings',
    label: 'Repository settings',
    group: 'Views',
    needsRepo: true,
    run: (r) => r!.setView({ kind: 'repoSettings' })
  },
  {
    id: 'find',
    label: 'Search history',
    group: 'Views',
    shortcut: 'find',
    needsRepo: true,
    run: (r) => {
      r!.setView({ kind: 'history' })
      setTimeout(() => window.dispatchEvent(new Event('spoon:find')), 0)
    }
  },

  {
    id: 'settings',
    label: 'Open settings',
    group: 'Application',
    shortcut: 'settings',
    keywords: 'preferences options',
    run: () => app.set({ settingsOpen: true })
  },
  {
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    group: 'Application',
    shortcut: 'shortcuts',
    run: () => app.set({ shortcutsOpen: true })
  },
  {
    id: 'oplog',
    label: 'Git operation log',
    group: 'Application',
    shortcut: 'oplog',
    run: () => app.set({ oplogOpen: !app.get().oplogOpen })
  },
  {
    id: 'toggleTheme',
    label: 'Toggle light/dark theme',
    group: 'Application',
    shortcut: 'toggleTheme',
    run: () => {
      const s = app.get().settings
      if (s) void updateSettings({ theme: isDark(s) ? 'light' : 'dark' })
    }
  },
  {
    id: 'themeLight',
    label: 'Theme: Light',
    group: 'Application',
    keywords: 'appearance',
    run: () => void updateSettings({ theme: 'light' })
  },
  {
    id: 'themeDark',
    label: 'Theme: Dark',
    group: 'Application',
    keywords: 'appearance',
    run: () => void updateSettings({ theme: 'dark' })
  },
  {
    id: 'themeSystem',
    label: 'Theme: System',
    group: 'Application',
    keywords: 'appearance',
    run: () => void updateSettings({ theme: 'system' })
  },
  {
    id: 'palette',
    label: 'Command palette',
    group: 'Application',
    shortcut: 'palette',
    run: () => app.set({ paletteOpen: !app.get().paletteOpen })
  }
]

export function runCommand(id: string): boolean {
  const cmd = COMMANDS.find((c) => c.id === id)
  if (!cmd) return false
  const r = activeRepo.get().ctx
  if (cmd.needsRepo && !r) return false
  cmd.run(r)
  return true
}
