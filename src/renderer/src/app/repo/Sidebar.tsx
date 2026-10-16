import * as React from 'react'
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Copy,
  ExternalLink,
  FileStack,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitBranchPlus,
  GitCompare,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  History,
  Link2,
  ListTree,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Unlink
} from 'lucide-react'
import type { Branch } from '@shared/types'
import { cn, short } from '@/lib/utils'
import { openRepository } from '@/app/state'
import { ContextMenu, type MenuItem } from '@/components/ui/menu'
import { Tip } from '@/components/ui/primitives'
import { useRepo } from './context'
import * as A from './actions'

function Section({
  id,
  title,
  count,
  children,
  actions
}: {
  id: string
  title: string
  count?: number
  children: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  const key = `spoon:sidebar:${id}`
  const [open, setOpen] = React.useState(() => localStorage.getItem(key) !== '0')
  React.useEffect(() => localStorage.setItem(key, open ? '1' : '0'), [key, open])
  return (
    <section className="mb-1">
      <div className="group flex h-7 items-center px-1.5">
        <button
          className="flex flex-1 items-center gap-1 text-[0.8em] font-semibold tracking-wide text-muted-foreground uppercase"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {title}
          {count != null && <span className="font-normal">({count})</span>}
        </button>
        <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {actions}
        </span>
      </div>
      {open && (
        <div role="group" aria-label={title}>
          {children}
        </div>
      )}
    </section>
  )
}

function Item({
  icon,
  label,
  active,
  current,
  detail,
  onClick,
  onDoubleClick,
  menu,
  indent = 0,
  title
}: {
  icon: React.ReactNode
  label: React.ReactNode
  active?: boolean
  current?: boolean
  detail?: React.ReactNode
  onClick?: () => void
  onDoubleClick?: () => void
  menu?: () => MenuItem[]
  indent?: number
  title?: string
}): React.JSX.Element {
  const el = (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={active}
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (onDoubleClick ?? onClick)?.()
      }}
      style={{ paddingLeft: 10 + indent * 12 }}
      className={cn(
        'flex h-[26px] cursor-default items-center gap-1.5 rounded-md pr-2 text-[0.95em] outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground',
        active ? 'bg-primary/15' : 'hover:bg-accent/70',
        current && 'font-semibold'
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail}
    </div>
  )
  return menu ? <ContextMenu items={menu}>{el}</ContextMenu> : el
}

function AheadBehind({ b }: { b: Branch }): React.JSX.Element | null {
  if (b.upstreamGone)
    return (
      <span
        className="text-[10px] text-modified"
        title="The upstream branch was deleted on the remote"
      >
        gone
      </span>
    )
  if (!b.ahead && !b.behind) return null
  return (
    <span
      className="flex shrink-0 gap-1 font-mono text-[10px] text-muted-foreground"
      title={`${b.ahead} to push, ${b.behind} to pull`}
    >
      {b.ahead > 0 && <span>↑{b.ahead}</span>}
      {b.behind > 0 && <span>↓{b.behind}</span>}
    </span>
  )
}

export function Sidebar(): React.JSX.Element {
  const r = useRepo()
  const [filter, setFilter] = React.useState('')
  const refs = r.refs
  const s = r.status
  const match = (name: string): boolean =>
    !filter || name.toLowerCase().includes(filter.toLowerCase())
  const busy = s?.operation !== 'none'
  const opReason = 'Finish or abort the current operation first'
  const current = s?.head.branch ?? null
  const changeCount = s
    ? s.staged.length + s.unstaged.length + s.untracked.length + s.conflicted.length
    : 0

  const branchMenu = (b: Branch): MenuItem[] => {
    const isCur = b.current
    const items: MenuItem[] = []
    if (!isCur)
      items.push({
        label: `Check out ${b.name}`,
        icon: <ArrowDownToLine />,
        onSelect: () => void A.checkout(r, b.name)
      })
    if (isCur) {
      items.push(
        {
          label: 'Pull',
          icon: <ArrowDownToLine />,
          disabled: !b.upstream,
          reason: 'No upstream branch',
          onSelect: () => void A.pull(r)
        },
        { label: 'Push…', icon: <ArrowUpFromLine />, onSelect: () => void A.push(r) }
      )
    } else {
      items.push(
        {
          label: `Merge ${b.name} into ${current ?? 'HEAD'}…`,
          icon: <GitMerge />,
          disabled: busy,
          reason: opReason,
          onSelect: () => void A.merge(r, b.name)
        },
        {
          label: `Rebase ${current ?? 'HEAD'} onto ${b.name}…`,
          icon: <GitPullRequestArrow />,
          disabled: busy,
          reason: opReason,
          onSelect: () => void A.rebase(r, b.name)
        },
        {
          label: `Push ${b.name}…`,
          icon: <ArrowUpFromLine />,
          onSelect: () => void A.push(r, b.name)
        }
      )
    }
    items.push(
      { type: 'separator' },
      {
        label: 'New branch from here…',
        icon: <GitBranchPlus />,
        onSelect: () => void A.createBranch(r, b.name)
      },
      { label: 'New tag here…', icon: <Tag />, onSelect: () => void A.createTag(r, b.name) },
      {
        label: 'New worktree for this branch…',
        icon: <FolderGit2 />,
        disabled: isCur,
        reason: 'The branch is checked out here',
        onSelect: () => void A.addWorktree(r, b.name)
      },
      {
        label: 'Compare with current branch',
        icon: <GitCompare />,
        disabled: isCur,
        reason: 'This is the current branch',
        onSelect: () => r.setView({ kind: 'compare', from: current ?? 'HEAD', to: b.name })
      },
      { type: 'separator' },
      { label: 'Set upstream…', icon: <Link2 />, onSelect: () => void A.setUpstream(r, b.name) },
      { label: 'Rename…', icon: <Pencil />, onSelect: () => void A.renameBranch(r, b.name) },
      {
        label: 'Delete…',
        icon: <Trash2 />,
        danger: true,
        disabled: isCur,
        reason: 'You cannot delete the checked-out branch',
        onSelect: () => void A.deleteBranch(r, b.name)
      },
      { type: 'separator' },
      {
        label: 'Copy name',
        icon: <Copy />,
        onSelect: () => void A.copy(b.name, 'Branch name copied')
      },
      {
        label: 'Open on hosting service',
        icon: <ExternalLink />,
        onSelect: () => void A.openInBrowser(r, { kind: 'branch', name: b.name })
      }
    )
    return items
  }

  const remoteBranchMenu = (b: Branch): MenuItem[] => [
    {
      label: `Check out as local branch`,
      icon: <ArrowDownToLine />,
      onSelect: () => void A.checkoutRemote(r, b.name)
    },
    {
      label: `Merge into ${current ?? 'HEAD'}…`,
      icon: <GitMerge />,
      disabled: busy,
      reason: opReason,
      onSelect: () => void A.merge(r, b.name)
    },
    {
      label: `Rebase ${current ?? 'HEAD'} onto ${b.name}…`,
      icon: <GitPullRequestArrow />,
      disabled: busy,
      reason: opReason,
      onSelect: () => void A.rebase(r, b.name)
    },
    {
      label: 'New branch from here…',
      icon: <GitBranchPlus />,
      onSelect: () => void A.createBranch(r, b.name)
    },
    {
      label: 'Compare with current branch',
      icon: <GitCompare />,
      onSelect: () => r.setView({ kind: 'compare', from: current ?? 'HEAD', to: b.name })
    },
    { type: 'separator' },
    {
      label: 'Delete on remote…',
      icon: <Trash2 />,
      danger: true,
      onSelect: () => void A.deleteRemoteBranch(r, b.name)
    },
    {
      label: 'Copy name',
      icon: <Copy />,
      onSelect: () => void A.copy(b.name, 'Branch name copied')
    }
  ]

  const branches = (refs?.branches ?? []).filter((b) => match(b.name))
  const remotes = refs?.remotes ?? []
  const tags = (refs?.tags ?? []).filter((t) => match(t.name))
  const stashes = (refs?.stashes ?? []).filter((x) => match(x.message))
  const worktrees = refs?.worktrees ?? []
  const submodules = (refs?.submodules ?? []).filter((x) => match(x.path))
  const view = r.view

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar" aria-label="Repository navigation">
      <div className="p-2 pb-1">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
            placeholder="Filter"
            aria-label="Filter branches, tags and stashes"
            className="h-7 w-full rounded-md border border-input bg-background pr-2 pl-7 text-[0.92em]"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3" role="tree" aria-label="Repository">
        <div className="mb-2 space-y-px">
          <Item
            icon={<FileStack />}
            label="Changes"
            active={view.kind === 'changes'}
            onClick={() => r.setView({ kind: 'changes' })}
            detail={
              changeCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {changeCount}
                </span>
              ) : null
            }
          />
          <Item
            icon={<History />}
            label="History"
            active={view.kind === 'history'}
            onClick={() => r.setView({ kind: 'history' })}
          />
          <Item
            icon={<GitPullRequest />}
            label="Pull requests"
            active={view.kind === 'pulls'}
            onClick={() => r.setView({ kind: 'pulls' })}
          />
          <Item
            icon={<ListTree />}
            label="Reflog"
            active={view.kind === 'reflog'}
            onClick={() => r.setView({ kind: 'reflog' })}
          />
        </div>

        <Section
          id="branches"
          title="Branches"
          count={branches.length}
          actions={
            <Tip content="New branch">
              <button
                className="rounded p-0.5 hover:bg-accent"
                aria-label="New branch"
                onClick={() => void A.createBranch(r)}
              >
                <Plus className="size-3.5" />
              </button>
            </Tip>
          }
        >
          {s?.head.detached && (
            <Item
              icon={<GitBranch />}
              label={<span className="italic">HEAD detached at {short(s.head.oid)}</span>}
              current
            />
          )}
          {branches.map((b) => (
            <Item
              key={b.name}
              icon={b.current ? <Check className="!text-primary" /> : <GitBranch />}
              label={b.name}
              current={b.current}
              title={`${b.name}${b.upstream ? ` → ${b.upstream}` : ''}\n${short(b.hash)} ${b.subject}`}
              detail={<AheadBehind b={b} />}
              onDoubleClick={() => !b.current && void A.checkout(r, b.name)}
              menu={() => branchMenu(b)}
            />
          ))}
          {branches.length === 0 && (
            <p className="px-3 py-1 text-[0.88em] text-muted-foreground">
              {filter ? 'No match' : s?.head.unborn ? 'No commits yet' : 'None'}
            </p>
          )}
        </Section>

        <Section
          id="remotes"
          title="Remotes"
          count={remotes.length}
          actions={
            <Tip content="Add remote">
              <button
                className="rounded p-0.5 hover:bg-accent"
                aria-label="Add remote"
                onClick={() => void A.addRemote(r)}
              >
                <Plus className="size-3.5" />
              </button>
            </Tip>
          }
        >
          {remotes.map((rm) => {
            const list = (refs?.remoteBranches ?? []).filter(
              (b) => b.name.startsWith(`${rm.name}/`) && match(b.name)
            )
            return (
              <RemoteGroup
                key={rm.name}
                name={rm.name}
                url={rm.fetchUrl}
                menu={() => [
                  {
                    label: `Fetch ${rm.name}`,
                    icon: <RefreshCw />,
                    onSelect: () => void A.fetchAll(r, rm.name)
                  },
                  {
                    label: 'Edit…',
                    icon: <Pencil />,
                    onSelect: () => void A.editRemote(r, rm.name, rm.fetchUrl)
                  },
                  {
                    label: 'Remove…',
                    icon: <Unlink />,
                    danger: true,
                    onSelect: () => void A.removeRemote(r, rm.name)
                  },
                  {
                    label: 'Copy URL',
                    icon: <Copy />,
                    onSelect: () => void A.copy(rm.fetchUrl, 'URL copied')
                  }
                ]}
              >
                {list.map((b) => (
                  <Item
                    key={b.name}
                    indent={1}
                    icon={<Cloud />}
                    label={b.name.slice(rm.name.length + 1)}
                    title={`${b.name}\n${short(b.hash)} ${b.subject}`}
                    onDoubleClick={() => void A.checkoutRemote(r, b.name)}
                    menu={() => remoteBranchMenu(b)}
                  />
                ))}
              </RemoteGroup>
            )
          })}
          {remotes.length === 0 && (
            <p className="px-3 py-1 text-[0.88em] text-muted-foreground">No remotes</p>
          )}
        </Section>

        <Section id="tags" title="Tags" count={tags.length}>
          {tags.map((t) => (
            <Item
              key={t.name}
              icon={<Tag />}
              label={t.name}
              title={`${t.name}${t.annotated ? ' (annotated)' : ''}\n${short(t.target)} ${t.subject}`}
              onDoubleClick={() => void A.checkout(r, `refs/tags/${t.name}`)}
              menu={() => [
                {
                  label: 'Check out (detached HEAD)',
                  icon: <ArrowDownToLine />,
                  onSelect: () => void A.checkout(r, `refs/tags/${t.name}`)
                },
                {
                  label: 'New branch from tag…',
                  icon: <GitBranchPlus />,
                  onSelect: () => void A.createBranch(r, `refs/tags/${t.name}`)
                },
                {
                  label: 'Push tag…',
                  icon: <ArrowUpFromLine />,
                  onSelect: () => void A.pushTag(r, t.name)
                },
                { type: 'separator' },
                {
                  label: 'Delete…',
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: () => void A.deleteTag(r, t.name)
                },
                {
                  label: 'Copy name',
                  icon: <Copy />,
                  onSelect: () => void A.copy(t.name, 'Tag copied')
                }
              ]}
            />
          ))}
          {tags.length === 0 && (
            <p className="px-3 py-1 text-[0.88em] text-muted-foreground">None</p>
          )}
        </Section>

        <Section
          id="stashes"
          title="Stashes"
          count={stashes.length}
          actions={
            <Tip content="Stash changes">
              <button
                className="rounded p-0.5 hover:bg-accent"
                aria-label="Stash changes"
                onClick={() => void A.stash(r)}
              >
                <Plus className="size-3.5" />
              </button>
            </Tip>
          }
        >
          {stashes.map((x) => (
            <Item
              key={x.hash}
              icon={<Archive />}
              label={x.message}
              title={`stash@{${x.index}}: ${x.message}`}
              active={view.kind === 'stash' && view.hash === x.hash}
              onClick={() =>
                r.setView({ kind: 'stash', index: x.index, hash: x.hash, message: x.message })
              }
              menu={() => [
                { label: 'Apply', onSelect: () => void A.applyStash(r, x.index, false) },
                {
                  label: 'Pop (apply and drop)',
                  onSelect: () => void A.applyStash(r, x.index, true)
                },
                { type: 'separator' },
                {
                  label: 'Drop…',
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: () => void A.dropStash(r, x.index, x.message)
                }
              ]}
            />
          ))}
          {stashes.length === 0 && (
            <p className="px-3 py-1 text-[0.88em] text-muted-foreground">None</p>
          )}
        </Section>

        {worktrees.length > 1 && (
          <Section id="worktrees" title="Worktrees" count={worktrees.length}>
            {worktrees.map((w) => (
              <Item
                key={w.path}
                icon={<FolderGit2 />}
                label={w.branch ?? (w.detached ? `detached ${short(w.head)}` : w.path)}
                title={w.path}
                current={w.path.toLowerCase() === r.path.toLowerCase()}
                onDoubleClick={() => void openRepository(w.path)}
                menu={() => [
                  {
                    label: 'Open in new tab',
                    icon: <FolderOpen />,
                    disabled: w.prunable,
                    reason: 'The folder is missing',
                    onSelect: () => void openRepository(w.path)
                  },
                  {
                    label: 'Remove…',
                    icon: <Trash2 />,
                    danger: true,
                    disabled: w.main,
                    reason: 'The main worktree cannot be removed',
                    onSelect: () => void A.removeWorktree(r, w.path)
                  },
                  {
                    label: 'Copy path',
                    icon: <Copy />,
                    onSelect: () => void A.copy(w.path, 'Path copied')
                  }
                ]}
              />
            ))}
          </Section>
        )}

        {submodules.length > 0 && (
          <Section id="submodules" title="Submodules" count={submodules.length}>
            {submodules.map((m) => (
              <Item
                key={m.path}
                icon={<FolderGit2 />}
                label={m.path}
                title={`${m.path} @ ${short(m.hash)}${m.state === '-' ? ' (not initialised)' : m.state === '+' ? ' (different commit checked out)' : ''}`}
                detail={
                  m.state !== ' ' ? (
                    <span className="text-[10px] text-modified">
                      {m.state === '-' ? 'uninit' : m.state === '+' ? 'changed' : 'conflict'}
                    </span>
                  ) : null
                }
                onDoubleClick={() => m.state !== '-' && void openRepository(`${r.path}/${m.path}`)}
                menu={() => [
                  {
                    label: 'Open in new tab',
                    icon: <FolderOpen />,
                    disabled: m.state === '-',
                    reason: 'Initialise the submodule first',
                    onSelect: () => void openRepository(`${r.path}/${m.path}`)
                  },
                  {
                    label: 'Initialise & update all submodules',
                    icon: <RefreshCw />,
                    onSelect: () => void A.updateSubmodules(r)
                  },
                  {
                    label: 'Copy path',
                    icon: <Copy />,
                    onSelect: () => void A.copy(m.path, 'Path copied')
                  }
                ]}
              />
            ))}
          </Section>
        )}
      </div>
    </aside>
  )
}

function RemoteGroup({
  name,
  url,
  menu,
  children
}: {
  name: string
  url: string
  menu: () => MenuItem[]
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = React.useState(true)
  return (
    <div>
      <ContextMenu items={menu}>
        <div
          role="treeitem"
          aria-expanded={open}
          tabIndex={0}
          title={url}
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)}
          className="flex h-[26px] cursor-default items-center gap-1.5 rounded-md pr-2 pl-2.5 text-[0.95em] hover:bg-accent/70"
        >
          {open ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <Cloud className="size-3.5 text-muted-foreground" />
          <span className="truncate">{name}</span>
        </div>
      </ContextMenu>
      {open && children}
    </div>
  )
}
