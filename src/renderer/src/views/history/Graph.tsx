import * as React from 'react'
import type { GraphRow } from '@shared/graph'

export const LANE_W = 14
export const MAX_LANES = 24

const color = (i: number): string => `var(--lane-${i % 8})`
const x = (col: number): number => Math.min(col, MAX_LANES - 1) * LANE_W + LANE_W / 2

/** One row of the commit graph. Lanes beyond MAX_LANES are clamped to the last column. */
export const GraphCell = React.memo(function GraphCell({
  row,
  height,
  width,
  head
}: {
  row: GraphRow
  height: number
  width: number
  head: boolean
}): React.JSX.Element {
  const mid = height / 2
  const paths = row.segments.map((s, i) => {
    const y0 = s.half === 'top' ? 0 : mid
    const y1 = s.half === 'top' ? mid : height
    const x0 = x(s.from)
    const x1 = x(s.to)
    const d =
      x0 === x1
        ? `M${x0} ${y0}V${y1}`
        : `M${x0} ${y0}C${x0} ${(y0 + y1) / 2} ${x1} ${(y0 + y1) / 2} ${x1} ${y1}`
    return <path key={i} d={d} stroke={color(s.color)} strokeWidth={2} fill="none" />
  })
  const cx = x(row.column)
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden>
      {paths}
      {head && (
        <circle
          cx={cx}
          cy={mid}
          r={7}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.5}
          opacity={0.55}
        />
      )}
      <circle
        cx={cx}
        cy={mid}
        r={row.isMerge ? 3.5 : 4.5}
        fill={row.isMerge ? 'var(--background)' : color(row.color)}
        stroke={color(row.color)}
        strokeWidth={2}
      />
    </svg>
  )
})
