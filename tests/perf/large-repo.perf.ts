// Large-repository benchmark. Generates a disposable repository with git fast-import and
// times the main-process operations the UI depends on. Run with: npm run perf
// Sizes can be overridden: PERF_COMMITS=100000 PERF_FILES=50000 npm run perf
import { spawn } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterAll, describe, expect, it } from 'vitest'
import { api } from '@shared/api'
import { layoutGraph } from '@shared/graph'
import { parseDiff } from '@shared/diff'
import { getStatus, getSummary } from '../../src/main/git/repo'
import { refsSnapshot } from '../../src/main/git/branches'
import { log } from '../../src/main/git/history'
import { getDiff } from '../../src/main/git/changes'
import { cleanup, openCtx, sh, tempDir } from '../integration/helpers'

const COMMITS = Number(process.env['PERF_COMMITS'] ?? 50_000)
const FILES = Number(process.env['PERF_FILES'] ?? 20_000)
const MODIFIED = Math.min(2_000, FILES)
const results: { name: string; ms: number; note?: string }[] = []

async function time<T>(
  name: string,
  fn: () => Promise<T> | T,
  note?: (v: T) => string
): Promise<T> {
  const t0 = performance.now()
  const v = await fn()
  const ms = performance.now() - t0
  results.push({ name, ms, note: note?.(v) })
  return v
}

/** Stream a synthetic history into git fast-import: FILES initial files, then COMMITS commits with a merged side branch every 40 commits. */
function generate(dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['fast-import', '--quiet', '--done'], {
      cwd: dir,
      stdio: ['pipe', 'ignore', 'inherit']
    })
    p.on('error', reject)
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`fast-import exited ${code}`))
    )
    let mark = 0
    let t = 1_600_000_000
    const chunks: string[] = []
    const flush = (): void => {
      if (chunks.length) p.stdin.write(chunks.join(''))
      chunks.length = 0
    }
    const data = (s: string): string => `data ${Buffer.byteLength(s)}\n${s}\n`
    const commit = (
      ref: string,
      msg: string,
      from: number | null,
      merge: number | null,
      files: [string, string][]
    ): number => {
      const m = ++mark
      let s = `commit ${ref}\nmark :${m}\ncommitter Perf <perf@spoon.invalid> ${t++} +0000\n${data(msg)}`
      if (from) s += `from :${from}\n`
      if (merge) s += `merge :${merge}\n`
      for (const [path, content] of files) s += `M 100644 inline ${path}\n${data(content)}`
      chunks.push(s)
      if (chunks.length > 200) flush()
      return m
    }
    const initial: [string, string][] = []
    for (let i = 0; i < FILES; i++)
      initial.push([`src/dir${i % 200}/file${i}.txt`, `file ${i}\nline 2\nline 3\n`])
    let head = commit('refs/heads/main', 'Initial import', null, null, initial)
    let n = 1
    while (n < COMMITS) {
      if (n % 40 === 0 && n + 4 < COMMITS) {
        let side = commit('refs/heads/side', `Side work ${n}`, head, null, [
          [`side/s${n}.txt`, `side ${n}\n`]
        ])
        side = commit('refs/heads/side', `Side work ${n + 1}`, side, null, [
          [`side/s${n}.txt`, `side ${n} more\n`]
        ])
        head = commit('refs/heads/main', `Main ${n + 2}`, head, null, [
          [`src/dir${n % 200}/file${n % FILES}.txt`, `edit ${n}\n`]
        ])
        head = commit('refs/heads/main', `Merge side ${n}`, head, side, [])
        n += 4
      } else {
        head = commit('refs/heads/main', `Change ${n}: update file ${n % FILES}`, head, null, [
          [`src/dir${n % 200}/file${n % FILES}.txt`, `content ${n}\nline 2\nline 3\n`]
        ])
        n++
      }
    }
    for (let i = 0; i < 300; i++)
      chunks.push(`reset refs/tags/v${i}\nfrom :${Math.max(1, mark - i * 97)}\n\n`)
    for (let i = 0; i < 200; i++)
      chunks.push(`reset refs/heads/feature/b${i}\nfrom :${Math.max(1, mark - i * 131)}\n\n`)
    chunks.push('done\n')
    flush()
    p.stdin.end()
  })
}

describe(`large repository (${COMMITS} commits, ${FILES} files)`, () => {
  const dir = tempDir('perf')

  afterAll(() => {
    const lines = [
      `Spoon performance run — ${new Date().toISOString()}`,
      `platform=${process.platform} arch=${process.arch} node=${process.version} git=${sh(dir, '--version').trim()}`,
      `commits=${COMMITS} files=${FILES} modified=${MODIFIED}`,
      ...results.map(
        (r) =>
          `${r.name.padEnd(48)} ${r.ms.toFixed(0).padStart(8)} ms${r.note ? `  (${r.note})` : ''}`
      )
    ]
    console.log('\n' + lines.join('\n'))
    if (process.env['PERF_OUT']) appendFileSync(process.env['PERF_OUT'], lines.join('\n') + '\n\n')
    cleanup()
  })

  it('runs', async () => {
    sh(dir, 'init', '-q', '-b', 'main')
    await time('generate history (fast-import)', () => generate(dir))
    await time('check out working tree', () => sh(dir, 'checkout', '-q', '-f', 'main'))
    for (let i = 0; i < MODIFIED; i++)
      writeFileSync(join(dir, `src/dir${i % 200}/file${i}.txt`), `modified ${i}\n`)
    for (let i = 0; i < 200; i++) writeFileSync(join(dir, `untracked-${i}.txt`), 'x\n')

    const ctx = await openCtx(dir)
    await time('repo summary (open)', () => getSummary(ctx))
    const status = await time(
      'status (porcelain v2)',
      () => getStatus(ctx),
      (s) => `${s.unstaged.length} unstaged, ${s.untracked.length} untracked`
    )
    expect(status.unstaged.length).toBe(MODIFIED)
    await time('status (warm, second run)', () => getStatus(ctx))
    const refs = await time(
      'refs snapshot',
      () => refsSnapshot(ctx),
      (r) => `${r.branches.length} branches, ${r.tags.length} tags`
    )
    expect(refs.tags.length).toBe(300)

    const first = await time('history: first page (400, all refs)', () =>
      log(ctx, api['history.log'].args.parse({ repo: dir, limit: 400 }))
    )
    expect(first.commits).toHaveLength(400)
    await time('history: page at offset 20 000', () =>
      log(
        ctx,
        api['history.log'].args.parse({
          repo: dir,
          skip: Math.min(20_000, COMMITS - 400),
          limit: 400
        })
      )
    )
    const all = await time(
      'history: all commits in one call',
      () => log(ctx, api['history.log'].args.parse({ repo: dir, limit: 5000 })),
      (r) => `${r.commits.length} commits`
    )
    await time(
      'history: message search',
      () =>
        log(
          ctx,
          api['history.log'].args.parse({ repo: dir, limit: 400, search: { text: 'Merge side 4' } })
        ),
      (r) => `${r.commits.length} hits`
    )

    const synthetic = Array.from({ length: COMMITS }, (_, i) => ({
      hash: `c${i}`,
      parents:
        i + 1 < COMMITS
          ? i % 40 === 0 && i + 3 < COMMITS
            ? [`c${i + 1}`, `c${i + 3}`]
            : [`c${i + 1}`]
          : []
    }))
    await time(`graph layout (${COMMITS} commits)`, () => layoutGraph(synthetic))
    await time('graph layout (5000 real commits)', () => layoutGraph(all.commits))

    await time('diff: one modified file', () =>
      getDiff(
        ctx,
        { kind: 'unstaged', path: 'src/dir0/file0.txt' },
        api['diff.get'].args.parse({
          repo: dir,
          source: { kind: 'unstaged', path: 'x' },
          options: {}
        }).options
      )
    )
    const bigDiff = Array.from({ length: 50_000 }, (_, i) => `-old ${i}\n+new ${i}`).join('\n')
    await time('parse 100 000-line diff', () =>
      parseDiff(`diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,50000 +1,50000 @@\n${bigDiff}\n`)
    )
  })
})
