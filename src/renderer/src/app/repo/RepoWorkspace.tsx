import * as React from 'react'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Bug,
  ChevronDown,
  Code2,
  ExternalLink,
  FolderOpen,
  GitBranchPlus,
  RefreshCw,
  Settings,
  SquareTerminal,
  Trash2
} from 'lucide-react'
import { call } from '@/lib/api'
import { toastError } from '@/app/state'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/primitives'
import { DropdownMenu } from '@/components/ui/menu'
import { Split } from '@/components/ui/split'
import type { RepoView } from '@/app/state'
import { HistoryView } from '@/views/history/HistoryView'
import { ChangesView } from '@/views/changes/ChangesView'
import {
  BlameView,
  CompareView,
  FileHistoryView,
  ReflogView,
  TreeView
} from '@/views/explore/ExploreViews'
import { PullsView } from '@/views/hosting/PullsView'
import { RepoSettingsView } from '@/views/repoSettings/RepoSettingsView'
import { FilesAndDiff } from '@/views/history/CommitDetails'
import type { CommitFile } from '@shared/types'
import { RepoProvider, useRepo } from './context'
import { Sidebar } from './Sidebar'
import * as A from './actions'
import { shortcutLabel } from '../shortcuts'

export function RepoWorkspace({
  tabId,
  path,
  view
}: {
  tabId: string
  path: string
  view: RepoView
}): React.JSX.Element {
  return (
    <RepoProvider tabId={tabId} path={path} view={view}>
      <Workspace />
    </RepoProvider>
  )
}

function Workspace(): React.JSX.Element {
  const r = useRepo()
  if (r.error && !r.status) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-10 text-destructive" />
        <div className="font-semibold">This repository could not be read</div>
        <p className="max-w-lg text-muted-foreground">{r.error}</p>
        <Button variant="outline" onClick={() => void r.refresh('all')}>
          <RefreshCw /> Retry
        </Button>
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-repo-workspace>
      <Toolbar />
      <OperationBanner />
      <Split
        id="sidebar"
        initial={250}
        min={180}
        max={520}
        first={<Sidebar />}
        second={<MainView />}
      />
    </div>
  )
}

function MainView(): React.JSX.Element {
  const { view } = useRepo()
  switch (view.kind) {
    case 'history':
      return <HistoryView />
    case 'changes':
      return <ChangesView />
    case 'fileHistory':
      return <FileHistoryView key={view.path} path={view.path} />
    case 'blame':
      return <BlameView key={view.path + (view.rev ?? '')} path={view.path} rev={view.rev} />
    case 'tree':
      return <TreeView key={view.rev} rev={view.rev} />
    case 'reflog':
      return <ReflogView />
    case 'compare':
      return <CompareView key={view.from + '..' + view.to} from={view.from} to={view.to} />
    case 'pulls':
      return <PullsView />
    case 'repoSettings':
      return <RepoSettingsView />
    case 'stash':
      return (
        <StashView key={view.hash} index={view.index} hash={view.hash} message={view.message} />
      )
  }
}

function StashView({
  index,
  hash,
  message
}: {
  index: number
  hash: string
  message: string
}): React.JSX.Element {
  const r = useRepo()
  const [files, setFiles] = React.useState<CommitFile[] | null>(null)
  React.useEffect(() => {
    call('stash.files', { repo: r.path, index })
      .then(setFiles)
      .catch((e) => (toastError(e), setFiles([])))
  }, [r.path, index])
  const top = (
    <div className="space-y-2 border-b p-3">
      <div className="font-semibold">{message}</div>
      <div className="font-mono text-[11px] text-muted-foreground">
        stash@{`{${index}}`} · {hash}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => void A.applyStash(r, index, false)}>
          <ArchiveRestore /> Apply
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void A.applyStash(r, index, true).then(() => r.setView({ kind: 'changes' }))
          }
        >
          Pop
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() =>
            void A.dropStash(r, index, message).then(
              (dropped) => dropped && r.setView({ kind: 'history' })
            )
          }
        >
          <Trash2 /> Drop
        </Button>
      </div>
    </div>
  )
  return (
    <FilesAndDiff
      id="stash"
      files={files ?? []}
      loading={!files}
      top={top}
      sourceFor={(f) => ({ kind: 'stash', ref: hash, path: f.path })}
    />
  )
}

function Toolbar(): React.JSX.Element {
  const r = useRepo()
  const head = r.status?.head
  const stashTop = r.refs?.stashes[0]
  const tool = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    opts: { shortcut?: string; disabled?: string | false; badge?: React.ReactNode } = {}
  ): React.ReactNode => (
    <Tip content={opts.disabled || (opts.shortcut ? `${label} (${opts.shortcut})` : label)}>
      <span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 flex-col gap-0 px-2 text-[11px] font-normal [&_svg]:size-[18px]"
          disabled={!!opts.disabled}
          onClick={onClick}
          aria-label={label}
        >
          <span className="relative">
            {icon}
            {opts.badge}
          </span>
          <span className="leading-none">{label}</span>
        </Button>
      </span>
    </Tip>
  )
  const count = (n: number | undefined): React.ReactNode =>
    n ? (
      <span className="absolute -top-1.5 -right-2.5 rounded-full bg-primary px-1 text-[9px] leading-[13px] font-semibold text-primary-foreground">
        {n > 99 ? '99+' : n}
      </span>
    ) : null

  return (
    <div
      className="flex h-12 shrink-0 items-center gap-0.5 border-b bg-panel px-2"
      role="toolbar"
      aria-label="Repository actions"
    >
      <div className="flex items-center">
        {tool('Fetch', <RefreshCw />, () => void A.fetchAll(r), {
          shortcut: shortcutLabel('fetch')
        })}
        <DropdownMenu
          items={[
            { label: 'Fetch all remotes', onSelect: () => void A.fetchAll(r) },
            {
              label: 'Fetch all and prune deleted branches',
              onSelect: () =>
                void A.runNetwork(
                  r,
                  'Fetching',
                  (opId) =>
                    call('remote.fetch', {
                      repo: r.path,
                      all: true,
                      prune: true,
                      tags: false,
                      opId
                    }),
                  'Fetch complete'
                )
            },
            {
              label: 'Fetch all including tags',
              onSelect: () =>
                void A.runNetwork(
                  r,
                  'Fetching',
                  (opId) =>
                    call('remote.fetch', {
                      repo: r.path,
                      all: true,
                      prune: false,
                      tags: true,
                      opId
                    }),
                  'Fetch complete'
                )
            }
          ]}
        >
          <Button variant="ghost" size="icon-sm" className="h-8 w-4" aria-label="Fetch options">
            <ChevronDown className="!size-3" />
          </Button>
        </DropdownMenu>
      </div>
      {tool('Pull', <ArrowDown />, () => void A.pull(r), {
        shortcut: shortcutLabel('pull'),
        disabled: !head?.upstream && 'No upstream branch to pull from',
        badge: count(head?.behind)
      })}
      {tool('Push', <ArrowUp />, () => void A.push(r), {
        shortcut: shortcutLabel('push'),
        disabled: head?.detached
          ? 'HEAD is detached'
          : head?.unborn
            ? 'Nothing committed yet'
            : false,
        badge: count(head?.ahead)
      })}
      <div className="mx-1.5 h-6 w-px bg-border" />
      {tool('Branch', <GitBranchPlus />, () => void A.createBranch(r), {
        shortcut: shortcutLabel('newBranch'),
        disabled: head?.unborn && 'Create the first commit first'
      })}
      {tool('Stash', <Archive />, () => void A.stash(r), { shortcut: shortcutLabel('stash') })}
      {tool(
        'Pop',
        <ArchiveRestore />,
        () => stashTop && void A.applyStash(r, stashTop.index, true),
        { disabled: !stashTop && 'No stashes' }
      )}
      <div className="mx-1.5 h-6 w-px bg-border" />
      {tool(
        'Terminal',
        <SquareTerminal />,
        () =>
          void call('shell.openTerminal', { repo: r.path }).catch((e) =>
            toastError(e, 'Open terminal')
          ),
        { shortcut: shortcutLabel('terminal') }
      )}
      {tool(
        'Explorer',
        <FolderOpen />,
        () => void call('shell.showInFolder', { repo: r.path }).catch((e) => toastError(e))
      )}
      {tool(
        'Editor',
        <Code2 />,
        () =>
          void call('shell.openEditor', { repo: r.path }).catch((e) => toastError(e, 'Open editor'))
      )}
      <div className="flex-1" />
      {tool('Web', <ExternalLink />, () => void A.openInBrowser(r, { kind: 'repo' }))}
      {tool('Settings', <Settings />, () => r.setView({ kind: 'repoSettings' }))}
    </div>
  )
}

function OperationBanner(): React.JSX.Element | null {
  const r = useRepo()
  const s = r.status
  if (!s) return null
  if (s.bisecting) return <BisectBanner />
  if (s.operation === 'none') {
    if (s.head.detached && !s.head.unborn)
      return (
        <div
          className="flex items-center gap-2 border-b bg-[color-mix(in_oklab,var(--modified)_12%,transparent)] px-3 py-1.5 text-[0.92em]"
          role="status"
        >
          <AlertTriangle className="size-4 text-modified" />
          <span className="flex-1">
            HEAD is detached. New commits will not belong to any branch unless you create one.
          </span>
          <Button size="sm" variant="outline" onClick={() => void A.createBranch(r)}>
            Create branch here
          </Button>
        </div>
      )
    return null
  }
  const conflicts = s.conflicted.length
  const label: Record<string, string> = {
    merge: 'Merge in progress',
    rebase: 'Rebase in progress',
    'rebase-interactive': 'Interactive rebase in progress',
    'cherry-pick': 'Cherry-pick in progress',
    revert: 'Revert in progress',
    am: 'Applying patches (git am) in progress'
  }
  const canSkip = s.operation !== 'merge'
  return (
    <div
      className="flex items-center gap-2 border-b bg-[color-mix(in_oklab,var(--conflict)_13%,transparent)] px-3 py-1.5 text-[0.92em]"
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="size-4 text-conflict" />
      <span className="flex-1">
        <b>{label[s.operation] ?? s.operation}</b>
        {s.operationTarget && <span className="text-muted-foreground"> — {s.operationTarget}</span>}
        {conflicts > 0 ? (
          <span className="text-conflict">
            {' '}
            · {conflicts} conflicted file{conflicts === 1 ? '' : 's'} to resolve
          </span>
        ) : (
          <span className="text-muted-foreground"> · no conflicts remaining</span>
        )}
      </span>
      {conflicts > 0 && r.view.kind !== 'changes' && (
        <Button size="sm" variant="outline" onClick={() => r.setView({ kind: 'changes' })}>
          Resolve conflicts
        </Button>
      )}
      <Tip content={conflicts ? 'Resolve all conflicts first' : 'Continue the operation'}>
        <span>
          <Button size="sm" disabled={conflicts > 0} onClick={() => void A.control(r, 'continue')}>
            Continue
          </Button>
        </span>
      </Tip>
      {canSkip && (
        <Button size="sm" variant="outline" onClick={() => void A.control(r, 'skip')}>
          Skip
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        onClick={() => void A.control(r, 'abort')}
      >
        Abort
      </Button>
    </div>
  )
}

function BisectBanner(): React.JSX.Element {
  const r = useRepo()
  const [log, setLog] = React.useState<string | null>(null)
  const mark = async (verdict: 'good' | 'bad' | 'skip'): Promise<void> => {
    const res = await A.run(r, 'Bisect', () => call('bisect.mark', { repo: r.path, verdict }))
    if (res) setLog(res.stdout.trim().split('\n').slice(0, 8).join('\n'))
  }
  return (
    <div
      className="border-b bg-[color-mix(in_oklab,var(--info)_12%,transparent)] px-3 py-1.5 text-[0.92em]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Bug className="size-4 text-info" />
        <span className="flex-1">
          <b>Bisecting</b> — test the checked-out commit, then mark it.
        </span>
        <Button size="sm" variant="outline" onClick={() => void mark('good')}>
          Good
        </Button>
        <Button size="sm" variant="outline" onClick={() => void mark('bad')}>
          Bad
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void mark('skip')}>
          Skip
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void call('bisect.log', { repo: r.path })
              .then(setLog)
              .catch((e) => toastError(e))
          }
        >
          Log
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          onClick={() =>
            void A.run(r, 'Bisect', () => call('bisect.reset', { repo: r.path }), {
              success: 'Bisect ended; returned to the original branch'
            }).then(() => setLog(null))
          }
        >
          End bisect
        </Button>
      </div>
      {log && (
        <pre
          className="mt-1 max-h-32 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] whitespace-pre-wrap"
          data-selectable
        >
          {log}
        </pre>
      )}
    </div>
  )
}
