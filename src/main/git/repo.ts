import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { RepoOperation, RepoStatus, RepoSummary } from '@shared/types'
import { AppError } from '../errors'
import { git, type RunOptions, type RunResult } from './runner'
import { parseStatusV2 } from './parse'

export interface RepoCtx {
  root: string
  gitDir: string
  commonDir: string
  bare: boolean
  linked: boolean
}

const opened = new Map<string, RepoCtx>()

export const normalizeKey = (p: string): string => {
  const r = resolve(p)
  return process.platform === 'win32' || process.platform === 'darwin' ? r.toLowerCase() : r
}

/** Read-only git invocation in a repository. */
export function rgit(
  ctx: RepoCtx,
  args: string[],
  opts: Partial<RunOptions> = {}
): Promise<RunResult> {
  return git(args, { cwd: ctx.root, readOnly: true, ...opts })
}

/** Mutating git invocation (callers hold the repository lock, see ipc dispatcher). */
export function mgit(
  ctx: RepoCtx,
  args: string[],
  opts: Partial<RunOptions> = {}
): Promise<RunResult> {
  return git(args, { cwd: ctx.root, readOnly: false, log: true, ...opts })
}

export async function resolveRepo(path: string): Promise<RepoCtx> {
  const abs = resolve(path)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new AppError('NOT_FOUND', `The folder does not exist: ${abs}`)
  }
  const out = await git(
    ['rev-parse', '--is-bare-repository', '--git-dir', '--git-common-dir', '--is-inside-work-tree'],
    { cwd: abs, readOnly: true, log: false }
  )
  const [bare, gitDir, commonDir] = out.stdout.trim().split(/\r?\n/)
  if (bare === 'true') {
    throw new AppError(
      'UNSUPPORTED',
      'This is a bare repository (it has no working tree). Spoon currently needs a working tree; create a worktree from it with "git worktree add <path>" or clone it.',
      abs
    )
  }
  const top = await git(['rev-parse', '--show-toplevel'], { cwd: abs, readOnly: true, log: false })
  const real = (p: string): string => {
    try {
      return realpathSync.native(p)
    } catch {
      return p
    }
  }
  const root = real(resolve(top.stdout.trim()))
  const ctx: RepoCtx = {
    root,
    gitDir: real(resolve(abs, gitDir ?? '.git')),
    commonDir: real(resolve(abs, commonDir ?? '.git')),
    bare: false,
    linked: false
  }
  ctx.linked = normalizeKey(ctx.gitDir) !== normalizeKey(ctx.commonDir)
  return ctx
}

export function registerRepo(ctx: RepoCtx): void {
  opened.set(normalizeKey(ctx.root), ctx)
}

export function unregisterRepo(path: string): void {
  opened.delete(normalizeKey(path))
}

/** Only repositories the user explicitly opened can be operated on via IPC. */
export function requireRepo(path: string): RepoCtx {
  const ctx = opened.get(normalizeKey(path))
  if (!ctx) throw new AppError('REPO_NOT_OPEN', 'This repository is not open in Spoon.')
  return ctx
}

export function openedRepos(): RepoCtx[] {
  return [...opened.values()]
}

function readText(p: string): string | null {
  try {
    return readFileSync(p, 'utf8').trim()
  } catch {
    return null
  }
}

export function detectOperation(ctx: RepoCtx): {
  operation: RepoOperation
  target?: string
  bisecting: boolean
} {
  const g = ctx.gitDir
  const bisecting = existsSync(join(g, 'BISECT_LOG'))
  if (existsSync(join(g, 'rebase-merge'))) {
    const interactive = existsSync(join(g, 'rebase-merge', 'interactive'))
    const target = readText(join(g, 'rebase-merge', 'stopped-sha')) ?? undefined
    return { operation: interactive ? 'rebase-interactive' : 'rebase', target, bisecting }
  }
  if (existsSync(join(g, 'rebase-apply'))) {
    return {
      operation: existsSync(join(g, 'rebase-apply', 'applying')) ? 'am' : 'rebase',
      bisecting
    }
  }
  if (existsSync(join(g, 'MERGE_HEAD'))) {
    return {
      operation: 'merge',
      target: readText(join(g, 'MERGE_HEAD'))?.split('\n')[0],
      bisecting
    }
  }
  if (existsSync(join(g, 'CHERRY_PICK_HEAD'))) {
    return {
      operation: 'cherry-pick',
      target: readText(join(g, 'CHERRY_PICK_HEAD')) ?? undefined,
      bisecting
    }
  }
  if (existsSync(join(g, 'REVERT_HEAD'))) {
    return { operation: 'revert', target: readText(join(g, 'REVERT_HEAD')) ?? undefined, bisecting }
  }
  return { operation: bisecting ? 'bisect' : 'none', bisecting }
}

/** Names of the branch being rebased and the base it is being replayed onto. */
export function rebaseInfo(ctx: RepoCtx): { headName: string | null; onto: string | null } {
  for (const dir of ['rebase-merge', 'rebase-apply']) {
    const p = join(ctx.gitDir, dir)
    if (existsSync(p)) {
      return {
        headName: readText(join(p, 'head-name'))?.replace(/^refs\/heads\//, '') ?? null,
        onto: readText(join(p, 'onto'))
      }
    }
  }
  return { headName: null, onto: null }
}

async function stashCount(ctx: RepoCtx): Promise<number> {
  try {
    const text = await readFile(join(ctx.commonDir, 'logs', 'refs', 'stash'), 'utf8')
    return text.split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

export async function getStatus(ctx: RepoCtx): Promise<RepoStatus> {
  const out = await rgit(ctx, [
    'status',
    '--porcelain=v2',
    '--branch',
    '-z',
    '--untracked-files=all'
  ])
  const parsed = parseStatusV2(out.stdout)
  const op = detectOperation(ctx)
  return {
    repo: ctx.root,
    head: parsed.head,
    operation: op.operation,
    operationTarget: op.target,
    bisecting: op.bisecting,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    untracked: parsed.untracked,
    conflicted: parsed.conflicted,
    stashCount: await stashCount(ctx),
    isShallow: existsSync(join(ctx.commonDir, 'shallow')),
    isLinkedWorktree: ctx.linked
  }
}

export async function getSummary(ctx: RepoCtx): Promise<RepoSummary> {
  const status = await getStatus(ctx)
  return {
    path: ctx.root,
    name: basename(ctx.root),
    gitDir: ctx.gitDir,
    commonDir: ctx.commonDir,
    bare: ctx.bare,
    isLinkedWorktree: ctx.linked,
    head: status.head,
    operation: status.operation,
    changeCount:
      status.staged.length +
      status.unstaged.length +
      status.untracked.length +
      status.conflicted.length
  }
}
