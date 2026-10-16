import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Two-pane resizable layout. Size is persisted in localStorage under `id`.
 * The divider is keyboard accessible (arrow keys) and exposes ARIA separator semantics.
 */
export function Split({
  id,
  direction = 'horizontal',
  initial,
  min = 160,
  max = 2000,
  first,
  second,
  className,
  collapsed
}: {
  id: string
  direction?: 'horizontal' | 'vertical'
  initial: number
  min?: number
  max?: number
  first: React.ReactNode
  second: React.ReactNode
  className?: string
  /** Hide the second pane */
  collapsed?: boolean
}): React.JSX.Element {
  const key = `split:${id}`
  const [size, setSize] = React.useState<number>(() => Number(localStorage.getItem(key)) || initial)
  const container = React.useRef<HTMLDivElement>(null)
  const horizontal = direction === 'horizontal'

  React.useEffect(() => localStorage.setItem(key, String(Math.round(size))), [key, size])

  const clamp = React.useCallback(
    (v: number): number => {
      const total = container.current
        ? horizontal
          ? container.current.clientWidth
          : container.current.clientHeight
        : 4000
      return Math.max(min, Math.min(Math.min(max, total - min), v))
    },
    [horizontal, max, min]
  )

  const onPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    const el = container.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const move = (ev: PointerEvent): void =>
      setSize(clamp(horizontal ? ev.clientX - rect.left : ev.clientY - rect.top))
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKey = (e: React.KeyboardEvent): void => {
    const step = e.shiftKey ? 50 : 15
    if ((horizontal && e.key === 'ArrowLeft') || (!horizontal && e.key === 'ArrowUp'))
      setSize((s) => clamp(s - step))
    else if ((horizontal && e.key === 'ArrowRight') || (!horizontal && e.key === 'ArrowDown'))
      setSize((s) => clamp(s + step))
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={container}
      className={cn('flex min-h-0 min-w-0 flex-1', horizontal ? 'flex-row' : 'flex-col', className)}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        style={
          collapsed
            ? { flex: 1 }
            : horizontal
              ? { width: size, flexShrink: 0 }
              : { height: size, flexShrink: 0 }
        }
      >
        {first}
      </div>
      {!collapsed && (
        <>
          <div
            role="separator"
            aria-orientation={horizontal ? 'vertical' : 'horizontal'}
            aria-valuenow={Math.round(size)}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onKeyDown={onKey}
            className={cn(
              'relative z-10 shrink-0 bg-border transition-colors hover:bg-primary/60 focus-visible:bg-primary',
              horizontal
                ? 'w-px cursor-col-resize before:absolute before:inset-y-0 before:-left-1 before:-right-1'
                : 'h-px cursor-row-resize before:absolute before:inset-x-0 before:-top-1 before:-bottom-1'
            )}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{second}</div>
        </>
      )}
    </div>
  )
}
