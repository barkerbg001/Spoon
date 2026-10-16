import * as React from 'react'
import {
  Checkbox as CheckboxPrimitive,
  Switch as SwitchPrimitive,
  Tooltip as TooltipPrimitive
} from 'radix-ui'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-[0.95em] placeholder:text-muted-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring',
      className
    )}
    spellCheck={false}
    {...props}
  />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[0.95em] placeholder:text-muted-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring resize-none',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  return (
    <label className={cn('text-[0.9em] font-medium text-foreground/90', className)} {...props} />
  )
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select
      className={cn(
        'h-8 rounded-md border border-input bg-background px-2 text-[0.95em] focus-visible:outline-2 focus-visible:outline-ring',
        className
      )}
      {...props}
    />
  )
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
  className
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label?: React.ReactNode
  id?: string
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  const autoId = React.useId()
  const cid = id ?? autoId
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <CheckboxPrimitive.Root
        id={cid}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="peer size-4 shrink-0 rounded-[4px] border border-input bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
          <Check className="size-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && (
        <label htmlFor={cid} className="text-[0.95em] leading-tight cursor-pointer select-none">
          {label}
        </label>
      )}
    </div>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onCheckedChange={onCheckedChange}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input transition-colors data-[state=checked]:bg-primary disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-4 translate-x-0.5" />
    </SwitchPrimitive.Root>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider

export function Tip({
  content,
  children,
  side = 'bottom'
}: {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
}): React.JSX.Element {
  if (!content) return children
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={5}
          className="z-50 max-w-sm rounded-md bg-foreground px-2 py-1 text-[0.85em] text-background shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function Kbd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  )
}

export function Badge({
  className,
  children,
  title
}: {
  className?: string
  children: React.ReactNode
  title?: string
}): React.JSX.Element {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 text-[11px] leading-[18px] font-medium whitespace-nowrap',
        className
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary',
        className
      )}
    />
  )
}

export function EmptyState({
  icon,
  title,
  children
}: {
  icon?: React.ReactNode
  title: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      {icon && <div className="text-muted-foreground/60 [&_svg]:size-10">{icon}</div>}
      <div className="font-medium text-foreground/80">{title}</div>
      {children && <div className="max-w-md text-[0.92em]">{children}</div>}
    </div>
  )
}
