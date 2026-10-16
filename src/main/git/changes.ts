import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import type { ApiArgs } from '@shared/api'
import { buildPartialPatch, parseDiff } from '@shared/diff'
import type { CommandResult, DiffResult, DiffSource } from '@shared/types'
import { AppError } from '../errors'
import { isPreviewableImage } from './history'
import { mgit, rgit, type RepoCtx } from './repo'

type DiffOptions = { ignoreWhitespace?: boolean; context?: number; maxBytes?: number }

const pathList = (paths: string[]): string =>
  paths.map((p) => p.replace(/\\/g, '/')).join('\0') + '\0'

/** Resolve a repository-relative path and make sure it stays inside the working tree. */
export function insideRepo(ctx: RepoCtx, rel: string): string {
  const abs = resolve(ctx.root, rel)
  const r = relative(ctx.root, abs)
  if (!r || r.startsWith('..') || isAbsolute(r))
    throw new AppError('VALIDATION', 'Path is outside the repository.')
  return abs
}

async function hasHead(ctx: RepoCtx): Promise<boolean> {
  const r = await rgit(ctx, ['rev-parse', '--verify', '--quiet', 'HEAD'], { okCodes: [0, 1, 128] })
  return r.exitCode === 0
}

async function parentsOf(ctx: RepoCtx, hash: string): Promise<string[]> {
  const r = await rgit(ctx, ['rev-list', '--parents', '-n', '1', '--end-of-options', hash])
  return r.stdout.trim().split(' ').slice(1)
}

async function rawDiff(
  ctx: RepoCtx,
  source: DiffSource,
  o: DiffOptions
): Promise<{ stdout: string; truncated: boolean; total: number }> {
  const common = ['--no-ext-diff', '--no-color', '--no-textconv', '-M', `-U${o.context ?? 3}`]
  if (o.ignoreWhitespace) common.push('-w')
  const paths = (p: string, orig?: string): string[] => [
    '--',
    ...(orig && orig !== p ? [orig] : []),
    p
  ]
  let args: string[]
  let okCodes = [0]
  switch (source.kind) {
    case 'unstaged':
      args = ['diff', ...common, ...paths(source.path)]
      break
    case 'staged':
      args = (await hasHead(ctx))
        ? ['diff', '--cached', ...common, ...paths(source.path, source.origPath)]
        : ['diff', '--cached', ...common, ...paths(source.path)]
      break
    case 'untracked':
      insideRepo(ctx, source.path)
      args = ['diff', '--no-index', ...common, '--', '/dev/null', source.path]
      okCodes = [0, 1]
      break
    case 'commit': {
      const parents = await parentsOf(ctx, source.hash)
      args = parents.length
        ? [
            'diff',
            ...common,
            '--end-of-options',
            parents[0]!,
            source.hash,
            ...paths(source.path, source.origPath)
          ]
        : [
            'diff-tree',
            '-p',
            '-r',
            '--root',
            ...common,
            '--end-of-options',
            source.hash,
            ...paths(source.path)
          ]
      break
    }
    case 'compare':
      args =
        source.to === 'WORKTREE'
          ? [
              'diff',
              ...common,
              '--end-of-options',
              source.from,
              ...paths(source.path, source.origPath)
            ]
          : [
              'diff',
              ...common,
              '--end-of-options',
              source.from,
              source.to,
              ...paths(source.path, source.origPath)
            ]
      break
    case 'stash':
      args = [
        'diff',
        ...common,
        '--end-of-options',
        `${source.ref}^1`,
        source.ref,
        ...paths(source.path)
      ]
      break
  }
  const out = await rgit(ctx, args, { okCodes, maxBytes: o.maxBytes ?? 1_000_000 })
  return { stdout: out.stdout, truncated: out.truncated, total: out.totalBytes }
}

export async function getDiff(
  ctx: RepoCtx,
  source: DiffSource,
  o: DiffOptions
): Promise<DiffResult> {
  const raw = await rawDiff(ctx, source, o)
  const text = raw.truncated ? raw.stdout.slice(0, raw.stdout.lastIndexOf('\n') + 1) : raw.stdout
  const files = parseDiff(text)
  const file =
    files.find((f) => f.newPath === source.path || f.oldPath === source.path) ?? files[0] ?? null
  return {
    source,
    file,
    fingerprint: createHash('sha1').update(raw.stdout).digest('hex'),
    truncated: raw.truncated,
    totalBytes: raw.total,
    isImage: isPreviewableImage(source.path),
    isLarge: raw.truncated
  }
}

export async function stage(ctx: RepoCtx, paths: string[]): Promise<void> {
  await mgit(ctx, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], {
    input: pathList(paths)
  })
}

export async function stageAll(ctx: RepoCtx): Promise<void> {
  await mgit(ctx, ['add', '-A'])
}

export async function unstage(ctx: RepoCtx, paths: string[]): Promise<void> {
  if (await hasHead(ctx)) {
    await mgit(ctx, ['reset', '-q', 'HEAD', '--pathspec-from-file=-', '--pathspec-file-nul'], {
      input: pathList(paths),
      okCodes: [0, 1]
    })
  } else {
    await mgit(
      ctx,
      ['rm', '--cached', '-r', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'],
      {
        input: pathList(paths)
      }
    )
  }
}

export async function unstageAll(ctx: RepoCtx): Promise<void> {
  if (await hasHead(ctx)) await mgit(ctx, ['reset', '-q'], { okCodes: [0, 1] })
  else await mgit(ctx, ['rm', '--cached', '-r', '-q', '.'])
}

/** Discard unstaged changes to tracked files and delete the given untracked files. */
export async function discard(ctx: RepoCtx, paths: string[], untracked: string[]): Promise<void> {
  if (paths.length) {
    await mgit(ctx, ['checkout', '--pathspec-from-file=-', '--pathspec-file-nul'], {
      input: pathList(paths)
    })
  }
  for (const p of untracked) {
    const abs = insideRepo(ctx, p)
    if (existsSync(abs)) await rm(abs, { force: true, recursive: false })
  }
}

export async function applyPartial(ctx: RepoCtx, a: ApiArgs<'index.applyPartial'>): Promise<void> {
  if (a.options.ignoreWhitespace) {
    throw new AppError(
      'UNSUPPORTED',
      'Line and hunk staging is unavailable while whitespace changes are hidden. Turn off "Ignore whitespace" first.'
    )
  }
  const source: DiffSource =
    a.mode === 'unstage' ? { kind: 'staged', path: a.path } : { kind: 'unstaged', path: a.path }
  const opts = { ...a.options, maxBytes: 50_000_000 }
  const current = await getDiff(ctx, source, opts)
  if (current.fingerprint !== a.fingerprint) {
    throw new AppError(
      'STALE',
      'The file changed since the diff was displayed. The diff has been refreshed; please review your selection again.'
    )
  }
  if (!current.file || current.file.binary)
    throw new AppError('UNSUPPORTED', 'Binary files can only be staged as a whole.')
  const selected = new Set(a.selection.map(([h, l]) => `${h}:${l}`))
  let patch: string | null
  try {
    patch = buildPartialPatch(current.file, selected, a.mode === 'stage' ? 'forward' : 'reverse')
  } catch (e) {
    throw new AppError('UNSUPPORTED', (e as Error).message)
  }
  if (!patch) throw new AppError('VALIDATION', 'No changed lines were selected.')
  const args = ['apply', '--recount', '--whitespace=nowarn']
  if (a.mode !== 'discard') args.push('--cached')
  if (a.mode !== 'stage') args.push('--reverse')
  if ((a.options.context ?? 3) === 0) args.push('--unidiff-zero')
  await mgit(ctx, [...args, '--check', '-'], { input: patch, log: false })
  await mgit(ctx, [...args, '-'], { input: patch })
}

export async function commit(ctx: RepoCtx, a: ApiArgs<'commit.create'>): Promise<CommandResult> {
  const args = ['commit']
  const message = a.message.trim()
  if (!message && !a.amend) throw new AppError('VALIDATION', 'Enter a commit message.')
  if (a.amend) args.push('--amend')
  if (message) args.push('-F', '-')
  else args.push('--no-edit')
  if (a.signoff) args.push('--signoff')
  if (a.noVerify) args.push('--no-verify')
  if (a.allowEmpty) args.push('--allow-empty')
  if (a.sign === 'force') args.push('-S')
  else if (a.sign === 'never') args.push('--no-gpg-sign')
  const out = await mgit(ctx, args, { input: message ? message + '\n' : undefined })
  return { stdout: out.stdout, stderr: out.stderr, exitCode: out.exitCode }
}

export async function lastMessage(ctx: RepoCtx): Promise<string> {
  const r = await rgit(ctx, ['log', '-1', '--format=%B'], { okCodes: [0, 128] })
  return r.exitCode === 0 ? r.stdout.trimEnd() : ''
}

export async function commitTemplate(ctx: RepoCtx): Promise<string | null> {
  const r = await rgit(ctx, ['config', '--path', '--get', 'commit.template'], { okCodes: [0, 1] })
  const p = r.stdout.trim()
  if (!p) return null
  try {
    const abs = resolve(ctx.root, p)
    return (await readFile(abs, 'utf8')).slice(0, 100_000)
  } catch {
    return null
  }
}
