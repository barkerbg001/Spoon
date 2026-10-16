import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn() }
}))

const { redact } = await import('../../src/main/redact')
const { isTrustedUrl } = await import('../../src/main/ipc')
const { isSafeExternalUrl, tokenize } = await import('../../src/main/launch')
const { classifyGitError } = await import('../../src/main/errors')

describe('redact', () => {
  it('removes credentials embedded in URLs', () => {
    expect(redact('fatal: unable to access https://user:s3cret@example.com/r.git/')).toBe(
      'fatal: unable to access https://***@example.com/r.git/'
    )
    expect(redact('https://ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/o/r')).not.toContain(
      'ghp_'
    )
  })
  it('removes tokens and authorization headers', () => {
    expect(redact('token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 used')).toBe('token *** used')
    expect(redact('glpat-abcdefghijklmnop1234')).toBe('***')
    expect(redact('Authorization: Bearer abc.def.ghi')).toBe('Authorization: Bearer ***')
    expect(redact('-c http.extraheader=Authorization: Basic Zm9vOmJhcg==')).not.toContain('Zm9v')
    expect(redact('username=me\npassword=hunter2\n')).toBe('username=me\npassword=***\n')
  })
  it('leaves ordinary output alone', () => {
    const s = 'To github.com:o/r.git\n   abc123..def456  main -> main'
    expect(redact(s)).toBe(s)
  })
})

describe('isTrustedUrl', () => {
  const file = 'C:\\app\\out\\renderer\\index.html'
  it('accepts the bundled renderer file and the dev server origin only', () => {
    expect(isTrustedUrl('file:///C:/app/out/renderer/index.html', undefined, file)).toBe(true)
    expect(isTrustedUrl('file:///C:/app/out/renderer/index.html#x', undefined, file)).toBe(true)
    expect(isTrustedUrl('file:///C:/repo/evil.html', undefined, file)).toBe(false)
    expect(isTrustedUrl('http://localhost:5173/', 'http://localhost:5173', file)).toBe(true)
    expect(isTrustedUrl('http://localhost:5174/', 'http://localhost:5173', file)).toBe(false)
    expect(isTrustedUrl('https://example.com/', undefined, file)).toBe(false)
    expect(isTrustedUrl('not a url', undefined, file)).toBe(false)
  })
})

describe('isSafeExternalUrl', () => {
  it('allows only http(s) without credentials', () => {
    expect(isSafeExternalUrl('https://github.com/o/r/pull/1')).toBe(true)
    expect(isSafeExternalUrl('http://intranet/x')).toBe(true)
    expect(isSafeExternalUrl('https://u:p@github.com/')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/Windows/system32/calc.exe')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('ms-settings:')).toBe(false)
    expect(isSafeExternalUrl('smb://host/share')).toBe(false)
  })
})

describe('tokenize', () => {
  it('splits a configured command without shell semantics', () => {
    expect(tokenize('"C:\\Program Files\\Tool\\tool.exe" --wait -n')).toEqual([
      'C:\\Program Files\\Tool\\tool.exe',
      '--wait',
      '-n'
    ])
    expect(tokenize('code $(rm -rf /) ; echo')).toEqual(['code', '$(rm', '-rf', '/)', ';', 'echo'])
  })
})

describe('classifyGitError', () => {
  it('maps common failures to actionable codes', () => {
    expect(
      classifyGitError("fatal: detected dubious ownership in repository at 'X'", 128, 'git status')
        .code
    ).toBe('UNSAFE_REPOSITORY')
    expect(
      classifyGitError(
        'fatal: not a git repository (or any of the parent directories): .git',
        128,
        'git'
      ).code
    ).toBe('NOT_A_REPOSITORY')
    expect(
      classifyGitError(
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
        128,
        'git fetch'
      ).code
    ).toBe('AUTH')
    expect(
      classifyGitError(
        'fatal: unable to access ...: The requested URL returned error: 403',
        128,
        'git push'
      ).code
    ).toBe('AUTH')
    expect(
      classifyGitError(
        'fatal: unable to access ...: Could not resolve host: nowhere',
        128,
        'git fetch'
      ).code
    ).toBe('NETWORK')
    expect(
      classifyGitError('CONFLICT (content): Merge conflict in a.txt', 1, 'git merge').code
    ).toBe('CONFLICT')
  })
  it('does not mistake numbers in output for HTTP status codes', () => {
    expect(classifyGitError('error: pathspec 401abc did not match', 1, 'git').code).toBe(
      'GIT_FAILED'
    )
  })
  it('explains rejected pushes', () => {
    const e = classifyGitError(
      ' ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs',
      1,
      'git push'
    )
    expect(e.message).toMatch(/Pull/)
  })
})
