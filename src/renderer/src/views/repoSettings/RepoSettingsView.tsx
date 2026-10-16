import * as React from 'react'
import { ArrowLeft, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ApiResult } from '@shared/api'
import { call } from '@/lib/api'
import { cn, short } from '@/lib/utils'
import { openRepository, toast, toastError } from '@/app/state'
import { prompt, validRefName } from '@/app/dialogs'
import { useRepo } from '@/app/repo/context'
import * as A from '@/app/repo/actions'
import { Button } from '@/components/ui/button'
import {
  Badge,
  Checkbox,
  EmptyState,
  Input,
  Label,
  Select,
  Spinner,
  Textarea
} from '@/components/ui/primitives'
import { GITIGNORE_TEMPLATES } from './gitignoreTemplates'

const SECTIONS = [
  { id: 'identity', label: 'Identity & signing' },
  { id: 'remotes', label: 'Remotes' },
  { id: 'gitignore', label: '.gitignore' },
  { id: 'worktrees', label: 'Worktrees' },
  { id: 'submodules', label: 'Submodules' },
  { id: 'lfs', label: 'Git LFS' },
  { id: 'flow', label: 'Git-flow' }
] as const
type SectionId = (typeof SECTIONS)[number]['id']

export function RepoSettingsView(): React.JSX.Element {
  const r = useRepo()
  const [section, setSection] = React.useState<SectionId>('identity')
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
        <Button size="sm" variant="ghost" onClick={() => r.setView({ kind: 'history' })}>
          <ArrowLeft /> History
        </Button>
        <span className="font-medium">Repository settings</span>
        <span className="truncate text-[0.88em] text-muted-foreground">{r.path}</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          className="w-48 shrink-0 space-y-0.5 border-r bg-sidebar p-2"
          aria-label="Repository settings sections"
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
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
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="max-w-3xl space-y-4">
            {section === 'identity' && <IdentitySection />}
            {section === 'remotes' && <RemotesSection />}
            {section === 'gitignore' && <GitignoreSection />}
            {section === 'worktrees' && <WorktreesSection />}
            {section === 'submodules' && <SubmodulesSection />}
            {section === 'lfs' && <LfsSection />}
            {section === 'flow' && <FlowSection />}
          </div>
        </div>
      </div>
    </div>
  )
}

function H({
  children,
  sub
}: {
  children: React.ReactNode
  sub?: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <h2 className="text-[1.1em] font-semibold">{children}</h2>
      {sub && <p className="text-[0.9em] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function IdentitySection(): React.JSX.Element {
  const r = useRepo()
  const [data, setData] = React.useState<ApiResult<'config.identity'> | null>(null)
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    signingKey: '',
    gpgSign: 'inherit'
  })
  const load = React.useCallback(() => {
    call('config.identity', { repo: r.path })
      .then((d) => {
        setData(d)
        setForm({
          name: d.local.name ?? '',
          email: d.local.email ?? '',
          signingKey: d.local.signingKey ?? '',
          gpgSign: d.local.gpgSign == null ? 'inherit' : d.local.gpgSign ? 'on' : 'off'
        })
      })
      .catch((e) => toastError(e))
  }, [r.path])
  React.useEffect(load, [load])
  if (!data) return <Spinner />
  const save = async (): Promise<void> => {
    try {
      await call('config.setIdentity', {
        repo: r.path,
        scope: 'local',
        name: form.name.trim() || null,
        email: form.email.trim() || null,
        signingKey: form.signingKey.trim() || null,
        gpgSign: form.gpgSign === 'inherit' ? null : form.gpgSign === 'on'
      })
      toast({ kind: 'success', title: 'Repository identity saved (.git/config)' })
      load()
    } catch (e) {
      toastError(e, 'Save identity')
    }
  }
  return (
    <>
      <H sub="Overrides for this repository only, stored in its .git/config. Leave a field empty to use your global value.">
        Identity & signing
      </H>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="id-name">Name</Label>
          <Input
            id="id-name"
            value={form.name}
            placeholder={data.global.name ?? 'not set globally'}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="id-email">Email</Label>
          <Input
            id="id-email"
            value={form.email}
            placeholder={data.global.email ?? 'not set globally'}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="id-key">Signing key (user.signingkey)</Label>
          <Input
            id="id-key"
            className="font-mono"
            value={form.signingKey}
            placeholder={data.global.signingKey ?? 'not set'}
            onChange={(e) => setForm({ ...form, signingKey: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="id-sign">Sign commits by default (commit.gpgsign)</Label>
          <Select
            id="id-sign"
            className="w-full"
            value={form.gpgSign}
            onChange={(e) => setForm({ ...form, gpgSign: e.target.value })}
          >
            <option value="inherit">Inherit global ({data.global.gpgSign ? 'on' : 'off'})</option>
            <option value="on">Always sign</option>
            <option value="off">Never sign</option>
          </Select>
        </div>
      </div>
      <p className="text-[0.85em] text-muted-foreground">
        Signing uses your existing GPG/SSH signing setup (gpg.format, gpg.program). Spoon does not
        manage keys.
      </p>
      <Button onClick={() => void save()}>Save</Button>
    </>
  )
}

function RemotesSection(): React.JSX.Element {
  const r = useRepo()
  const remotes = r.refs?.remotes ?? []
  return (
    <>
      <H sub="Remotes are stored in the repository configuration.">Remotes</H>
      {remotes.length === 0 ? (
        <p className="text-muted-foreground">No remotes configured.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {remotes.map((x) => (
            <li key={x.name} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{x.name}</div>
                <div
                  className="truncate font-mono text-[11px] text-muted-foreground"
                  data-selectable
                >
                  {x.fetchUrl}
                  {x.pushUrl !== x.fetchUrl && ` (push: ${x.pushUrl})`}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void A.fetchAll(r, x.name)}>
                Fetch
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Edit ${x.name}`}
                onClick={() => void A.editRemote(r, x.name, x.fetchUrl)}
              >
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${x.name}`}
                onClick={() => void A.removeRemote(r, x.name)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" onClick={() => void A.addRemote(r)}>
        <Plus /> Add remote
      </Button>
    </>
  )
}

function GitignoreSection(): React.JSX.Element {
  const r = useRepo()
  const [text, setText] = React.useState<string | null>(null)
  const [orig, setOrig] = React.useState('')
  React.useEffect(() => {
    call('gitignore.read', { repo: r.path })
      .then((t) => (setText(t), setOrig(t)))
      .catch((e) => toastError(e))
  }, [r.path])
  if (text == null) return <Spinner />
  const addTemplate = (name: string): void => {
    const tpl = GITIGNORE_TEMPLATES[name]
    if (!tpl) return
    setText((t) => `${(t ?? '').replace(/\s*$/, '')}${t ? '\n\n' : ''}${tpl}\n`)
  }
  const save = async (): Promise<void> => {
    try {
      await call('gitignore.write', { repo: r.path, content: text })
      setOrig(text)
      toast({ kind: 'success', title: '.gitignore saved' })
      await r.refresh('worktree')
    } catch (e) {
      toastError(e, 'Save .gitignore')
    }
  }
  return (
    <>
      <H sub="The .gitignore file at the repository root. Already-tracked files are not affected by new ignore rules.">
        .gitignore
      </H>
      <div className="flex items-center gap-2">
        <Select aria-label="Insert template" value="" onChange={(e) => addTemplate(e.target.value)}>
          <option value="">Insert template…</option>
          {Object.keys(GITIGNORE_TEMPLATES).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <Button variant="outline" disabled={text === orig} onClick={() => setText(orig)}>
          Revert
        </Button>
        <Button disabled={text === orig} onClick={() => void save()}>
          Save
        </Button>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={22}
        className="font-mono text-[12px]"
        aria-label=".gitignore content"
        spellCheck={false}
      />
    </>
  )
}

function WorktreesSection(): React.JSX.Element {
  const r = useRepo()
  const wts = r.refs?.worktrees ?? []
  return (
    <>
      <H sub="Linked worktrees let you check out several branches at once, each in its own folder.">
        Worktrees
      </H>
      <ul className="divide-y rounded-md border">
        {wts.map((w) => (
          <li key={w.path} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {w.branch ?? (w.detached ? `detached at ${short(w.head)}` : '(bare)')}
                </span>
                {w.main && <Badge className="bg-muted">main</Badge>}
                {w.locked && <Badge className="bg-muted">locked</Badge>}
                {w.prunable && <Badge className="bg-muted text-modified">missing</Badge>}
              </div>
              <div className="truncate font-mono text-[11px] text-muted-foreground" data-selectable>
                {w.path}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={w.prunable || w.bare}
              onClick={() => void openRepository(w.path)}
            >
              <FolderOpen /> Open
            </Button>
            {!w.main && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Remove worktree"
                onClick={() => void A.removeWorktree(r, w.path)}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void A.addWorktree(r)}>
          <Plus /> Add worktree
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void A.run(r, 'Prune worktrees', () => call('worktree.prune', { repo: r.path }), {
              success: 'Pruned stale worktree entries'
            })
          }
        >
          Prune missing
        </Button>
      </div>
    </>
  )
}

function SubmodulesSection(): React.JSX.Element {
  const r = useRepo()
  const subs = r.refs?.submodules ?? []
  const STATE: Record<string, string> = {
    ' ': 'up to date',
    '-': 'not initialised',
    '+': 'different commit checked out',
    U: 'merge conflicts'
  }
  const add = async (): Promise<void> => {
    const v = await prompt({
      title: 'Add submodule',
      fields: [
        { name: 'url', label: 'Repository URL', mono: true },
        { name: 'path', label: 'Path inside this repository', mono: true, autoFocus: false }
      ],
      validate: (x) =>
        !String(x['url']).trim() || String(x['url']).startsWith('-')
          ? 'Enter a URL.'
          : !String(x['path']).trim() ||
              /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-zA-Z]:/.test(String(x['path']))
            ? 'Enter a relative path inside the repository.'
            : null,
      confirmLabel: 'Add submodule'
    })
    if (!v) return
    await A.runNetwork(
      r,
      'Adding submodule',
      (opId) =>
        call('submodule.add', {
          repo: r.path,
          url: String(v['url']).trim(),
          path: String(v['path']).trim().replace(/\\/g, '/'),
          opId
        }),
      'Submodule added'
    )
  }
  return (
    <>
      <H sub="Submodules pin another repository at a specific commit.">Submodules</H>
      {subs.length === 0 ? (
        <p className="text-muted-foreground">This repository has no submodules.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {subs.map((s) => (
            <li key={s.path} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px]">{s.path}</div>
                <div className="text-[0.85em] text-muted-foreground">
                  {short(s.hash)} · {STATE[s.state]}
                  {s.describe && ` · ${s.describe}`}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={s.state === '-'}
                onClick={() => void openRepository(`${r.path}/${s.path}`)}
              >
                <FolderOpen /> Open
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void A.updateSubmodules(r)}>
          Initialise & update all
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void A.run(r, 'Sync submodules', () => call('submodule.sync', { repo: r.path }), {
              success: 'Submodule URLs synchronised'
            })
          }
        >
          Sync URLs
        </Button>
        <Button variant="ghost" onClick={() => void add()}>
          <Plus /> Add submodule
        </Button>
      </div>
    </>
  )
}

function LfsSection(): React.JSX.Element {
  const r = useRepo()
  const [st, setSt] = React.useState<ApiResult<'lfs.status'> | null>(null)
  const [pattern, setPattern] = React.useState('')
  const load = React.useCallback(() => {
    call('lfs.status', { repo: r.path })
      .then(setSt)
      .catch((e) => toastError(e))
  }, [r.path])
  React.useEffect(load, [load])
  if (!st) return <Spinner />
  if (!st.installed)
    return (
      <EmptyState title="Git LFS is not installed">
        Install Git LFS from git-lfs.com (it is bundled with Git for Windows), then reopen this
        page.
      </EmptyState>
    )
  const run = (action: 'fetch' | 'pull' | 'push' | 'install' | 'prune'): void =>
    void A.runNetwork(
      r,
      `git lfs ${action}`,
      (opId) => call('lfs.run', { repo: r.path, action, opId }),
      `git lfs ${action} finished`
    ).then(load)
  const track = async (p: string, untrack: boolean): Promise<void> => {
    await A.run(
      r,
      untrack ? 'Untrack' : 'Track',
      () => call('lfs.track', { repo: r.path, pattern: p, untrack }),
      {
        success: untrack
          ? `Stopped tracking ${p}`
          : `Tracking ${p} (remember to commit .gitattributes)`
      }
    )
    setPattern('')
    load()
  }
  return (
    <>
      <H sub={st.version ?? undefined}>Git LFS</H>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => run('install')}>
          Install hooks in this repository
        </Button>
        <Button variant="outline" onClick={() => run('fetch')}>
          Fetch
        </Button>
        <Button variant="outline" onClick={() => run('pull')}>
          Pull
        </Button>
        <Button variant="outline" onClick={() => run('push')}>
          Push
        </Button>
        <Button variant="ghost" onClick={() => run('prune')}>
          Prune
        </Button>
      </div>
      <div>
        <h3 className="mb-1 font-medium">Tracked patterns</h3>
        {st.tracked.length === 0 ? (
          <p className="text-[0.9em] text-muted-foreground">No patterns tracked.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {st.tracked.map((p) => (
              <li
                key={p}
                className="flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[12px]"
              >
                {p}
                <button
                  aria-label={`Untrack ${p}`}
                  className="rounded p-0.5 hover:bg-accent"
                  onClick={() => void track(p, true)}
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => (
            e.preventDefault(),
            pattern.trim() && !pattern.startsWith('-') && void track(pattern.trim(), false)
          )}
        >
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="*.psd"
            className="w-56 font-mono"
            aria-label="Pattern to track"
          />
          <Button type="submit" variant="outline" disabled={!pattern.trim()}>
            Track
          </Button>
        </form>
      </div>
      <div>
        <h3 className="mb-1 font-medium">LFS files ({st.files.length})</h3>
        <ul
          className="max-h-64 overflow-auto rounded border p-2 font-mono text-[12px]"
          data-selectable
        >
          {st.files.map((f) => (
            <li key={f}>{f}</li>
          ))}
          {st.files.length === 0 && <li className="font-sans text-muted-foreground">None</li>}
        </ul>
      </div>
    </>
  )
}

function FlowSection(): React.JSX.Element {
  const r = useRepo()
  const [develop, setDevelop] = React.useState(
    () => localStorage.getItem(`spoon:flow:develop:${r.path}`) ?? 'develop'
  )
  const [main, setMain] = React.useState(
    () =>
      localStorage.getItem(`spoon:flow:main:${r.path}`) ??
      (r.refs?.branches.some((b) => b.name === 'master') &&
      !r.refs.branches.some((b) => b.name === 'main')
        ? 'master'
        : 'main')
  )
  const [deleteBranch, setDeleteBranch] = React.useState(true)
  React.useEffect(() => {
    localStorage.setItem(`spoon:flow:develop:${r.path}`, develop)
    localStorage.setItem(`spoon:flow:main:${r.path}`, main)
  }, [develop, main, r.path])
  const branches = r.refs?.branches ?? []
  const flowBranches = branches.filter((b) => /^(feature|release|hotfix)\//.test(b.name))
  const start = async (kind: 'feature' | 'release' | 'hotfix'): Promise<void> => {
    const v = await prompt({
      title: `Start ${kind}`,
      description: `Creates ${kind}/<name> from ${kind === 'hotfix' ? main : develop}.`,
      fields: [{ name: 'name', label: 'Name', mono: true }],
      validate: (x) => validRefName(`${kind}/${String(x['name'])}`),
      confirmLabel: 'Start'
    })
    if (v)
      await A.run(
        r,
        'git-flow',
        () => call('flow.start', { repo: r.path, kind, name: String(v['name']), develop, main }),
        { success: `Started ${kind}/${String(v['name'])}` }
      )
  }
  const finish = async (branch: string): Promise<void> => {
    const res = await A.run(r, 'git-flow finish', () =>
      call('flow.finish', { repo: r.path, branch, develop, main, deleteBranch })
    )
    if (res && res.exitCode !== 0) {
      toast({
        kind: 'error',
        title: 'Finishing stopped with merge conflicts. Resolve them and commit, then finish again.'
      })
      r.setView({ kind: 'changes' })
    } else if (res) toast({ kind: 'success', title: `Finished ${branch}` })
  }
  return (
    <>
      <H sub="A built-in implementation of the git-flow branching model using plain Git commands (no git-flow extension required). Releases and hotfixes are merged into the main branch, tagged, and merged back into develop.">
        Git-flow
      </H>
      <div className="grid max-w-md grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="flow-dev">Integration branch</Label>
          <Input
            id="flow-dev"
            value={develop}
            onChange={(e) => setDevelop(e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="flow-main">Production branch</Label>
          <Input
            id="flow-main"
            value={main}
            onChange={(e) => setMain(e.target.value)}
            className="font-mono"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void start('feature')}>
          Start feature
        </Button>
        <Button variant="outline" onClick={() => void start('release')}>
          Start release
        </Button>
        <Button variant="outline" onClick={() => void start('hotfix')}>
          Start hotfix
        </Button>
      </div>
      <div>
        <h3 className="mb-1 font-medium">Open flow branches</h3>
        <Checkbox
          className="mb-2"
          checked={deleteBranch}
          onCheckedChange={setDeleteBranch}
          label="Delete the branch after finishing"
        />
        {flowBranches.length === 0 ? (
          <p className="text-[0.9em] text-muted-foreground">None.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {flowBranches.map((b) => (
              <li key={b.name} className="flex items-center gap-2 px-3 py-1.5">
                <span className="flex-1 font-mono text-[12px]">{b.name}</span>
                <Button size="sm" variant="outline" onClick={() => void finish(b.name)}>
                  Finish
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
