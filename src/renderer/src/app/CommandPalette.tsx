import * as React from 'react'
import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { FolderGit2, GitBranch, Search } from 'lucide-react'
import { useStore } from '@/lib/store'
import { app, openRepository } from './state'
import { activeRepo } from './repo/context'
import * as A from './repo/actions'
import { COMMANDS } from './commands'
import { shortcutLabel } from './shortcuts'

const itemCls =
  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[0.95em] data-[selected=true]:bg-accent data-[disabled=true]:opacity-50 [&>svg]:size-4 [&>svg]:text-muted-foreground'
const groupCls =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[0.78em] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground'

/** Prefer prefix and word-start matches over loose subsequence matches. */
function rank(value: string, search: string, keywords?: string[]): number {
  const v = value.toLowerCase()
  const s = search.toLowerCase().trim()
  if (!s) return 1
  if (v.startsWith(s)) return 1
  if (v.includes(` ${s}`) || v.includes(`/${s}`)) return 0.9
  if (v.includes(s)) return 0.75
  if (keywords?.some((k) => k.toLowerCase().includes(s))) return 0.6
  let i = 0
  for (const ch of v) if (ch === s[i]) i++
  return i === s.length ? 0.2 : 0
}

export function CommandPalette(): React.JSX.Element {
  const open = useStore(app, (s) => s.paletteOpen)
  const recents = useStore(app, (s) => s.recents)
  const r = useStore(activeRepo, (s) => s.ctx)
  const close = (): void => app.set({ paletteOpen: false })
  const run = (fn: () => void): void => {
    close()
    setTimeout(fn, 0)
  }
  const groups = [...new Set(COMMANDS.map((c) => c.group))]

  return (
    <D.Root open={open} onOpenChange={(o) => app.set({ paletteOpen: o })}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <D.Content
          className="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Command palette</D.Title>
          <Command label="Command palette" loop filter={rank}>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Type a command, branch or repository…"
                className="h-11 flex-1 bg-transparent outline-none"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-auto p-1.5">
              <Command.Empty className="p-4 text-center text-muted-foreground">
                No results.
              </Command.Empty>
              {groups.map((g) => {
                const cmds = COMMANDS.filter(
                  (c) => c.group === g && (!c.needsRepo || r) && c.id !== 'palette'
                )
                if (!cmds.length) return null
                return (
                  <Command.Group key={g} heading={g} className={groupCls}>
                    {cmds.map((c) => (
                      <Command.Item
                        key={c.id}
                        value={c.label}
                        keywords={c.keywords?.split(' ')}
                        onSelect={() => run(() => c.run(r))}
                        className={itemCls}
                      >
                        <span className="flex-1">{c.label}</span>
                        {c.shortcut && (
                          <span className="text-[0.8em] text-muted-foreground">
                            {shortcutLabel(c.shortcut)}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )
              })}
              {r && r.refs && r.refs.branches.length > 0 && (
                <Command.Group heading="Check out branch" className={groupCls}>
                  {r.refs.branches
                    .filter((b) => !b.current)
                    .map((b) => (
                      <Command.Item
                        key={b.name}
                        value={`checkout ${b.name}`}
                        onSelect={() => run(() => void A.checkout(r, b.name))}
                        className={itemCls}
                      >
                        <GitBranch />
                        <span className="flex-1 truncate">{b.name}</span>
                      </Command.Item>
                    ))}
                </Command.Group>
              )}
              {recents.length > 0 && (
                <Command.Group heading="Open recent" className={groupCls}>
                  {recents.slice(0, 30).map((x) => (
                    <Command.Item
                      key={x.path}
                      value={`open ${x.name} ${x.path}`}
                      onSelect={() => run(() => void openRepository(x.path))}
                      className={itemCls}
                    >
                      <FolderGit2 />
                      <span className="truncate">{x.name}</span>
                      <span className="ml-auto truncate text-[0.82em] text-muted-foreground">
                        {x.path}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
