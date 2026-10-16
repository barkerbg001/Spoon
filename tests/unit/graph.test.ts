import { describe, expect, it } from 'vitest'
import { emptyGraphState, layoutGraph } from '@shared/graph'

const c = (hash: string, ...parents: string[]): { hash: string; parents: string[] } => ({
  hash,
  parents
})

describe('layoutGraph', () => {
  it('keeps a linear history in one lane', () => {
    const { rows } = layoutGraph([c('c', 'b'), c('b', 'a'), c('a')])
    expect(rows.map((r) => r.column)).toEqual([0, 0, 0])
    expect(rows.every((r) => r.width === 1)).toBe(true)
  })

  it('lays out a merge with a side branch', () => {
    //   m (merge of x into b)
    //   |\
    //   b x
    //   |/
    //   a
    const { rows, state } = layoutGraph([c('m', 'b', 'x'), c('x', 'a'), c('b', 'a'), c('a')])
    expect(rows[0]).toMatchObject({ column: 0, isMerge: true })
    expect(rows[0]!.segments.some((s) => s.half === 'bottom' && s.from === 0 && s.to === 1)).toBe(
      true
    )
    expect(rows[1]!.column).toBe(1)
    expect(rows[2]!.column).toBe(0)
    // x's lane joins a's lane when b also points to a
    expect(rows[3]!.column).toBe(0)
    expect(state.lanes).toEqual([])
  })

  it('is stable when history is appended incrementally', () => {
    const commits = [c('e', 'd', 'x'), c('x', 'b'), c('d', 'c'), c('c', 'b'), c('b', 'a'), c('a')]
    const full = layoutGraph(commits).rows
    const first = layoutGraph(commits.slice(0, 3))
    const rest = layoutGraph(commits.slice(3), first.state).rows
    expect([...first.rows, ...rest]).toEqual(full)
  })

  it('does not mutate the previous state', () => {
    const prev = emptyGraphState()
    layoutGraph([c('a', 'p')], prev)
    expect(prev).toEqual(emptyGraphState())
  })
})
