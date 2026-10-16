import { spawn, execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import type { CommandResult, GitInfo, OpProgress } from '@shared/types'
import { AppError, classifyGitError } from '../errors'
import { finishOp, startOp } from '../oplog'
import { Semaphore } from './lock'

export interface RunOptions {
  cwd: string
  /** Data written to stdin */
  input?: string | Buffer
  /** Exit codes that are not errors (default [0]) */
  okCodes?: number[]
  /** Identifier used for cancellation and progress events */
  opId?: string
  onProgress?: (p: OpProgress) => void
  /** Extra environment variables */
  env?: Record<string, string>
  /** Read-only commands skip optional locks so they never contend with the user's tools */
  readOnly?: boolean
  /**
   * Treat pathspecs literally (default true). Must be false for `stash push -u` /
   * `--keep-index`: newer Git passes `:/` to an internal `clean`/`checkout`, and
   * with literal pathspecs that magic root pathspec is not expanded, so untracked
   * files are saved but not removed from the worktree.
   */
  literalPathspecs?: boolean
  /** Stop reading stdout after this many bytes (the process is killed) */
  maxBytes?: number
  /** Return raw stdout bytes instead of text */
  binary?: boolean
  /** Record in the visible operation log (default: only mutations/failures surface) */
  log?: boolean
  timeoutMs?: number
}

export interface RunResult extends CommandResult {
  truncated: boolean
  totalBytes: number
  raw?: Buffer
}

const processes = new Semaphore(8)
const running = new Map<string, () => void>()

let gitPath = 'git'
let gitInfo: GitInfo | null = null
let proxy = ''

export function setProxy(value: string): void {
  proxy = value
}

export function getGitInfo(): GitInfo | null {
  return gitInfo
}

function candidatePaths(configured: string): string[] {
  const list: string[] = []
  if (configured) list.push(configured)
  const exe = process.platform === 'win32' ? 'git.exe' : 'git'
  for (const dir of (process.env.PATH ?? '').split(delimiter)) if (dir) list.push(join(dir, exe))
  if (process.platform === 'win32') {
    const pf = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env['LOCALAPPDATA'] && join(process.env['LOCALAPPDATA'], 'Programs')
    ]
    for (const p of pf) if (p) list.push(join(p, 'Git', 'cmd', 'git.exe'))
  } else {
    list.push('/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git')
  }
  return list
}

function execVersion(path: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(path, args, { windowsHide: true, timeout: 15_000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout.trim())
    })
  })
}

/** Locate Git, read its version and derive capability flags. */
const MIN_GIT = [2, 25] as const

export async function discoverGit(configured = ''): Promise<GitInfo> {
  let lastError = ''
  let tooOld = ''
  for (const candidate of candidatePaths(configured)) {
    if (candidate !== 'git' && !existsSync(candidate)) continue
    try {
      const out = await execVersion(candidate, ['--version'])
      const m = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(out)
      if (!m) continue
      const major = Number(m[1])
      const minor = Number(m[2])
      const atLeast = (a: number, b: number): boolean => major > a || (major === a && minor >= b)
      if (!atLeast(MIN_GIT[0], MIN_GIT[1])) {
        tooOld = `${out.trim()} at ${candidate}`
        continue
      }
      let lfsVersion: string | null = null
      try {
        lfsVersion = (await execVersion(candidate, ['lfs', 'version'])).split('\n')[0] ?? null
      } catch {
        lfsVersion = null
      }
      gitPath = candidate
      gitInfo = {
        path: candidate,
        version: out.replace(/^git version /, ''),
        major,
        minor,
        lfsVersion,
        capabilities: {
          switchRestore: atLeast(2, 23),
          fixupAmend: atLeast(2, 32),
          updateRefs: atLeast(2, 38),
          mergeTreeWriteTree: atLeast(2, 38)
        }
      }
      return gitInfo
    } catch (e) {
      lastError = String(e)
    }
  }
  gitInfo = null
  if (tooOld) {
    throw new AppError(
      'GIT_NOT_FOUND',
      `Spoon needs Git ${MIN_GIT.join('.')} or newer, but found ${tooOld}. Update Git (https://git-scm.com/downloads) or choose a newer executable in Settings → Git.`
    )
  }
  throw new AppError(
    'GIT_NOT_FOUND',
    'Git was not found. Install Git (https://git-scm.com/downloads) or set its location in Settings → Git.',
    lastError
  )
}

function parseProgress(opId: string, line: string): OpProgress | null {
  const m = /^(?:remote: )?([A-Za-z][A-Za-z ]+?):\s+(\d+)%/.exec(line)
  if (m) return { opId, phase: m[1]!, percent: Number(m[2]), message: line }
  if (line.trim()) return { opId, phase: '', percent: null, message: line.trim() }
  return null
}

function killTree(pid: number | undefined): void {
  if (!pid) return
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined)
  } else {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* already exited */
    }
  }
}

export function cancelOp(opId: string): boolean {
  const cancel = running.get(opId)
  if (!cancel) return false
  cancel()
  return true
}

/** Base arguments applied to every invocation: stable, machine-readable output. */
const BASE_ARGS = [
  '-c',
  'core.quotepath=false',
  '-c',
  'color.ui=false',
  '-c',
  'log.showSignature=false'
]

/**
 * Run git with an argument array (never through a shell). Throws AppError on
 * failure unless the exit code is listed in okCodes.
 */
export async function git(args: string[], opts: RunOptions): Promise<RunResult> {
  if (!gitInfo) await discoverGit()
  return processes.run(() => runGit(args, opts))
}

function runGit(args: string[], opts: RunOptions): Promise<RunResult> {
  const fullArgs = [...BASE_ARGS, ...(proxy ? ['-c', `http.proxy=${proxy}`] : []), ...args]
  const logEntry = startOp(opts.cwd, args)
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
    LANGUAGE: 'C',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    // ":" is recognised by Git as "do not launch an editor" and keeps the prepared message.
    GIT_EDITOR: ':',
    ...(opts.readOnly ? { GIT_OPTIONAL_LOCKS: '0' } : {}),
    ...opts.env
  }
  // Paths from the UI are always literal (no glob/pathspec magic), so names like "a[1].txt" work.
  // Callers can opt out (see RunOptions.literalPathspecs).
  if (opts.literalPathspecs === false) delete env['GIT_LITERAL_PATHSPECS']
  else env['GIT_LITERAL_PATHSPECS'] = '1'
  delete env['ELECTRON_RUN_AS_NODE']
  if (opts.env?.['ELECTRON_RUN_AS_NODE'])
    env['ELECTRON_RUN_AS_NODE'] = opts.env['ELECTRON_RUN_AS_NODE']

  return new Promise((resolve, reject) => {
    const child = spawn(gitPath, fullArgs, {
      cwd: opts.cwd,
      env,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const chunks: Buffer[] = []
    let total = 0
    let truncated = false
    let stderr = ''
    let cancelled = false
    let timer: NodeJS.Timeout | undefined

    if (opts.opId) {
      running.set(opts.opId, () => {
        cancelled = true
        killTree(child.pid)
      })
    }
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        cancelled = true
        killTree(child.pid)
      }, opts.timeoutMs)
    }

    child.stdout.on('data', (d: Buffer) => {
      total += d.length
      if (opts.maxBytes && total > opts.maxBytes) {
        if (!truncated) {
          const keep = opts.maxBytes - (total - d.length)
          if (keep > 0) chunks.push(d.subarray(0, keep))
          truncated = true
          child.stdout.destroy()
          killTree(child.pid)
        }
        return
      }
      chunks.push(d)
    })
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString('utf8')
      stderr += text
      if (stderr.length > 1_000_000) stderr = stderr.slice(-500_000)
      if (opts.onProgress && opts.opId) {
        for (const line of text.split(/[\r\n]+/)) {
          const p = parseProgress(opts.opId, line)
          if (p) opts.onProgress(p)
        }
      }
    })
    child.on('error', (err) => {
      if (opts.opId) running.delete(opts.opId)
      if (timer) clearTimeout(timer)
      finishOp(logEntry, -1, String(err), true)
      reject(new AppError('GIT_NOT_FOUND', `Could not start Git: ${err.message}`))
    })
    child.on('close', (code) => {
      if (opts.opId) running.delete(opts.opId)
      if (timer) clearTimeout(timer)
      const exitCode = code ?? -1
      const raw = Buffer.concat(chunks)
      finishOp(logEntry, truncated ? 0 : exitCode, stderr, opts.log ?? !opts.readOnly)
      if (cancelled && !truncated) {
        reject(new AppError('CANCELLED', 'The operation was cancelled.'))
        return
      }
      const result: RunResult = {
        stdout: opts.binary ? '' : raw.toString('utf8'),
        stderr,
        exitCode,
        truncated,
        totalBytes: total,
        raw: opts.binary ? raw : undefined
      }
      if (truncated || (opts.okCodes ?? [0]).includes(exitCode)) resolve(result)
      else reject(classifyGitError(stderr || result.stdout, exitCode, args[0] ?? 'git'))
    })

    if (opts.input !== undefined) child.stdin.end(opts.input)
    else child.stdin.end()
  })
}
