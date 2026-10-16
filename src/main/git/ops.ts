import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ApiArgs } from '@shared/api'
import type { Commit, CommandResult, CommitFile, RebaseTodoItem } from '@shared/types'
import { AppError } from '../errors'
import { LOG_FORMAT, applyNumstat, parseLog, parseNameStatus } from './parse'
import { detectOperation, getStatus, mgit, rgit, type RepoCtx } from './repo'
import { getGitInfo } from './runner'

const ok = (r: CommandResult): CommandResult => ({
  stdout: r.stdout,
  stderr: r.stderr,
  exitCode: r.exitCode
})

/**
 * Run an operation that may legitimately stop with conflicts. A stop with
 * conflicts is returned as a result (exitCode 1) instead of an error so the UI
 * can switch to the conflict workspace.
 */
async function allowConflicts(
  ctx: RepoCtx,
  fn: () => Promise<CommandResult>
): Promise<CommandResult> {
  try {
    return ok(await fn())
  } catch (e) {
    if (!(e instanceof AppError) || e.code === 'CANCELLED') throw e
    const status = await getStatus(ctx)
    if (
      status.conflicted.length > 0 ||
      (status.operation !== 'none' && status.operation !== 'bisect')
    ) {
      return { stdout: '', stderr: e.detail ?? e.message, exitCode: 1 }
    }
    throw e
  }
}

async function isMerge(ctx: RepoCtx, rev: string): Promise<boolean> {
  const r = await rgit(ctx, ['rev-list', '--parents', '-n', '1', '--end-of-options', rev])
  return r.stdout.trim().split(' ').length > 2
}

async function requireClean(ctx: RepoCtx, what: string): Promise<void> {
  const s = await getStatus(ctx)
  if (s.staged.length || s.unstaged.length || s.conflicted.length) {
    throw new AppError(
      'GIT_FAILED',
      `${what} needs a clean working tree. Commit, stash, or discard your changes first.`
    )
  }
}

export function merge(ctx: RepoCtx, a: ApiArgs<'op.merge'>): Promise<CommandResult> {
  const args = ['merge', '--no-edit']
  if (a.mode === 'no-ff') args.push('--no-ff')
  else if (a.mode === 'ff-only') args.push('--ff-only')
  else if (a.mode === 'squash') args.push('--squash')
  args.push('--end-of-options', a.ref)
  return allowConflicts(ctx, () => mgit(ctx, args))
}

export function rebase(ctx: RepoCtx, onto: string): Promise<CommandResult> {
  return allowConflicts(ctx, () => mgit(ctx, ['rebase', '--end-of-options', onto]))
}

export async function cherryPick(
  ctx: RepoCtx,
  hashes: string[],
  noCommit: boolean
): Promise<CommandResult> {
  const args = ['cherry-pick']
  if (noCommit) args.push('--no-commit')
  if (hashes.length === 1 && (await isMerge(ctx, hashes[0]!))) args.push('-m', '1')
  args.push('--end-of-options', ...hashes)
  return allowConflicts(ctx, () => mgit(ctx, args))
}

export async function revert(
  ctx: RepoCtx,
  hash: string,
  noCommit: boolean
): Promise<CommandResult> {
  const args = ['revert', '--no-edit']
  if (noCommit) args.push('--no-commit')
  if (await isMerge(ctx, hash)) args.push('-m', '1')
  args.push('--end-of-options', hash)
  return allowConflicts(ctx, () => mgit(ctx, args))
}

export async function reset(
  ctx: RepoCtx,
  target: string,
  mode: 'soft' | 'mixed' | 'hard' | 'keep'
): Promise<void> {
  // `git reset` rejects --end-of-options on older Git; `target` is validated never to start with "-".
  await mgit(ctx, ['reset', `--${mode}`, target, '--'])
}

export async function control(
  ctx: RepoCtx,
  action: 'continue' | 'abort' | 'skip'
): Promise<CommandResult> {
  const { operation } = detectOperation(ctx)
  const cmd =
    operation === 'rebase' || operation === 'rebase-interactive'
      ? 'rebase'
      : operation === 'merge'
        ? 'merge'
        : operation === 'cherry-pick'
          ? 'cherry-pick'
          : operation === 'revert'
            ? 'revert'
            : operation === 'am'
              ? 'am'
              : null
  if (!cmd)
    throw new AppError('VALIDATION', 'No merge, rebase, cherry-pick or revert is in progress.')
  if (action === 'skip' && cmd === 'merge')
    throw new AppError('UNSUPPORTED', 'A merge cannot be skipped; continue or abort it.')
  if (action === 'continue') {
    const s = await getStatus(ctx)
    if (s.conflicted.length) {
      throw new AppError(
        'CONFLICT',
        `${s.conflicted.length} file(s) still have unresolved conflicts. Resolve and stage them before continuing.`
      )
    }
  }
  return allowConflicts(ctx, () => mgit(ctx, [cmd, `--${action}`]))
}

export async function previewCommits(
  ctx: RepoCtx,
  from: string,
  to: string,
  limit: number
): Promise<Commit[]> {
  const out = await rgit(ctx, [
    'log',
    '-z',
    `--format=${LOG_FORMAT}`,
    '--decorate=full',
    '-n',
    String(limit),
    '--end-of-options',
    `${from}..${to}`,
    '--'
  ])
  return parseLog(out.stdout)
}

// Interactive rebase -----------------------------------------------------------

const quoteForSh = (p: string): string => `"${p.replace(/\\/g, '/').replace(/(["$`\\])/g, '\\$1')}"`

export function buildTodo(items: RebaseTodoItem[], messageFile: (i: number) => string): string {
  const lines: string[] = []
  items.forEach((it, i) => {
    switch (it.action) {
      case 'pick':
      case 'edit':
      case 'drop':
      case 'fixup':
        lines.push(`${it.action} ${it.hash} ${it.subject}`)
        break
      case 'reword':
        lines.push(`pick ${it.hash} ${it.subject}`)
        lines.push(
          `exec git commit --amend --only --no-verify --allow-empty -F ${quoteForSh(messageFile(i))}`
        )
        break
      case 'squash':
        if (it.message?.trim()) {
          lines.push(`fixup ${it.hash} ${it.subject}`)
          lines.push(
            `exec git commit --amend --only --no-verify --allow-empty -F ${quoteForSh(messageFile(i))}`
          )
        } else lines.push(`squash ${it.hash} ${it.subject}`)
        break
    }
  })
  return lines.join('\n') + '\n'
}

export async function interactiveRebase(
  ctx: RepoCtx,
  a: ApiArgs<'rebase.interactive'>
): Promise<CommandResult> {
  await requireClean(ctx, 'Interactive rebase')
  const first = a.todo[0]!
  if (first.action === 'squash' || first.action === 'fixup') {
    throw new AppError(
      'VALIDATION',
      'The first commit cannot be squashed or fixed up: there is no earlier commit in the list to combine it with.'
    )
  }
  const dir = await mkdtemp(join(tmpdir(), 'spoon-rebase-'))
  try {
    const msgPath = (i: number): string => join(dir, `msg-${i}.txt`)
    for (const [i, it] of a.todo.entries()) {
      if ((it.action === 'reword' || it.action === 'squash') && it.message?.trim()) {
        await writeFile(msgPath(i), it.message.trim() + '\n', 'utf8')
      } else if (it.action === 'reword') {
        throw new AppError('VALIDATION', `Enter a new message for ${it.hash.slice(0, 7)}.`)
      }
    }
    const todoPath = join(dir, 'todo.txt')
    await writeFile(todoPath, buildTodo(a.todo, msgPath), 'utf8')
    const scriptPath = join(dir, 'sequence-editor.cjs')
    await writeFile(
      scriptPath,
      "require('fs').copyFileSync(process.argv[2], process.argv[3])\n",
      'utf8'
    )
    const editor = `${quoteForSh(process.execPath)} ${quoteForSh(scriptPath)} ${quoteForSh(todoPath)}`
    const args = ['rebase', '-i']
    if (getGitInfo()?.capabilities.updateRefs) args.push('--no-update-refs')
    args.push(a.base ? '--end-of-options' : '--root')
    if (a.base) args.push(a.base)
    return await allowConflicts(ctx, () =>
      mgit(ctx, args, {
        env: { GIT_SEQUENCE_EDITOR: editor, ELECTRON_RUN_AS_NODE: '1' }
      })
    )
  } finally {
    // Message files must survive until "exec" lines run; if the rebase stopped, keep them.
    if (detectOperation(ctx).operation === 'none') await rm(dir, { recursive: true, force: true })
  }
}

// Stash -----------------------------------------------------------------------

export async function stashPush(ctx: RepoCtx, a: ApiArgs<'stash.push'>): Promise<void> {
  const args = ['stash', 'push']
  if (a.message) args.push('-m', a.message)
  if (a.includeUntracked) args.push('--include-untracked')
  if (a.keepIndex) args.push('--keep-index')
  if (a.paths?.length) args.push('--', ...a.paths)
  // Newer Git's builtin stash passes ":/" to clean/checkout; that breaks under
  // GIT_LITERAL_PATHSPECS (untracked files stay on disk after -u / --keep-index fails).
  const r = await mgit(ctx, args, { literalPathspecs: false })
  if (/No local changes to save/i.test(r.stdout + r.stderr))
    throw new AppError('VALIDATION', 'There are no local changes to stash.')
}

export function stashApply(
  ctx: RepoCtx,
  index: number,
  pop: boolean,
  restoreIndex: boolean
): Promise<CommandResult> {
  const args = ['stash', pop ? 'pop' : 'apply']
  if (restoreIndex) args.push('--index')
  args.push(`stash@{${index}}`)
  return allowConflicts(ctx, () => mgit(ctx, args))
}

export async function stashDrop(ctx: RepoCtx, index: number): Promise<void> {
  await mgit(ctx, ['stash', 'drop', `stash@{${index}}`])
}

export async function stashFiles(ctx: RepoCtx, index: number): Promise<CommitFile[]> {
  const ref = `stash@{${index}}`
  const ns = await rgit(ctx, ['diff', '-M', '--name-status', '-z', `${ref}^1`, ref, '--'])
  const files = parseNameStatus(ns.stdout)
  const num = await rgit(ctx, ['diff', '-M', '--numstat', '-z', `${ref}^1`, ref, '--'])
  applyNumstat(files, num.stdout)
  const untracked = await rgit(ctx, ['ls-tree', '-r', '--name-only', '-z', `${ref}^3`], {
    okCodes: [0, 128]
  })
  if (untracked.exitCode === 0) {
    for (const p of untracked.stdout.split('\0').filter(Boolean)) {
      files.push({ path: p, status: '?', additions: null, deletions: null, binary: false })
    }
  }
  return files
}

export async function branchFromReflog(ctx: RepoCtx, name: string, hash: string): Promise<void> {
  await mgit(ctx, ['branch', '--end-of-options', name, hash])
}

// Bisect ----------------------------------------------------------------------

export async function bisectStart(ctx: RepoCtx, bad: string, good: string): Promise<CommandResult> {
  await requireClean(ctx, 'Bisect')
  // bisect does not accept --end-of-options; revisions are validated never to start with "-".
  return ok(await mgit(ctx, ['bisect', 'start', bad, good, '--']))
}
export async function bisectMark(
  ctx: RepoCtx,
  verdict: 'good' | 'bad' | 'skip'
): Promise<CommandResult> {
  return ok(await mgit(ctx, ['bisect', verdict]))
}
export async function bisectReset(ctx: RepoCtx): Promise<CommandResult> {
  return ok(await mgit(ctx, ['bisect', 'reset']))
}
export async function bisectLog(ctx: RepoCtx): Promise<string> {
  const r = await rgit(ctx, ['bisect', 'log'], { okCodes: [0, 1, 128] })
  return r.exitCode === 0 ? r.stdout : ''
}

// Git-flow (implemented natively on top of branches and merges; no git-flow install required) --

async function refExists(ctx: RepoCtx, ref: string): Promise<boolean> {
  const r = await rgit(ctx, ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`], {
    okCodes: [0, 1, 128]
  })
  return r.exitCode === 0
}

export async function flowStart(ctx: RepoCtx, a: ApiArgs<'flow.start'>): Promise<void> {
  const base = a.kind === 'hotfix' ? (a.main ?? 'main') : (a.develop ?? 'develop')
  if (!(await refExists(ctx, base))) {
    throw new AppError(
      'VALIDATION',
      `The base branch "${base}" does not exist. Create it first (git-flow uses "${a.develop ?? 'develop'}" for integration and "${a.main ?? 'main'}" for releases).`
    )
  }
  await mgit(ctx, ['checkout', '-b', `${a.kind}/${a.name}`, base, '--'])
}

export async function flowFinish(ctx: RepoCtx, a: ApiArgs<'flow.finish'>): Promise<CommandResult> {
  await requireClean(ctx, 'Finishing a git-flow branch')
  const develop = a.develop ?? 'develop'
  const main = a.main ?? 'main'
  const m = /^(feature|release|hotfix)\/(.+)$/.exec(a.branch)
  if (!m)
    throw new AppError(
      'VALIDATION',
      'Only feature/, release/ and hotfix/ branches can be finished.'
    )
  const [, kind, name] = m
  const mergeInto = async (target: string): Promise<CommandResult | null> => {
    await mgit(ctx, ['checkout', target, '--'])
    const r = await allowConflicts(ctx, () =>
      mgit(ctx, ['merge', '--no-ff', '--no-edit', '--end-of-options', a.branch])
    )
    return r.exitCode === 0 ? null : r
  }
  if (kind === 'feature') {
    const stop = await mergeInto(develop)
    if (stop) return stop
  } else {
    const stop = await mergeInto(main)
    if (stop) return stop
    await mgit(ctx, ['tag', '-a', '-m', `${kind} ${name}`, '--end-of-options', name!, main])
    if (await refExists(ctx, develop)) {
      const stop2 = await mergeInto(develop)
      if (stop2) return stop2
    }
  }
  if (a.deleteBranch !== false) await mgit(ctx, ['branch', '-d', '--end-of-options', a.branch])
  return { stdout: `Finished ${a.branch}`, stderr: '', exitCode: 0 }
}
