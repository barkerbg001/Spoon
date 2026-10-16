import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ApiArgs } from '@shared/api'
import type { CommandResult, OpProgress, RefsSnapshot, Remote, Stash } from '@shared/types'
import {
  BRANCH_FORMAT,
  TAG_FORMAT,
  parseBranches,
  parseSubmodules,
  parseTags,
  parseWorktrees
} from './parse'
import { mgit, rgit, type RepoCtx } from './repo'

type Progress = (p: OpProgress) => void
const result = (r: CommandResult): CommandResult => ({
  stdout: r.stdout,
  stderr: r.stderr,
  exitCode: r.exitCode
})

export async function listRemotes(ctx: RepoCtx): Promise<Remote[]> {
  const r = await rgit(ctx, ['config', '--get-regexp', '^remote\\..*\\.(url|pushurl)$'], {
    okCodes: [0, 1]
  })
  const map = new Map<string, Remote>()
  for (const line of r.stdout.split('\n')) {
    const m = /^remote\.(.+)\.(url|pushurl) (.*)$/.exec(line.trim())
    if (!m) continue
    const rem = map.get(m[1]!) ?? { name: m[1]!, fetchUrl: '', pushUrl: '' }
    if (m[2] === 'url') {
      rem.fetchUrl = m[3]!
      if (!rem.pushUrl) rem.pushUrl = m[3]!
    } else rem.pushUrl = m[3]!
    map.set(m[1]!, rem)
  }
  return [...map.values()]
}

export async function listStashes(ctx: RepoCtx): Promise<Stash[]> {
  const r = await rgit(ctx, ['stash', 'list', '-z', '--format=%H%x1f%gd%x1f%ct%x1f%gs'], {
    okCodes: [0, 1, 128]
  })
  return r.stdout
    .split('\0')
    .filter(Boolean)
    .map((rec, i) => {
      const f = rec.replace(/^\n/, '').split('\x1f')
      return {
        index: i,
        hash: f[0]!,
        ref: f[1]!,
        date: Number(f[2]),
        message: f.slice(3).join('\x1f')
      }
    })
}

export async function refsSnapshot(ctx: RepoCtx): Promise<RefsSnapshot> {
  const [local, remote, tags, remotes, stashes, wt, head] = await Promise.all([
    rgit(ctx, ['for-each-ref', `--format=${BRANCH_FORMAT}`, '--sort=refname', 'refs/heads']),
    rgit(ctx, ['for-each-ref', `--format=${BRANCH_FORMAT}`, '--sort=refname', 'refs/remotes']),
    rgit(ctx, ['for-each-ref', `--format=${TAG_FORMAT}`, '--sort=-creatordate', 'refs/tags']),
    listRemotes(ctx),
    listStashes(ctx),
    rgit(ctx, ['worktree', 'list', '--porcelain'], { okCodes: [0, 128, 129] }),
    rgit(ctx, ['rev-parse', '--verify', '--quiet', 'HEAD'], { okCodes: [0, 1, 128] })
  ])
  const submodules = existsSync(join(ctx.root, '.gitmodules'))
    ? parseSubmodules((await rgit(ctx, ['submodule', 'status'], { okCodes: [0, 1, 128] })).stdout)
    : []
  const branches = parseBranches(local.stdout)
  const current = branches.find((b) => b.current)
  const sym = current
    ? null
    : await rgit(ctx, ['symbolic-ref', '-q', '--short', 'HEAD'], { okCodes: [0, 1, 128] })
  const unbornBranch = sym?.exitCode === 0 ? sym.stdout.trim() : null
  return {
    branches,
    remoteBranches: parseBranches(remote.stdout),
    tags: parseTags(tags.stdout),
    remotes,
    stashes,
    worktrees: parseWorktrees(wt.stdout),
    submodules,
    head: {
      branch: current?.name ?? unbornBranch,
      detached: !current && !unbornBranch,
      oid: head.stdout.trim() || null,
      upstream: current?.upstream ?? null,
      ahead: current?.ahead ?? 0,
      behind: current?.behind ?? 0,
      unborn: !head.stdout.trim()
    }
  }
}

// Branches ------------------------------------------------------------------

export async function createBranch(ctx: RepoCtx, a: ApiArgs<'branch.create'>): Promise<void> {
  if (a.checkout) await mgit(ctx, ['checkout', '-b', a.name, ...(a.start ? [a.start] : []), '--'])
  else await mgit(ctx, ['branch', '--end-of-options', a.name, ...(a.start ? [a.start] : [])])
}

export async function checkout(ctx: RepoCtx, ref: string, track?: boolean): Promise<void> {
  if (track) {
    // Create a local branch tracking the remote branch (origin/x -> x).
    await mgit(ctx, ['checkout', '--track', ref, '--'])
  } else {
    await mgit(ctx, ['checkout', ref, '--'])
  }
}

export async function renameBranch(ctx: RepoCtx, from: string, to: string): Promise<void> {
  await mgit(ctx, ['branch', '-m', '--end-of-options', from, to])
}

export async function deleteBranch(ctx: RepoCtx, name: string, force: boolean): Promise<void> {
  await mgit(ctx, ['branch', force ? '-D' : '-d', '--end-of-options', name])
}

export async function deleteRemoteBranch(
  ctx: RepoCtx,
  remote: string,
  name: string,
  opId?: string
): Promise<void> {
  await mgit(ctx, ['push', remote, '--delete', `refs/heads/${name}`], { opId })
}

export async function setUpstream(
  ctx: RepoCtx,
  branch: string,
  upstream: string | null
): Promise<void> {
  if (upstream)
    await mgit(ctx, ['branch', `--set-upstream-to=${upstream}`, '--end-of-options', branch])
  else await mgit(ctx, ['branch', '--unset-upstream', '--end-of-options', branch])
}

// Tags ----------------------------------------------------------------------

export async function createTag(ctx: RepoCtx, a: ApiArgs<'tag.create'>): Promise<void> {
  const args = ['tag']
  const annotated = !!a.message?.trim() || a.sign
  if (a.sign) args.push('-s')
  else if (annotated) args.push('-a')
  if (annotated) args.push('-F', '-')
  args.push('--end-of-options', a.name, a.target)
  await mgit(ctx, args, { input: annotated ? (a.message?.trim() || a.name) + '\n' : undefined })
}

export async function deleteTag(ctx: RepoCtx, name: string): Promise<void> {
  await mgit(ctx, ['tag', '-d', '--end-of-options', name])
}

export async function pushTag(
  ctx: RepoCtx,
  a: ApiArgs<'tag.push'>,
  onProgress: Progress
): Promise<CommandResult> {
  const args = ['push', '--progress', a.remote]
  if (a.delete) args.push('--delete')
  args.push(`refs/tags/${a.name}`)
  return result(await mgit(ctx, args, { opId: a.opId, onProgress }))
}

// Remotes -------------------------------------------------------------------

export async function addRemote(ctx: RepoCtx, name: string, url: string): Promise<void> {
  await mgit(ctx, ['remote', 'add', '--', name, url])
}
export async function removeRemote(ctx: RepoCtx, name: string): Promise<void> {
  await mgit(ctx, ['remote', 'remove', '--', name])
}
export async function renameRemote(ctx: RepoCtx, from: string, to: string): Promise<void> {
  await mgit(ctx, ['remote', 'rename', '--', from, to])
}
export async function setRemoteUrl(
  ctx: RepoCtx,
  name: string,
  url: string,
  push: boolean
): Promise<void> {
  await mgit(ctx, ['remote', 'set-url', ...(push ? ['--push'] : []), '--', name, url])
}

export async function fetch(
  ctx: RepoCtx,
  a: ApiArgs<'remote.fetch'>,
  onProgress: Progress
): Promise<CommandResult> {
  const args = ['fetch', '--progress']
  if (a.prune) args.push('--prune')
  if (a.tags) args.push('--tags')
  if (a.remote) args.push(a.remote)
  else if (a.all !== false) args.push('--all')
  return result(await mgit(ctx, args, { opId: a.opId, onProgress }))
}

export async function pull(
  ctx: RepoCtx,
  a: ApiArgs<'remote.pull'>,
  onProgress: Progress
): Promise<CommandResult> {
  const flag =
    a.strategy === 'rebase' ? '--rebase' : a.strategy === 'ff-only' ? '--ff-only' : '--no-rebase'
  return result(await mgit(ctx, ['pull', '--progress', flag], { opId: a.opId, onProgress }))
}

export async function push(
  ctx: RepoCtx,
  a: ApiArgs<'remote.push'>,
  onProgress: Progress
): Promise<CommandResult> {
  const args = ['push', '--progress']
  if (a.setUpstream) args.push('--set-upstream')
  if (a.forceWithLease) args.push('--force-with-lease')
  if (a.tags) args.push('--follow-tags')
  const target = a.remoteBranch ?? a.branch
  args.push(a.remote, `refs/heads/${a.branch}:refs/heads/${target}`)
  return result(await mgit(ctx, args, { opId: a.opId, onProgress }))
}
