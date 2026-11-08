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
  } catch {
    /* recording undo is best effort; the command itself succeeded */
  }
  return result
}

const shortRef = (r: string | null): string =>
  r ? r.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, 'tag ') : 'detached HEAD'
const shortOid = (o: string | undefined | null): string => (o ? o.slice(0, 7) : '—')

/** Human-readable list of what undoing `e` would change. */
function describe(e: UndoEntry): string[] {
  const out: string[] = []
  for (const ref of changedRefs(e.before, e.after)) {
    const was = e.before.refs[ref]
    const now = e.after.refs[ref]
    const name = shortRef(ref)
    if (!was) out.push(`Delete ${name} (created at ${shortOid(now)})`)
    else if (!now) out.push(`Restore ${name} at ${shortOid(was)}`)
    else out.push(`Move ${name} from ${shortOid(now)} back to ${shortOid(was)}`)
  }
  if (e.before.head !== e.after.head) {
    out.push(
      e.before.head
        ? `Switch back to ${shortRef(e.before.head)}`
        : `Check out ${shortOid(e.before.headOid)} (detached HEAD)`
    )
  } else if (!e.before.head && e.before.headOid !== e.after.headOid) {
    out.push(`Move detached HEAD back to ${shortOid(e.before.headOid)}`)
  }
  return out
}

/** Why the entry can no longer be undone safely, or null if it can. */
function staleReason(e: UndoEntry, now: RefSnapshot): string | null {
  for (const ref of changedRefs(e.before, e.after)) {
    if (now.refs[ref] !== e.after.refs[ref])
      return `${shortRef(ref)} changed after "${e.label}". Undo would overwrite that later work; use the reflog instead.`
  }
  if (!sameHead(now, e.after))
    return `HEAD moved after "${e.label}" (you are now on ${shortRef(now.head)} at ${shortOid(now.headOid)}). Undo only reverts the most recent change.`
  return null
}

export async function peekUndo(ctx: RepoCtx): Promise<UndoPreview | null> {
  const stack = stacks.get(normalizeKey(ctx.root))
  const e = stack?.[stack.length - 1]
  if (!e) return null
  let reason: string | null
  const op = detectOperation(ctx).operation
  if (op !== 'none') reason = 'Finish or abort the operation in progress first.'
  else reason = staleReason(e, await snapshot(ctx))
  return { label: e.label, time: e.time, changes: describe(e), blockedReason: reason }
}

export function clearUndo(ctx: RepoCtx): void {
  stacks.delete(normalizeKey(ctx.root))
}

export async function runUndo(ctx: RepoCtx): Promise<UndoPreview> {
  const key = normalizeKey(ctx.root)
  const stack = stacks.get(key)
  const e = stack?.[stack.length - 1]
  if (!e) throw new AppError('VALIDATION', 'There is nothing to undo.')
  if (detectOperation(ctx).operation !== 'none')
    throw new AppError('VALIDATION', 'Finish or abort the operation in progress first.')
  const now = await snapshot(ctx)
  const stale = staleReason(e, now)
  if (stale) {
    stack!.pop() // it can never become valid again
    throw new AppError('STALE', stale)
  }
  const preview: UndoPreview = {
    label: e.label,
    time: e.time,
    changes: describe(e),
    blockedReason: null
  }
  const msg = `spoon: undo ${e.label}`
  const zero =
    (now.headOid ?? Object.values(now.refs)[0] ?? '').replace(/./g, '0') || '0'.repeat(40)
  const changed = changedRefs(e.before, e.after)
  const { before, after } = e
  // HEAD names the same branch (or stays detached) before and after: move it with reset.
  const stayOnBranch = before.head === after.head
  const currentRef = stayOnBranch ? before.head : null

  // 1. Create or move every ref that existed before (except the checked-out branch, which is
  //    moved together with the index and working tree below). Compare-and-swap against the value
  //    the command left, so concurrent changes make Git refuse instead of being overwritten.
  for (const ref of changed) {
    const was = before.refs[ref]
    if (!was || ref === currentRef) continue
    await mgit(ctx, ['update-ref', '-m', msg, ref, was, after.refs[ref] ?? zero])
  }

  // 2. Put HEAD back.
  if (stayOnBranch) {
    const was = currentRef ? before.refs[currentRef] : before.headOid
    if (was && was !== now.headOid) {
      await mgit(ctx, ['reset', `--${e.mode}`, was, '--'])
    }
  } else {
    const sameCommit = before.headOid !== null && before.headOid === now.headOid
    if (before.head && sameCommit) {
      // e.g. undoing a rename of the current branch: no files change, only HEAD's name.
      await mgit(ctx, ['symbolic-ref', '-m', msg, 'HEAD', before.head])
    } else if (before.head) {
      await mgit(ctx, ['checkout', before.head.replace(/^refs\/heads\//, ''), '--'])
    } else if (before.headOid) {
      await mgit(ctx, ['checkout', '--detach', before.headOid, '--'])
    }
  }

  // 3. Delete refs the command created (after HEAD has moved off them).
  for (const ref of changed) {
    if (before.refs[ref]) continue
    const cur = after.refs[ref]
    if (cur) await mgit(ctx, ['update-ref', '-m', msg, '-d', ref, cur])
  }

  stack!.pop()
  return preview
}
