import type {
  BlameLine,
  Branch,
  Commit,
  CommitFile,
  FileChange,
  RefLabel,
  ReflogEntry,
  RepoHead,
  Submodule,
  Tag,
  TreeEntry,
  Worktree
} from '@shared/types'

const CONFLICT_NAMES: Record<string, string> = {
  DD: 'both deleted',
  AU: 'added by us',
  UD: 'deleted by them',
  UA: 'added by them',
  DU: 'deleted by us',
  AA: 'both added',
  UU: 'both modified'
}

export interface ParsedStatus {
  head: RepoHead
  staged: FileChange[]
  unstaged: FileChange[]
  untracked: FileChange[]
  conflicted: FileChange[]
}

/** Parse `git status --porcelain=v2 --branch -z`. */
export function parseStatusV2(out: string): ParsedStatus {
  const head: RepoHead = {
    branch: null,
    detached: false,
    oid: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    unborn: false
  }
  const staged: FileChange[] = []
  const unstaged: FileChange[] = []
  const untracked: FileChange[] = []
  const conflicted: FileChange[] = []
  const tokens = out.split('\0')
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (!t) continue
    if (t.startsWith('# ')) {
      const [, key, ...rest] = t.split(' ')
      const value = rest.join(' ')
      if (key === 'branch.oid') {
        head.oid = value === '(initial)' ? null : value
        head.unborn = value === '(initial)'
      } else if (key === 'branch.head') {
        head.detached = value === '(detached)'
        head.branch = head.detached ? null : value
      } else if (key === 'branch.upstream') head.upstream = value
      else if (key === 'branch.ab') {
        const m = /\+(\d+) -(\d+)/.exec(value)
        if (m) {
          head.ahead = Number(m[1])
          head.behind = Number(m[2])
        }
      }
      continue
    }
    const type = t[0]
    if (type === '?') {
      untracked.push({ path: t.slice(2), index: '?', worktree: '?', kind: 'untracked' })
      continue
    }
    if (type === '!') continue
    if (type === '1' || type === '2') {
      const fieldCount = type === '1' ? 8 : 9
      const parts = splitN(t, ' ', fieldCount)
      const xy = parts[1]!
      const sub = parts[2]!.startsWith('S')
      const path = parts[fieldCount]!
      let origPath: string | undefined
      if (type === '2') origPath = tokens[++i]
      const x = xy[0]!
      const y = xy[1]!
      if (x !== '.')
        staged.push({ path, origPath, index: x, worktree: y, kind: 'staged', submodule: sub })
      if (y !== '.')
        unstaged.push({
          path,
          origPath: undefined,
          index: x,
          worktree: y,
          kind: 'unstaged',
          submodule: sub
        })
      continue
    }
    if (type === 'u') {
      const parts = splitN(t, ' ', 10)
      const xy = parts[1]!
      conflicted.push({
        path: parts[10]!,
        index: xy[0]!,
        worktree: xy[1]!,
        kind: 'conflicted',
        conflict: CONFLICT_NAMES[xy] ?? 'conflict'
      })
    }
  }
  return { head, staged, unstaged, untracked, conflicted }
}

/** Split into at most n+1 parts: n separator-delimited fields and the remainder. */
function splitN(s: string, sep: string, n: number): string[] {
  const parts: string[] = []
  let start = 0
  for (let k = 0; k < n; k++) {
    const idx = s.indexOf(sep, start)
    if (idx === -1) break
    parts.push(s.slice(start, idx))
    start = idx + 1
  }
  parts.push(s.slice(start))
  return parts
}

export const LOG_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%D%x1f%s'

export function parseDecorations(d: string): RefLabel[] {
  if (!d.trim()) return []
  const refs: RefLabel[] = []
  for (let part of d.split(', ')) {
    part = part.trim()
    if (part.startsWith('HEAD -> ')) {
      refs.push({ name: 'HEAD', type: 'head' })
      part = part.slice(8)
    }
    if (part === 'HEAD') refs.push({ name: 'HEAD', type: 'head' })
    else if (part.startsWith('tag: '))
      refs.push({ name: part.slice(5).replace(/^refs\/tags\//, ''), type: 'tag' })
    else if (part.startsWith('refs/heads/')) refs.push({ name: part.slice(11), type: 'local' })
    else if (part.startsWith('refs/remotes/')) {
      const name = part.slice(13)
      if (!name.endsWith('/HEAD')) refs.push({ name, type: 'remote' })
    } else if (part === 'refs/stash') refs.push({ name: 'stash', type: 'stash' })
    else if (part) refs.push({ name: part.replace(/^refs\//, ''), type: 'other' })
  }
  return refs
}

/** Parse `git log -z --format=LOG_FORMAT`. */
export function parseLog(out: string): Commit[] {
  const commits: Commit[] = []
  for (const rec of out.split('\0')) {
    const r = rec.replace(/^\n/, '')
    if (!r) continue
    const f = r.split('\x1f')
    if (f.length < 9) continue
    commits.push({
      hash: f[0]!,
      parents: f[1] ? f[1].split(' ') : [],
      authorName: f[2]!,
      authorEmail: f[3]!,
      authorTime: Number(f[4]),
      committerName: f[5]!,
      committerTime: Number(f[6]),
      refs: parseDecorations(f[7]!),
      subject: f.slice(8).join('\x1f')
    })
  }
  return commits
}

export const BRANCH_FORMAT =
  '%(refname)%1f%(objectname)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(HEAD)%1f%(committerdate:unix)%1f%(contents:subject)'

export function parseBranches(out: string): Branch[] {
  const list: Branch[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const f = line.split('\x1f')
    const fullName = f[0]!
    if (fullName.endsWith('/HEAD')) continue
    const track = f[3] ?? ''
    const ahead = /ahead (\d+)/.exec(track)
    const behind = /behind (\d+)/.exec(track)
    list.push({
      fullName,
      name: fullName.replace(/^refs\/(heads|remotes)\//, ''),
      hash: f[1]!,
      upstream: f[2] || null,
      upstreamGone: track === 'gone',
      ahead: ahead ? Number(ahead[1]) : 0,
      behind: behind ? Number(behind[1]) : 0,
      current: f[4] === '*',
      date: Number(f[5]) || 0,
      subject: f.slice(6).join('\x1f')
    })
  }
  return list
}

export const TAG_FORMAT =
  '%(refname:strip=2)%1f%(objectname)%1f%(*objectname)%1f%(objecttype)%1f%(creatordate:unix)%1f%(contents:subject)'

export function parseTags(out: string): Tag[] {
  const list: Tag[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const f = line.split('\x1f')
    const annotated = f[3] === 'tag'
    list.push({
      name: f[0]!,
      hash: f[1]!,
      target: annotated && f[2] ? f[2] : f[1]!,
      annotated,
      date: Number(f[4]) || 0,
      subject: f.slice(5).join('\x1f')
    })
  }
  return list
}

/** Parse `git worktree list --porcelain` (2.36+ supports -z; we parse the line format). */
export function parseWorktrees(out: string): Worktree[] {
  const list: Worktree[] = []
  let cur: Worktree | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = {
        path: line.slice(9),
        head: null,
        branch: null,
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
        main: list.length === 0
      }
      list.push(cur)
    } else if (!cur) continue
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5)
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
    else if (line === 'bare') cur.bare = true
    else if (line === 'detached') cur.detached = true
    else if (line.startsWith('locked')) cur.locked = true
    else if (line.startsWith('prunable')) cur.prunable = true
  }
  return list
}

export function parseSubmodules(out: string): Submodule[] {
  const list: Submodule[] = []
  for (const line of out.split('\n')) {
    const m = /^([ \-+U])([0-9a-f]+) (.+?)(?: \((.*)\))?$/.exec(line)
    if (!m) continue
    list.push({ state: m[1] as Submodule['state'], hash: m[2]!, path: m[3]!, describe: m[4] ?? '' })
  }
  return list
}

/** Parse `git diff --numstat -z` combined with `--name-status -z` output. */
export function parseNameStatus(out: string): CommitFile[] {
  const tokens = out.split('\0')
  const files: CommitFile[] = []
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i]
    if (!status) continue
    const code = status[0]!
    if (code === 'R' || code === 'C') {
      const origPath = tokens[++i]!
      const path = tokens[++i]!
      files.push({ status: code, origPath, path, additions: null, deletions: null, binary: false })
    } else {
      const path = tokens[++i]!
      files.push({ status: code, path, additions: null, deletions: null, binary: false })
    }
  }
  return files
}

export function applyNumstat(files: CommitFile[], out: string): CommitFile[] {
  const tokens = out.split('\0')
  const byPath = new Map(files.map((f) => [f.path, f]))
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    const m = /^(\S+)\t(\S+)\t(.*)$/s.exec(t)
    if (!m) continue
    let path = m[3]!
    if (path === '') {
      // rename: next two tokens are old and new path
      i++
      path = tokens[++i] ?? ''
    }
    const f = byPath.get(path)
    if (!f) continue
    if (m[1] === '-') {
      f.binary = true
    } else {
      f.additions = Number(m[1])
      f.deletions = Number(m[2])
    }
  }
  return files
}

/** Parse `git blame --porcelain`. */
export function parseBlame(out: string): BlameLine[] {
  const lines = out.split('\n')
  const info = new Map<string, { author: string; authorTime: number; summary: string }>()
  const result: BlameLine[] = []
  let current: { hash: string; line: number } | null = null
  for (const l of lines) {
    const header = /^([0-9a-f]{40,64}) \d+ (\d+)/.exec(l)
    if (header) {
      current = { hash: header[1]!, line: Number(header[2]) }
      if (!info.has(current.hash))
        info.set(current.hash, { author: '', authorTime: 0, summary: '' })
      continue
    }
    if (!current) continue
    const meta = info.get(current.hash)!
    if (l.startsWith('author ')) meta.author = l.slice(7)
    else if (l.startsWith('author-time ')) meta.authorTime = Number(l.slice(12))
    else if (l.startsWith('summary ')) meta.summary = l.slice(8)
    else if (l.startsWith('\t')) {
      result.push({
        hash: current.hash,
        line: current.line,
        content: l.slice(1),
        author: '',
        authorTime: 0,
        summary: ''
      })
      current = null
    }
  }
  for (const r of result) Object.assign(r, info.get(r.hash))
  return result
}

/** Parse `git ls-tree -z -l`. */
export function parseLsTree(out: string): TreeEntry[] {
  const list: TreeEntry[] = []
  for (const rec of out.split('\0')) {
    if (!rec) continue
    const m = /^(\d+) (blob|tree|commit) ([0-9a-f]+)\s+(-|\d+)\t(.*)$/s.exec(rec)
    if (!m) continue
    const path = m[5]!
    list.push({
      mode: m[1]!,
      type: m[2] as TreeEntry['type'],
      hash: m[3]!,
      size: m[4] === '-' ? null : Number(m[4]),
      path,
      name: path.split('/').pop() ?? path
    })
  }
  return list.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1
  )
}

export function parseReflog(out: string): ReflogEntry[] {
  const list: ReflogEntry[] = []
  for (const rec of out.split('\0')) {
    const r = rec.replace(/^\n/, '')
    if (!r) continue
    const f = r.split('\x1f')
    list.push({
      hash: f[0]!,
      selector: f[1]!,
      date: Number(f[2]),
      subject: f.slice(3).join('\x1f')
    })
  }
  return list
}
