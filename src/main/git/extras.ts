import { existsSync, realpathSync } from 'node:fs'
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApiArgs } from '@shared/api'
import type { CommandResult, OpProgress, Worktree, WorktreeStatus } from '@shared/types'
import { AppError } from '../errors'
import { git } from './runner'
import { mgit, normalizeKey, rgit, type RepoCtx } from './repo'
import { parseStatusV2, parseWorktrees } from './parse'

type Progress = (p: OpProgress) => void
const ok = (r: CommandResult): CommandResult => ({
  stdout: r.stdout,
  stderr: r.stderr,
  exitCode: r.exitCode
})

// Worktrees -------------------------------------------------------------------

export async function addWorktree(ctx: RepoCtx, a: ApiArgs<'worktree.add'>): Promise<void> {
  if (existsSync(a.path)) {
    const { readdirSync } = await import('node:fs')
    if (readdirSync(a.path).length)
      throw new AppError('VALIDATION', 'The worktree folder must be new or empty.')
  }
  const args = ['worktree', 'add']
  if (a.newBranch) args.push('-b', a.newBranch)
  args.push('--', a.path)
  if (a.ref) args.push(a.ref)
  await mgit(ctx, args)
}

/** Comparable form of a path: resolves symlinks and Windows 8.3 short names when it exists. */
function canonical(p: string): string {
  try {
    return normalizeKey(realpathSync.native(p))
  } catch {
    return normalizeKey(p)
  }
}

/** A worktree of this repository, matched by path (requests may not name arbitrary folders). */
async function findWorktree(ctx: RepoCtx, path: string): Promise<Worktree> {
  const out = await rgit(ctx, ['worktree', 'list', '--porcelain'])
  const want = canonical(path)
  const w = parseWorktrees(out.stdout).find((x) => canonical(x.path) === want)
  if (!w) throw new AppError('NOT_FOUND', 'That folder is not a worktree of this repository.')
  return w
}

/** What removing a worktree would affect: its uncommitted changes, lock and role. */
export async function worktreeStatus(ctx: RepoCtx, path: string): Promise<WorktreeStatus> {
  const w = await findWorktree(ctx, path)
  const current = canonical(w.path) === canonical(ctx.root)
  let changes: string[] = []
  if (!w.prunable && !w.bare && existsSync(w.path)) {
    const out = await git(['status', '--porcelain=v2', '-z', '--untracked-files=all'], {
      cwd: w.path,
      readOnly: true
    })
    const s = parseStatusV2(out.stdout)
    changes = [
      ...s.conflicted.map((f) => `conflict   ${f.path}`),
      ...s.staged.map((f) => `staged     ${f.path}`),
      ...s.unstaged.map((f) => `modified   ${f.path}`),
      ...s.untracked.map((f) => `untracked  ${f.path}`)
    ]
  }
  return {
    path: w.path,
    branch: w.branch,
    main: w.main,
    current,
    locked: w.locked,
    missing: w.prunable,
    changes
  }
}

export async function removeWorktree(ctx: RepoCtx, path: string, force: boolean): Promise<void> {
  const w = await findWorktree(ctx, path)
  if (w.main)
    throw new AppError(
      'VALIDATION',
      'The main worktree cannot be removed; it holds the repository.'
    )
  if (canonical(w.path) === canonical(ctx.root))
    throw new AppError(
      'VALIDATION',
      'You cannot remove the worktree you are working in. Open another worktree of this repository and remove it from there.'
    )
  const args = ['worktree', 'remove']
  // A locked worktree needs --force twice; only an explicit force request may do that.
  if (force) args.push('--force', ...(w.locked ? ['--force'] : []))
  args.push('--', w.path)
  try {
    await mgit(ctx, args)
  } catch (e) {
    if (e instanceof AppError && /modified or untracked files|use --force/i.test(e.detail ?? ''))
      throw new AppError(
        'VALIDATION',
        'The worktree has uncommitted changes, so Git refused to remove it. Commit or stash them there, or remove it with "discard changes".',
        e.detail
      )
    if (e instanceof AppError && /locked/i.test(e.detail ?? ''))
      throw new AppError(
        'VALIDATION',
        'The worktree is locked. Unlock it with "git worktree unlock", or force the removal.',
        e.detail
      )
    throw e
  }
}

export async function pruneWorktrees(ctx: RepoCtx): Promise<void> {
  await mgit(ctx, ['worktree', 'prune'])
}

// Submodules ------------------------------------------------------------------

export async function submoduleUpdate(
  ctx: RepoCtx,
  a: ApiArgs<'submodule.update'>,
  onProgress: Progress
): Promise<CommandResult> {
  const args = ['submodule', 'update', '--progress']
  if (a.init !== false) args.push('--init')
  if (a.recursive !== false) args.push('--recursive')
  return ok(await mgit(ctx, args, { opId: a.opId, onProgress }))
}

export async function submoduleSync(ctx: RepoCtx): Promise<void> {
  await mgit(ctx, ['submodule', 'sync', '--recursive'])
}

export async function submoduleAdd(
  ctx: RepoCtx,
  a: ApiArgs<'submodule.add'>,
  onProgress: Progress
): Promise<CommandResult> {
  return ok(
    await mgit(ctx, ['submodule', 'add', '--progress', '--', a.url, a.path], {
      opId: a.opId,
      onProgress
    })
  )
}

// Git LFS ---------------------------------------------------------------------

export async function lfsStatus(
  ctx: RepoCtx
): Promise<{ installed: boolean; version: string | null; tracked: string[]; files: string[] }> {
  const v = await rgit(ctx, ['lfs', 'version'], { okCodes: [0, 1, 128, 129] }).catch(() => null)
  if (!v || v.exitCode !== 0 || !/git-lfs/i.test(v.stdout))
    return { installed: false, version: null, tracked: [], files: [] }
  const track = await rgit(ctx, ['lfs', 'track'], { okCodes: [0, 1, 2] })
  const tracked = track.stdout
    .split('\n')
    .map((l) => /^\s{4}(\S.*?) \(/.exec(l)?.[1])
    .filter((x): x is string => !!x)
  const files = await rgit(ctx, ['lfs', 'ls-files', '--name-only'], { okCodes: [0, 1, 2] })
  return {
    installed: true,
    version: v.stdout.trim(),
    tracked,
    files: files.stdout.split('\n').filter(Boolean).slice(0, 5000)
  }
}

export async function lfsRun(
  ctx: RepoCtx,
  a: ApiArgs<'lfs.run'>,
  onProgress: Progress
): Promise<CommandResult> {
  const args = a.action === 'install' ? ['lfs', 'install', '--local'] : ['lfs', a.action]
  return ok(await mgit(ctx, args, { opId: a.opId, onProgress }))
}

export async function lfsTrack(ctx: RepoCtx, pattern: string, untrack: boolean): Promise<void> {
  await mgit(ctx, ['lfs', untrack ? 'untrack' : 'track', '--', pattern])
}

// .gitignore --------------------------------------------------------------------

export async function readGitignore(ctx: RepoCtx): Promise<string> {
  try {
    return await readFile(join(ctx.root, '.gitignore'), 'utf8')
  } catch {
    return ''
  }
}

export async function writeGitignore(ctx: RepoCtx, content: string): Promise<void> {
  await writeFile(join(ctx.root, '.gitignore'), content, 'utf8')
}

export async function appendGitignore(ctx: RepoCtx, pattern: string): Promise<void> {
  const file = join(ctx.root, '.gitignore')
  const current = await readGitignore(ctx)
  if (current.split(/\r?\n/).includes(pattern)) return
  await appendFile(file, (current && !current.endsWith('\n') ? '\n' : '') + pattern + '\n', 'utf8')
}

// Identity --------------------------------------------------------------------

type Identity = {
  name: string | null
  email: string | null
  signingKey: string | null
  gpgSign: boolean | null
}

async function readIdentity(cwd: string, scope: 'local' | 'global'): Promise<Identity> {
  const get = async (key: string): Promise<string | null> => {
    const r = await git(['config', `--${scope}`, '--get', key], {
      cwd,
      readOnly: true,
      okCodes: [0, 1, 128],
      log: false
    })
    return r.exitCode === 0 ? r.stdout.trim() : null
  }
  const [name, email, signingKey, gpgSign] = await Promise.all([
    get('user.name'),
    get('user.email'),
    get('user.signingkey'),
    get('commit.gpgsign')
  ])
  return { name, email, signingKey, gpgSign: gpgSign === null ? null : gpgSign === 'true' }
}

export async function getIdentity(
  ctx: RepoCtx | null,
  home: string
): Promise<{ local: Identity; global: Identity }> {
  const empty: Identity = { name: null, email: null, signingKey: null, gpgSign: null }
  return {
    local: ctx ? await readIdentity(ctx.root, 'local') : empty,
    global: await readIdentity(home, 'global')
  }
}

/** Only invoked from an explicit user action in Settings or Repository settings. */
export async function setIdentity(
  ctx: RepoCtx | null,
  home: string,
  a: ApiArgs<'config.setIdentity'>
): Promise<void> {
  if (a.scope === 'local' && !ctx)
    throw new AppError('VALIDATION', 'Open a repository to change its identity.')
  const cwd = a.scope === 'local' ? ctx!.root : home
  const set = async (key: string, value: string | null | undefined): Promise<void> => {
    if (value === undefined) return
    if (value === null || value === '') {
      await git(['config', `--${a.scope}`, '--unset', key], { cwd, okCodes: [0, 5], log: true })
    } else {
      await git(['config', `--${a.scope}`, key, value], { cwd, log: true })
    }
  }
  await set('user.name', a.name)
  await set('user.email', a.email)
  await set('user.signingkey', a.signingKey)
  if (a.gpgSign !== undefined)
    await set('commit.gpgsign', a.gpgSign === null ? null : String(a.gpgSign))
}
