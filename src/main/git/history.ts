import { readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { ApiArgs } from '@shared/api'
import type {
  BlameLine,
  BlobContent,
  Commit,
  CommitDetails,
  CommitFile,
  FileLogEntry,
  ReflogEntry,
  TreeEntry
} from '@shared/types'
import { AppError } from '../errors'
import { rgit, type RepoCtx } from './repo'
import {
  LOG_FORMAT,
  applyNumstat,
  parseBlame,
  parseDecorations,
  parseLog,
  parseLsTree,
  parseNameStatus,
  parseReflog
} from './parse'

export async function log(
  ctx: RepoCtx,
  a: ApiArgs<'history.log'>
): Promise<{ commits: Commit[]; hasMore: boolean }> {
  const limit = a.limit ?? 500
  const skip = a.skip ?? 0
  const s = a.search
  if (s?.hash) {
    const r = await rgit(ctx, ['rev-parse', '--verify', '--quiet', `${s.hash}^{commit}`], {
      okCodes: [0, 1, 128]
    })
    const full = r.stdout.trim()
    if (!full || skip > 0) return { commits: [], hasMore: false }
    const one = await rgit(ctx, [
      'log',
      '-z',
      '-n',
      '1',
      `--format=${LOG_FORMAT}`,
      '--decorate=full',
      full
    ])
    return { commits: parseLog(one.stdout), hasMore: false }
  }
  const args = [
    'log',
    '-z',
    `--format=${LOG_FORMAT}`,
    '--decorate=full',
    '--topo-order',
    `--skip=${skip}`,
    `-n`,
    String(limit)
  ]
  if (s?.text) args.push(`--grep=${s.text}`, '-i', '--fixed-strings')
  if (s?.author) args.push(`--author=${s.author}`, '-i', '--fixed-strings')
  if (s?.since) args.push(`--since=${s.since}`)
  if (s?.until) args.push(`--until=${s.until} 23:59:59`)
  if (a.refs?.length) args.push('--end-of-options', ...a.refs)
  else if (a.allRefs !== false) args.push('--exclude=refs/stash', '--all', 'HEAD')
  else args.push('HEAD')
  args.push('--')
  if (s?.path) args.push(s.path)
  const out = await rgit(ctx, args, { okCodes: [0, 128] })
  if (out.exitCode === 128) {
    // Unborn HEAD (no commits yet) is a normal state, not an error.
    if (/does not have any commits|unknown revision|bad (default )?revision/i.test(out.stderr))
      return { commits: [], hasMore: false }
    throw new AppError('GIT_FAILED', out.stderr.trim())
  }
  const commits = parseLog(out.stdout)
  return { commits, hasMore: commits.length === limit }
}

async function filesBetween(
  ctx: RepoCtx,
  from: string | null,
  to: string | null,
  root = false
): Promise<CommitFile[]> {
  const range = [from, to].filter((x): x is string => !!x)
  const base = root ? ['diff-tree', '-r', '--root', '--no-commit-id', '-M'] : ['diff', '-M']
  const ns = await rgit(ctx, [...base, '--name-status', '-z', '--end-of-options', ...range, '--'])
  const files = parseNameStatus(ns.stdout)
  if (files.length > 5000) return files
  const num = await rgit(ctx, [...base, '--numstat', '-z', '--end-of-options', ...range, '--'])
  return applyNumstat(files, num.stdout)
}

export async function commitDetails(ctx: RepoCtx, hash: string): Promise<CommitDetails> {
  const fmt = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ce%x1f%ct%x1f%D%x1f%B'
  const out = await rgit(ctx, [
    'show',
    '-s',
    `--format=${fmt}`,
    '--decorate=full',
    '--end-of-options',
    hash
  ])
  const f = out.stdout.split('\x1f')
  const parents = f[1] ? f[1].split(' ') : []
  const full = f[0]!
  const files =
    parents.length === 0
      ? await filesBetween(ctx, null, full, true)
      : await filesBetween(ctx, parents[0]!, full)
  const raw = await rgit(ctx, ['cat-file', 'commit', full])
  const signed = /^gpgsig(-sha256)? /m.test(raw.stdout.split('\n\n')[0] ?? '')
  return {
    hash: full,
    parents,
    authorName: f[2]!,
    authorEmail: f[3]!,
    authorTime: Number(f[4]),
    committerName: f[5]!,
    committerEmail: f[6]!,
    committerTime: Number(f[7]),
    refs: parseDecorations(f[8]!),
    message: f.slice(9).join('\x1f').trimEnd(),
    files,
    signature: signed ? 'Signed (signature not verified by Spoon)' : null
  }
}

export function compareFiles(ctx: RepoCtx, from: string, to: string | null): Promise<CommitFile[]> {
  return filesBetween(ctx, from, to)
}

export async function fileLog(ctx: RepoCtx, path: string, limit: number): Promise<FileLogEntry[]> {
  const [out, names] = await Promise.all([
    rgit(
      ctx,
      [
        'log',
        '-z',
        `--format=${LOG_FORMAT}`,
        '--decorate=full',
        '--follow',
        '-n',
        String(limit),
        '--',
        path
      ],
      { okCodes: [0, 128] }
    ),
    rgit(
      ctx,
      [
        'log',
        '-z',
        '--format=%x1e%H',
        '--name-status',
        '--follow',
        '-n',
        String(limit),
        '--',
        path
      ],
      { okCodes: [0, 128] }
    )
  ])
  // Path of the file in each commit, so renamed files show the right diff further back in history.
  const paths = new Map<string, { path: string; origPath?: string }>()
  for (const rec of names.stdout.split('\x1e')) {
    const tokens = rec
      .split('\0')
      .map((t) => t.replace(/^\n+|\n+$/g, ''))
      .filter(Boolean)
    const [hash, status, a, b] = tokens
    if (!hash || !status || !a) continue
    paths.set(hash, /^[RC]/.test(status) && b ? { path: b, origPath: a } : { path: a })
  }
  return parseLog(out.stdout).map((c) => ({ ...c, ...(paths.get(c.hash) ?? { path }) }))
}

export async function blame(ctx: RepoCtx, path: string, rev?: string): Promise<BlameLine[]> {
  const args = ['blame', '--porcelain']
  if (rev) args.push('--end-of-options', rev)
  args.push('--', path)
  const out = await rgit(ctx, args, { maxBytes: 50_000_000 })
  return parseBlame(out.stdout)
}

export async function tree(ctx: RepoCtx, rev: string, path?: string): Promise<TreeEntry[]> {
  const treeish = path ? `${rev}:${path.replace(/\\/g, '/')}` : `${rev}^{tree}`
  const out = await rgit(ctx, ['ls-tree', '-z', '-l', '--end-of-options', treeish])
  return parseLsTree(out.stdout).map((e) => ({ ...e, path: path ? `${path}/${e.name}` : e.name }))
}

export async function reflog(ctx: RepoCtx, ref: string, limit: number): Promise<ReflogEntry[]> {
  const out = await rgit(
    ctx,
    [
      'reflog',
      'show',
      '-z',
      '--format=%H%x1f%gd%x1f%ct%x1f%gs',
      '-n',
      String(limit),
      '--end-of-options',
      ref
    ],
    {
      okCodes: [0, 128]
    }
  )
  return parseReflog(out.stdout)
}

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif'
}
const MAX_TEXT = 5_000_000
const MAX_IMAGE = 20_000_000

export const isPreviewableImage = (path: string): boolean =>
  extname(path).toLowerCase() in IMAGE_TYPES

function classify(path: string, buf: Buffer): BlobContent {
  const mime = IMAGE_TYPES[extname(path).toLowerCase()]
  if (mime) {
    if (buf.length > MAX_IMAGE) return { kind: 'too-large', size: buf.length }
    return {
      kind: 'image',
      dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
      size: buf.length
    }
  }
  if (buf.subarray(0, 8000).includes(0)) return { kind: 'binary', size: buf.length }
  if (buf.length > MAX_TEXT) return { kind: 'too-large', size: buf.length }
  return { kind: 'text', text: buf.toString('utf8'), size: buf.length }
}

/** rev may be a revision, ":" (index), ":1"/":2"/":3" (conflict stages) or "WORKTREE". */
export async function blob(ctx: RepoCtx, rev: string, path: string): Promise<BlobContent> {
  if (rev === 'WORKTREE') {
    const abs = join(ctx.root, path)
    try {
      const st = await stat(abs)
      if (st.size > MAX_IMAGE) return { kind: 'too-large', size: st.size }
      return classify(path, await readFile(abs))
    } catch {
      return { kind: 'missing', size: 0 }
    }
  }
  const spec = rev.startsWith(':') ? `${rev === ':' ? '' : rev}:${path}` : `${rev}:${path}`
  const size = await rgit(ctx, ['cat-file', '-s', spec], { okCodes: [0, 128] })
  if (size.exitCode !== 0) return { kind: 'missing', size: 0 }
  const n = Number(size.stdout.trim())
  if (n > MAX_IMAGE) return { kind: 'too-large', size: n }
  const out = await rgit(ctx, ['cat-file', 'blob', spec], { binary: true })
  return classify(path, out.raw ?? Buffer.alloc(0))
}
