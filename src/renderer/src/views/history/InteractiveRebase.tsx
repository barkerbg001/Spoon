import * as React from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Commit, RebaseTodoItem } from '@shared/types'
import { call } from '@/lib/api'
import { cn, short } from '@/lib/utils'
import { toast, toastError } from '@/app/state'
import { openDialog } from '@/app/dialogs'
import type { RepoContextValue } from '@/app/repo/context'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/primitives'

type Item = RebaseTodoItem & { full: string }

const HELP: Record<RebaseTodoItem['action'], string> = {
  pick: 'Keep the commit as is',
  reword: 'Keep the changes, edit the message',
  edit: 'Stop after applying so you can amend it',
  squash: 'Combine into the previous commit and edit the combined message',
  fixup: 'Combine into the previous commit, discarding this message',
  drop: 'Remove the commit and its changes'
}

/**
 * Open the interactive rebase editor for commits after `base` (exclusive) up to HEAD.
 * `base === null` rebases from the root commit.
 */
export async function interactiveRebase(
  r: Pick<RepoContextValue, 'path' | 'refresh' | 'status' | 'setView'>,
  base: Commit
): Promise<void> {
  const st = r.status
  if (st && st.staged.length + st.unstaged.length + st.conflicted.length > 0) {
    toast({
      kind: 'error',
      title: 'Interactive rebase needs a clean working tree. Commit or stash your changes first.'
    })
    return
  }
  if (st?.operation !== 'none') {
    toast({ kind: 'error', title: 'Another operation is in progress. Continue or abort it first.' })
    return
  }
  const isRoot = base.parents.length === 0
  let commits: Commit[]
  try {
    commits = await call('op.previewCommits', {
      repo: r.path,
      from: base.hash,
      to: 'HEAD',
      limit: 1000
    })
    if (isRoot) commits = [...commits, base]
  } catch (e) {
    toastError(e, 'Interactive rebase')
    return
  }
  if (commits.length === 0) {
    toast({
      kind: 'info',
      title: 'The selected commit is not an ancestor of HEAD, or there are no commits after it.'
    })
    return
  }
  if (commits.some((c) => c.parents.length > 1)) {
    toast({
      kind: 'error',
      title:
        'The range contains merge commits. Interactive rebase in Spoon currently supports linear history only.'
    })
    return
  }
  // Load full messages for reword/squash editing.
  const items: Item[] = []
  for (const c of [...commits].reverse()) {
    const d = await call('history.commit', { repo: r.path, hash: c.hash }).catch(() => null)
    items.push({ action: 'pick', hash: c.hash, subject: c.subject, full: d?.message ?? c.subject })
  }
  const todo = await openDialog<RebaseTodoItem[]>((close) => (
    <Editor
      initial={items}
      branch={st?.head.branch ?? 'HEAD'}
      base={isRoot ? null : base}
      close={close}
    />
  ))
  if (!todo) return
  try {
    const res = await call('rebase.interactive', {
      repo: r.path,
      base: isRoot ? null : base.hash,
      todo
    })
    if (res.exitCode !== 0) {
      toast({
        kind: 'info',
        title: 'The rebase stopped. Resolve conflicts or amend the commit, then Continue.',
        detail: res.stderr
      })
      r.setView({ kind: 'changes' })
    } else toast({ kind: 'success', title: 'Interactive rebase complete' })
  } catch (e) {
    toastError(e, 'Interactive rebase')
  } finally {
    await r.refresh('all')
  }
}

function Editor({
  initial,
  branch,
  base,
  close
}: {
  initial: Item[]
  branch: string
  base: Commit | null
  close: (v: RebaseTodoItem[] | null) => void
}): React.JSX.Element {
  const [items, setItems] = React.useState(initial)
  const [focus, setFocus] = React.useState(0)
  const set = (i: number, patch: Partial<Item>): void =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, d: -1 | 1): void => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    setItems((xs) => {
      const next = xs.slice()
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
    setFocus(j)
  }

  const first = items[0]
  const error =
    first && (first.action === 'squash' || first.action === 'fixup')
      ? 'The first commit cannot be squashed or fixed up.'
      : items.every((x) => x.action === 'drop')
        ? 'Dropping every commit would empty the branch; use Reset instead.'
        : items.some((x) => x.action === 'reword' && !x.message?.trim())
          ? 'Enter a message for every reworded commit.'
          : null

  const changed = items.some((x, i) => x.action !== 'pick' || x.hash !== initial[i]!.hash)

  const submit = (): void => {
    if (error) return
    close(
      items.map(({ action, hash, subject, message }) => ({
        action,
        hash,
        subject,
        message: action === 'reword' || action === 'squash' ? message : undefined
      }))
    )
  }

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && close(null)}
      title={`Interactive rebase of ${branch}`}
      description={`${items.length} commit(s) ${base ? `after ${short(base.hash)} ${base.subject}` : 'from the root commit'}, oldest first. Commits get new IDs; if already pushed you will need to force push.`}
      footer={
        <>
          {error && <span className="mr-auto text-[0.9em] text-destructive">{error}</span>}
          <Button variant="outline" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button disabled={!!error || !changed} onClick={submit}>
            Start rebase
          </Button>
        </>
      }
    >
      <ol className="space-y-1" aria-label="Rebase plan">
        {items.map((it, i) => (
          <li
            key={it.hash}
            className={cn(
              'rounded-md border p-1.5',
              focus === i && 'border-primary',
              it.action === 'drop' && 'opacity-60'
            )}
            onFocus={() => setFocus(i)}
            onKeyDown={(e) => {
              if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault()
                move(i, e.key === 'ArrowUp' ? -1 : 1)
              }
            }}
          >
            <div className="flex items-center gap-2">
              <Select
                aria-label={`Action for ${short(it.hash)}`}
                value={it.action}
                title={HELP[it.action]}
                onChange={(e) =>
                  set(i, {
                    action: e.target.value as Item['action'],
                    message:
                      e.target.value === 'reword'
                        ? (it.message ?? it.full)
                        : e.target.value === 'squash'
                          ? (it.message ?? '')
                          : it.message
                  })
                }
                className="w-24"
              >
                {(Object.keys(HELP) as Item['action'][]).map((a) => (
                  <option key={a} value={a} title={HELP[a]}>
                    {a}
                  </option>
                ))}
              </Select>
              <span className="font-mono text-[11px] text-muted-foreground">{short(it.hash)}</span>
              <span
                className={cn('min-w-0 flex-1 truncate', it.action === 'drop' && 'line-through')}
              >
                {it.subject}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Move up (Alt+Up)"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Move down (Alt+Down)"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
            </div>
            {(it.action === 'reword' || it.action === 'squash') && (
              <Textarea
                className="mt-1.5 font-mono text-[12px]"
                rows={3}
                value={it.message ?? ''}
                placeholder={
                  it.action === 'squash'
                    ? 'Combined message (leave empty to keep both messages concatenated)'
                    : 'New commit message'
                }
                onChange={(e) => set(i, { message: e.target.value })}
                aria-label={`Message for ${short(it.hash)}`}
              />
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[0.85em] text-muted-foreground">
        Tip: Alt+↑/↓ reorders the focused commit. Abort at any time from the banner to restore the
        original branch.
      </p>
    </Dialog>
  )
}
