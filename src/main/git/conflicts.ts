import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { countConflictMarkers } from '@shared/conflict'
import type { CommandResult, ConflictFile } from '@shared/types'
import { AppError } from '../errors'
import { insideRepo } from './changes'
import { detectOperation, mgit, rebaseInfo, rgit, type RepoCtx } from './repo'

async function stageBlob(
  ctx: RepoCtx,
  stage: number,
  path: string
): Promise<{ text: string | null; binary: boolean }> {
  const r = await rgit(ctx, ['cat-file', 'blob', `:${stage}:${path}`], {
    okCodes: [0, 128],
    binary: true
  })
  if (r.exitCode !== 0 || !r.raw) return { text: null, binary: false }
  if (r.raw.subarray(0, 8000).includes(0)) return { text: null, binary: true }
  return { text: r.raw.toString('utf8'), binary: false }
}

async function short(ctx: RepoCtx, rev: string): Promise<string> {
  const r = await rgit(ctx, ['log', '-1', '--format=%h %s', '--end-of-options', rev], {
    okCodes: [0, 128]
  })
  return r.stdout.trim() || rev.slice(0, 8)
}

async function currentBranch(ctx: RepoCtx): Promise<string> {
  const r = await rgit(ctx, ['symbolic-ref', '-q', '--short', 'HEAD'], { okCodes: [0, 1, 128] })
  return r.stdout.trim() || 'HEAD'
}

/** Labels that explain what "ours" and "theirs" mean for the operation in progress. */
export async function conflictLabels(ctx: RepoCtx): Promise<{ ours: string; theirs: string }> {
  const { operation, target } = detectOperation(ctx)
  switch (operation) {
    case 'rebase':
    case 'rebase-interactive': {
      const info = rebaseInfo(ctx)
      const onto = info.onto ? await short(ctx, info.onto) : 'upstream'
      const replay = target ? await short(ctx, target) : 'commit being replayed'
      return {
        ours: `Base being rebased onto (${onto})`,
        theirs: `Your commit from ${info.headName ?? 'branch'} (${replay})`
      }
    }
    case 'merge': {
      let theirs = target ? await short(ctx, target) : 'MERGE_HEAD'
      try {
        const msg = await readFile(join(ctx.gitDir, 'MERGE_MSG'), 'utf8')
        const m = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(msg)
        if (m) theirs = m[1]!
      } catch {
        /* no merge message */
      }
      return {
        ours: `Current branch (${await currentBranch(ctx)})`,
        theirs: `Incoming (${theirs})`
      }
    }
    case 'cherry-pick':
      return {
        ours: `Current branch (${await currentBranch(ctx)})`,
        theirs: `Cherry-picked ${target ? await short(ctx, target) : 'commit'}`
      }
    case 'revert':
      return {
        ours: `Current branch (${await currentBranch(ctx)})`,
        theirs: `Revert of ${target ? await short(ctx, target) : 'commit'}`
      }
    default:
      // Most commonly a conflicting "stash apply/pop".
      return {
        ours: `Current (${await currentBranch(ctx)})`,
        theirs: 'Incoming (e.g. stashed changes)'
      }
  }
}

export async function getConflict(ctx: RepoCtx, path: string): Promise<ConflictFile> {
  const ls = await rgit(ctx, ['ls-files', '-u', '-z', '--', path])
  const stages = new Set<number>()
  for (const rec of ls.stdout.split('\0')) {
    const m = /^\d+ [0-9a-f]+ (\d)\t/.exec(rec)
    if (m) stages.add(Number(m[1]))
  }
  if (stages.size === 0)
    throw new AppError('NOT_FOUND', 'This file is no longer in a conflicted state.')
  const [base, ours, theirs] = await Promise.all(
    [1, 2, 3].map((s) =>
      stages.has(s) ? stageBlob(ctx, s, path) : Promise.resolve({ text: null, binary: false })
    )
  )
  const abs = insideRepo(ctx, path)
  let result: string | null = null
  let binary = !!(base!.binary || ours!.binary || theirs!.binary)
  if (existsSync(abs)) {
    const buf = await readFile(abs)
    if (buf.subarray(0, 8000).includes(0)) binary = true
    else result = buf.toString('utf8')
  }
  const type = !stages.has(2)
    ? 'deleted by us'
    : !stages.has(3)
      ? 'deleted by them'
      : !stages.has(1)
        ? 'both added'
        : 'both modified'
  const labels = await conflictLabels(ctx)
  return {
    path,
    type,
    binary,
    base: base!.text,
    ours: ours!.text,
    theirs: theirs!.text,
    result,
    oursLabel: labels.ours,
    theirsLabel: labels.theirs,
    markerCount: result ? countConflictMarkers(result) : 0
  }
}

export async function saveResolution(
  ctx: RepoCtx,
  path: string,
  content: string,
  stage: boolean
): Promise<void> {
  const abs = insideRepo(ctx, path)
  await writeFile(abs, content, 'utf8')
  if (stage) await mgit(ctx, ['add', '--', path])
}

export async function takeSide(
  ctx: RepoCtx,
  path: string,
  side: 'ours' | 'theirs' | 'delete'
): Promise<void> {
  if (side === 'delete') {
    await mgit(ctx, ['rm', '-q', '--', path])
    return
  }
  const ls = await rgit(ctx, ['ls-files', '-u', '-z', '--', path])
  const stage = side === 'ours' ? 2 : 3
  const has = ls.stdout.split('\0').some((r) => new RegExp(`^\\d+ [0-9a-f]+ ${stage}\\t`).test(r))
  if (!has) {
    // The chosen side deleted the file.
    await mgit(ctx, ['rm', '-q', '--', path])
    return
  }
  await mgit(ctx, ['checkout', `--${side}`, '--', path])
  await mgit(ctx, ['add', '--', path])
}

export async function markResolved(ctx: RepoCtx, path: string): Promise<void> {
  await mgit(ctx, ['add', '--', path])
}

export async function externalMergeTool(
  ctx: RepoCtx,
  path: string,
  tool: string,
  opId: string
): Promise<CommandResult> {
  const args = ['mergetool', '--no-prompt']
  if (tool) args.push(`--tool=${tool}`)
  args.push('--', path)
  const r = await mgit(ctx, args, { opId, okCodes: [0, 1] })
  return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode }
}

export async function externalDiffTool(
  ctx: RepoCtx,
  path: string,
  tool: string,
  staged: boolean
): Promise<void> {
  const args = ['difftool', '--no-prompt']
  if (tool) args.push(`--tool=${tool}`)
  if (staged) args.push('--cached')
  args.push('--', path)
  await rgit(ctx, args, { okCodes: [0, 1], log: true })
}
