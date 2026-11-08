import type { CommandResult, Commit, FileChange } from '@shared/types'
import type { ApiArgs } from '@shared/api'
import { ApiError, call, newOpId } from '@/lib/api'
import { short } from '@/lib/utils'
import { app, closeTab, endOp, openRepository, startOp, toast, toastError } from '../state'
import { confirm, prompt, validRefName } from '../dialogs'
import type { RepoContextValue } from './context'

type R = Pick<RepoContextValue, 'path' | 'refresh' | 'status' | 'refs' | 'setView'>

const isDirtyError = (e: unknown): boolean =>
  e instanceof ApiError &&
  /uncommitted changes|would be overwritten|unstaged changes/i.test(e.message + (e.detail ?? ''))

/** Run a local action with error reporting and a refresh afterwards. */
export async function run<T>(
  r: R,
  label: string,
  fn: () => Promise<T>,
  opts: { success?: string; scope?: 'worktree' | 'refs' | 'all' } = {}
): Promise<T | undefined> {
  try {
    const v = await fn()
    if (opts.success) toast({ kind: 'success', title: opts.success })
    return v
  } catch (e) {
    toastError(e, label)
    return undefined
  } finally {
    await r.refresh(opts.scope ?? 'all')
  }
}

/** Run a long-running (network) operation with progress and cancellation in the status bar. */
export async function runNetwork(
  r: R | null,
  label: string,
  fn: (opId: string) => Promise<unknown>,
  success?: string
): Promise<boolean> {
  const opId = newOpId()
  startOp({ opId, label, repo: r?.path ?? null, cancellable: true })
  try {
    const res = await fn(opId)
    if (
      res &&
      typeof res === 'object' &&
      'exitCode' in res &&
      (res as CommandResult).exitCode !== 0
    ) {
      handleStopped(r, res as CommandResult)
      return false
    }
    if (success) toast({ kind: 'success', title: success })
    return true
  } catch (e) {
    toastError(e, label)
    return false
  } finally {
    endOp(opId)
    await r?.refresh('all')
  }
}

/** Operations that may stop with conflicts return exitCode 1 rather than throwing. */
function handleStopped(r: R | null, res: CommandResult): void {
  toast({
    kind: 'error',
    title: 'Stopped with conflicts — resolve them, then continue or abort.',
    detail: res.stderr || res.stdout
  })
  r?.setView({ kind: 'changes' })
}

async function runOp(
  r: R,
  label: string,
  fn: () => Promise<CommandResult>,
  success: string
): Promise<boolean> {
  try {
    const res = await fn()
    if (res.exitCode !== 0) {
      handleStopped(r, res)
      return false
    }
    toast({ kind: 'success', title: success })
    return true
  } catch (e) {
    if (isDirtyError(e)) {
      toast({
        kind: 'error',
        title: `${label}: ${(e as ApiError).message}`,
        detail: (e as ApiError).detail
      })
    } else toastError(e, label)
    return false
  } finally {
    await r.refresh('all')
  }
}

const currentBranch = (r: R): string | null => r.status?.head.branch ?? r.refs?.head.branch ?? null

// Remote operations ---------------------------------------------------------------

export function fetchAll(r: R, remote?: string): Promise<boolean> {
  return runNetwork(
    r,
    remote ? `Fetching ${remote}` : 'Fetching',
    (opId) =>
      call('remote.fetch', { repo: r.path, remote, all: !remote, prune: false, tags: false, opId }),
    'Fetch complete'
  )
}

export async function pull(r: R): Promise<void> {
  if (!r.status?.head.upstream) {
    toast({
      kind: 'error',
      title:
        'The current branch has no upstream. Set one from the branch context menu or push with "Set upstream".'
    })
    return
  }
  const key = `spoon:pull:${r.path}`
  const remembered = localStorage.getItem(key)
  let strategy = remembered as 'merge' | 'rebase' | 'ff-only' | null
  if (!strategy) {
    const v = await prompt({
      title: 'Pull',
      description: `Integrate ${r.status.head.upstream} into ${currentBranch(r) ?? 'HEAD'}.`,
      fields: [
        {
          name: 'strategy',
          label: 'Strategy',
          type: 'select',
          initial: 'ff-only',
          options: [
            { value: 'ff-only', label: 'Fast-forward only (fails if branches diverged)' },
            { value: 'merge', label: 'Merge (creates a merge commit if needed)' },
            { value: 'rebase', label: 'Rebase local commits on top of upstream' }
          ]
        },
        {
          name: 'remember',
          label: 'Remember for this repository',
          type: 'checkbox',
          initial: false
        }
      ],
      confirmLabel: 'Pull'
    })
    if (!v) return
    strategy = v['strategy'] as 'merge' | 'rebase' | 'ff-only'
    if (v['remember']) localStorage.setItem(key, strategy)
  }
  await runNetwork(
    r,
    'Pulling',
    (opId) => call('remote.pull', { repo: r.path, strategy: strategy!, opId }),
    'Pull complete'
  )
}

export async function push(r: R, branchArg?: string): Promise<void> {
  if (!branchArg && !r.status && !r.refs) {
    toast({ kind: 'info', title: 'The repository is still loading; try again in a moment.' })
    return
  }
  const branch = branchArg ?? currentBranch(r)
  if (!branch) {
    toast({
      kind: 'error',
      title: 'HEAD is detached. Create or check out a branch before pushing.'
    })
    return
  }
  const remotes = r.refs?.remotes ?? []
  if (remotes.length === 0) {
    toast({
      kind: 'error',
      title: 'This repository has no remotes. Add one in Repository settings.'
    })
    return
  }
  const b = r.refs?.branches.find((x) => x.name === branch)
  const [upRemote, ...upRest] = (b?.upstream ?? '').split('/')
  const v = await prompt({
    title: 'Push',
    description: `Push ${branch} to a remote.`,
    fields: [
      {
        name: 'remote',
        label: 'Remote',
        type: 'select',
        initial: upRemote && remotes.some((x) => x.name === upRemote) ? upRemote : remotes[0]!.name,
        options: remotes.map((x) => ({ value: x.name, label: `${x.name} — ${x.pushUrl}` }))
      },
      {
        name: 'remoteBranch',
        label: 'Remote branch',
        initial: upRest.join('/') || branch,
        mono: true,
        autoFocus: false
      },
      {
        name: 'setUpstream',
        label: 'Set as upstream (tracking) branch',
        type: 'checkbox',
        initial: !b?.upstream
      },
      {
        name: 'tags',
        label: 'Also push annotated tags reachable from the commits (--follow-tags)',
        type: 'checkbox',
        initial: false
      },
      {
        name: 'force',
        label:
          'Force push with lease (overwrite remote history if nobody else pushed since your last fetch)',
        type: 'checkbox',
        initial: false
      }
    ],
    validate: (x) => validRefName(String(x['remoteBranch'])),
    confirmLabel: 'Push'
  })
  if (!v) return
  const remote = String(v['remote'])
  const remoteBranch = String(v['remoteBranch'])
  const force = !!v['force']
  let expectedRemoteOid: string | null | undefined
  if (force) {
    // The lease is pinned to exactly the remote commit shown here, not to whatever the
    // remote-tracking ref says when the push runs (a background fetch may move it).
    expectedRemoteOid = await call('repo.resolve', {
      repo: r.path,
      rev: `refs/remotes/${remote}/${remoteBranch}`
    }).catch(() => null)
    let lost: Commit[] = []
    if (expectedRemoteOid) {
      lost = await call('op.previewCommits', {
        repo: r.path,
        from: branch,
        to: expectedRemoteOid,
        limit: 200
      }).catch(() => [] as Commit[])
    }
    const ok = await confirm({
      title: 'Force push?',
      description: expectedRemoteOid
        ? `This rewrites ${remote}/${remoteBranch}, which your last fetch saw at ${short(expectedRemoteOid)}. The push uses --force-with-lease pinned to that commit, so it is refused if anyone pushed since. It cannot be undone from Spoon; collaborators who based work on the old commits will need to recover.`
        : `Spoon has no record of ${remote}/${remoteBranch} (never fetched). The push is only allowed if that branch does not exist on the remote.`,
      items: lost.map((c) => `${short(c.hash)}  ${c.subject}`),
      details: lost.length ? (
        <p className="text-[0.92em]">
          These remote commits are not in your branch and will be removed from {remote}/
          {remoteBranch}:
        </p>
      ) : (
        <p className="text-[0.92em]">
          No remote commits are known to be lost (based on your last fetch).
        </p>
      ),
      confirmLabel: 'Force push',
      destructive: true
    })
    if (!ok) return
  }
  await pushWithRecovery(r, {
    branch,
    remote,
    remoteBranch,
    setUpstream: !!v['setUpstream'],
    force,
    expectedRemoteOid,
    tags: !!v['tags']
  })
}

interface PushRequest {
  branch: string
  remote: string
  remoteBranch: string
  setUpstream: boolean
  force: boolean
  expectedRemoteOid?: string | null
  tags: boolean
}

/**
 * Push, and when the remote rejects it, explain why and offer the next step instead of a bare
 * error: integrate the remote commits (rebase or merge) and push again, or fetch to review what
 * changed after a refused force push.
 */
export async function pushWithRecovery(r: R, p: PushRequest): Promise<boolean> {
  const opId = newOpId()
  startOp({ opId, label: `Pushing ${p.branch}`, repo: r.path, cancellable: true })
  let rejected: ApiError | null = null
  try {
    await call('remote.push', {
      repo: r.path,
      remote: p.remote,
      branch: p.branch,
      remoteBranch: p.remoteBranch,
      setUpstream: p.setUpstream,
      forceWithLease: p.force,
      ...(p.force ? { expectedRemoteOid: p.expectedRemoteOid } : {}),
      tags: p.tags,
      opId
    })
    toast({ kind: 'success', title: `Pushed ${p.branch} to ${p.remote}` })
    return true
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'PUSH_REJECTED' || e.code === 'LEASE_REJECTED'))
      rejected = e
    else toastError(e, 'Push')
  } finally {
    endOp(opId)
    await r.refresh('all')
  }
  if (!rejected) return false
  const target = `${p.remote}/${p.remoteBranch}`
  if (rejected.code === 'LEASE_REJECTED') {
    const ok = await confirm({
      title: 'Force push refused',
      description: `${target} changed since you reviewed it, so Spoon did not overwrite it. Fetch ${p.remote} to see the new commits before deciding what to do.`,
      details: (
        <pre className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">
          {rejected.detail}
        </pre>
      ),
      confirmLabel: `Fetch ${p.remote}`
    })
    if (ok) await fetchAll(r, p.remote)
    return false
  }
  const busy = r.status?.operation && r.status.operation !== 'none'
  const v = await prompt({
    title: 'Push rejected',
    description: `${target} has commits that ${p.branch} does not have. Integrate them first, then push again.`,
    fields: [
      {
        name: 'strategy',
        label: 'Next step',
        type: 'select',
        initial: 'rebase',
        options: [
          { value: 'rebase', label: `Fetch, rebase ${p.branch} onto ${target}, then push` },
          { value: 'merge', label: `Fetch, merge ${target} into ${p.branch}, then push` },
          { value: 'fetch', label: `Only fetch ${p.remote} (review before integrating)` }
        ]
      }
    ],
    validate: () => (busy ? 'Finish or abort the current operation first.' : null),
    confirmLabel: 'Continue'
  })
  if (!v) return false
  const strategy = String(v['strategy'])
  if (!(await fetchAll(r, p.remote))) return false
  if (strategy === 'fetch') return false
  if (currentBranch(r) !== p.branch && r.refs?.head.branch !== p.branch) {
    toast({
      kind: 'error',
      title: `Check out ${p.branch} to integrate ${target} into it.`
    })
    return false
  }
  const integrated = await runOp(
    r,
    strategy === 'rebase' ? 'Rebase' : 'Merge',
    () =>
      strategy === 'rebase'
        ? call('op.rebase', { repo: r.path, onto: target })
        : call('op.merge', { repo: r.path, ref: target, mode: 'default' }),
    strategy === 'rebase' ? `Rebased onto ${target}` : `Merged ${target}`
  )
  if (!integrated) return false
  return pushWithRecovery(r, { ...p, force: false, expectedRemoteOid: undefined })
}

// Undo ----------------------------------------------------------------------------

/**
 * Undo the most recent undoable operation (commit, amend, merge, rebase, interactive rebase,
 * cherry-pick, revert, reset, branch/tag create/delete/rename, checkout). Shows exactly which
 * references move before asking for confirmation.
 */
export function undo(r: R): Promise<boolean> {
  return undoOrRedo(r, 'undo')
}

/** Re-apply the operation most recently undone (only while nothing has changed since). */
export function redo(r: R): Promise<boolean> {
  return undoOrRedo(r, 'redo')
}

async function undoOrRedo(r: R, d: 'undo' | 'redo'): Promise<boolean> {
  const Verb = d === 'undo' ? 'Undo' : 'Redo'
  let preview
  try {
    preview = await call(d === 'undo' ? 'undo.peek' : 'redo.peek', { repo: r.path })
  } catch (e) {
    toastError(e, Verb)
    return false
  }
  if (!preview) {
    toast({
      kind: 'info',
      title: d === 'undo' ? 'Nothing to undo in this session.' : 'Nothing to redo.'
    })
    return false
  }
  if (preview.blockedReason) {
    toast({ kind: 'error', title: `Cannot ${d} "${preview.label}"`, detail: preview.blockedReason })
    return false
  }
  const ok = await confirm({
    title: `${Verb} "${preview.label}"?`,
    description:
      d === 'undo'
        ? 'Spoon moves these references back. Uncommitted changes are kept; if they would be overwritten, Git refuses and nothing changes. Undone commits stay recoverable from the reflog, and you can redo.'
        : 'Spoon moves these references forward again, to where the operation left them. Uncommitted changes are kept; if they would be overwritten, Git refuses and nothing changes.',
    items: preview.changes,
    confirmLabel: Verb
  })
  if (!ok) return false
  return (
    (await run(
      r,
      Verb,
      () => call(d === 'undo' ? 'undo.run' : 'redo.run', { repo: r.path }).then(() => true),
      { success: `${d === 'undo' ? 'Undid' : 'Redid'} "${preview.label}"` }
    )) ?? false
  )
}

// Branches ------------------------------------------------------------------------

export async function createBranch(r: R, start?: string): Promise<void> {
  const v = await prompt({
    title: 'New branch',
    description: start
      ? `Starting at ${start.length === 40 ? short(start) : start}`
      : `Starting at ${currentBranch(r) ?? 'HEAD'}`,
    fields: [
      { name: 'name', label: 'Branch name', placeholder: 'feature/my-change', mono: true },
      { name: 'checkout', label: 'Check out after creating', type: 'checkbox', initial: true }
    ],
    validate: (x) =>
      validRefName(String(x['name'])) ??
      (r.refs?.branches.some((b) => b.name === x['name'])
        ? 'A branch with this name already exists.'
        : null),
    confirmLabel: 'Create branch'
  })
  if (!v) return
  await run(
    r,
    'Create branch',
    () =>
      call('branch.create', {
        repo: r.path,
        name: String(v['name']),
        start,
        checkout: !!v['checkout']
      }),
    { success: `Created ${String(v['name'])}` }
  )
}

/** Checkout; on conflicting local changes offer an explicit stash-and-checkout choice. */
export async function checkout(r: R, ref: string, track = false): Promise<void> {
  const elsewhere = r.refs?.worktrees.find(
    (w) => w.branch === ref && samePath(w.path) !== samePath(r.path)
  )
  if (elsewhere) {
    const open = await confirm({
      title: `${ref} is checked out in another worktree`,
      description: `Git allows a branch to be checked out in only one worktree at a time. It is checked out in ${elsewhere.path}.`,
      confirmLabel: 'Open that worktree'
    })
    if (open) await openRepository(elsewhere.path)
    return
  }
  try {
    await call('branch.checkout', { repo: r.path, ref, track })
    toast({ kind: 'success', title: `Checked out ${ref}` })
  } catch (e) {
    if (!isDirtyError(e)) {
      toastError(e, 'Checkout')
      return
    }
    const choice = await confirm({
      title: 'Local changes would be overwritten',
      description: `Checking out ${ref} would overwrite uncommitted changes. You can stash them first (they stay in the stash list until you apply or drop them).`,
      details: (
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">
          {(e as ApiError).detail}
        </pre>
      ),
      confirmLabel: 'Stash changes and check out'
    })
    if (!choice) return
    try {
      await call('stash.push', {
        repo: r.path,
        message: `spoon: before checkout of ${ref}`,
        includeUntracked: true,
        keepIndex: false
      })
      await call('branch.checkout', { repo: r.path, ref, track })
      toast({ kind: 'success', title: `Checked out ${ref}. Your changes are saved in the stash.` })
    } catch (e2) {
      toastError(e2, 'Checkout')
    }
  } finally {
    await r.refresh('all')
  }
}

export async function checkoutRemote(r: R, remoteBranch: string): Promise<void> {
  const local = remoteBranch.split('/').slice(1).join('/')
  if (r.refs?.branches.some((b) => b.name === local)) return checkout(r, local)
  return checkout(r, remoteBranch, true)
}

export async function renameBranch(r: R, from: string): Promise<void> {
  const v = await prompt({
    title: `Rename ${from}`,
    fields: [{ name: 'to', label: 'New name', initial: from, mono: true }],
    validate: (x) => validRefName(String(x['to'])),
    confirmLabel: 'Rename'
  })
  if (!v) return
  await run(
    r,
    'Rename branch',
    () => call('branch.rename', { repo: r.path, from, to: String(v['to']) }),
    { success: 'Branch renamed' }
  )
}

export async function deleteBranch(r: R, name: string): Promise<void> {
  const b = r.refs?.branches.find((x) => x.name === name)
  const ok = await confirm({
    title: `Delete branch ${name}?`,
    description:
      'Git refuses to delete a branch that is not merged into its upstream or HEAD unless you force it.',
    details: b ? (
      <p className="font-mono text-[12px]">
        {short(b.hash)} {b.subject}
      </p>
    ) : null,
    confirmLabel: 'Delete',
    destructive: true
  })
  if (!ok) return
  try {
    await call('branch.delete', { repo: r.path, name, force: false })
    toast({
      kind: 'success',
      title: `Deleted ${name}`,
      detail: b ? `It pointed at ${b.hash}. Recover it from the reflog if needed.` : undefined
    })
  } catch (e) {
    if (e instanceof ApiError && /not fully merged/i.test(e.message + (e.detail ?? ''))) {
      const force = await confirm({
        title: `${name} is not fully merged`,
        description:
          'Its unmerged commits will only be reachable through the reflog (which Git eventually expires). Force delete?',
        confirmLabel: 'Force delete',
        destructive: true
      })
      if (force)
        await run(
          r,
          'Delete branch',
          () => call('branch.delete', { repo: r.path, name, force: true }),
          { success: `Deleted ${name}` }
        )
    } else toastError(e, 'Delete branch')
  } finally {
    await r.refresh('all')
  }
}

export async function deleteRemoteBranch(r: R, remoteBranch: string): Promise<void> {
  const [remote, ...rest] = remoteBranch.split('/')
  const name = rest.join('/')
  const ok = await confirm({
    title: `Delete ${remoteBranch} on the remote?`,
    description: `This runs "git push ${remote} --delete ${name}" and affects everyone using ${remote}.`,
    confirmLabel: 'Delete remote branch',
    destructive: true
  })
  if (!ok || !remote) return
  await runNetwork(
    r,
    `Deleting ${remoteBranch}`,
    (opId) => call('branch.deleteRemote', { repo: r.path, remote, name, opId }),
    `Deleted ${remoteBranch}`
  )
}

export async function setUpstream(r: R, branch: string): Promise<void> {
  const remoteBranches = r.refs?.remoteBranches ?? []
  const v = await prompt({
    title: `Upstream for ${branch}`,
    fields: [
      {
        name: 'upstream',
        label: 'Tracking branch',
        type: 'select',
        initial: remoteBranches.find((x) => x.name.endsWith(`/${branch}`))?.name ?? '',
        options: [
          { value: '', label: '(none — stop tracking)' },
          ...remoteBranches.map((x) => ({ value: x.name, label: x.name }))
        ]
      }
    ],
    confirmLabel: 'Save'
  })
  if (!v) return
  await run(
    r,
    'Set upstream',
    () =>
      call('branch.setUpstream', { repo: r.path, branch, upstream: String(v['upstream']) || null }),
    { success: 'Upstream updated' }
  )
}

// Integration ---------------------------------------------------------------------

export async function merge(r: R, ref: string): Promise<void> {
  const into = currentBranch(r) ?? 'HEAD'
  const incoming = await call('op.previewCommits', {
    repo: r.path,
    from: 'HEAD',
    to: ref,
    limit: 200
  }).catch(() => [] as Commit[])
  const v = await prompt({
    title: `Merge ${ref} into ${into}`,
    description: incoming.length
      ? `${incoming.length}${incoming.length === 200 ? '+' : ''} commit(s) will be integrated.`
      : 'Already up to date — nothing to merge.',
    fields: [
      {
        name: 'mode',
        label: 'Mode',
        type: 'select',
        initial: 'default',
        options: [
          { value: 'default', label: 'Fast-forward if possible, otherwise merge commit' },
          { value: 'no-ff', label: 'Always create a merge commit (--no-ff)' },
          { value: 'ff-only', label: 'Fast-forward only' },
          { value: 'squash', label: 'Squash into staged changes (commit manually)' }
        ]
      }
    ],
    confirmLabel: 'Merge'
  })
  if (!v) return
  await runOp(
    r,
    'Merge',
    () => call('op.merge', { repo: r.path, ref, mode: v['mode'] as 'default' }),
    `Merged ${ref}`
  )
}

export async function rebase(r: R, onto: string): Promise<void> {
  const branch = currentBranch(r) ?? 'HEAD'
  const commits = await call('op.previewCommits', {
    repo: r.path,
    from: onto,
    to: 'HEAD',
    limit: 500
  }).catch(() => [] as Commit[])
  const ok = await confirm({
    title: `Rebase ${branch} onto ${onto}?`,
    description:
      'These commits will be re-created on top of the target with new IDs. If the branch was already pushed, you will need to force push and collaborators must re-sync.',
    items: commits.map((c) => `${short(c.hash)}  ${c.subject}`),
    confirmLabel: 'Rebase'
  })
  if (!ok) return
  await runOp(
    r,
    'Rebase',
    () => call('op.rebase', { repo: r.path, onto }),
    `Rebased ${branch} onto ${onto}`
  )
}

export async function cherryPick(r: R, commits: Commit[]): Promise<void> {
  const ok = await confirm({
    title: `Cherry-pick ${commits.length} commit(s) onto ${currentBranch(r) ?? 'HEAD'}?`,
    items: commits.map((c) => `${short(c.hash)}  ${c.subject}`),
    confirmLabel: 'Cherry-pick'
  })
  if (!ok) return
  const ordered = [...commits].reverse().map((c) => c.hash)
  await runOp(
    r,
    'Cherry-pick',
    () => call('op.cherryPick', { repo: r.path, hashes: ordered, noCommit: false }),
    'Cherry-pick complete'
  )
}

export async function revert(r: R, c: Commit): Promise<void> {
  const ok = await confirm({
    title: 'Revert commit?',
    description:
      'A new commit will be created that undoes these changes. History is not rewritten.',
    items: [`${short(c.hash)}  ${c.subject}`],
    confirmLabel: 'Revert'
  })
  if (!ok) return
  await runOp(
    r,
    'Revert',
    () => call('op.revert', { repo: r.path, hash: c.hash, noCommit: false }),
    'Revert committed'
  )
}

const RESET_HELP: Record<string, string> = {
  soft: 'Soft — move the branch; keep all changes staged. Nothing is lost.',
  mixed:
    'Mixed — move the branch; keep changes in the working tree but unstage them. Nothing is lost.',
  keep: 'Keep — move the branch and update files, but refuse if that would overwrite your local changes.',
  hard: 'Hard — move the branch and DISCARD all uncommitted changes to tracked files. Cannot be undone.'
}

export async function reset(r: R, target: Commit): Promise<void> {
  const branch = currentBranch(r) ?? 'HEAD'
  const dropped = await call('op.previewCommits', {
    repo: r.path,
    from: target.hash,
    to: 'HEAD',
    limit: 200
  }).catch(() => [] as Commit[])
  const v = await prompt({
    title: `Reset ${branch} to ${short(target.hash)}`,
    description: target.subject,
    fields: [
      {
        name: 'mode',
        label: 'Mode',
        type: 'select',
        initial: 'mixed',
        options: (['soft', 'mixed', 'keep', 'hard'] as const).map((m) => ({
          value: m,
          label: RESET_HELP[m]!
        }))
      }
    ],
    confirmLabel: 'Continue'
  })
  if (!v) return
  const mode = v['mode'] as 'soft' | 'mixed' | 'hard' | 'keep'
  const changed = [...(r.status?.staged ?? []), ...(r.status?.unstaged ?? [])].map((f) => f.path)
  const ok = await confirm({
    title: mode === 'hard' ? 'Discard changes and reset?' : 'Reset branch?',
    description: RESET_HELP[mode],
    details: (
      <div className="space-y-2 text-[0.92em]">
        {dropped.length > 0 && (
          <p>
            {dropped.length} commit(s) will no longer be on {branch} (still recoverable from the
            reflog for a while).
          </p>
        )}
        {mode === 'hard' && changed.length > 0 && (
          <p className="text-destructive">
            These files have uncommitted changes that will be lost:
          </p>
        )}
      </div>
    ),
    items:
      mode === 'hard'
        ? [...new Set(changed)]
        : dropped.map((c) => `${short(c.hash)}  ${c.subject}`),
    destructive: mode === 'hard',
    confirmLabel: `Reset (${mode})`
  })
  if (!ok) return
  await run(r, 'Reset', () => call('op.reset', { repo: r.path, target: target.hash, mode }), {
    success: `Reset ${branch} to ${short(target.hash)}`
  })
}

export async function control(r: R, action: 'continue' | 'abort' | 'skip'): Promise<void> {
  if (action !== 'continue') {
    const ok = await confirm({
      title: action === 'abort' ? 'Abort the operation?' : 'Skip this commit?',
      description:
        action === 'abort'
          ? 'The repository returns to the state before the operation started. Conflict resolutions made so far are discarded.'
          : 'The current commit is left out; its changes are dropped from the result.',
      confirmLabel: action === 'abort' ? 'Abort' : 'Skip',
      destructive: true
    })
    if (!ok) return
  }
  await runOp(
    r,
    action[0]!.toUpperCase() + action.slice(1),
    () => call('op.control', { repo: r.path, action }),
    action === 'abort' ? 'Operation aborted' : 'Done'
  )
}

// Tags ------------------------------------------------------------------------------

export async function createTag(r: R, target: string): Promise<void> {
  const v = await prompt({
    title: 'New tag',
    description: `On ${target.length >= 40 ? short(target) : target}`,
    fields: [
      { name: 'name', label: 'Tag name', placeholder: 'v1.0.0', mono: true },
      {
        name: 'message',
        label: 'Message (creates an annotated tag; leave empty for a lightweight tag)',
        type: 'textarea',
        rows: 3
      },
      {
        name: 'sign',
        label: 'Sign the tag with your configured key (-s)',
        type: 'checkbox',
        initial: false
      },
      { name: 'push', label: 'Push the tag to the first remote', type: 'checkbox', initial: false }
    ],
    validate: (x) =>
      validRefName(String(x['name'])) ??
      (r.refs?.tags.some((t) => t.name === x['name']) ? 'Tag already exists.' : null),
    confirmLabel: 'Create tag'
  })
  if (!v) return
  const name = String(v['name'])
  const ok = await run(
    r,
    'Create tag',
    () =>
      call('tag.create', {
        repo: r.path,
        name,
        target,
        message: String(v['message']) || undefined,
        sign: !!v['sign']
      }).then(() => true),
    { success: `Created tag ${name}` }
  )
  const remote = r.refs?.remotes[0]?.name
  if (ok && v['push'] && remote)
    await runNetwork(
      r,
      `Pushing ${name}`,
      (opId) => call('tag.push', { repo: r.path, remote, name, delete: false, opId }),
      `Pushed ${name}`
    )
}

export async function deleteTag(r: R, name: string): Promise<void> {
  const remote = r.refs?.remotes[0]?.name
  const ok = await confirm({
    title: `Delete tag ${name}?`,
    confirmLabel: 'Delete',
    destructive: true,
    checkbox: remote ? { label: `Also delete it on ${remote}`, initial: false } : undefined
  })
  if (!ok) return
  await run(r, 'Delete tag', () => call('tag.delete', { repo: r.path, name }), {
    success: `Deleted ${name}`
  })
  if (ok.checked && remote)
    await runNetwork(
      r,
      `Deleting ${name} on ${remote}`,
      (opId) => call('tag.push', { repo: r.path, remote, name, delete: true, opId }),
      'Remote tag deleted'
    )
}

export async function pushTag(r: R, name: string): Promise<void> {
  const remotes = r.refs?.remotes ?? []
  if (!remotes.length) return toast({ kind: 'error', title: 'No remotes configured.' })
  const v =
    remotes.length > 1
      ? await prompt({
          title: `Push ${name}`,
          fields: [
            {
              name: 'remote',
              label: 'Remote',
              type: 'select',
              options: remotes.map((x) => ({ value: x.name, label: x.name }))
            }
          ],
          confirmLabel: 'Push'
        })
      : { remote: remotes[0]!.name }
  if (!v) return
  await runNetwork(
    r,
    `Pushing ${name}`,
    (opId) =>
      call('tag.push', { repo: r.path, remote: String(v['remote']), name, delete: false, opId }),
    `Pushed ${name}`
  )
}

// Stash -----------------------------------------------------------------------------

export async function stash(r: R, paths?: string[]): Promise<void> {
  const v = await prompt({
    title: paths ? `Stash ${paths.length} file(s)` : 'Stash changes',
    fields: [
      { name: 'message', label: 'Message', placeholder: 'Work in progress' },
      { name: 'untracked', label: 'Include untracked files', type: 'checkbox', initial: !paths },
      {
        name: 'keepIndex',
        label: 'Keep staged changes in the index',
        type: 'checkbox',
        initial: false
      }
    ],
    confirmLabel: 'Stash'
  })
  if (!v) return
  await run(
    r,
    'Stash',
    () =>
      call('stash.push', {
        repo: r.path,
        message: String(v['message']) || undefined,
        includeUntracked: !!v['untracked'],
        keepIndex: !!v['keepIndex'],
        paths
      }),
    { success: 'Changes stashed' }
  )
}

export async function applyStash(r: R, index: number, pop: boolean): Promise<void> {
  await runOp(
    r,
    pop ? 'Pop stash' : 'Apply stash',
    () => call('stash.apply', { repo: r.path, index, pop, restoreIndex: false }),
    pop ? 'Stash popped' : 'Stash applied'
  )
}

export async function dropStash(r: R, index: number, message: string): Promise<boolean> {
  const ok = await confirm({
    title: 'Drop stash?',
    description:
      'The stashed changes are deleted. Recovery requires finding the dangling commit manually.',
    items: [`stash@{${index}}: ${message}`],
    confirmLabel: 'Drop',
    destructive: true
  })
  if (!ok) return false
  return (
    (await run(
      r,
      'Drop stash',
      () => call('stash.drop', { repo: r.path, index }).then(() => true),
      { success: 'Stash dropped' }
    )) ?? false
  )
}

// Working tree --------------------------------------------------------------------

export async function discard(r: R, files: FileChange[]): Promise<void> {
  const tracked = files.filter((f) => f.kind !== 'untracked').map((f) => f.path)
  const untracked = files.filter((f) => f.kind === 'untracked').map((f) => f.path)
  const ok = await confirm({
    title: `Discard changes in ${files.length} file(s)?`,
    description: untracked.length
      ? 'Unstaged changes are reverted and untracked files are deleted from disk. This cannot be undone.'
      : 'Unstaged changes are reverted to the staged/committed version. This cannot be undone.',
    items: [...tracked.map((p) => `modified  ${p}`), ...untracked.map((p) => `delete    ${p}`)],
    confirmLabel: 'Discard',
    destructive: true
  })
  if (!ok) return
  await run(
    r,
    'Discard',
    () => call('index.discard', { repo: r.path, paths: tracked, untracked }),
    { scope: 'worktree' }
  )
}

export async function createBranchAt(r: R, hash: string, hint: string): Promise<void> {
  const v = await prompt({
    title: 'Create branch here',
    description: `${short(hash)} ${hint}`,
    fields: [{ name: 'name', label: 'Branch name', mono: true, placeholder: 'recovered-work' }],
    validate: (x) => validRefName(String(x['name'])),
    confirmLabel: 'Create'
  })
  if (!v) return
  await run(
    r,
    'Create branch',
    () => call('reflog.createBranch', { repo: r.path, name: String(v['name']), hash }),
    { success: `Created ${String(v['name'])} at ${short(hash)}` }
  )
}

// Remotes, worktrees, submodules ----------------------------------------------------------

export async function addRemote(r: R): Promise<void> {
  const v = await prompt({
    title: 'Add remote',
    fields: [
      { name: 'name', label: 'Name', initial: r.refs?.remotes.length ? '' : 'origin', mono: true },
      {
        name: 'url',
        label: 'URL',
        placeholder: 'https://github.com/owner/repo.git or git@host:owner/repo.git',
        mono: true
      }
    ],
    validate: (x) =>
      !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(String(x['name']))
        ? 'Invalid remote name.'
        : !String(x['url']).trim()
          ? 'Enter a URL.'
          : String(x['url']).startsWith('-')
            ? 'Invalid URL.'
            : null,
    confirmLabel: 'Add remote'
  })
  if (!v) return
  await run(
    r,
    'Add remote',
    () =>
      call('remote.add', { repo: r.path, name: String(v['name']), url: String(v['url']).trim() }),
    { success: 'Remote added' }
  )
}

export async function editRemote(r: R, name: string, url: string): Promise<void> {
  const v = await prompt({
    title: `Edit remote ${name}`,
    fields: [
      { name: 'name', label: 'Name', initial: name, mono: true },
      { name: 'url', label: 'URL', initial: url, mono: true }
    ],
    validate: (x) =>
      !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(String(x['name'])) ? 'Invalid remote name.' : null,
    confirmLabel: 'Save'
  })
  if (!v) return
  await run(r, 'Edit remote', async () => {
    if (String(v['url']) !== url)
      await call('remote.setUrl', { repo: r.path, name, url: String(v['url']), push: false })
    if (String(v['name']) !== name)
      await call('remote.rename', { repo: r.path, from: name, to: String(v['name']) })
  })
}

export async function removeRemote(r: R, name: string): Promise<void> {
  const ok = await confirm({
    title: `Remove remote ${name}?`,
    description: 'Its remote-tracking branches are deleted locally. Nothing on the server changes.',
    confirmLabel: 'Remove',
    destructive: true
  })
  if (ok)
    await run(r, 'Remove remote', () => call('remote.remove', { repo: r.path, name }), {
      success: `Removed ${name}`
    })
}

export async function addWorktree(r: R, ref?: string): Promise<void> {
  const dir = await call('dialog.pickDirectory', {
    title: 'Choose an empty folder for the new worktree'
  })
  if (!dir) return
  const v = await prompt({
    title: 'New worktree',
    description: dir,
    fields: [
      {
        name: 'mode',
        label: 'Branch',
        type: 'select',
        initial: ref ? 'existing' : 'new',
        options: [
          { value: 'new', label: 'Create a new branch' },
          { value: 'existing', label: 'Check out an existing branch or commit' }
        ]
      },
      { name: 'name', label: 'New branch name / existing ref', initial: ref ?? '', mono: true }
    ],
    validate: (x) => validRefName(String(x['name'])),
    confirmLabel: 'Create worktree'
  })
  if (!v) return
  const name = String(v['name'])
  const ok = await run(
    r,
    'Add worktree',
    () =>
      call('worktree.add', {
        repo: r.path,
        path: dir,
        ...(v['mode'] === 'new' ? { newBranch: name } : { ref: name })
      }).then(() => true),
    { success: 'Worktree created' }
  )
  if (ok) await openRepository(dir)
}

export async function removeWorktree(r: R, path: string): Promise<void> {
  let st
  try {
    st = await call('worktree.status', { repo: r.path, path })
  } catch (e) {
    toastError(e, 'Remove worktree')
    return
  }
  if (st.main || st.current) {
    toast({
      kind: 'error',
      title: st.main
        ? 'The main worktree cannot be removed.'
        : 'You cannot remove the worktree you are working in. Open another worktree and remove it from there.'
    })
    return
  }
  const dirty = st.changes.length > 0
  const ok = await confirm({
    title: `Remove worktree${st.branch ? ` for ${st.branch}` : ''}?`,
    description: st.missing
      ? `The folder ${st.path} no longer exists; only Git's record of it is removed.`
      : dirty
        ? `The folder ${st.path} is deleted. It has ${st.changes.length} uncommitted change(s), listed below. Git refuses to remove it unless you choose to discard them.`
        : `The folder ${st.path} is deleted. It has no uncommitted changes${st.branch ? `; the branch ${st.branch} itself is kept` : ''}.`,
    items: dirty ? st.changes : undefined,
    confirmLabel: 'Remove',
    destructive: true,
    checkbox:
      dirty || st.locked
        ? {
            label: dirty
              ? `Discard these ${st.changes.length} change(s) and remove anyway`
              : 'The worktree is locked; remove it anyway',
            initial: false
          }
        : undefined
  })
  if (!ok) return
  const done = await run(
    r,
    'Remove worktree',
    () => call('worktree.remove', { repo: r.path, path, force: !!ok.checked }).then(() => true),
    { success: 'Worktree removed' }
  )
  if (done) {
    // Close a tab that still shows the removed worktree.
    const key = samePath(path)
    for (const t of app.get().tabs) if (t.path && samePath(t.path) === key) closeTab(t.id)
  }
}

const samePath = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export function updateSubmodules(r: R): Promise<boolean> {
  return runNetwork(
    r,
    'Updating submodules',
    (opId) => call('submodule.update', { repo: r.path, init: true, recursive: true, opId }),
    'Submodules updated'
  )
}

export async function openInBrowser(
  r: R,
  target: ApiArgs<'hosting.webUrl'>['target']
): Promise<void> {
  try {
    const url = await call('hosting.webUrl', { repo: r.path, target })
    if (!url)
      return toast({
        kind: 'error',
        title:
          'No remote points to a recognised hosting service (GitHub, GitLab, Bitbucket, Azure DevOps).'
      })
    await call('shell.openExternal', { url })
  } catch (e) {
    toastError(e)
  }
}

export async function copy(text: string, what = 'Copied'): Promise<void> {
  await navigator.clipboard.writeText(text)
  toast({ kind: 'info', title: what })
}
