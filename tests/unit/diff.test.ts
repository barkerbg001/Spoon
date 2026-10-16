import { describe, expect, it } from 'vitest'
import { buildPartialPatch, countChanges, parseDiff, unquoteGitPath } from '@shared/diff'

const MODIFIED = [
  'diff --git a/src/a.txt b/src/a.txt',
  'index 1111111..2222222 100644',
  '--- a/src/a.txt',
  '+++ b/src/a.txt',
  '@@ -1,4 +1,4 @@',
  ' one',
  '-two',
  '+TWO',
  ' three',
  '-four',
  '+FOUR',
  '\\ No newline at end of file',
  ''
].join('\n')

describe('unquoteGitPath', () => {
  it('returns unquoted paths unchanged', () => {
    expect(unquoteGitPath('plain/path.txt')).toBe('plain/path.txt')
  })
  it('decodes C-style escapes and octal UTF-8 bytes', () => {
    expect(unquoteGitPath('"tab\\there"')).toBe('tab\there')
    expect(unquoteGitPath('"caf\\303\\251.txt"')).toBe('café.txt')
    expect(unquoteGitPath('"\\346\\227\\245\\346\\234\\254.md"')).toBe('日本.md')
    expect(unquoteGitPath('"quote\\"d"')).toBe('quote"d')
  })
})

describe('parseDiff', () => {
  it('parses a modified file with hunks and line numbers', () => {
    const [f] = parseDiff(MODIFIED)
    expect(f).toBeDefined()
    expect(f!.oldPath).toBe('src/a.txt')
    expect(f!.newPath).toBe('src/a.txt')
    expect(f!.status).toBe('modified')
    expect(f!.hunks).toHaveLength(1)
    const lines = f!.hunks[0]!.lines
    expect(lines.map((l) => l.type)).toEqual(['context', 'del', 'add', 'context', 'del', 'add'])
    expect(lines[2]).toMatchObject({ content: 'TWO', oldNo: null, newNo: 2 })
    expect(lines[4]).toMatchObject({ content: 'four', oldNo: 4, newNo: null })
    expect(lines[5]!.noNewline).toBe(true)
    expect(countChanges(f!)).toEqual({ add: 2, del: 2 })
  })

  it('detects added, deleted, renamed and binary files', () => {
    const text = [
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      'index 0000000..e69de29',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1 @@',
      '+hello',
      'diff --git a/old.txt b/old.txt',
      'deleted file mode 100644',
      '--- a/old.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-bye',
      'diff --git a/a.md b/b.md',
      'similarity index 90%',
      'rename from a.md',
      'rename to b.md',
      'diff --git a/img.png b/img.png',
      'index 1..2 100644',
      'Binary files a/img.png and b/img.png differ',
      ''
    ].join('\n')
    const files = parseDiff(text)
    expect(files.map((f) => f.status)).toEqual(['added', 'deleted', 'renamed', 'modified'])
    expect(files[0]!.oldPath).toBe('new.txt')
    expect(files[1]!.newPath).toBe('old.txt')
    expect(files[2]).toMatchObject({ oldPath: 'a.md', newPath: 'b.md', similarity: 90 })
    expect(files[3]).toMatchObject({ binary: true, oldPath: 'img.png', newPath: 'img.png' })
  })
})

describe('buildPartialPatch', () => {
  const file = parseDiff(MODIFIED)[0]!

  it('stages only selected lines (forward)', () => {
    const patch = buildPartialPatch(file, new Set(['0:1', '0:2']), 'forward')!
    expect(patch).toContain('@@ -1,4 +1,4 @@')
    expect(patch).toContain('-two\n+TWO\n three\n four\n')
    expect(patch).not.toContain('+FOUR')
  })

  it('drops unselected additions and keeps unselected deletions as context (forward)', () => {
    const patch = buildPartialPatch(file, new Set(['0:5']), 'forward')!
    expect(patch).toContain('@@ -1,4 +1,5 @@')
    expect(patch).toContain(' two\n three\n four\n+FOUR\n')
  })

  it('builds reverse patches for unstage/discard', () => {
    const patch = buildPartialPatch(file, new Set(['0:2']), 'reverse')!
    expect(patch).toContain('+TWO')
    expect(patch).not.toContain('-two')
    expect(patch).toContain(' FOUR')
  })

  it('returns null when nothing is selected', () => {
    expect(buildPartialPatch(file, new Set(), 'forward')).toBeNull()
    expect(buildPartialPatch(file, new Set(['0:0']), 'forward')).toBeNull()
  })

  it('refuses partial selection of a new file', () => {
    const added = parseDiff(
      [
        'diff --git a/n b/n',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/n',
        '@@ -0,0 +1,2 @@',
        '+a',
        '+b',
        ''
      ].join('\n')
    )[0]!
    expect(() => buildPartialPatch(added, new Set(['0:0']), 'forward')).toThrow(/new file/)
    expect(buildPartialPatch(added, new Set(['0:0', '0:1']), 'forward')).toContain('new file mode')
  })
})
