import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * A small repository with known authors, dates, a .mailmap alias, a merge, a rename, a binary file
 * and a commit reachable from several branches. Shared by the integration tests and the E2E test.
 *
 * main:    c1 ─ c2 ─ c3 ─ c5 ─────── M (merge of feature, by Alice)
 *                      ├── c4 (feature: rename app.ts → src/app.ts) ┘
 *                      └── f1 (other: only on branch "other")
 *
 * Author dates are in the author's own time zone; c2 is 2026-01-06 23:30 -0500 (2026-01-07 in UTC).
 */
export const STATS_EXPECTED = {
  head: { total: 6, merges: 1, contributors: 3 },
  local: { total: 7, merges: 1, contributors: 4 },
  /** HEAD scope, all time, non-merge commits */
  files: {
    commitsAnalysed: 5,
    fileChanges: 7,
    filesChanged: 4,
    linesAdded: 9,
    linesDeleted: 1,
    binaryChanges: 1,
    renames: 1
  }
}

const run = (cwd: string, args: string[], env: Record<string, string> = {}): string =>
  execFileSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' })

function put(dir: string, rel: string, content: string | Buffer): void {
  const p = join(dir, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
}

function commit(dir: string, who: string, email: string, date: string, msg: string): void {
  run(dir, ['add', '-A'])
  run(dir, ['commit', '-q', '-m', msg], {
    GIT_AUTHOR_NAME: who,
    GIT_AUTHOR_EMAIL: email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: who,
    GIT_COMMITTER_EMAIL: email,
    GIT_COMMITTER_DATE: date
  })
}

/** Create the fixture in `dir` (which must exist and be empty). Git config must set user/autocrlf. */
export function buildStatsFixture(dir: string): void {
  run(dir, ['init', '-q'])
  run(dir, ['checkout', '-q', '-b', 'main'])
  run(dir, ['config', 'core.autocrlf', 'false'])
  put(dir, 'README.md', 'one\ntwo\nthree\n')
  put(dir, '.mailmap', 'Alice <alice@example.com> alice <alice@old.example>\n')
  commit(dir, 'Alice', 'alice@example.com', '2026-01-05T10:00:00+00:00', 'c1')
  put(dir, 'README.md', 'one\ntwo\nthree\nfour\n')
  commit(dir, 'alice', 'alice@old.example', '2026-01-06T23:30:00-05:00', 'c2')
  put(dir, 'logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1, 2, 3, 0, 255]))
  put(dir, 'app.ts', 'export const a = 1\nexport const b = 2\n')
  commit(dir, 'Bob', 'bob@example.com', '2026-02-10T09:00:00+01:00', 'c3')
  run(dir, ['branch', 'other'])
  run(dir, ['checkout', '-q', '-b', 'feature'])
  mkdirSync(join(dir, 'src'))
  run(dir, ['mv', 'app.ts', 'src/app.ts'])
  put(dir, 'src/app.ts', 'export const a = 1\nexport const b = 2\nexport const c = 3\n')
  commit(dir, 'Carol', 'carol@example.com', '2026-02-15T14:00:00+00:00', 'c4')
  run(dir, ['checkout', '-q', 'main'])
  put(dir, 'README.md', 'one\ntwo\nthree\nFOUR\n')
  commit(dir, 'Bob', 'bob@example.com', '2026-02-20T16:00:00+00:00', 'c5')
  run(dir, ['merge', '-q', '--no-ff', '--no-edit', 'feature'], {
    GIT_AUTHOR_NAME: 'Alice',
    GIT_AUTHOR_EMAIL: 'alice@example.com',
    GIT_AUTHOR_DATE: '2026-03-01T12:00:00+00:00',
    GIT_COMMITTER_NAME: 'Alice',
    GIT_COMMITTER_EMAIL: 'alice@example.com',
    GIT_COMMITTER_DATE: '2026-03-01T12:00:00+00:00'
  })
  run(dir, ['checkout', '-q', 'other'])
  put(dir, 'other.txt', 'only here\n')
  commit(dir, 'Dave', 'dave@example.com', '2026-03-10T08:00:00+00:00', 'f1')
  run(dir, ['checkout', '-q', 'main'])
}

/**
 * A larger synthetic history (fast-import): `commits` commits by four authors, each changing two
 * files, all dated in 2020. Used to keep a statistics query busy long enough to change filters or
 * repositories while it runs.
 */
export function buildBulkHistory(dir: string, commits: number): void {
  const data = (s: string): string => `data ${Buffer.byteLength(s)}\n${s}\n`
  const authors = [
    'Ann <ann@bulk.test>',
    'Ben <ben@bulk.test>',
    'Cy <cy@bulk.test>',
    'Di <di@bulk.test>'
  ]
  let t = 1_577_880_000 // 2020-01-01
  const parts: string[] = []
  for (let i = 1; i <= commits; i++) {
    const who = authors[i % authors.length]!
    let s = `commit refs/heads/main\nmark :${i}\nauthor ${who} ${t} +0000\ncommitter ${who} ${t} +0000\n${data(`bulk ${i}`)}`
    if (i > 1) s += `from :${i - 1}\n`
    for (let f = 0; f < 2; f++) {
      const body = Array.from({ length: 40 }, (_, l) => `line ${l} of ${i}-${f}`).join('\n') + '\n'
      s += `M 100644 inline dir${(i + f) % 50}/file${(i * 7 + f) % 400}.txt\n${data(body)}`
    }
    parts.push(s)
    t += 3600
  }
  parts.push('done\n')
  run(dir, ['init', '-q'])
  execFileSync('git', ['fast-import', '--quiet', '--done'], {
    cwd: dir,
    input: parts.join(''),
    env: process.env,
    maxBuffer: 1 << 28
  })
  run(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  run(dir, ['checkout', '-q', '-f', 'main'])
}
