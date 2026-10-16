import * as React from 'react'
import { ContextMenu as CM, DropdownMenu as DM } from 'radix-ui'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Declarative menu model shared by context menus and dropdowns. */
export type MenuItem =
  | {
      type?: 'item'
      label: string
      icon?: React.ReactNode
      shortcut?: string
      onSelect: () => void
      disabled?: boolean
      /** Explains why the item is disabled */
      reason?: string
      danger?: boolean
    }
  | { type: 'separator' }
  | { type: 'label'; label: string }
  | {
      type: 'submenu'
      label: string
      icon?: React.ReactNode
      items: MenuItem[]
      disabled?: boolean
    }

const content =
  'z-50 min-w-[13rem] max-h-[70vh] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'
const item =
  'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[0.95em] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'

type Kit = typeof CM | typeof DM

function renderItems(K: Kit, items: MenuItem[]): React.ReactNode {
  return items.map((it, i) => {
    if (it.type === 'separator')
      return <K.Separator key={i} className="-mx-1 my-1 h-px bg-border" />
    if (it.type === 'label')
      return (
        <K.Label
          key={i}
          className="px-2 py-1 text-[0.8em] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {it.label}
        </K.Label>
      )
    if (it.type === 'submenu')
      return (
        <K.Sub key={i}>
          <K.SubTrigger disabled={it.disabled} className={cn(item, 'data-[state=open]:bg-accent')}>
            {it.icon}
            <span className="flex-1">{it.label}</span>
            <ChevronRight />
          </K.SubTrigger>
          <K.Portal>
            <K.SubContent className={content}>{renderItems(K, it.items)}</K.SubContent>
          </K.Portal>
        </K.Sub>
      )
    return (
      <K.Item
        key={i}
        disabled={it.disabled}
        onSelect={it.onSelect}
        title={it.disabled ? it.reason : undefined}
        className={cn(
          item,
          it.danger &&
            'text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive'
        )}
      >
        {it.icon}
        <span className="flex-1">{it.label}</span>
        {it.shortcut && (
          <span className="ml-4 text-[0.8em] tracking-wide text-muted-foreground">
            {it.shortcut}
          </span>
        )}
      </K.Item>
    )
  })
}

export function ContextMenu({
  items,
  children,
  disabled
}: {
  items: MenuItem[] | (() => MenuItem[])
  children: React.ReactNode
  disabled?: boolean
}): React.JSX.Element {
  const [list, setList] = React.useState<MenuItem[]>([])
  return (
    <CM.Root onOpenChange={(o) => o && setList(typeof items === 'function' ? items() : items)}>
      <CM.Trigger asChild disabled={disabled}>
        {children}
      </CM.Trigger>
      <CM.Portal>
        <CM.Content className={content}>{renderItems(CM, list)}</CM.Content>
      </CM.Portal>
    </CM.Root>
  )
}

export function DropdownMenu({
  items,
  children,
  align = 'start'
}: {
  items: MenuItem[]
  children: React.ReactNode
  align?: 'start' | 'end' | 'center'
}): React.JSX.Element {
  return (
    <DM.Root>
      <DM.Trigger asChild>{children}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={4} className={content}>
          {renderItems(DM, items)}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}
