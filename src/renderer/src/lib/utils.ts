import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export const short = (hash: string | null | undefined): string => (hash ? hash.slice(0, 7) : '')

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function relativeTime(unixSeconds: number, nowMs: number = Date.now()): string {
  const diff = unixSeconds * 1000 - nowMs
  const abs = Math.abs(diff)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 864e5],
    ['month', 30 * 864e5],
    ['week', 7 * 864e5],
    ['day', 864e5],
    ['hour', 36e5],
    ['minute', 6e4]
  ]
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  return 'just now'
}

export const fullDate = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toLocaleString()

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export const basename = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p
export const dirname = (p: string): string => {
  const parts = p.split('/')
  parts.pop()
  return parts.join('/')
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (
    (
      (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
    ).toUpperCase() || '?'
  )
}

/** Deterministic hue for avatars. */
export function hueOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

export const STATUS_LABEL: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  T: 'Type changed',
  U: 'Conflicted',
  '?': 'Untracked'
}
