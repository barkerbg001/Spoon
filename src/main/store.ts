import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { HostingAccount, RecentRepo, Settings } from '@shared/types'

export const DEFAULT_ACCENT = '#c41e3a'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: DEFAULT_ACCENT,
  density: 'comfortable',
  uiFontSize: 13,
  monoFont: '',
  diffView: 'unified',
  diffContext: 3,
  diffIgnoreWhitespace: false,
  diffShowWhitespace: false,
  diffWrap: false,
  gitPath: '',
  editorCommand: '',
  terminalCommand: '',
  diffTool: '',
  mergeTool: '',
  defaultCloneDir: '',
  autoFetch: false,
  autoFetchMinutes: 15,
  notifications: true,
  reduceMotion: 'system',
  proxy: '',
  shortcuts: {},
  telemetry: false
}

/** Small JSON-file store with atomic writes. Never stores secrets (see secrets.ts). */
export class JsonStore<T> {
  private cache: T | null = null
  constructor(
    private readonly file: string,
    private readonly fallback: () => T
  ) {}

  read(): T {
    if (this.cache) return this.cache
    try {
      this.cache = existsSync(this.file)
        ? (JSON.parse(readFileSync(this.file, 'utf8')) as T)
        : this.fallback()
    } catch {
      this.cache = this.fallback()
    }
    return this.cache
  }

  write(value: T): void {
    this.cache = value
    mkdirSync(join(this.file, '..'), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }
}

export class AppStore {
  readonly settings: JsonStore<Settings>
  readonly recents: JsonStore<RecentRepo[]>
  readonly accounts: JsonStore<HostingAccount[]>

  constructor(dir: string) {
    this.settings = new JsonStore(join(dir, 'settings.json'), () => ({ ...DEFAULT_SETTINGS }))
    this.recents = new JsonStore(join(dir, 'recents.json'), () => [])
    this.accounts = new JsonStore(join(dir, 'accounts.json'), () => [])
  }

  getSettings(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.settings.read(), telemetry: false }
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.getSettings(), ...patch, telemetry: false as const }
    this.settings.write(next)
    return next
  }

  touchRecent(path: string): RecentRepo[] {
    const list = this.recents.read().filter((r) => r.path.toLowerCase() !== path.toLowerCase())
    const prev = this.recents.read().find((r) => r.path.toLowerCase() === path.toLowerCase())
    list.unshift({
      path,
      name: basename(path),
      lastOpened: Date.now(),
      favorite: prev?.favorite ?? false,
      group: prev?.group ?? null
    })
    const trimmed = list.filter((r, i) => i < 50 || r.favorite)
    this.recents.write(trimmed)
    return trimmed
  }

  updateRecent(path: string, patch: { favorite?: boolean; group?: string | null }): RecentRepo[] {
    const list = this.recents.read().map((r) =>
      r.path.toLowerCase() === path.toLowerCase()
        ? {
            ...r,
            ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
            ...(patch.group !== undefined ? { group: patch.group || null } : {})
          }
        : r
    )
    this.recents.write(list)
    return list
  }

  removeRecent(path: string): RecentRepo[] {
    const list = this.recents.read().filter((r) => r.path.toLowerCase() !== path.toLowerCase())
    this.recents.write(list)
    return list
  }

  isKnownRepo(path: string): boolean {
    return this.recents.read().some((r) => r.path.toLowerCase() === path.toLowerCase())
  }
}
