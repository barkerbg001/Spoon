import * as React from 'react'
import { cn, STATUS_LABEL } from '@/lib/utils'

const COLOR: Record<string, string> = {
  M: 'text-modified',
  T: 'text-modified',
  A: 'text-added',
  '?': 'text-added',
  D: 'text-removed',
  R: 'text-renamed',
  C: 'text-renamed',
  U: 'text-conflict'
}

/** Single-letter status chip; colour is paired with a letter and a label so it is not the only cue. */
export function StatusChip({
  code,
  className
}: {
  code: string
  className?: string
}): React.JSX.Element {
  const c = code === '.' ? 'M' : code
  return (
    <span
      title={STATUS_LABEL[c] ?? c}
      aria-label={STATUS_LABEL[c] ?? c}
      className={cn(
        'inline-flex w-4 shrink-0 justify-center font-mono text-[11px] font-bold',
        COLOR[c] ?? 'text-muted-foreground',
        className
      )}
    >
      {c}
    </span>
  )
}

export function PathLabel({
  path,
  origPath
}: {
  path: string
  origPath?: string
}): React.JSX.Element {
  const idx = path.lastIndexOf('/')
  const name = idx >= 0 ? path.slice(idx + 1) : path
  const dir = idx >= 0 ? path.slice(0, idx) : ''
  return (
    <span
      className="flex min-w-0 items-baseline gap-1.5"
      title={origPath ? `${origPath} → ${path}` : path}
    >
      <span className="truncate">{name}</span>
      {(dir || origPath) && (
        <span className="truncate text-[0.88em] text-muted-foreground">
          {origPath ? `← ${origPath}` : dir}
        </span>
      )}
    </span>
  )
}
