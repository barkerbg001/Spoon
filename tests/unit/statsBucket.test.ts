import { describe, expect, it } from 'vitest'
import { bucketActivity, localDate, presetRange } from '../../src/renderer/src/views/stats/bucket'
import { parseNumstatLog, weekdayOf } from '../../src/main/git/stats'

describe('statistics date presets and buckets', () => {
  it('"last 30 days" includes today and the 29 days before it', () => {
    const now = new Date(2026, 10, 8, 15, 0) // 8 Nov 2026, local time
    expect(presetRange('30d', now)).toEqual({ since: '2026-10-10', until: '2026-11-08' })
    expect(presetRange('90d', now)).toEqual({ since: '2026-08-11', until: '2026-11-08' })
    expect(presetRange('all', now)).toEqual({ since: null, until: null })
    expect(localDate(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01')
  })

  it('uses daily bars for short ranges and keeps empty days', () => {
    const r = bucketActivity(
      [
        { date: '2026-01-01', commits: 2 },
        { date: '2026-01-03', commits: 1 }
      ],
      '2026-01-01',
      '2026-01-04'
    )
    expect(r.unit).toBe('day')
    expect(r.bars.map((b) => b.value)).toEqual([2, 0, 1, 0])
  })

  it('switches to weeks (Monday start) and months for long ranges, preserving totals', () => {
    const days = [
      { date: '2026-01-04', commits: 1 }, // Sunday -> week of 2025-12-29
      { date: '2026-01-05', commits: 2 }, // Monday
      { date: '2026-06-30', commits: 4 }
    ]
    const w = bucketActivity(days, '2026-01-01', '2026-12-31')
    expect(w.unit).toBe('week')
    expect(w.bars[0]!.key).toBe('2025-12-29')
    expect(w.bars.find((b) => b.key === '2026-01-05')!.value).toBe(2)
    expect(w.bars.reduce((n, b) => n + b.value, 0)).toBe(7)
    const m = bucketActivity(days, '2020-01-01', '2026-12-31')
    expect(m.unit).toBe('month')
    expect(m.bars).toHaveLength(84)
    expect(m.bars.find((b) => b.key === '2026-01')!.value).toBe(3)
  })

  it('computes weekdays from calendar dates', () => {
    expect(weekdayOf('2026-11-08')).toBe(6) // Sunday
    expect(weekdayOf('2024-02-29')).toBe(3) // Thursday
  })

  it('parses numstat records with renames and binary files', () => {
    const out =
      '\x1eaaa\x1fA\x1fa@x\0\n1\t0\t\0old name.txt\0new name.txt\0-\t-\tlogo.png\0' +
      '\x1ebbb\x1fB\x1fb@x\0\n2\t3\tdir/ünï.txt\0' +
      '\x1eccc\x1fC\x1fc@x\0'
    const r = parseNumstatLog(out)
    expect(r).toHaveLength(3)
    expect(r[0]!.files).toEqual([
      { added: 1, deleted: 0, path: 'new name.txt', oldPath: 'old name.txt' },
      { added: null, deleted: null, path: 'logo.png' }
    ])
    expect(r[1]!.files[0]).toEqual({ added: 2, deleted: 3, path: 'dir/ünï.txt' })
    expect(r[2]!.files).toEqual([])
  })
})
