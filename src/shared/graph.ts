// Commit-graph lane layout.
//
// Commits arrive in topological order (children before parents). Each lane
// remembers the commit it is waiting for. Lanes are never compacted, only
// reused once free, so rows that were already laid out never move when more
// history is appended (stable incremental loading).

export interface GraphSegment {
  /** Column at the start of the segment */
  from: number
  /** Column at the end of the segment */
  to: number
  /** 'top' segments run from the top edge to the node row centre; 'bottom' from centre to bottom edge */
  half: 'top' | 'bottom'
  color: number
}

export interface GraphRow {
  column: number
  color: number
  segments: GraphSegment[]
  /** number of columns occupied in this row */
  width: number
  isMerge: boolean
}

export interface GraphState {
  lanes: (string | null)[]
  colors: number[]
  nextColor: number
}

export const emptyGraphState = (): GraphState => ({ lanes: [], colors: [], nextColor: 0 })

export const GRAPH_PALETTE_SIZE = 8

function allocate(state: GraphState, hash: string): number {
  let idx = state.lanes.indexOf(null)
  if (idx === -1) {
    idx = state.lanes.length
    state.lanes.push(null)
    state.colors.push(0)
  }
  state.lanes[idx] = hash
  state.colors[idx] = state.nextColor++ % GRAPH_PALETTE_SIZE
  return idx
}

export function layoutGraph(
  commits: { hash: string; parents: string[] }[],
  previous: GraphState = emptyGraphState()
): { rows: GraphRow[]; state: GraphState } {
  const state: GraphState = {
    lanes: previous.lanes.slice(),
    colors: previous.colors.slice(),
    nextColor: previous.nextColor
  }
  const rows: GraphRow[] = []

  for (const c of commits) {
    const before = state.lanes.slice()
    const beforeColors = state.colors.slice()
    let col = state.lanes.indexOf(c.hash)
    if (col === -1) col = allocate(state, c.hash)
    const nodeColor = state.colors[col]!
    const segments: GraphSegment[] = []

    // Top half: lanes coming in from the previous row.
    before.forEach((h, j) => {
      if (h === null) return
      if (h === c.hash) segments.push({ from: j, to: col, half: 'top', color: beforeColors[j]! })
      else segments.push({ from: j, to: j, half: 'top', color: beforeColors[j]! })
    })
    // Lanes that converged into this commit are freed.
    state.lanes.forEach((h, j) => {
      if (h === c.hash && j !== col) state.lanes[j] = null
    })

    // Parents.
    const [first, ...rest] = c.parents
    const fromNode: { to: number; color: number }[] = []
    const folded: GraphSegment[] = []
    if (first !== undefined) {
      const existing = state.lanes.indexOf(first)
      if (existing !== -1 && existing < col) {
        // First parent already has a lane further left (a branch that forked there): join it.
        state.lanes[col] = null
        fromNode.push({ to: existing, color: state.colors[existing]! })
      } else if (existing > col) {
        // A lane further right waits for the same parent: fold it into this column so
        // the first-parent line keeps the leftmost position.
        folded.push({ from: existing, to: col, half: 'bottom', color: state.colors[existing]! })
        state.lanes[existing] = null
        state.lanes[col] = first
        fromNode.push({ to: col, color: nodeColor })
      } else {
        state.lanes[col] = first
        fromNode.push({ to: col, color: nodeColor })
      }
    } else {
      state.lanes[col] = null
    }
    for (const p of rest) {
      let k = state.lanes.indexOf(p)
      if (k === -1) k = allocate(state, p)
      fromNode.push({ to: k, color: state.colors[k]! })
    }

    // Bottom half: pass-through lanes and edges leaving the node.
    const nodeTargets = new Set(fromNode.map((f) => f.to))
    state.lanes.forEach((h, k) => {
      if (h === null) return
      const passThrough = before[k] !== null && before[k] !== c.hash && before[k] === h
      if (passThrough) segments.push({ from: k, to: k, half: 'bottom', color: state.colors[k]! })
      else if (!nodeTargets.has(k))
        segments.push({ from: k, to: k, half: 'bottom', color: state.colors[k]! })
    })
    for (const f of fromNode) segments.push({ from: col, to: f.to, half: 'bottom', color: f.color })
    segments.push(...folded)

    while (state.lanes.length && state.lanes[state.lanes.length - 1] === null) {
      state.lanes.pop()
      state.colors.pop()
    }
    const width = Math.max(before.length, state.lanes.length, col + 1)
    rows.push({ column: col, color: nodeColor, segments, width, isMerge: c.parents.length > 1 })
  }
  return { rows, state }
}
