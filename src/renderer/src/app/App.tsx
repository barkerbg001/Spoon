import * as React from 'react'
import { call, on } from '@/lib/api'
import { useStore } from '@/lib/store'
import { applyTheme, watchSystem } from '@/lib/theme'
import { TooltipProvider } from '@/components/ui/primitives'
import { app, loadRecents, openRepository, progressOp, savedTabs, toastError } from './state'
import { activeRepo } from './repo/context'
import { RepoWorkspace } from './repo/RepoWorkspace'
import { Welcome } from './Welcome'
import { DialogHost } from './dialogs'
import { SettingsDialog } from './SettingsDialog'
import { CloneDialog, InitDialog, ShortcutsDialog, TrustDialog } from './AppDialogs'
import { CommandPalette } from './CommandPalette'
import { OpLogPanel, StatusBar, TabBar, Toasts } from './Chrome'
import { matchShortcut } from './shortcuts'
import { runCommand } from './commands'

/** Shortcuts handled by the focused component rather than globally. */
const LOCAL_SHORTCUTS = new Set(['commit'])

function useBootstrap(): boolean {
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [info, settings] = await Promise.all([call('app.info', {}), call('settings.get', {})])
        if (!alive) return
        app.set({ info, settings })
        applyTheme(settings)
        await loadRecents().catch(() => undefined)
      } catch (e) {
        toastError(e, 'Could not load settings')
      } finally {
        if (alive) setReady(true)
      }
      if (!alive) return
      // Restore the tabs from the previous session, one at a time so trust prompts stay sequential.
      for (const [i, path] of savedTabs().entries()) {
        await openRepository(path, i === 0 ? app.get().activeTab : undefined).catch(() => undefined)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  React.useEffect(() => {
    const offs = [
      watchSystem(() => app.get().settings),
      on('theme.system', () => {
        const s = app.get().settings
        if (s) applyTheme(s)
      }),
      on('op.progress', (p) => progressOp(p))
    ]
    return () => offs.forEach((f) => f())
  }, [])
  return ready
}

function useGlobalShortcuts(): void {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing) return
      const id = matchShortcut(e)
      if (!id || LOCAL_SHORTCUTS.has(id)) return
      const modalOpen = document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
      if (modalOpen && id !== 'palette') return
      if (runCommand(id)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function useActiveRepoSync(): void {
  const activePath = useStore(app, (s) => s.tabs.find((t) => t.id === s.activeTab)?.path ?? null)
  React.useEffect(() => {
    if (!activePath) activeRepo.set({ ctx: null })
  }, [activePath])
}

export function App(): React.JSX.Element {
  const ready = useBootstrap()
  useGlobalShortcuts()
  useActiveRepoSync()
  const tabs = useStore(app, (s) => s.tabs)
  const active = useStore(app, (s) => s.activeTab)

  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <TabBar />
        <main className="relative min-h-0 flex-1">
          {!ready ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Loading…
            </div>
          ) : (
            tabs.map((t) => (
              <div
                key={t.id}
                role="tabpanel"
                aria-label={t.summary?.name ?? 'New tab'}
                className="absolute inset-0 flex flex-col"
                hidden={t.id !== active}
              >
                {t.path ? (
                  <RepoWorkspace tabId={t.id} path={t.path} view={t.view} />
                ) : (
                  <Welcome tabId={t.id} />
                )}
              </div>
            ))
          )}
        </main>
        <OpLogPanel />
        <StatusBar />
      </div>
      <Toasts />
      <CommandPalette />
      <SettingsDialog />
      <CloneDialog />
      <InitDialog />
      <TrustDialog />
      <ShortcutsDialog />
      <DialogHost />
    </TooltipProvider>
  )
}
