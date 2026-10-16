import * as React from 'react'
import {
  ArrowDownToLine,
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  GitPullRequest,
  RefreshCw,
  Settings
} from 'lucide-react'
import type { HostedRepoRef, PullRequest } from '@shared/types'
import { type ApiError, call } from '@/lib/api'
import { cn } from '@/lib/utils'
import { app, toastError } from '@/app/state'
import { useRepo } from '@/app/repo/context'
import * as A from '@/app/repo/actions'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState, Select, Spinner } from '@/components/ui/primitives'
import { Split } from '@/components/ui/split'

const KIND_LABEL: Record<HostedRepoRef['kind'], string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  azure: 'Azure DevOps'
}

export function PullsView(): React.JSX.Element {
  const r = useRepo()
  const [hosted, setHosted] = React.useState<HostedRepoRef | null | undefined>(undefined)
  const [state, setState] = React.useState<'open' | 'closed' | 'all'>('open')
  const [prs, setPrs] = React.useState<PullRequest[] | null>(null)
  const [error, setError] = React.useState<{ code: string; message: string } | null>(null)
  const [sel, setSel] = React.useState<PullRequest | null>(null)
  const [nonce, setNonce] = React.useState(0)

  React.useEffect(() => {
    call('hosting.detect', { repo: r.path })
      .then(setHosted)
      .catch(() => setHosted(null))
  }, [r.path])

  React.useEffect(() => {
    if (!hosted) return
    let alive = true
    setPrs(null)
    setError(null)
    call('hosting.pullRequests', { repo: r.path, state })
      .then((x) => alive && setPrs(x))
      .catch((e: ApiError) => alive && setError({ code: e.code, message: e.message }))
    return () => {
      alive = false
    }
  }, [hosted, r.path, state, nonce])

  React.useEffect(() => {
    if (!sel) return
    let alive = true
    call('hosting.pullRequest', { repo: r.path, number: sel.number })
      .then((d) => alive && setSel((cur) => (cur?.number === d.number ? d : cur)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.number, r.path])

  if (hosted === undefined)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )
  if (hosted === null)
    return (
      <EmptyState icon={<GitPullRequest />} title="No supported hosting remote">
        None of this repository’s remotes points to GitHub, GitLab, Bitbucket or Azure DevOps
        (including self-hosted instances added under Settings → Accounts). Local Git features work
        without any hosting account.
      </EmptyState>
    )

  const openAccounts = (): void => app.set({ settingsOpen: true, settingsSection: 'accounts' })

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
        <span className="min-w-0 flex-1 truncate text-[0.92em]">
          {KIND_LABEL[hosted.kind]} ·{' '}
          <span className="font-medium">
            {hosted.owner}/{hosted.name}
          </span>
        </span>
        <Select
          aria-label="Pull request state"
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
          className="h-7 text-[0.9em]"
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </Select>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh"
          onClick={() => setNonce((n) => n + 1)}
        >
          <RefreshCw />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" role="listbox" aria-label="Pull requests">
        {error ? (
          <EmptyState
            title={error.code === 'AUTH' ? 'Account required' : 'Could not load pull requests'}
          >
            <p>{error.message}</p>
            {error.code === 'AUTH' && (
              <Button className="mt-2" size="sm" onClick={openAccounts}>
                <Settings /> Open account settings
              </Button>
            )}
          </EmptyState>
        ) : !prs ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : prs.length === 0 ? (
          <EmptyState title={`No ${state === 'all' ? '' : state + ' '}pull requests`} />
        ) : (
          prs.map((p) => (
            <div
              key={p.number}
              role="option"
              aria-selected={sel?.number === p.number}
              onMouseDown={() => setSel(p)}
              className={cn(
                'cursor-default border-b px-3 py-1.5',
                sel?.number === p.number ? 'bg-primary/15' : 'hover:bg-accent/60'
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">#{p.number}</span>
                <span className="truncate">{p.title}</span>
                {p.draft && <Badge className="bg-muted text-muted-foreground">Draft</Badge>}
              </div>
              <div className="truncate text-[0.85em] text-muted-foreground">
                {p.author} · {p.sourceBranch} → {p.targetBranch} ·{' '}
                {new Date(p.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const checkout = (p: PullRequest): Promise<boolean> =>
    A.runNetwork(
      r,
      `Checking out #${p.number}`,
      (opId) => call('hosting.checkoutPullRequest', { repo: r.path, number: p.number, opId }),
      `Checked out pull request #${p.number}`
    )

  const details = sel ? (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4" data-selectable>
      <div>
        <h2 className="text-[1.15em] font-semibold">
          {sel.title} <span className="font-normal text-muted-foreground">#{sel.number}</span>
        </h2>
        <p className="text-[0.9em] text-muted-foreground">
          {sel.author} wants to merge <code className="font-mono">{sel.sourceBranch}</code> into{' '}
          <code className="font-mono">{sel.targetBranch}</code> · {sel.state}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void checkout(sel)}>
          <ArrowDownToLine /> Check out
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void call('shell.openExternal', { url: sel.url }).catch((e) => toastError(e))
          }
        >
          <ExternalLink /> Open in browser
        </Button>
      </div>
      {sel.checks && sel.checks.length > 0 && (
        <section>
          <h3 className="mb-1 text-[0.9em] font-semibold">Checks</h3>
          <ul className="space-y-0.5">
            {sel.checks.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-[0.92em]">
                {c.conclusion === 'success' ? (
                  <CircleCheck className="size-4 text-added" />
                ) : c.conclusion && c.conclusion !== 'neutral' && c.conclusion !== 'skipped' ? (
                  <CircleX className="size-4 text-removed" />
                ) : (
                  <CircleDashed className="size-4 text-muted-foreground" />
                )}
                <span className="truncate">{c.name}</span>
                <span className="text-muted-foreground">{c.conclusion ?? c.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sel.body && (
        <section>
          <h3 className="mb-1 text-[0.9em] font-semibold">Description</h3>
          {/* Shown as plain text: remote Markdown/HTML is never rendered. */}
          <pre className="rounded bg-muted/50 p-3 font-sans text-[0.92em] whitespace-pre-wrap">
            {sel.body}
          </pre>
        </section>
      )}
    </div>
  ) : (
    <EmptyState title="Select a pull request" />
  )

  return <Split id="pulls" initial={420} first={list} second={details} />
}
