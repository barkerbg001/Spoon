// Serialises mutating Git operations per repository. The key is the common
// Git directory, so linked worktrees of the same repository share a lock.

const tails = new Map<string, Promise<unknown>>()

export async function withRepoLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const k = key.toLowerCase()
  const prev = tails.get(k) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((r) => (release = r))
  const tail = prev.then(() => current)
  tails.set(k, tail)
  try {
    await prev
    return await fn()
  } finally {
    release()
    if (tails.get(k) === tail) tails.delete(k)
  }
}

/** Limits the number of concurrently running subprocesses. */
export class Semaphore {
  private active = 0
  private queue: (() => void)[] = []
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r))
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}
