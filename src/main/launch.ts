import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, extname, join } from 'node:path'
import { shell } from 'electron'
import { AppError } from './errors'

/** Split a configured command line into tokens, honouring double quotes. No shell is involved. */
export function tokenize(command: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(command))) tokens.push(m[1] ?? m[2]!)
  return tokens
}

export function which(name: string): string | null {
  if (existsSync(name) && /[\\/]/.test(name)) return name
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const p = join(dir, extname(name) ? name : name + ext)
      if (existsSync(p)) return p
    }
  }
  return null
}

const CMD_META = /["%^&|<>!\r\n]/

/** Start a detached GUI/console program with literal arguments. */
export function launch(command: string, args: string[], cwd: string, newConsole = false): void {
  const [exe, ...pre] = existsSync(command) ? [command] : tokenize(command)
  if (!exe) throw new AppError('VALIDATION', 'No command configured.')
  const resolved = which(exe)
  if (!resolved)
    throw new AppError(
      'NOT_FOUND',
      `Could not find "${exe}". Check the command in Settings → Tools.`
    )
  const all = [...pre, ...args]
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved)) {
    // Batch files can only run through cmd.exe. Refuse arguments that cmd would interpret.
    if (all.some((a) => CMD_META.test(a)) || CMD_META.test(resolved)) {
      throw new AppError(
        'UNSUPPORTED',
        "This path contains characters that cannot be passed safely to a .cmd/.bat launcher. Configure the program's .exe instead."
      )
    }
    const line = [resolved, ...all].map((a) => `"${a}"`).join(' ')
    spawn('cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
      windowsHide: true
    }).unref()
    return
  }
  spawn(resolved, all, { cwd, detached: true, stdio: 'ignore', windowsHide: !newConsole }).unref()
}

export function openTerminal(cwd: string, configured: string): void {
  if (configured) return launch(configured, [], cwd, true)
  if (process.platform === 'win32') {
    const wt = which('wt.exe')
    if (wt) return launch(wt, ['-d', cwd], cwd)
    return launch('cmd.exe', [], cwd, true)
  }
  if (process.platform === 'darwin') return launch('/usr/bin/open', ['-a', 'Terminal', cwd], cwd)
  for (const [term, flag] of [
    ['x-terminal-emulator', null],
    ['gnome-terminal', '--working-directory'],
    ['konsole', '--workdir'],
    ['xfce4-terminal', '--working-directory'],
    ['xterm', null]
  ] as const) {
    if (which(term)) return launch(term, flag ? [`${flag}=${cwd}`] : [], cwd)
  }
  throw new AppError('NOT_FOUND', 'No terminal emulator found. Set one in Settings → Tools.')
}

export async function openEditor(target: string, cwd: string, configured: string): Promise<void> {
  if (configured) return launch(configured, [target], cwd)
  const code = which('code')
  if (code) return launch(code, [target], cwd)
  const err = await shell.openPath(target)
  if (err)
    throw new AppError(
      'NOT_FOUND',
      `No editor configured and the system could not open the file: ${err}`
    )
}

export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password
  } catch {
    return false
  }
}
