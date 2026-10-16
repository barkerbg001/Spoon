import * as React from 'react'
import { FolderOpen, ShieldAlert } from 'lucide-react'
import type { HostedRepo, HostingAccount } from '@shared/types'
import { parseRemoteUrl } from '@shared/remoteUrl'
import { call, newOpId } from '@/lib/api'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Kbd, Label, Select, Spinner } from '@/components/ui/primitives'
import { app, attachSummary, endOp, startOp, toast, toastError, trustRequest } from './state'
import { SHORTCUTS, formatBinding, bindingFor } from './shortcuts'
import { GITIGNORE_TEMPLATES } from '@/views/repoSettings/gitignoreTemplates'

const sep = (): string => (window.spoon.platform === 'win32' ? '\\' : '/')
const join = (a: string, b: string): string =>
  a.endsWith('/') || a.endsWith('\\') ? a + b : a + sep() + b

function nameFromUrl(url: string): string {
  const parsed = parseRemoteUrl(url.trim())
  const last =
    parsed?.path.split('/').pop() ??
    url
      .trim()
      .replace(/[\\/]+$/, '')
      .split(/[\\/:]/)
      .pop() ??
    ''
  return last.replace(/\.git$/i, '')
}

export function CloneDialog(): React.JSX.Element | null {
  const open = useStore(app, (s) => s.cloneOpen)
  const settings = useStore(app, (s) => s.settings)
  const ops = useStore(app, (s) => s.ops)
  const [url, setUrl] = React.useState('')
  const [parent, setParent] = React.useState('')
  const [name, setName] = React.useState('')
  const [nameTouched, setNameTouched] = React.useState(false)
  const [shallow, setShallow] = React.useState(false)
  const [submodules, setSubmodules] = React.useState(true)
  const [opId, setOpId] = React.useState<string | null>(null)
  const [accounts, setAccounts] = React.useState<HostingAccount[]>([])
  const [account, setAccount] = React.useState('')
  const [repos, setRepos] = React.useState<HostedRepo[] | null>(null)
  const [repoFilter, setRepoFilter] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setParent((p) => p || settings?.defaultCloneDir || '')
    setError(null)
    call('hosting.accounts', {})
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, [open, settings?.defaultCloneDir])

  React.useEffect(() => {
    if (!nameTouched) setName(nameFromUrl(url))
  }, [url, nameTouched])

  React.useEffect(() => {
    if (!account) return setRepos(null)
    setRepos(null)
    call('hosting.repos', { accountId: account })
      .then(setRepos)
      .catch((e) => (toastError(e, 'Load repositories'), setRepos([])))
  }, [account])

  if (!open) return null
  const progress = opId ? ops.find((o) => o.opId === opId)?.progress : undefined
  const close = (): void => {
    if (opId) return
    app.set({ cloneOpen: false })
    setUrl('')
    setNameTouched(false)
  }
  const invalid = !url.trim()
    ? 'Enter a repository URL.'
    : url.trim().startsWith('-') || /^ext::/i.test(url.trim())
      ? 'This URL is not allowed.'
      : !parent
        ? 'Choose a parent folder.'
        : !name.trim() || /[\\/:*?"<>|]/.test(name)
          ? 'Enter a valid folder name.'
          : null

  const clone = async (): Promise<void> => {
    if (invalid) return
    const id = newOpId()
    setOpId(id)
    setError(null)
    startOp({ opId: id, label: `Cloning ${name}`, repo: null, cancellable: true })
    try {
      const summary = await call('repo.clone', {
        url: url.trim(),
        path: join(parent, name.trim()),
        opId: id,
        depth: shallow ? 1 : undefined,
        recurseSubmodules: submodules
      })
      attachSummary(summary)
      toast({ kind: 'success', title: `Cloned ${name}` })
      app.set({ cloneOpen: false })
      setUrl('')
      setNameTouched(false)
    } catch (e) {
      const err = e as { code?: string; message: string }
      if (err.code !== 'CANCELLED') setError(err.message)
    } finally {
      endOp(id)
      setOpId(null)
    }
  }

  const visibleRepos = (repos ?? []).filter(
    (r) => !repoFilter || r.fullName.toLowerCase().includes(repoFilter.toLowerCase())
  )

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title="Clone repository"
      description="Authentication uses your existing Git credential helper or SSH agent."
      footer={
        <>
          {error && (
            <span
              className="mr-auto max-w-[60%] truncate text-[0.9em] text-destructive"
              title={error}
            >
              {error}
            </span>
          )}
          {opId ? (
            <Button variant="outline" onClick={() => void call('op.cancel', { opId })}>
              Cancel clone
            </Button>
          ) : (
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
          )}
          <Button
            disabled={!!invalid || !!opId}
            onClick={() => void clone()}
            title={invalid ?? undefined}
          >
            {opId ? 'Cloning…' : 'Clone'}
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void clone())}>
        {accounts.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="cl-acc">From an account (optional)</Label>
            <Select
              id="cl-acc"
              className="w-full"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.username} @ {new URL(a.baseUrl).host}
                </option>
              ))}
            </Select>
            {account && (
              <div className="rounded-md border">
                <Input
                  placeholder="Filter repositories"
                  value={repoFilter}
                  onChange={(e) => setRepoFilter(e.target.value)}
                  className="rounded-b-none border-0 border-b"
                  aria-label="Filter repositories"
                />
                <div className="max-h-40 overflow-auto" role="listbox">
                  {!repos ? (
                    <div className="p-2">
                      <Spinner />
                    </div>
                  ) : (
                    visibleRepos.slice(0, 300).map((r) => (
                      <button
                        type="button"
                        key={r.fullName}
                        role="option"
                        aria-selected={url === r.cloneUrl}
                        onClick={() => setUrl(r.cloneUrl)}
                        className={cn(
                          'block w-full truncate px-2 py-1 text-left text-[0.92em] hover:bg-accent',
                          url === r.cloneUrl && 'bg-primary/15'
                        )}
                      >
                        {r.fullName}{' '}
                        {r.private && <span className="text-muted-foreground">(private)</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="cl-url">Repository URL</Label>
          <Input
            id="cl-url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo.git or git@github.com:owner/repo.git"
            className="font-mono"
            disabled={!!opId}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cl-parent">Parent folder</Label>
          <div className="flex gap-2">
            <Input
              id="cl-parent"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              disabled={!!opId}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!!opId}
              onClick={() =>
                void call('dialog.pickDirectory', {
                  title: 'Choose where to clone',
                  defaultPath: parent || undefined
                }).then((d) => d && setParent(d))
              }
            >
              <FolderOpen /> Browse
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cl-name">Folder name</Label>
          <Input
            id="cl-name"
            value={name}
            onChange={(e) => (setName(e.target.value), setNameTouched(true))}
            disabled={!!opId}
          />
          {parent && name && (
            <p className="truncate text-[0.85em] text-muted-foreground">{join(parent, name)}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          <Checkbox
            checked={submodules}
            onCheckedChange={setSubmodules}
            label="Clone submodules"
            disabled={!!opId}
          />
          <Checkbox
            checked={shallow}
            onCheckedChange={setShallow}
            label="Shallow (latest commit only)"
            disabled={!!opId}
          />
        </div>
        {opId && (
          <div className="space-y-1" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded bg-muted">
              <div
                className={cn(
                  'h-full bg-primary transition-[width]',
                  progress?.percent == null && 'w-1/3 animate-pulse'
                )}
                style={progress?.percent != null ? { width: `${progress.percent}%` } : undefined}
              />
            </div>
            <p className="truncate text-[0.85em] text-muted-foreground">
              {progress?.message ?? 'Starting…'}
            </p>
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}

export function InitDialog(): React.JSX.Element | null {
  const open = useStore(app, (s) => s.initOpen)
  const [dir, setDir] = React.useState('')
  const [branch, setBranch] = React.useState('main')
  const [templates, setTemplates] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  if (!open) return null
  const close = (): void => app.set({ initOpen: false })
  const create = async (): Promise<void> => {
    setBusy(true)
    try {
      const summary = await call('repo.init', {
        path: dir,
        initialBranch: branch.trim() || undefined
      })
      let note: string | undefined
      if (templates.length) {
        const existing = await call('gitignore.read', { repo: summary.path })
        if (existing.trim()) note = 'An existing .gitignore was kept unchanged.'
        else
          await call('gitignore.write', {
            repo: summary.path,
            content: templates.map((t) => GITIGNORE_TEMPLATES[t]).join('\n\n') + '\n'
          })
      }
      attachSummary(summary)
      toast({ kind: 'success', title: 'Repository created', detail: note })
      close()
    } catch (e) {
      toastError(e, 'Create repository')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title="Create repository"
      description="Runs git init in the chosen folder. Existing files are left untouched."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!dir || busy || !/^[^\s~^:?*[\\]+$/.test(branch)}
            onClick={() => void create()}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="in-dir">Folder</Label>
          <div className="flex gap-2">
            <Input
              id="in-dir"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              placeholder="Choose or type a folder path"
            />
            <Button
              variant="outline"
              onClick={() =>
                void call('dialog.pickDirectory', { title: 'Folder for the new repository' }).then(
                  (d) => d && setDir(d)
                )
              }
            >
              <FolderOpen /> Browse
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="in-branch">Initial branch</Label>
          <Input
            id="in-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="font-mono"
          />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-[0.9em] font-medium">.gitignore starter (optional)</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.keys(GITIGNORE_TEMPLATES).map((t) => (
              <Checkbox
                key={t}
                label={t}
                checked={templates.includes(t)}
                onCheckedChange={(v) =>
                  setTemplates((s) => (v ? [...s, t] : s.filter((x) => x !== t)))
                }
              />
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  )
}

export function TrustDialog(): React.JSX.Element | null {
  const req = useStore(trustRequest, (s) => s.request)
  const [busy, setBusy] = React.useState(false)
  if (!req) return null
  const close = (): void => trustRequest.set({ request: null })
  const trust = async (): Promise<void> => {
    setBusy(true)
    try {
      const summary = await call('repo.trust', { path: req.path })
      attachSummary(summary, req.tabId)
      close()
    } catch (e) {
      toastError(e, 'Trust repository')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title={
        <span className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-modified" /> Repository owned by another user
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Don’t open
          </Button>
          <Button disabled={busy} onClick={() => void trust()}>
            Trust this repository
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[0.95em]">
        <p>
          Git refuses to work in <span className="font-mono text-[0.92em]">{req.path}</span> because
          the folder is owned by a different user account. This protects you from malicious
          repositories whose configuration could run programs.
        </p>
        <p>
          Trusting adds this exact path to <code className="font-mono">safe.directory</code> in your{' '}
          <b>global</b> Git configuration (
          <code className="font-mono">git config --global --add safe.directory</code>). Only do this
          if you trust the repository’s owner.
        </p>
        {req.detail && (
          <pre
            className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap"
            data-selectable
          >
            {req.detail}
          </pre>
        )}
      </div>
    </Dialog>
  )
}

export function ShortcutsDialog(): React.JSX.Element | null {
  const open = useStore(app, (s) => s.shortcutsOpen)
  useStore(app, (s) => s.settings?.shortcuts)
  if (!open) return null
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))]
  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && app.set({ shortcutsOpen: false })}
      title="Keyboard shortcuts"
      description="Customise them in Settings → Shortcuts."
    >
      <div className="grid grid-cols-2 gap-6">
        {groups.map((g) => (
          <section key={g}>
            <h3 className="mb-1 text-[0.85em] font-semibold tracking-wide text-muted-foreground uppercase">
              {g}
            </h3>
            <dl className="space-y-1">
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <dt>{s.label}</dt>
                  <dd>
                    <Kbd>{formatBinding(bindingFor(s.id)) || '—'}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section>
          <h3 className="mb-1 text-[0.85em] font-semibold tracking-wide text-muted-foreground uppercase">
            Lists
          </h3>
          <dl className="space-y-1">
            {[
              ['Move selection', '↑ ↓'],
              ['Extend selection', 'Shift+↑ ↓ / Shift+click'],
              ['Stage / unstage selected files', 'Space or Enter'],
              ['Discard selected files', 'Delete'],
              ['Clear line selection in a diff', 'Esc'],
              ['Reorder in interactive rebase', 'Alt+↑ ↓'],
              ['Context menu', 'Shift+F10 / Menu key']
            ].map(([a, b]) => (
              <div key={a} className="flex items-center justify-between gap-3">
                <dt>{a}</dt>
                <dd>
                  <Kbd>{b}</Kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Dialog>
  )
}
