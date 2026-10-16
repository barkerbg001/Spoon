import * as React from 'react'
import { Store, useStore } from '@/lib/store'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/primitives'

export type Field =
  | {
      name: string
      label: string
      type?: 'text'
      initial?: string
      placeholder?: string
      mono?: boolean
      hint?: string
      autoFocus?: boolean
    }
  | {
      name: string
      label: string
      type: 'textarea'
      initial?: string
      placeholder?: string
      rows?: number
      hint?: string
    }
  | {
      name: string
      label: string
      type: 'select'
      initial?: string
      options: { value: string; label: string }[]
      hint?: string
    }
  | { name: string; label: string; type: 'checkbox'; initial?: boolean; hint?: string }

type Values = Record<string, string | boolean>

interface Pending {
  id: number
  render: (close: (v: unknown) => void) => React.ReactNode
  resolve: (v: unknown) => void
}

const dialogs = new Store<{ stack: Pending[] }>({ stack: [] })
let seq = 0

export function openDialog<T>(
  render: (close: (v: T | null) => void) => React.ReactNode
): Promise<T | null> {
  return new Promise((resolve) => {
    const id = ++seq
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const close = (v: unknown): void => {
      dialogs.set((s) => ({ stack: s.stack.filter((d) => d.id !== id) }))
      resolve(v as T | null)
      // Keep keyboard flows going: return focus to where the dialog was opened from.
      requestAnimationFrame(() => {
        if (opener?.isConnected && !document.querySelector('[role="dialog"], [role="alertdialog"]'))
          opener.focus({ preventScroll: true })
      })
    }
    dialogs.set((s) => ({
      stack: [...s.stack, { id, render: render as Pending['render'], resolve: close }]
    }))
  })
}

export function DialogHost(): React.JSX.Element {
  const stack = useStore(dialogs, (s) => s.stack)
  return (
    <>
      {stack.map((d) => (
        <React.Fragment key={d.id}>{d.render(d.resolve)}</React.Fragment>
      ))}
    </>
  )
}

export function confirm(opts: {
  title: string
  description?: React.ReactNode
  details?: React.ReactNode
  items?: string[]
  confirmLabel?: string
  destructive?: boolean
  checkbox?: { label: string; initial?: boolean }
}): Promise<{ checked: boolean } | null> {
  return openDialog<{ checked: boolean }>((close) => <ConfirmDialog {...opts} close={close} />)
}

function ConfirmDialog(
  props: Parameters<typeof confirm>[0] & { close: (v: { checked: boolean } | null) => void }
): React.JSX.Element {
  const [checked, setChecked] = React.useState(props.checkbox?.initial ?? false)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.close(null)}
      title={props.title}
      description={props.description}
      footer={
        <>
          <Button variant="outline" onClick={() => props.close(null)}>
            Cancel
          </Button>
          <Button
            autoFocus
            variant={props.destructive ? 'destructive' : 'default'}
            onClick={() => props.close({ checked })}
          >
            {props.confirmLabel ?? 'Continue'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {props.details}
        {props.items && props.items.length > 0 && (
          <ul
            className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[12px]"
            data-selectable
          >
            {props.items.slice(0, 500).map((i) => (
              <li key={i} className="truncate">
                {i}
              </li>
            ))}
            {props.items.length > 500 && (
              <li className="text-muted-foreground">…and {props.items.length - 500} more</li>
            )}
          </ul>
        )}
        {props.checkbox && (
          <Checkbox checked={checked} onCheckedChange={setChecked} label={props.checkbox.label} />
        )}
      </div>
    </Dialog>
  )
}

export function prompt(opts: {
  title: string
  description?: React.ReactNode
  fields: Field[]
  confirmLabel?: string
  destructive?: boolean
  validate?: (v: Values) => string | null
  wide?: boolean
}): Promise<Values | null> {
  return openDialog<Values>((close) => <PromptDialog {...opts} close={close} />)
}

function PromptDialog(
  props: Parameters<typeof prompt>[0] & { close: (v: Values | null) => void }
): React.JSX.Element {
  const [values, setValues] = React.useState<Values>(() =>
    Object.fromEntries(
      props.fields.map((f) => [
        f.name,
        f.type === 'checkbox'
          ? (f.initial ?? false)
          : (f.initial ?? (f.type === 'select' ? (f.options[0]?.value ?? '') : ''))
      ])
    )
  )
  const error = props.validate?.(values) ?? null
  const submit = (e?: React.FormEvent): void => {
    e?.preventDefault()
    if (!error) props.close(values)
  }
  const set = (name: string, v: string | boolean): void => setValues((s) => ({ ...s, [name]: v }))
  return (
    <Dialog
      open
      wide={props.wide}
      onOpenChange={(o) => !o && props.close(null)}
      title={props.title}
      description={props.description}
      footer={
        <>
          {error && <span className="mr-auto text-[0.9em] text-destructive">{error}</span>}
          <Button variant="outline" onClick={() => props.close(null)}>
            Cancel
          </Button>
          <Button
            variant={props.destructive ? 'destructive' : 'default'}
            disabled={!!error}
            onClick={() => submit()}
          >
            {props.confirmLabel ?? 'OK'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {props.fields.map((f, i) => (
          <div key={f.name} className="space-y-1">
            {f.type === 'checkbox' ? (
              <Checkbox
                checked={values[f.name] as boolean}
                onCheckedChange={(v) => set(f.name, v)}
                label={f.label}
              />
            ) : (
              <>
                <Label htmlFor={`f-${f.name}`}>{f.label}</Label>
                {f.type === 'textarea' ? (
                  <Textarea
                    id={`f-${f.name}`}
                    rows={f.rows ?? 4}
                    value={values[f.name] as string}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                ) : f.type === 'select' ? (
                  <Select
                    id={`f-${f.name}`}
                    className="w-full"
                    value={values[f.name] as string}
                    onChange={(e) => set(f.name, e.target.value)}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={`f-${f.name}`}
                    autoFocus={f.autoFocus ?? i === 0}
                    className={f.mono ? 'font-mono' : undefined}
                    value={values[f.name] as string}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
              </>
            )}
            {f.hint && <p className="text-[0.85em] text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}

export const validRefName = (s: string): string | null => {
  if (!s.trim()) return 'Enter a name.'
  if (/^-|[\s~^:?*[\\]|\.\.|@\{|\.lock$|^\/|\/$|\.$|\/\//.test(s))
    return 'This is not a valid Git reference name.'
  return null
}
