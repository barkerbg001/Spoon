import type { Settings } from '@shared/types'
import { accessibleAccent, onColor } from './color'

export const ACCENTS: { name: string; value: string }[] = [
  { name: 'Crimson', value: '#c41e3a' },
  { name: 'Ruby', value: '#9b1b30' },
  { name: 'Coral', value: '#e5533d' },
  { name: 'Amber', value: '#c27c0e' },
  { name: 'Emerald', value: '#16855a' },
  { name: 'Teal', value: '#0f7c86' },
  { name: 'Azure', value: '#1f6feb' },
  { name: 'Indigo', value: '#5b4fe0' },
  { name: 'Violet', value: '#8a3ffc' },
  { name: 'Graphite', value: '#5b6170' }
]

const systemDark = (): boolean => window.matchMedia('(prefers-color-scheme: dark)').matches
const systemReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function isDark(settings: Pick<Settings, 'theme'>): boolean {
  return settings.theme === 'dark' || (settings.theme === 'system' && systemDark())
}

export function applyTheme(settings: Settings): void {
  const root = document.documentElement
  const dark = isDark(settings)
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  const bg = dark ? '#16161a' : '#ffffff'
  const primary = accessibleAccent(settings.accent, bg, 3.2)
  root.style.setProperty('--primary', primary)
  root.style.setProperty('--primary-foreground', onColor(primary))
  root.style.setProperty('--ring', primary)
  root.style.setProperty('--lane-0', accessibleAccent(settings.accent, bg, 3))
  root.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`)
  if (settings.monoFont.trim()) {
    root.style.setProperty(
      '--mono',
      `${JSON.stringify(settings.monoFont.trim())}, ui-monospace, Consolas, monospace`
    )
  } else root.style.removeProperty('--mono')
  root.dataset['density'] = settings.density
  const reduce =
    settings.reduceMotion === 'on' || (settings.reduceMotion === 'system' && systemReducedMotion())
  root.dataset['reduceMotion'] = String(reduce)
}

/** Re-apply when the OS theme or motion preference changes (System mode). */
export function watchSystem(get: () => Settings | null): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const mm = window.matchMedia('(prefers-reduced-motion: reduce)')
  const handler = (): void => {
    const s = get()
    if (s) applyTheme(s)
  }
  mq.addEventListener('change', handler)
  mm.addEventListener('change', handler)
  return () => {
    mq.removeEventListener('change', handler)
    mm.removeEventListener('change', handler)
  }
}
