import type { OpLogEntry } from '@shared/types'
import { redact } from './redact'

type Listener = (entry: OpLogEntry) => void

const MAX_ENTRIES = 500
const entries: OpLogEntry[] = []
const listeners = new Set<Listener>()
let nextId = 1

export function onOpLog(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(entry: OpLogEntry): void {
  for (const l of listeners) l({ ...entry })
}

export function startOp(repo: string | null, args: string[]): OpLogEntry {
  const entry: OpLogEntry = {
    id: nextId++,
    repo,
    command: redact(
      ['git', ...args].map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)).join(' ')
    ),
    startedAt: Date.now(),
    durationMs: null,
    exitCode: null,
    stderr: '',
    running: true
  }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  return entry
}

export function finishOp(
  entry: OpLogEntry,
  exitCode: number,
  stderr: string,
  notify: boolean
): void {
  entry.running = false
  entry.exitCode = exitCode
  entry.durationMs = Date.now() - entry.startedAt
  entry.stderr = redact(stderr.slice(0, 8000))
  if (notify || exitCode !== 0) emit(entry)
}

export function listOps(): OpLogEntry[] {
  return entries.slice().reverse()
}

export function clearOps(): void {
  entries.length = 0
}
