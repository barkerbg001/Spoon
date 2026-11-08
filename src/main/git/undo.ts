import type { UndoPreview } from '@shared/types'
import { AppError } from '../errors'
import { detectOperation, mgit, normalizeKey, rgit, type RepoCtx } from './repo'

/**
 * Operation-level undo.
 *
 * Before an undoable command runs, Spoon records the position of HEAD and of every local branch
 * and tag; afterwards it records them again. Undo moves exactly the references that the command
 * changed back to where they were — and only if they are still where the command left them, so
 * an undo can never overwrite work done later (in Spoon or in another tool).
 *
 * Working-tree safety: the checked-out branch is moved with `git reset --soft` (undoing a commit
 * keeps its changes staged), `--mixed`/`--soft` (undoing a reset of that kind) or `--keep` (any
 * other operation: refuses instead of overwriting local changes). Switching back to a previous
 * branch uses a plain `git checkout`, which also refuses to overwrite local changes.
 */

export interface RefSnapshot {
  /** Symbolic HEAD target ("refs/heads/main"), or null when detached */
  head: string | null
  headOid: string | null
  refs: Record<string, string>
}

export type RestoreMode = 'soft' | 'mixed' | 'keep'

interface UndoEntry {
  label: string
  time: number
  mode: RestoreMode
  before: RefSnapshot
  after: RefSnapshot
}

const MAX_ENTRIES = 30
const stacks = new Map<string, UndoEntry[]>()
/** Entries undone in this session, most recent last; cleared by any new undoable operation. */
const redoStacks = new Map<string, UndoEntry[]>()

export async function snapshot(ctx: RepoCtx): Promise<RefSnapshot> {
  const [refs, sym, head] = await Promise.all([
    rgit(ctx, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads', 'refs/tags']),
    rgit(ctx, ['symbolic-ref', '-q', 'HEAD'], { okCodes: [0, 1, 128] }),
    rgit(ctx, ['rev-parse', '--verify', '--quiet', 'HEAD'], { okCodes: [0, 1, 128] })
  ])
  const map: Record<string, string> = {}
  for (const line of refs.stdout.split('\n')) {
    const [name, oid] = line.split('\0')
    if (name && oid) map[name] = oid.trim()
  }
  return {
    head: sym.exitCode === 0 ? sym.stdout.trim() || null : null,
    headOid: head.exitCode === 0 ? head.stdout.trim() || null : null,
    refs: map
  }
}

/** Refs whose value differs between two snapshots. */
function changedRefs(a: RefSnapshot, b: RefSnapshot): string[] {
  const names = new Set([...Object.keys(a.refs), ...Object.keys(b.refs)])
  return [...names].filter((n) => a.refs[n] !== b.refs[n]).sort()
}

const sameHead = (a: RefSnapshot, b: RefSnapshot): boolean =>
  a.head === b.head && a.headOid === b.headOid

/** Run an undoable command and record what it changed. */
export async function recordUndo<T>(
  ctx: RepoCtx,
  label: string,
  mode: RestoreMode,
  fn: () => Promise<T>
): Promise<T> {
  let before: RefSnapshot | null = null
  try {
    before = await snapshot(ctx)
  } catch {
    before = null // e.g. a repository without commits: nothing to record
  }
  const result = await fn()
  if (!before) return result
  // An operation that stopped (conflicts, "edit" in a rebase) is not undoable as a unit; the
  // banner's Abort is the right tool there.
  if (detectOperation(ctx).operation !== 'none') return result
  if (result && typeof result === 'object' && 'exitCode' in result) {
    if ((result as { exitCode: number }).exitCode !== 0) return result
  }
  try {
    const after = await snapshot(ctx)
    if (changedRefs(before, after).length === 0 && sameHead(before, after)) return result
    const key = normalizeKey(ctx.root)
    const stack = stacks.get(key) ?? []
    stack.push({ label, time: Date.now(), mode, before, after })
    if (stack.length > MAX_ENTRIES) stack.splice(0, stack.length - MAX_ENTRIES)
    stacks.set(key, stack)
    redoStacks.delete(key)
  } catch {
    /* recording undo is best effort; the command itself succeeded */
  }
  return result
}

const shortRef = (r: string | null): string =>
  r ? r.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, 'tag ') : 'detached HEAD'
const shortOid = (o: string | undefined | null): string => (o ? o.slice(0, 7) : '—')

type Direction = 'undo' | 'redo'
/** The state an entry moves to, and the state it must currently be in, for a direction. */
const ends = (e: UndoEntry, d: Direction): { target: RefSnapshot; current: RefSnapshot } =>
  d === 'undo' ? { target: e.before, current: e.after } : { target: e.after, current: e.before }

/** Human-readable list of what applying `e` in direction `d` would change. */
function describe(e: UndoEntry, d: Direction): string[] {
  const { target, current } = ends(e, d)
  const back = d === 'undo' ? ' back' : ''
  const out: string[] = []
  for (const ref of changedRefs(target, current)) {
    const want = target.refs[ref]
    const now = current.refs[ref]
    const name = shortRef(ref)
    if (!want) out.push(`Delete ${name} (${d === 'undo' ? 'created' : 'now'} at ${shortOid(now)})`)
    else if (!now) out.push(`Restore ${name} at ${shortOid(want)}`)
    else out.push(`Move ${name} from ${shortOid(now)}${back} to ${shortOid(want)}`)
  }
  if (target.head !== current.head) {
    out.push(
      target.head
        ? `Switch${back} to ${shortRef(target.head)}`
        : `Check out ${shortOid(target.headOid)} (detached HEAD)`
    )
  } else if (!target.head && target.headOid !== current.headOid) {
    out.push(`Move detached HEAD${back} to ${shortOid(target.headOid)}`)
  }
  return out
}

/** Why the entry can no longer be applied safely in direction `d`, or null if it can. */
function staleReason(e: UndoEntry, d: Direction, now: RefSnapshot): string | null {
  const { target, current } = ends(e, d)
  const verb = d === 'undo' ? 'Undo' : 'Redo'
  for (const ref of changedRefs(target, current)) {
    if (now.refs[ref] !== current.refs[ref])
      return `${shortRef(ref)} changed after "${e.label}". ${verb} would overwrite that later work; use the reflog instead.`
  }
  if (!sameHead(now, current))
    return `HEAD moved after "${e.label}" (you are now on ${shortRef(now.head)} at ${shortOid(now.headOid)}). ${verb} only applies to the most recent change.`
  return null
}

async function peek(ctx: RepoCtx, d: Direction): Promise<UndoPreview | null> {
  const stack = (d === 'undo' ? stacks : redoStacks).get(normalizeKey(ctx.root))
  const e = stack?.[stack.length - 1]
  if (!e) return null
  let reason: string | null
  if (detectOperation(ctx).operation !== 'none')
    reason = 'Finish or abort the operation in progress first.'
  else reason = staleReason(e, d, await snapshot(ctx))
  return { label: e.label, time: e.time, changes: describe(e, d), blockedReason: reason }
}

export const peekUndo = (ctx: RepoCtx): Promise<UndoPreview | null> => peek(ctx, 'undo')
export const peekRedo = (ctx: RepoCtx): Promise<UndoPreview | null> => peek(ctx, 'redo')

export function clearUndo(ctx: RepoCtx): void {
  stacks.delete(normalizeKey(ctx.root))
  redoStacks.delete(normalizeKey(ctx.root))
}

/**
 * Move every reference the entry changed from `current` to `target`. Compare-and-swap against
 * `current`, so concurrent changes make Git refuse instead of being overwritten.
 */
async function transition(
  ctx: RepoCtx,
  target: RefSnapshot,
  current: RefSnapshot,
  now: RefSnapshot,
  mode: RestoreMode,
  msg: string
): Promise<void> {
  const zero =
    (now.headOid ?? Object.values(now.refs)[0] ?? '').replace(/./g, '0') || '0'.repeat(40)
  const changed = changedRefs(target, current)
  // HEAD names the same branch (or stays detached) on both sides: move it with reset.
  const stayOnBranch = target.head === current.head
  const currentRef = stayOnBranch ? target.head : null

  // 1. Create or move every ref that exists in the target (except the checked-out branch, which
  //    is moved together with the index and working tree below).
  for (const ref of changed) {
    const want = target.refs[ref]
    if (!want || ref === currentRef) continue
    await mgit(ctx, ['update-ref', '-m', msg, ref, want, current.refs[ref] ?? zero])
  }

  // 2. Put HEAD where the target has it.
  if (stayOnBranch) {
    const want = currentRef ? target.refs[currentRef] : target.headOid
    if (want && want !== now.headOid) await mgit(ctx, ['reset', `--${mode}`, want, '--'])
  } else {
    const sameCommit = target.headOid !== null && target.headOid === now.headOid
    if (target.head && sameCommit) {
      // e.g. a rename of the current branch: no files change, only HEAD's name.
      await mgit(ctx, ['symbolic-ref', '-m', msg, 'HEAD', target.head])
    } else if (target.head) {
      await mgit(ctx, ['checkout', target.head.replace(/^refs\/heads\//, ''), '--'])
    } else if (target.headOid) {
      await mgit(ctx, ['checkout', '--detach', target.headOid, '--'])
    }
  }

  // 3. Delete refs the target does not have (after HEAD has moved off them).
  for (const ref of changed) {
    if (target.refs[ref]) continue
    const cur = current.refs[ref]
    if (cur) await mgit(ctx, ['update-ref', '-m', msg, '-d', ref, cur])
  }
}

async function apply(ctx: RepoCtx, d: Direction): Promise<UndoPreview> {
  const key = normalizeKey(ctx.root)
  const from = d === 'undo' ? stacks : redoStacks
  const to = d === 'undo' ? redoStacks : stacks
  const stack = from.get(key)
  const e = stack?.[stack.length - 1]
  if (!e) throw new AppError('VALIDATION', `There is nothing to ${d}.`)
  if (detectOperation(ctx).operation !== 'none')
    throw new AppError('VALIDATION', 'Finish or abort the operation in progress first.')
  const now = await snapshot(ctx)
  const stale = staleReason(e, d, now)
  if (stale) {
    stack!.pop() // it can never become valid again
    throw new AppError('STALE', stale)
  }
  const preview: UndoPreview = {
    label: e.label,
    time: e.time,
    changes: describe(e, d),
    blockedReason: null
  }
  const { target, current } = ends(e, d)
  await transition(ctx, target, current, now, e.mode, `spoon: ${d} ${e.label}`)
  stack!.pop()
  const other = to.get(key) ?? []
  other.push(e)
  to.set(key, other)
  return preview
}

export const runUndo = (ctx: RepoCtx): Promise<UndoPreview> => apply(ctx, 'undo')
export const runRedo = (ctx: RepoCtx): Promise<UndoPreview> => apply(ctx, 'redo')
