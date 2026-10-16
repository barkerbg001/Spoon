import * as React from 'react'
import { ChevronDown, GitCommitHorizontal, History, Settings2 } from 'lucide-react'
import { call, isMac } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast, toastError } from '@/app/state'
import { useRepo } from '@/app/repo/context'
import { Button } from '@/components/ui/button'
import { Checkbox, Textarea, Tip } from '@/components/ui/primitives'
import { DropdownMenu, type MenuItem } from '@/components/ui/menu'

const draftKey = (repo: string): string => `spoon:draft:${repo.toLowerCase()}`
const recentKey = (repo: string): string => `spoon:recent-messages:${repo.toLowerCase()}`

function recentMessages(repo: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(recentKey(repo)) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function CommitBox(): React.JSX.Element {
  const r = useRepo()
  const s = r.status
  const [message, setMessage] = React.useState(() => localStorage.getItem(draftKey(r.path)) ?? '')
  const [amend, setAmend] = React.useState(false)
  const [signoff, setSignoff] = React.useState(false)
  const [noVerify, setNoVerify] = React.useState(false)
  const [sign, setSign] = React.useState<'config' | 'force' | 'never'>('config')
  const [busy, setBusy] = React.useState(false)
  const [hookOutput, setHookOutput] = React.useState<string | null>(null)
  const beforeAmend = React.useRef<string>('')
  const ref = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    localStorage.setItem(draftKey(r.path), message)
  }, [message, r.path])

  // Pre-fill from commit.template (only when there is no draft).
  React.useEffect(() => {
    if (localStorage.getItem(draftKey(r.path))) return
    call('commit.template', { repo: r.path })
      .then((t) => t && setMessage((m) => m || t))
      .catch(() => undefined)
  }, [r.path])

  const stagedCount = s?.staged.length ?? 0
  const unstagedCount = (s?.unstaged.length ?? 0) + (s?.untracked.length ?? 0)
  const conflicts = s?.conflicted.length ?? 0
  const unborn = s?.head.unborn ?? false
  const summary = message.split('\n')[0] ?? ''
  const blocked =
    conflicts > 0
      ? 'Resolve conflicts before committing.'
      : !message.trim()
        ? 'Enter a commit message.'
        : !amend && stagedCount === 0 && unstagedCount === 0
          ? 'There is nothing to commit.'
          : null
  const stageAllFirst = !amend && stagedCount === 0 && unstagedCount > 0

  const toggleAmend = async (v: boolean): Promise<void> => {
    setAmend(v)
    if (v) {
      beforeAmend.current = message
      if (!message.trim()) {
        const last = await call('commit.lastMessage', { repo: r.path }).catch(() => '')
        setMessage(last.trimEnd())
      }
    } else if (!beforeAmend.current.trim()) setMessage(beforeAmend.current)
  }

  const commit = async (): Promise<void> => {
    if (blocked || busy) return
    setBusy(true)
    setHookOutput(null)
    try {
      if (stageAllFirst) await call('index.stageAll', { repo: r.path })
      const res = await call('commit.create', {
        repo: r.path,
        message,
        amend,
        signoff,
        noVerify,
        sign,
        allowEmpty: false
      })
      const out = [res.stdout, res.stderr]
        .filter((x) => x.trim())
        .join('\n')
        .trim()
      const recents = [message, ...recentMessages(r.path).filter((m) => m !== message)].slice(0, 15)
      localStorage.setItem(recentKey(r.path), JSON.stringify(recents))
      setMessage('')
      setAmend(false)
      toast({
        kind: 'success',
        title: amend ? 'Commit amended' : 'Committed',
        detail: out.split('\n')[0]
      })
      if (res.stderr.trim()) setHookOutput(res.stderr.trim())
    } catch (e) {
      const detail = (e as { detail?: string }).detail
      if (detail) setHookOutput(detail)
      toastError(e, 'Commit failed')
    } finally {
      setBusy(false)
      await r.refresh('all')
    }
  }

  const recent = recentMessages(r.path)
  const recentItems: MenuItem[] = recent.length
    ? recent.map((m) => ({ label: m.split('\n')[0]!.slice(0, 80), onSelect: () => setMessage(m) }))
    : [{ label: 'No recent messages', disabled: true, onSelect: () => undefined }]

  const options: MenuItem[] = [
    { type: 'label', label: 'Signing' },
    {
      label: `${sign === 'config' ? '✓ ' : ''}Use repository configuration`,
      onSelect: () => setSign('config')
    },
    {
      label: `${sign === 'force' ? '✓ ' : ''}Always sign this commit (-S)`,
      onSelect: () => setSign('force')
    },
    {
      label: `${sign === 'never' ? '✓ ' : ''}Do not sign this commit`,
      onSelect: () => setSign('never')
    }
  ]

  return (
    <div className="shrink-0 border-t bg-panel p-2">
      {s && s.operation !== 'none' && conflicts === 0 && (
        <p className="mb-1.5 text-[0.85em] text-muted-foreground">
          {s.operation === 'merge'
            ? 'Committing concludes the merge.'
            : s.operation.startsWith('rebase')
              ? 'Use “Continue” in the banner to proceed with the rebase.'
              : 'Use “Continue” in the banner to proceed.'}
        </p>
      )}
      <div className="relative">
        <Textarea
          ref={ref}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void commit()
            }
          }}
          rows={4}
          placeholder={
            amend ? 'Amended commit message' : 'Summary (first line), blank line, then description'
          }
          aria-label="Commit message"
          className="font-mono text-[12px]"
          spellCheck
          data-commit-message
        />
        <span
          className={cn(
            'pointer-events-none absolute right-2 top-1.5 font-mono text-[10px]',
            summary.length > 72 ? 'text-modified' : 'text-muted-foreground/70'
          )}
          title="Summary length (72 recommended)"
        >
          {summary.length}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Checkbox
          checked={amend}
          onCheckedChange={(v) => void toggleAmend(v)}
          label="Amend"
          disabled={unborn}
        />
        <Checkbox checked={signoff} onCheckedChange={setSignoff} label="Sign-off" />
        <Tip content="Skip pre-commit and commit-msg hooks (--no-verify)">
          <span>
            <Checkbox checked={noVerify} onCheckedChange={setNoVerify} label="Skip hooks" />
          </span>
        </Tip>
        <span className="ml-auto flex gap-0.5">
          <DropdownMenu items={recentItems} align="end">
            <Button size="icon-sm" variant="ghost" aria-label="Recent commit messages">
              <History />
            </Button>
          </DropdownMenu>
          <DropdownMenu items={options} align="end">
            <Button size="icon-sm" variant="ghost" aria-label="Commit options">
              <Settings2 />
              <ChevronDown className="!size-3" />
            </Button>
          </DropdownMenu>
        </span>
      </div>
      <Tip content={blocked ?? `${isMac() ? '⌘' : 'Ctrl'}+Enter`}>
        <span className="mt-2 block">
          <Button className="w-full" disabled={!!blocked || busy} onClick={() => void commit()}>
            <GitCommitHorizontal />
            {busy
              ? 'Committing…'
              : amend
                ? 'Amend last commit'
                : stageAllFirst
                  ? `Stage all and commit (${unstagedCount})`
                  : `Commit ${stagedCount} file${stagedCount === 1 ? '' : 's'}`}
          </Button>
        </span>
      </Tip>
      {hookOutput && (
        <details className="mt-2 rounded border bg-muted/50 text-[0.85em]" open>
          <summary className="cursor-pointer px-2 py-1 text-muted-foreground">
            Hook / Git output
          </summary>
          <pre
            className="max-h-40 overflow-auto px-2 pb-2 font-mono text-[11px] whitespace-pre-wrap"
            data-selectable
          >
            {hookOutput}
          </pre>
        </details>
      )}
    </div>
  )
}
