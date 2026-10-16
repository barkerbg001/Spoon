import { watch, type FSWatcher } from 'node:fs'
import type { RepoCtx } from './git/repo'

type Scope = 'worktree' | 'refs' | 'all'
type Notify = (repo: string, scope: Scope) => void

const IGNORED_GIT = /^(objects|logs|lfs|modules|hooks|info|fsmonitor--daemon|Spoon-)|\.lock$/
const IMPORTANT_GIT =
  /^(index|HEAD|ORIG_HEAD|FETCH_HEAD|MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|BISECT_LOG|packed-refs|refs|rebase-merge|rebase-apply|sequencer|worktrees)/

/** Debounced recursive watcher. Falls back silently to manual/focus refresh if watching fails. */
export class RepoWatcher {
  private watchers: FSWatcher[] = []
  private timer: NodeJS.Timeout | null = null
  private pending: Scope | null = null

  constructor(
    private readonly ctx: RepoCtx,
    private readonly notify: Notify,
    private readonly delayMs = 350
  ) {}

  start(): boolean {
    let ok = true
    const add = (dir: string, classify: (f: string) => Scope | null): void => {
      try {
        const w = watch(dir, { recursive: true }, (_event, filename) => {
          const scope = classify(String(filename ?? '').replace(/\\/g, '/'))
          if (scope) this.queue(scope)
        })
        w.on('error', () => undefined)
        this.watchers.push(w)
      } catch {
        ok = false
      }
    }
    add(this.ctx.root, (f) => {
      if (f === '.git' || f.startsWith('.git/')) {
        if (this.ctx.linked) return null
        return classifyGit(f.slice(5))
      }
      return 'worktree'
    })
    if (this.ctx.linked) {
      add(this.ctx.gitDir, classifyGit)
      add(this.ctx.commonDir, (f) => (f.startsWith('worktrees/') ? null : classifyGit(f)))
    }
    return ok
  }

  private queue(scope: Scope): void {
    this.pending = this.pending && this.pending !== scope ? 'all' : scope
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      const s = this.pending ?? 'all'
      this.pending = null
      this.timer = null
      this.notify(this.ctx.root, s)
    }, this.delayMs)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    for (const w of this.watchers) w.close()
    this.watchers = []
  }
}

function classifyGit(f: string): Scope | null {
  if (!f || IGNORED_GIT.test(f)) return null
  if (f === 'index') return 'worktree'
  if (IMPORTANT_GIT.test(f)) return 'all'
  return null
}
