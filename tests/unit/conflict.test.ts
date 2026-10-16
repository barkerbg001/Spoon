import { describe, expect, it } from 'vitest'
import { countConflictMarkers, parseConflicts, resolveSegments, splitLines } from '@shared/conflict'

const TEXT = [
  'header',
  '<<<<<<< HEAD',
  'ours 1',
  '||||||| base',
  'base 1',
  '=======',
  'theirs 1',
  '>>>>>>> feature',
  'middle',
  '<<<<<<< HEAD',
  'ours 2',
  '=======',
  'theirs 2',
  '>>>>>>> feature',
  'footer',
  ''
].join('\n')

describe('conflict parsing', () => {
  it('splits text and conflict segments, including diff3 base', () => {
    const segs = parseConflicts(TEXT)
    expect(segs.map((s) => s.type)).toEqual(['text', 'conflict', 'text', 'conflict', 'text'])
    const c = segs[1]!
    if (c.type !== 'conflict') throw new Error('expected conflict')
    expect(c).toMatchObject({
      ours: ['ours 1'],
      base: ['base 1'],
      theirs: ['theirs 1'],
      oursLabel: 'HEAD',
      theirsLabel: 'feature'
    })
    const c2 = segs[3]!
    if (c2.type !== 'conflict') throw new Error('expected conflict')
    expect(c2.base).toBeNull()
    expect(countConflictMarkers(TEXT)).toBe(2)
  })

  it('treats unterminated markers as plain text', () => {
    const t = 'a\n<<<<<<< HEAD\nb\n'
    expect(parseConflicts(t)).toEqual([{ type: 'text', lines: ['a', '<<<<<<< HEAD', 'b'] }])
    expect(countConflictMarkers(t)).toBe(0)
  })

  it('resolves with per-conflict choices', () => {
    const segs = parseConflicts(TEXT)
    expect(resolveSegments(segs, ['ours', 'theirs'])).toBe(
      'header\nours 1\nmiddle\ntheirs 2\nfooter\n'
    )
    expect(resolveSegments(segs, ['ours-theirs', 'theirs-ours'])).toBe(
      'header\nours 1\ntheirs 1\nmiddle\ntheirs 2\nours 2\nfooter\n'
    )
    expect(resolveSegments(segs, ['base', 'none'])).toBe('header\nbase 1\nmiddle\nfooter\n')
  })

  it('keeps unresolved conflicts as markers', () => {
    const segs = parseConflicts(TEXT)
    const out = resolveSegments(segs, ['ours', undefined])
    expect(countConflictMarkers(out)).toBe(1)
    expect(out).toContain('<<<<<<< HEAD\nours 2\n=======\ntheirs 2\n>>>>>>> feature')
  })

  it('preserves CRLF line endings and missing trailing newline', () => {
    const crlf = 'a\r\n<<<<<<< HEAD\r\nx\r\n=======\r\ny\r\n>>>>>>> b\r\nz'
    const { eol, trailingNewline } = splitLines(crlf)
    expect(eol).toBe('\r\n')
    expect(trailingNewline).toBe(false)
    expect(resolveSegments(parseConflicts(crlf), ['theirs'], eol, trailingNewline)).toBe(
      'a\r\ny\r\nz'
    )
  })
})
