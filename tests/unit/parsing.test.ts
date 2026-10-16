import { describe, expect, it } from 'vitest'
import { parseRemoteUrl } from '@shared/remoteUrl'
import { api } from '@shared/api'
import { parseDecorations, parseStatusV2 } from '../../src/main/git/parse'

describe('parseStatusV2', () => {
  it('parses branch headers, ordinary, renamed, untracked and conflicted entries', () => {
    const out = [
      '# branch.oid 0123456789abcdef0123456789abcdef01234567',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 .M N... 100644 100644 100644 aaa bbb src/file with spaces.txt',
      '1 A. N... 000000 100644 100644 000 ccc 日本語.md',
      '2 R. N... 100644 100644 100644 ddd eee R100 new name.txt',
      'old name.txt',
      'u UU N... 100644 100644 100644 100644 f1 f2 f3 conflict.txt',
      '? untracked.txt',
      '! ignored.txt',
      ''
    ].join('\0')
    const s = parseStatusV2(out)
    expect(s.head).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      detached: false,
      unborn: false
    })
    expect(s.unstaged.map((f) => f.path)).toEqual(['src/file with spaces.txt'])
    expect(s.staged.map((f) => [f.path, f.origPath])).toEqual([
      ['日本語.md', undefined],
      ['new name.txt', 'old name.txt']
    ])
    expect(s.untracked.map((f) => f.path)).toEqual(['untracked.txt'])
    expect(s.conflicted[0]).toMatchObject({ path: 'conflict.txt', conflict: 'both modified' })
  })

  it('recognises unborn and detached HEADs', () => {
    expect(parseStatusV2('# branch.oid (initial)\0# branch.head main\0').head).toMatchObject({
      unborn: true,
      oid: null
    })
    expect(parseStatusV2('# branch.oid abc\0# branch.head (detached)\0').head).toMatchObject({
      detached: true,
      branch: null
    })
  })
})

describe('parseDecorations', () => {
  it('classifies ref labels', () => {
    const refs = parseDecorations('HEAD -> main, origin/main, tag: v1.0, refs/stash')
    expect(refs.map((r) => r.type)).toContain('tag')
    expect(refs.find((r) => r.name === 'main')).toBeDefined()
  })
})

describe('parseRemoteUrl', () => {
  it.each([
    ['https://github.com/owner/repo.git', 'github.com', 'owner/repo'],
    ['git@github.com:owner/repo.git', 'github.com', 'owner/repo'],
    [
      'ssh://git@gitlab.example.com:2222/group/sub/repo.git',
      'gitlab.example.com',
      'group/sub/repo'
    ],
    ['https://dev.azure.com/org/project/_git/repo', 'dev.azure.com', 'org/project/_git/repo'],
    ['https://user:token@bitbucket.org/ws/repo', 'bitbucket.org', 'ws/repo']
  ])('%s', (url, host, path) => {
    expect(parseRemoteUrl(url)).toEqual({ host, path })
  })
  it('rejects local paths', () => {
    expect(parseRemoteUrl('C:/repos/x')).toBeNull()
    expect(parseRemoteUrl('file:///srv/repo.git')).toBeNull()
    expect(parseRemoteUrl('/srv/repo.git')).toBeNull()
  })
})

describe('IPC schemas', () => {
  it('reject option-like and traversal arguments', () => {
    expect(
      api['branch.checkout'].args.safeParse({ repo: 'C:/r', ref: '--upload-pack=evil' }).success
    ).toBe(false)
    expect(
      api['branch.create'].args.safeParse({ repo: 'C:/r', name: 'feature/ok', checkout: true })
        .success
    ).toBe(true)
    expect(api['index.stage'].args.safeParse({ repo: 'C:/r', paths: ['../outside'] }).success).toBe(
      false
    )
    expect(api['index.stage'].args.safeParse({ repo: 'C:/r', paths: ['C:/abs'] }).success).toBe(
      false
    )
    expect(
      api['index.stage'].args.safeParse({ repo: 'C:/r', paths: ['ok/file.txt'] }).success
    ).toBe(true)
    expect(
      api['remote.add'].args.safeParse({ repo: 'C:/r', name: 'x', url: 'ext::sh -c evil' }).success
    ).toBe(false)
    expect(api['shell.openExternal'].args.safeParse({ url: 'not a url' }).success).toBe(false)
  })
  it('reject an empty discard request', () => {
    expect(
      api['index.discard'].args.safeParse({ repo: 'C:/r', paths: [], untracked: [] }).success
    ).toBe(false)
    expect(
      api['index.discard'].args.safeParse({ repo: 'C:/r', paths: [], untracked: ['new.txt'] })
        .success
    ).toBe(true)
  })
})
