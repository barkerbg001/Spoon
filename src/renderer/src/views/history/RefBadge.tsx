import * as React from 'react'
import { Archive, Cloud, GitBranch, Tag } from 'lucide-react'
import type { RefLabel } from '@shared/types'
import { cn } from '@/lib/utils'

const STYLE: Record<RefLabel['type'], string> = {
  head: 'bg-primary text-primary-foreground',
  local:
    'bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-foreground border border-primary/40',
  remote:
    'bg-[color-mix(in_oklab,var(--info)_14%,transparent)] text-foreground border border-[color-mix(in_oklab,var(--info)_40%,transparent)]',
  tag: 'bg-[color-mix(in_oklab,var(--modified)_16%,transparent)] text-foreground border border-[color-mix(in_oklab,var(--modified)_45%,transparent)]',
  stash: 'bg-muted text-muted-foreground border',
  other: 'bg-muted text-muted-foreground border'
}

export function RefBadge({ r, className }: { r: RefLabel; className?: string }): React.JSX.Element {
  const Icon =
    r.type === 'tag' ? Tag : r.type === 'remote' ? Cloud : r.type === 'stash' ? Archive : GitBranch
  return (
    <span
      className={cn(
        'inline-flex max-w-[16rem] shrink-0 items-center gap-1 rounded px-1.5 text-[11px] leading-[17px] font-medium',
        STYLE[r.type],
        className
      )}
      title={`${r.type === 'head' ? 'Current branch' : r.type}: ${r.name}`}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{r.name}</span>
    </span>
  )
}
