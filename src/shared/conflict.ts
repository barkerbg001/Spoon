// Parsing of conflict markers written by Git into working-tree files.

export type ConflictChoice = 'ours' | 'theirs' | 'ours-theirs' | 'theirs-ours' | 'base' | 'none'

export type ConflictSegment =
  | { type: 'text'; lines: string[] }
  | {
      type: 'conflict'
      ours: string[]
      base: string[] | null
      theirs: string[]
      oursLabel: string
      theirsLabel: string
    }

const OPEN = /^<{7}(?: (.*))?$/
const BASE = /^\|{7}(?: (.*))?$/
const SEP = /^={7}$/
const CLOSE = /^>{7}(?: (.*))?$/

/** Split text into lines while keeping track of the original line ending style. */
export function splitLines(text: string): {
  lines: string[]
  eol: string
  trailingNewline: boolean
} {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const trailingNewline = text.endsWith('\n')
  const body = trailingNewline ? text.slice(0, text.endsWith('\r\n') ? -2 : -1) : text
  return { lines: body === '' && !trailingNewline ? [] : body.split(/\r?\n/), eol, trailingNewline }
}

export function parseConflicts(text: string): ConflictSegment[] {
  const { lines } = splitLines(text)
  const segments: ConflictSegment[] = []
  let textBuf: string[] = []
  let i = 0
  while (i < lines.length) {
    const open = OPEN.exec(lines[i]!)
    if (!open) {
      textBuf.push(lines[i]!)
      i++
      continue
    }
    // Try to read a complete conflict block; if it is malformed, treat it as text.
    let j = i + 1
    const ours: string[] = []
    let base: string[] | null = null
    const theirs: string[] = []
    let phase: 'ours' | 'base' | 'theirs' = 'ours'
    let closeLabel: string | null = null
    for (; j < lines.length; j++) {
      const l = lines[j]!
      if (phase === 'ours' && BASE.test(l)) {
        phase = 'base'
        base = []
        continue
      }
      if ((phase === 'ours' || phase === 'base') && SEP.test(l)) {
        phase = 'theirs'
        continue
      }
      const close = phase === 'theirs' ? CLOSE.exec(l) : null
      if (close) {
        closeLabel = close[1] ?? ''
        break
      }
      if (phase === 'ours') ours.push(l)
      else if (phase === 'base') base!.push(l)
      else theirs.push(l)
    }
    if (closeLabel === null) {
      textBuf.push(lines[i]!)
      i++
      continue
    }
    if (textBuf.length) segments.push({ type: 'text', lines: textBuf })
    textBuf = []
    segments.push({
      type: 'conflict',
      ours,
      base,
      theirs,
      oursLabel: open[1] ?? '',
      theirsLabel: closeLabel
    })
    i = j + 1
  }
  if (textBuf.length) segments.push({ type: 'text', lines: textBuf })
  return segments
}

export function countConflictMarkers(text: string): number {
  return parseConflicts(text).filter((s) => s.type === 'conflict').length
}

export function resolveSegments(
  segments: ConflictSegment[],
  choices: (ConflictChoice | undefined)[],
  eol = '\n',
  trailingNewline = true
): string {
  const out: string[] = []
  let ci = 0
  for (const s of segments) {
    if (s.type === 'text') {
      out.push(...s.lines)
      continue
    }
    const choice = choices[ci++]
    switch (choice) {
      case 'ours':
        out.push(...s.ours)
        break
      case 'theirs':
        out.push(...s.theirs)
        break
      case 'ours-theirs':
        out.push(...s.ours, ...s.theirs)
        break
      case 'theirs-ours':
        out.push(...s.theirs, ...s.ours)
        break
      case 'base':
        out.push(...(s.base ?? []))
        break
      case 'none':
        break
      default:
        out.push(`<<<<<<< ${s.oursLabel}`.trimEnd(), ...s.ours)
        if (s.base) out.push('|||||||', ...s.base)
        out.push('=======', ...s.theirs, `>>>>>>> ${s.theirsLabel}`.trimEnd())
    }
  }
  const joined = out.join(eol)
  return trailingNewline && out.length ? joined + eol : joined
}
