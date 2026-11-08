export type RangePreset = '30d' | '90d' | 'all' | 'custom'

const pad = (n: number): string => String(n).padStart(2, '0')

/** YYYY-MM-DD of a Date by the local (computer) calendar. */
export const localDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "Last N days" ends today and includes it: last 30 days = today and the 29 days before. */
export function presetRange(
  preset: Exclude<RangePreset, 'custom'>,
  now: Date
): { since: string | null; until: string | null } {
  if (preset === 'all') return { since: null, until: null }
  const days = preset === '30d' ? 30 : 90
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  return { since: localDate(start), until: localDate(now) }
}

const toUtc = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}
const fromUtc = (t: number): string => new Date(t).toISOString().slice(0, 10)
const DAY = 86_400_000

/**
 * Group per-day counts into day, week (Monday start) or month buckets so the chart has at most a
 * few hundred bars. Empty buckets are kept so gaps in activity are visible.
 */
export function bucketActivity(
  days: { date: string; commits: number }[],
  from: string | null,
  to: string | null
): { unit: 'day' | 'week' | 'month'; bars: { key: string; label: string; value: number }[] } {
  if (!from || !to || days.length === 0) return { unit: 'day', bars: [] }
  const start = toUtc(from)
  const end = toUtc(to)
  const span = Math.max(0, Math.round((end - start) / DAY)) + 1
  const unit = span <= 120 ? 'day' : span <= 3 * 366 ? 'week' : 'month'
  const keyOf = (date: string): string => {
    if (unit === 'day') return date
    if (unit === 'month') return date.slice(0, 7)
    const t = toUtc(date)
    const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY
    return fromUtc(monday)
  }
  const counts = new Map<string, number>()
  for (const d of days) counts.set(keyOf(d.date), (counts.get(keyOf(d.date)) ?? 0) + d.commits)
  const bars: { key: string; label: string; value: number }[] = []
  const seen = new Set<string>()
  for (let t = start; t <= end; t += DAY) {
    const k = keyOf(fromUtc(t))
    if (seen.has(k)) continue
    seen.add(k)
    bars.push({
      key: k,
      label: unit === 'week' ? `Week of ${k}` : k,
      value: counts.get(k) ?? 0
    })
  }
  return { unit, bars }
}
