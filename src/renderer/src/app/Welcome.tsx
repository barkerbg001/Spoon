import * as React from 'react'
import {
  AlertTriangle,
  Copy,
  Download,
  FolderOpen,
  FolderPlus,
  Search,
  Star,
  Tags,
  Trash2
} from 'lucide-react'
import type { RecentRepo } from '@shared/types'
import { call } from '@/lib/api'
import { useStore } from '@/lib/store'
import { cn, relativeTime } from '@/lib/utils'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/primitives'
import { ContextMenu, type MenuItem } from '@/components/ui/menu'
import { app, loadRecents, openRepository, toastError } from './state'
import { prompt } from './dialogs'
import { shortcutLabel } from './shortcuts'

export async function pickAndOpen(tabId?: string): Promise<void> {
  const dir = await call('dialog.pickDirectory', { title: 'Open a Git repository' })
  if (dir) await openRepository(dir, tabId)
}

export function Welcome({ tabId }: { tabId: string }): React.JSX.Element {
  const recents = useStore(app, (s) => s.recents)
  const info = useStore(app, (s) => s.info)
  const [q, setQ] = React.useState('')
  const [sel, setSel] = React.useState(0)

  const filtered = recents.filter(
    (r) =>
      !q ||
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.path.toLowerCase().includes(q.toLowerCase()) ||
      (r.group ?? '').toLowerCase().includes(q.toLowerCase())
  )
  const favorites = filtered.filter((r) => r.favorite)
  const groups = new Map<string, RecentRepo[]>()
  for (const r of filtered.filter((r) => !r.favorite && r.group))
    groups.set(r.group!, [...(groups.get(r.group!) ?? []), r])
  const others = filtered.filter((r) => !r.favorite && !r.group)
  const ordered = [...favorites, ...[...groups.values()].flat(), ...others]

  const update = async (
    path: string,
    patch: { favorite?: boolean; group?: string | null }
  ): Promise<void> => {
    try {
      app.set({ recents: await call('recents.update', { path, ...patch }) })
    } catch (e) {
      toastError(e)
    }
  }

  const menu = (r: RecentRepo): MenuItem[] => [
    { label: 'Open', icon: <FolderOpen />, onSelect: () => void openRepository(r.path, tabId) },
    {
      label: r.favorite ? 'Remove from favourites' : 'Add to favourites',
      icon: <Star />,
      onSelect: () => void update(r.path, { favorite: !r.favorite })
    },
    {
      label: 'Set group…',
      icon: <Tags />,
      onSelect: async () => {
        const v = await prompt({
          title: 'Group',
          description: r.name,
          fields: [{ name: 'g', label: 'Group name (empty to remove)', initial: r.group ?? '' }],
          confirmLabel: 'Save'
        })
        if (v) await update(r.path, { group: String(v['g']).trim() || null })
      }
    },
    {
      label: 'Copy path',
      icon: <Copy />,
      onSelect: () => void navigator.clipboard.writeText(r.path)
    },
    { type: 'separator' },
    {
      label: 'Remove from list',
      icon: <Trash2 />,
      onSelect: () =>
        void call('recents.remove', { path: r.path }).then((list) => app.set({ recents: list }))
    }
  ]

  React.useEffect(() => {
    void loadRecents()
  }, [])

  const row = (r: RecentRepo): React.ReactNode => {
    const i = ordered.indexOf(r)
    return (
      <ContextMenu key={r.path} items={() => menu(r)}>
        <div
          role="option"
          aria-selected={sel === i}
          tabIndex={-1}
          onMouseEnter={() => setSel(i)}
          onClick={() => void openRepository(r.path, tabId)}
          className={cn(
            'group flex cursor-default items-center gap-3 rounded-md px-3 py-1.5',
            sel === i ? 'bg-accent' : ''
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[12px] font-bold text-primary">
            {r.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{r.name}</div>
            <div className="truncate text-[0.85em] text-muted-foreground">{r.path}</div>
          </div>
          <span className="shrink-0 text-[0.85em] text-muted-foreground">
            {relativeTime(Math.floor(r.lastOpened / 1000))}
          </span>
          <button
            className={cn(
              'rounded p-1 hover:bg-background',
              r.favorite
                ? 'text-primary'
                : 'text-muted-foreground opacity-0 group-hover:opacity-100'
            )}
            aria-label={r.favorite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={(e) => (e.stopPropagation(), void update(r.path, { favorite: !r.favorite }))}
          >
            <Star className="size-4" fill={r.favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </ContextMenu>
    )
  }

  const heading = (t: string): React.ReactNode => (
    <div className="px-3 pt-3 pb-1 text-[0.8em] font-semibold tracking-wide text-muted-foreground uppercase">
      {t}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-auto">
      <div className="flex w-full max-w-3xl flex-col gap-6 px-8 py-10">
        <div className="flex items-center gap-4">
          <Logo size={56} />
          <div>
            <h1 className="text-[1.8em] font-semibold tracking-tight">Spoon</h1>
            <p className="text-muted-foreground">A fast, local-first Git client.</p>
          </div>
        </div>

        {!info?.git && info && (
          <div
            className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3"
            role="alert"
          >
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            <div className="text-[0.95em]">
              <div className="font-semibold">Git was not found</div>
              <p className="text-muted-foreground">
                {info.gitError ?? 'Install Git 2.25 or newer from git-scm.com.'} You can also set
                the Git executable in Settings → Git.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => app.set({ settingsOpen: true, settingsSection: 'git' })}
                >
                  Open Git settings
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void call('app.refreshGit', {}).then((i) => app.set({ info: i }))}
                >
                  Detect again
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[
            {
              icon: <FolderOpen />,
              title: 'Open',
              desc: 'An existing repository',
              kbd: shortcutLabel('open'),
              run: () => void pickAndOpen(tabId)
            },
            {
              icon: <Download />,
              title: 'Clone',
              desc: 'From a URL or account',
              kbd: shortcutLabel('clone'),
              run: () => app.set({ cloneOpen: true })
            },
            {
              icon: <FolderPlus />,
              title: 'Create',
              desc: 'A new repository',
              kbd: shortcutLabel('init'),
              run: () => app.set({ initOpen: true })
            }
          ].map((a) => (
            <button
              key={a.title}
              onClick={a.run}
              disabled={!info?.git}
              className="flex flex-col items-start gap-1 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent disabled:opacity-50 [&>svg]:size-5 [&>svg]:text-primary"
            >
              {a.icon}
              <span className="font-semibold">{a.title}</span>
              <span className="text-[0.88em] text-muted-foreground">{a.desc}</span>
              <Kbd>{a.kbd}</Kbd>
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => (setQ(e.target.value), setSel(0))}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSel((s) => Math.min(ordered.length - 1, s + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSel((s) => Math.max(0, s - 1))
                } else if (e.key === 'Enter' && ordered[sel])
                  void openRepository(ordered[sel]!.path, tabId)
              }}
              placeholder="Search recent repositories"
              aria-label="Search recent repositories"
              className="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9"
            />
          </div>
          <div role="listbox" aria-label="Recent repositories">
            {recents.length === 0 && (
              <p className="px-3 py-6 text-center text-muted-foreground">
                Repositories you open will appear here.
              </p>
            )}
            {favorites.length > 0 && heading('Favourites')}
            {favorites.map(row)}
            {[...groups.entries()].map(([g, list]) => (
              <React.Fragment key={g}>
                {heading(g)}
                {list.map(row)}
              </React.Fragment>
            ))}
            {others.length > 0 && (favorites.length > 0 || groups.size > 0) && heading('Recent')}
            {others.map(row)}
            {recents.length > 0 && ordered.length === 0 && (
              <p className="px-3 py-4 text-muted-foreground">No match.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
