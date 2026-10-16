import * as React from 'react'
import { Check, KeyRound, Monitor, Moon, RotateCcw, Sun, Trash2 } from 'lucide-react'
import type { HostingAccount, HostingKind, Settings } from '@shared/types'
import type { ApiResult } from '@shared/api'
import { call } from '@/lib/api'
import { useStore } from '@/lib/store'
import { ACCENTS } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Kbd, Label, Select, Spinner, Switch } from '@/components/ui/primitives'
import { app, toast, toastError, updateSettings } from './state'
import { confirm } from './dialogs'
import { SHORTCUTS, bindingFor, eventToBinding, formatBinding } from './shortcuts'

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'diff', label: 'Diff' },
  { id: 'git', label: 'Git' },
  { id: 'identity', label: 'Identity & signing' },
  { id: 'tools', label: 'Tools' },
  { id: 'fetch', label: 'Fetching & notifications' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'privacy', label: 'Privacy & about' }
]

export function SettingsDialog(): React.JSX.Element | null {
  const open = useStore(app, (s) => s.settingsOpen)
  const section = useStore(app, (s) => s.settingsSection)
  const settings = useStore(app, (s) => s.settings)
  if (!open || !settings) return null
  return (
    <Dialog
      open
      wide
      className="h-[80vh]"
      onOpenChange={(o) => !o && app.set({ settingsOpen: false })}
      title="Settings"
      description="Application preferences are stored locally. Git configuration changes happen only when you click Save in the Git or Identity sections."
    >
      <div className="-mx-5 -my-4 flex h-full min-h-[60vh]">
        <nav className="w-48 shrink-0 space-y-0.5 border-r p-2" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => app.set({ settingsSection: s.id })}
              aria-current={section === s.id}
              className={cn(
                'w-full rounded-md px-2 py-1.5 text-left',
                section === s.id ? 'bg-primary/15 font-medium' : 'hover:bg-accent'
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-5 overflow-auto p-5">
          {section === 'appearance' && <Appearance s={settings} />}
          {section === 'diff' && <DiffSettings s={settings} />}
          {section === 'git' && <GitSettings s={settings} />}
          {section === 'identity' && <GlobalIdentity />}
          {section === 'tools' && <Tools s={settings} />}
          {section === 'fetch' && <FetchSettings s={settings} />}
          {section === 'accounts' && <Accounts />}
          {section === 'shortcuts' && <Shortcuts s={settings} />}
          {section === 'privacy' && <Privacy />}
        </div>
      </div>
    </Dialog>
  )
}

function Row({
  label,
  hint,
  children,
  htmlFor
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
  htmlFor?: string
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[13rem_1fr] items-start gap-4">
      <div>
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <p className="text-[0.85em] text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Text setting that saves on blur/Enter instead of on each keystroke. */
function TextSetting({
  id,
  value,
  onSave,
  placeholder,
  mono
}: {
  id: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
  mono?: boolean
}): React.JSX.Element {
  const [v, setV] = React.useState(value)
  React.useEffect(() => setV(value), [value])
  return (
    <Input
      id={id}
      value={v}
      placeholder={placeholder}
      className={mono ? 'font-mono' : undefined}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && v !== value && onSave(v)}
    />
  )
}

function Appearance({ s }: { s: Settings }): React.JSX.Element {
  const themes: { v: Settings['theme']; label: string; icon: React.ReactNode }[] = [
    { v: 'light', label: 'Light', icon: <Sun /> },
    { v: 'dark', label: 'Dark', icon: <Moon /> },
    { v: 'system', label: 'System', icon: <Monitor /> }
  ]
  return (
    <>
      <Row label="Theme" hint="System follows your OS and updates live.">
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {themes.map((t) => (
            <button
              key={t.v}
              role="radio"
              aria-checked={s.theme === t.v}
              onClick={() => void updateSettings({ theme: t.v })}
              className={cn(
                'flex w-24 flex-col items-center gap-1 rounded-md border p-2 [&>svg]:size-5',
                s.theme === t.v ? 'border-primary bg-primary/10' : 'hover:bg-accent'
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </Row>
      <Row
        label="Accent colour"
        hint="Adjusted automatically to keep enough contrast in light and dark themes."
      >
        <div
          className="flex flex-wrap items-center gap-2"
          role="radiogroup"
          aria-label="Accent colour"
        >
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              role="radio"
              aria-checked={s.accent.toLowerCase() === a.value}
              aria-label={a.name}
              title={a.name}
              onClick={() => void updateSettings({ accent: a.value })}
              className="flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2"
              style={{ background: a.value }}
            >
              {s.accent.toLowerCase() === a.value && <Check className="size-4 text-white" />}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-[0.9em]">
            <input
              type="color"
              value={s.accent}
              onChange={(e) => void updateSettings({ accent: e.target.value })}
              aria-label="Custom accent colour"
              className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            Custom
          </label>
        </div>
      </Row>
      <Row label="Density">
        <Select
          value={s.density}
          onChange={(e) => void updateSettings({ density: e.target.value as Settings['density'] })}
          aria-label="Density"
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </Select>
      </Row>
      <Row label="Interface font size" htmlFor="ui-size">
        <div className="flex items-center gap-2">
          <input
            id="ui-size"
            type="range"
            min={11}
            max={17}
            value={s.uiFontSize}
            onChange={(e) => void updateSettings({ uiFontSize: Number(e.target.value) })}
            className="w-48 accent-[var(--primary)]"
          />
          <span className="w-10 text-muted-foreground">{s.uiFontSize}px</span>
        </div>
      </Row>
      <Row
        label="Monospace font"
        hint="Used for diffs and code. Leave empty for the default."
        htmlFor="mono-font"
      >
        <TextSetting
          id="mono-font"
          value={s.monoFont}
          placeholder="Cascadia Code"
          onSave={(v) => void updateSettings({ monoFont: v })}
        />
      </Row>
      <Row label="Reduce motion">
        <Select
          value={s.reduceMotion}
          onChange={(e) =>
            void updateSettings({ reduceMotion: e.target.value as Settings['reduceMotion'] })
          }
          aria-label="Reduce motion"
        >
          <option value="system">Follow system</option>
          <option value="on">Always</option>
          <option value="off">Never</option>
        </Select>
      </Row>
    </>
  )
}

function DiffSettings({ s }: { s: Settings }): React.JSX.Element {
  return (
    <>
      <Row label="Layout">
        <Select
          value={s.diffView}
          onChange={(e) =>
            void updateSettings({ diffView: e.target.value as Settings['diffView'] })
          }
          aria-label="Diff layout"
        >
          <option value="unified">Unified</option>
          <option value="split">Side by side</option>
        </Select>
      </Row>
      <Row label="Context lines" htmlFor="ctx">
        <Input
          id="ctx"
          type="number"
          min={0}
          max={50}
          value={s.diffContext}
          onChange={(e) =>
            void updateSettings({
              diffContext: Math.max(0, Math.min(50, Number(e.target.value) || 0))
            })
          }
          className="w-24"
        />
      </Row>
      <Row label="Whitespace">
        <div className="space-y-2">
          <Checkbox
            checked={s.diffIgnoreWhitespace}
            onCheckedChange={(v) => void updateSettings({ diffIgnoreWhitespace: v })}
            label="Ignore whitespace changes (line staging is disabled while active)"
          />
          <Checkbox
            checked={s.diffShowWhitespace}
            onCheckedChange={(v) => void updateSettings({ diffShowWhitespace: v })}
            label="Show whitespace characters"
          />
          <Checkbox
            checked={s.diffWrap}
            onCheckedChange={(v) => void updateSettings({ diffWrap: v })}
            label="Wrap long lines"
          />
        </div>
      </Row>
    </>
  )
}

function GitSettings({ s }: { s: Settings }): React.JSX.Element {
  const info = useStore(app, (x) => x.info)
  return (
    <>
      <Row label="Git executable" hint="Leave empty to find Git on your PATH." htmlFor="git-path">
        <TextSetting
          id="git-path"
          value={s.gitPath}
          mono
          placeholder="auto-detect"
          onSave={(v) =>
            void updateSettings({ gitPath: v }).then(() =>
              call('app.info', {}).then((i) => app.set({ info: i }))
            )
          }
        />
        <p className="mt-1 text-[0.88em]">
          {info?.git ? (
            <span className="text-muted-foreground">
              Using Git {info.git.version} at <span className="font-mono">{info.git.path}</span>
              {info.git.lfsVersion && ` · ${info.git.lfsVersion}`}
            </span>
          ) : (
            <span className="text-destructive">{info?.gitError ?? 'Git not found'}</span>
          )}
        </p>
        {info?.git && (
          <ul className="mt-1 text-[0.85em] text-muted-foreground">
            <li>switch/restore: {info.git.capabilities.switchRestore ? 'yes' : 'no'}</li>
            <li>
              rebase --update-refs: {info.git.capabilities.updateRefs ? 'yes' : 'no (Git 2.38+)'}
            </li>
            <li>
              merge-tree --write-tree:{' '}
              {info.git.capabilities.mergeTreeWriteTree ? 'yes' : 'no (Git 2.38+)'}
            </li>
          </ul>
        )}
      </Row>
      <Row
        label="Proxy"
        hint="Passed to Git as http.proxy for Spoon’s own Git commands only. Your Git configuration is not changed."
        htmlFor="proxy"
      >
        <TextSetting
          id="proxy"
          value={s.proxy}
          mono
          placeholder="http://proxy.example:8080"
          onSave={(v) => void updateSettings({ proxy: v.trim() })}
        />
      </Row>
      <Row label="Default clone folder" htmlFor="clone-dir">
        <div className="flex gap-2">
          <TextSetting
            id="clone-dir"
            value={s.defaultCloneDir}
            onSave={(v) => void updateSettings({ defaultCloneDir: v })}
          />
          <Button
            variant="outline"
            onClick={() =>
              void call('dialog.pickDirectory', { title: 'Default clone folder' }).then((d) => {
                if (d) void updateSettings({ defaultCloneDir: d })
              })
            }
          >
            Browse
          </Button>
        </div>
      </Row>
      <p className="text-[0.88em] text-muted-foreground">
        Certificate verification and credential helpers are always left to your Git configuration;
        Spoon never disables TLS checks.
      </p>
    </>
  )
}

function GlobalIdentity(): React.JSX.Element {
  const [data, setData] = React.useState<ApiResult<'config.identity'> | null>(null)
  const [form, setForm] = React.useState({ name: '', email: '', signingKey: '', gpgSign: false })
  const load = React.useCallback(() => {
    call('config.identity', {})
      .then((d) => {
        setData(d)
        setForm({
          name: d.global.name ?? '',
          email: d.global.email ?? '',
          signingKey: d.global.signingKey ?? '',
          gpgSign: !!d.global.gpgSign
        })
      })
      .catch((e) => toastError(e))
  }, [])
  React.useEffect(load, [load])
  if (!data) return <Spinner />
  const save = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Update global Git configuration?',
      description:
        'This writes user.name, user.email, user.signingkey and commit.gpgsign to your global ~/.gitconfig, affecting every repository and other Git tools.',
      confirmLabel: 'Save to global config'
    })
    if (!ok) return
    try {
      await call('config.setIdentity', {
        scope: 'global',
        name: form.name.trim() || null,
        email: form.email.trim() || null,
        signingKey: form.signingKey.trim() || null,
        gpgSign: form.gpgSign
      })
      toast({ kind: 'success', title: 'Global identity saved' })
      load()
    } catch (e) {
      toastError(e, 'Save identity')
    }
  }
  return (
    <>
      <p className="text-[0.9em] text-muted-foreground">
        Your global Git identity. Per-repository overrides are in each repository’s settings.
      </p>
      <Row label="Name" htmlFor="g-name">
        <Input
          id="g-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Row>
      <Row label="Email" htmlFor="g-email">
        <Input
          id="g-email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Row>
      <Row
        label="Signing key"
        hint="GPG key ID or SSH public key path, depending on gpg.format."
        htmlFor="g-key"
      >
        <Input
          id="g-key"
          className="font-mono"
          value={form.signingKey}
          onChange={(e) => setForm({ ...form, signingKey: e.target.value })}
        />
      </Row>
      <Row label="Sign commits">
        <Checkbox
          checked={form.gpgSign}
          onCheckedChange={(v) => setForm({ ...form, gpgSign: v })}
          label="Sign all commits by default (commit.gpgsign)"
        />
      </Row>
      <Button onClick={() => void save()}>Save to global Git config…</Button>
    </>
  )
}

function Tools({ s }: { s: Settings }): React.JSX.Element {
  return (
    <>
      <Row
        label="Editor command"
        hint={
          <>
            Program and arguments; the path is appended. Empty: VS Code if installed, otherwise the
            system default. Example: <code className="font-mono">code -n</code>
          </>
        }
        htmlFor="editor"
      >
        <TextSetting
          id="editor"
          value={s.editorCommand}
          mono
          placeholder="code"
          onSave={(v) => void updateSettings({ editorCommand: v })}
        />
      </Row>
      <Row
        label="Terminal command"
        hint="Started in the repository folder. Empty: Windows Terminal/cmd, Terminal.app, or a common Linux terminal."
        htmlFor="terminal"
      >
        <TextSetting
          id="terminal"
          value={s.terminalCommand}
          mono
          placeholder="wt"
          onSave={(v) => void updateSettings({ terminalCommand: v })}
        />
      </Row>
      <Row
        label="External diff tool"
        hint="A git difftool name (e.g. vscode, meld, bc). Empty uses diff.tool from your Git config."
        htmlFor="difftool"
      >
        <TextSetting
          id="difftool"
          value={s.diffTool}
          mono
          placeholder="from git config"
          onSave={(v) => void updateSettings({ diffTool: v.trim() })}
        />
      </Row>
      <Row
        label="External merge tool"
        hint="A git mergetool name. Empty uses merge.tool from your Git config."
        htmlFor="mergetool"
      >
        <TextSetting
          id="mergetool"
          value={s.mergeTool}
          mono
          placeholder="from git config"
          onSave={(v) => void updateSettings({ mergeTool: v.trim() })}
        />
      </Row>
    </>
  )
}

function FetchSettings({ s }: { s: Settings }): React.JSX.Element {
  return (
    <>
      <Row
        label="Automatic fetch"
        hint="Off by default. Fetches all remotes of open repositories in the background; never pulls or merges."
      >
        <div className="flex items-center gap-3">
          <Switch
            checked={s.autoFetch}
            onCheckedChange={(v) => void updateSettings({ autoFetch: v })}
            label="Automatic fetch"
          />
          <span className="text-[0.9em]">every</span>
          <Select
            value={String(s.autoFetchMinutes)}
            disabled={!s.autoFetch}
            onChange={(e) => void updateSettings({ autoFetchMinutes: Number(e.target.value) })}
            aria-label="Fetch interval"
          >
            {[5, 10, 15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </div>
      </Row>
      <Row
        label="Notifications"
        hint="Desktop notifications when long operations finish while Spoon is in the background."
      >
        <Switch
          checked={s.notifications}
          onCheckedChange={(v) => void updateSettings({ notifications: v })}
          label="Notifications"
        />
      </Row>
    </>
  )
}

const KIND_DEFAULTS: Record<
  HostingKind,
  { label: string; url: string; tokenHelp: string; maturity: string }
> = {
  github: {
    label: 'GitHub',
    url: 'https://github.com',
    tokenHelp:
      'A fine-grained or classic personal access token with repository read access (and pull request read).',
    maturity: 'Supported'
  },
  gitlab: {
    label: 'GitLab',
    url: 'https://gitlab.com',
    tokenHelp: 'A personal access token with the read_api scope.',
    maturity: 'Supported'
  },
  bitbucket: {
    label: 'Bitbucket Cloud',
    url: 'https://bitbucket.org',
    tokenHelp:
      'A workspace, project or repository access token (sent as a Bearer token) with repository and pull request read scopes.',
    maturity: 'Experimental'
  },
  azure: {
    label: 'Azure DevOps',
    url: 'https://dev.azure.com',
    tokenHelp:
      'A personal access token with Code (Read) scope. Use https://dev.azure.com/<organization> as the URL.',
    maturity: 'Experimental'
  }
}

function Accounts(): React.JSX.Element {
  const [accounts, setAccounts] = React.useState<HostingAccount[] | null>(null)
  const [kind, setKind] = React.useState<HostingKind>('github')
  const [url, setUrl] = React.useState(KIND_DEFAULTS.github.url)
  const [token, setToken] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    call('hosting.accounts', {})
      .then(setAccounts)
      .catch((e) => (toastError(e), setAccounts([])))
  }, [])
  const add = async (): Promise<void> => {
    setBusy(true)
    try {
      const a = await call('hosting.addAccount', { kind, baseUrl: url.trim(), token: token.trim() })
      setAccounts((xs) => [...(xs ?? []), a])
      setToken('')
      toast({ kind: 'success', title: `Signed in as ${a.username}` })
    } catch (e) {
      toastError(e, 'Add account')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (a: HostingAccount): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${a.username}?`,
      description:
        'The stored token is deleted from Spoon’s encrypted storage. Revoke it on the hosting service if it is no longer needed.',
      confirmLabel: 'Remove',
      destructive: true
    })
    if (!ok) return
    try {
      setAccounts(await call('hosting.removeAccount', { id: a.id }))
    } catch (e) {
      toastError(e)
    }
  }
  const d = KIND_DEFAULTS[kind]
  return (
    <>
      <p className="text-[0.9em] text-muted-foreground">
        Accounts are used only for hosting features (pull requests, CI status, repository lists).
        Git operations such as fetch and push always use your existing Git credential helper or SSH
        agent. Tokens are encrypted with your operating system’s secure storage and never written to
        settings or logs; if secure storage is unavailable, tokens are refused.
      </p>
      {!accounts ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <p className="text-muted-foreground">No accounts.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <KeyRound className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {a.username}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {KIND_DEFAULTS[a.kind].label}
                  </span>
                </div>
                <div className="truncate text-[0.85em] text-muted-foreground">
                  {a.baseUrl}{' '}
                  {!a.hasToken && (
                    <span className="text-destructive">
                      — token unavailable, re-add the account
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${a.username}`}
                onClick={() => void remove(a)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-3 rounded-md border p-3"
        onSubmit={(e) => (e.preventDefault(), void add())}
      >
        <div className="font-medium">Add account</div>
        <Row label="Service">
          <Select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as HostingKind
              setKind(k)
              setUrl(KIND_DEFAULTS[k].url)
            }}
            aria-label="Hosting service"
          >
            {(Object.keys(KIND_DEFAULTS) as HostingKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_DEFAULTS[k].label} ({KIND_DEFAULTS[k].maturity})
              </option>
            ))}
          </Select>
        </Row>
        <Row
          label="Server URL"
          hint="Change for GitHub Enterprise Server or self-managed GitLab."
          htmlFor="acc-url"
        >
          <Input
            id="acc-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="font-mono"
          />
        </Row>
        <Row label="Access token" hint={d.tokenHelp} htmlFor="acc-token">
          <Input
            id="acc-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="font-mono"
          />
        </Row>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !token.trim() || !/^https:\/\//.test(url.trim())}>
            {busy ? 'Verifying…' : 'Add account'}
          </Button>
        </div>
      </form>
    </>
  )
}

function Shortcuts({ s }: { s: Settings }): React.JSX.Element {
  const [recording, setRecording] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(null)
      const b = eventToBinding(e)
      if (!b) return
      const clash = SHORTCUTS.find((x) => x.id !== recording && bindingFor(x.id) === b)
      if (clash)
        toast({ kind: 'error', title: `${formatBinding(b)} is already used by “${clash.label}”.` })
      else void updateSettings({ shortcuts: { ...s.shortcuts, [recording]: b } })
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, s.shortcuts])
  return (
    <>
      <p className="text-[0.9em] text-muted-foreground">
        Click a shortcut, then press the new key combination (Esc cancels).
      </p>
      <table className="w-full text-[0.95em]">
        <tbody>
          {SHORTCUTS.filter((x) => x.id !== 'commit').map((x) => (
            <tr key={x.id} className="border-b last:border-0">
              <td className="py-1.5">{x.label}</td>
              <td className="py-1.5 text-right">
                <button
                  className={cn(
                    'rounded border px-2 py-0.5 font-mono text-[12px]',
                    recording === x.id ? 'border-primary bg-primary/10' : 'hover:bg-accent'
                  )}
                  onClick={() => setRecording(x.id)}
                  aria-label={`Change shortcut for ${x.label}`}
                >
                  {recording === x.id ? 'Press keys…' : formatBinding(bindingFor(x.id)) || '—'}
                </button>
                {s.shortcuts[x.id] && (
                  <button
                    className="ml-1 rounded p-1 text-muted-foreground hover:bg-accent"
                    aria-label={`Reset ${x.label}`}
                    title="Reset to default"
                    onClick={() => {
                      const { [x.id]: _, ...rest } = s.shortcuts
                      void updateSettings({ shortcuts: rest })
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[0.85em] text-muted-foreground">
        <Kbd>{formatBinding('Mod+Enter')}</Kbd> commits from the message box.
      </p>
    </>
  )
}

function Privacy(): React.JSX.Element {
  const info = useStore(app, (s) => s.info)
  return (
    <div className="space-y-3 text-[0.95em]">
      <p>
        <b>No telemetry.</b> Spoon does not collect analytics or usage data and requires no cloud
        service. Network access happens only for Git operations you trigger (or automatic fetch, if
        you enable it) and for hosting features when you add an account.
      </p>
      <p>
        AI features are not included. If they are added later they will be opt-in and show exactly
        what would be sent before sending anything.
      </p>
      <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-[0.9em]">
        <dt className="text-muted-foreground">Version</dt>
        <dd>{info?.version}</dd>
        <dt className="text-muted-foreground">Electron</dt>
        <dd>{info?.electron}</dd>
        <dt className="text-muted-foreground">Platform</dt>
        <dd>
          {info?.platform} ({info?.arch})
        </dd>
        <dt className="text-muted-foreground">Settings folder</dt>
        <dd className="font-mono text-[11px] break-all" data-selectable>
          {info?.userData}
        </dd>
      </dl>
      <Button variant="outline" onClick={() => app.set({ oplogOpen: true, settingsOpen: false })}>
        Show Git operation log
      </Button>
    </div>
  )
}
