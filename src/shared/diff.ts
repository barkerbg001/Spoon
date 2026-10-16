import type { DiffFile, DiffHunk, DiffLine } from './types'

/** Unquote a path that Git emitted in C-style quotes ("a\tb", octal escapes for UTF-8 bytes). */
export function unquoteGitPath(input: string): string {
  if (!input.startsWith('"') || !input.endsWith('"')) return input
  const body = input.slice(1, -1)
  const bytes: number[] = []
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!
    if (ch !== '\\') {
      bytes.push(...new TextEncoder().encode(ch))
      continue
    }
    const next = body[++i]
    if (next === undefined) break
    if (/[0-7]/.test(next)) {
      const oct = body.slice(i, i + 3)
      bytes.push(parseInt(oct, 8))
      i += 2
      continue
    }
    const map: Record<string, number> = {
      n: 10,
      t: 9,
      r: 13,
      '"': 34,
      '\\': 92,
      a: 7,
      b: 8,
      f: 12,
      v: 11
    }
    bytes.push(map[next] ?? next.charCodeAt(0))
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function stripPrefix(p: string): string {
  const u = unquoteGitPath(p)
  if (u === '/dev/null') return u
  return u.replace(/^[ab]\//, '')
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/** Parse the output of `git diff` for (typically) a single file. Returns one entry per file. */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  const lines = text.split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  let file: DiffFile | null = null
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0
  let inHeader = false

  for (const raw of lines) {
    if (
      raw.startsWith('diff --git ') ||
      raw.startsWith('diff --cc ') ||
      raw.startsWith('diff --combined ')
    ) {
      file = {
        oldPath: '',
        newPath: '',
        status: 'modified',
        binary: false,
        hunks: [],
        headerLines: [raw]
      }
      files.push(file)
      hunk = null
      inHeader = true
      continue
    }
    if (!file) continue
    if (inHeader) {
      if (raw.startsWith('@@')) {
        inHeader = false
      } else {
        file.headerLines.push(raw)
        if (raw.startsWith('--- ')) file.oldPath = stripPrefix(raw.slice(4))
        else if (raw.startsWith('+++ ')) file.newPath = stripPrefix(raw.slice(4))
        else if (raw.startsWith('new file mode ')) {
          file.status = 'added'
          file.newMode = raw.slice(14)
        } else if (raw.startsWith('deleted file mode ')) {
          file.status = 'deleted'
          file.oldMode = raw.slice(18)
        } else if (raw.startsWith('old mode ')) file.oldMode = raw.slice(9)
        else if (raw.startsWith('new mode ')) {
          file.newMode = raw.slice(9)
          if (file.status === 'modified') file.status = 'modified'
        } else if (raw.startsWith('rename from ')) {
          file.status = 'renamed'
          file.oldPath = unquoteGitPath(raw.slice(12))
        } else if (raw.startsWith('rename to ')) file.newPath = unquoteGitPath(raw.slice(10))
        else if (raw.startsWith('copy from ')) {
          file.status = 'copied'
          file.oldPath = unquoteGitPath(raw.slice(10))
        } else if (raw.startsWith('copy to ')) file.newPath = unquoteGitPath(raw.slice(8))
        else if (raw.startsWith('similarity index ')) file.similarity = parseInt(raw.slice(17), 10)
        else if (raw.startsWith('Binary files ') || raw === 'GIT binary patch') file.binary = true
        continue
      }
    }
    const m = HUNK_RE.exec(raw)
    if (m) {
      hunk = {
        header: raw,
        oldStart: parseInt(m[1]!, 10),
        oldLines: m[2] === undefined ? 1 : parseInt(m[2], 10),
        newStart: parseInt(m[3]!, 10),
        newLines: m[4] === undefined ? 1 : parseInt(m[4], 10),
        lines: []
      }
      oldNo = hunk.oldStart
      newNo = hunk.newStart
      file.hunks.push(hunk)
      continue
    }
    if (!hunk) continue
    const tag = raw[0]
    const content = raw.slice(1)
    let line: DiffLine | null = null
    if (tag === ' ') line = { type: 'context', content, oldNo: oldNo++, newNo: newNo++ }
    else if (tag === '+') line = { type: 'add', content, oldNo: null, newNo: newNo++ }
    else if (tag === '-') line = { type: 'del', content, oldNo: oldNo++, newNo: null }
    else if (tag === '\\') {
      const prev = hunk.lines[hunk.lines.length - 1]
      if (prev) prev.noNewline = true
      continue
    } else if (raw === '') line = { type: 'context', content: '', oldNo: oldNo++, newNo: newNo++ }
    if (line) hunk.lines.push(line)
  }

  for (const f of files) {
    if (!f.oldPath && !f.newPath) {
      // Binary or mode-only diffs have no ---/+++ lines; fall back to the "diff --git" line.
      const g = /^diff --git (?:"?a\/)(.+?)"? (?:"?b\/)(.+?)"?$/.exec(f.headerLines[0] ?? '')
      if (g) {
        f.oldPath = g[1]!
        f.newPath = g[2]!
      }
    }
    if (f.oldPath === '/dev/null') f.oldPath = f.newPath
    if (f.newPath === '/dev/null') f.newPath = f.oldPath
    if (f.oldMode && f.newMode && f.oldMode !== f.newMode && /^120000|^160000/.test(f.newMode)) {
      f.status = 'typechange'
    }
  }
  return files
}

export type PatchDirection = 'forward' | 'reverse'

/**
 * Build a patch containing only the selected change lines of `file`.
 *
 * forward: used with `git apply --cached` to stage lines from an index→worktree diff.
 *   Unselected additions are dropped; unselected deletions become context.
 * reverse: used with `git apply --reverse` to unstage (on a HEAD→index diff) or discard
 *   (on an index→worktree diff). Unselected additions become context; unselected deletions are dropped.
 *
 * `selected` holds keys `${hunkIndex}:${lineIndex}`.
 */
export function buildPartialPatch(
  file: DiffFile,
  selected: Set<string>,
  direction: PatchDirection
): string | null {
  const allChangeKeys: string[] = []
  file.hunks.forEach((h, hi) =>
    h.lines.forEach((l, li) => {
      if (l.type === 'add' || l.type === 'del') allChangeKeys.push(`${hi}:${li}`)
    })
  )
  const selectedChanges = allChangeKeys.filter((k) => selected.has(k))
  if (selectedChanges.length === 0) return null
  const partial = selectedChanges.length !== allChangeKeys.length

  let header = file.headerLines.slice()
  if (partial && (file.status === 'added' || file.status === 'deleted')) {
    if (direction === 'reverse' && file.status === 'added') {
      throw new Error(
        'Selecting individual lines of a newly added file is not supported here. Use the whole file instead.'
      )
    }
    if (direction === 'forward' && file.status === 'added') {
      throw new Error(
        'Selecting individual lines of a new file is not supported. Stage the whole file instead.'
      )
    }
    // A partially staged deletion becomes a modification of the existing file.
    const path = file.oldPath
    header = header
      .filter((l) => !l.startsWith('deleted file mode') && !l.startsWith('new file mode'))
      .map((l) =>
        l.startsWith('+++ ') ? `+++ b/${path}` : l.startsWith('--- ') ? `--- a/${path}` : l
      )
  }

  const out: string[] = [...header]
  let delta = 0
  file.hunks.forEach((h, hi) => {
    const body: string[] = []
    let oldCount = 0
    let newCount = 0
    let hasChange = false
    h.lines.forEach((l, li) => {
      const isSel = selected.has(`${hi}:${li}`)
      let tag: ' ' | '+' | '-' | null = null
      if (l.type === 'context') tag = ' '
      else if (l.type === 'add') tag = isSel ? '+' : direction === 'forward' ? null : ' '
      else if (l.type === 'del') tag = isSel ? '-' : direction === 'forward' ? ' ' : null
      if (tag === null) return
      if (tag !== ' ') hasChange = true
      if (tag !== '+') oldCount++
      if (tag !== '-') newCount++
      body.push(tag + l.content)
      if (l.noNewline) body.push('\\ No newline at end of file')
    })
    if (!hasChange) return
    let oldStart: number
    let newStart: number
    if (direction === 'forward') {
      oldStart = h.oldStart
      newStart = h.oldStart + delta
    } else {
      newStart = h.newStart
      oldStart = h.newStart - delta
    }
    if (oldCount === 0 && oldStart > 0 && direction === 'reverse')
      oldStart = Math.max(0, oldStart - 1)
    if (newCount === 0 && direction === 'forward') newStart = Math.max(0, newStart - 1)
    delta += newCount - oldCount
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`)
    out.push(...body)
  })
  if (out.length === header.length) return null
  return out.join('\n') + '\n'
}

export function countChanges(file: DiffFile | null): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const h of file?.hunks ?? [])
    for (const l of h.lines) {
      if (l.type === 'add') add++
      else if (l.type === 'del') del++
    }
  return { add, del }
}
