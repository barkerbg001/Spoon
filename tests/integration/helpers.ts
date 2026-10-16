import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { registerRepo, resolveRepo, type RepoCtx } from '../../src/main/git/repo'
import { discoverGit } from '../../src/main/git/runner'

const root = mkdtempSync(join(tmpdir(), 'spoon-test-'))
const globalConfig = join(root, 'gitconfig')
writeFileSync(
  globalConfig,
  [
    '[user]',
    '\tname = Spoon Test',
    '\temail = test@spoon.invalid',
    '[init]',
    '\tdefaultBranch = main',
    '[commit]',
    '\tgpgsign = false',
    '[core]',
    '\tautocrlf = false',
    '[protocol "file"]',
    '\tallow = always',
    ''
  ].join('\n')
)
// Isolate tests from the developer's own Git configuration.
process.env['GIT_CONFIG_GLOBAL'] = globalConfig
process.env['GIT_CONFIG_NOSYSTEM'] = '1'
process.env['GIT_AUTHOR_DATE'] = ''
delete process.env['GIT_AUTHOR_DATE']

let counter = 0
export function tempDir(name = 'repo'): string {
  const d = join(root, `${name}-${++counter}`)
  mkdirSync(d, { recursive: true })
  return d
}

export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
}

export function write(dir: string, rel: string, content: string): void {
  const p = join(dir, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content, 'utf8')
}

export async function newRepo(
  files: Record<string, string> = { 'README.md': 'hello\n' }
): Promise<RepoCtx> {
  await discoverGit()
  const dir = tempDir()
  sh(dir, 'init', '-q')
  sh(dir, 'checkout', '-q', '-b', 'main')
  for (const [k, v] of Object.entries(files)) write(dir, k, v)
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'initial')
  const ctx = await resolveRepo(dir)
  registerRepo(ctx)
  return ctx
}

export async function openCtx(dir: string): Promise<RepoCtx> {
  const ctx = await resolveRepo(dir)
  registerRepo(ctx)
  return ctx
}

export function cleanup(): void {
  rmSync(root, { recursive: true, force: true })
}
