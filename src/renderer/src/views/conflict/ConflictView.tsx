import * as React from 'react'
import { AlertTriangle, Check, ExternalLink, RotateCcw, Save, Wrench } from 'lucide-react'
import type { ConflictFile } from '@shared/types'
import {
  parseConflicts,
  resolveSegments,
  splitLines,
  countConflictMarkers,
  type ConflictChoice,
  type ConflictSegment
} from '@shared/conflict'
import { call, newOpId } from '@/lib/api'
import { highlightLine, languageFor } from '@/lib/highlight'
import { cn } from '@/lib/utils'
import { endOp, startOp, toast, toastError } from '@/app/state'
import { confirm } from '@/app/dialogs'
import { useRepo, type RepoContextValue } from '@/app/repo/context'
import { Button } from '@/components/ui/button'
import { EmptyState, Spinner, Textarea, Tip } from '@/components/ui/primitives'

/** Stage files as resolved, warning first if conflict markers are still present. */
export async function markResolvedChecked(
  r: Pick<RepoContextValue, 'path' | 'refresh'>,
  paths: string[]
): Promise<void> {
  try {
    const withMarkers: string[] = []
    for (const p of paths) {
      const c = await call('conflict.get', { repo: r.path, path: p }).catch(() => null)
      if (c && c.markerCount > 0)
        withMarkers.push(`${p} (${c.markerCount} conflict${c.markerCount === 1 ? '' : 's'})`)
    }
    if (withMarkers.length) {
      const ok = await confirm({
        title: 'Conflict markers remain',
        description:
          'These files still contain <<<<<<< / ======= / >>>>>>> markers. Marking them resolved will commit the markers as file content.',
        items: withMarkers,
        confirmLabel: 'Mark resolved anyway',
        destructive: true
      })
      if (!ok) return
    }
    for (const p of paths) await call('conflict.markResolved', { repo: r.path, path: p })
    toast({
      kind: 'success',
      title: paths.length === 1 ? 'Marked as resolved' : `Marked ${paths.length} files as resolved`
    })
  } catch (e) {
    toastError(e, 'Mark resolved')
  } finally {
    await r.refresh('worktree')
  }
}

export function ConflictView({ path }: { path: string }): React.JSX.Element {
  const r = useRepo()
  const [file, setFile] = React.useState<ConflictFile | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [nonce, setNonce] = React.useState(0)

  React.useEffect(() => {
    let alive = true
    setFile(null)
    call('conflict.get', { repo: r.path, path })
      .then((f) => alive && (setFile(f), setError(null)))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [r.path, path, nonce])

  const take = async (side: 'ours' | 'theirs' | 'delete'): Promise<void> => {
    if (side === 'delete') {
      const ok = await confirm({
        title: `Delete ${path}?`,
        description:
          'The file is removed from the working tree and the deletion is staged as the resolution.',
        confirmLabel: 'Delete file',
        destructive: true
      })
      if (!ok) return
    }
    await call('conflict.take', { repo: r.path, path, side })
      .then(() => toast({ kind: 'success', title: 'Resolution staged' }))
      .catch((e) => toastError(e, 'Resolve'))
    await r.refresh('worktree')
  }

  const mergeTool = async (): Promise<void> => {
    const opId = newOpId()
    startOp({ opId, label: `Merge tool: ${path}`, repo: r.path, cancellable: true })
    try {
      const res = await call('conflict.externalTool', { repo: r.path, path, opId })
      if (res.exitCode !== 0)
        toast({
          kind: 'info',
          title: 'The merge tool exited without resolving the file.',
          detail: res.stderr
        })
    } catch (e) {
      toastError(e, 'External merge tool')
    } finally {
      endOp(opId)
      await r.refresh('worktree')
      setNonce((n) => n + 1)
    }
  }

  if (error)
    return (
      <EmptyState icon={<AlertTriangle />} title="Could not load the conflict">
        {error}
      </EmptyState>
    )
  if (!file)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )

  const header = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-panel px-3 py-2">
      <AlertTriangle className="size-4 text-conflict" />
      <span className="font-mono text-[12px]">{path}</span>
      <span className="rounded bg-[color-mix(in_oklab,var(--conflict)_15%,transparent)] px-1.5 text-[11px] text-conflict">
        {file.type}
      </span>
      <span className="ml-auto flex flex-wrap gap-1">
        <Tip content={`Take the whole file from: ${file.oursLabel}`}>
          <Button size="sm" variant="outline" onClick={() => void take('ours')}>
            Use ours
          </Button>
        </Tip>
        <Tip content={`Take the whole file from: ${file.theirsLabel}`}>
          <Button size="sm" variant="outline" onClick={() => void take('theirs')}>
            Use theirs
          </Button>
        </Tip>
        {(file.type.startsWith('deleted') || file.binary) && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => void take('delete')}
          >
            Delete file
          </Button>
        )}
        <Tip content="Open git mergetool (configure the tool in Settings → Tools)">
          <Button size="sm" variant="ghost" onClick={() => void mergeTool()}>
            <Wrench /> Merge tool
          </Button>
        </Tip>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void call('shell.openEditor', { repo: r.path, path }).catch((e) => toastError(e))
          }
        >
          <ExternalLink /> Editor
        </Button>
      </span>
    </div>
  )

  if (
    file.binary ||
    file.result == null ||
    (file.type !== 'both modified' && file.type !== 'both added')
  ) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="space-y-3 p-5 text-[0.95em]">
          {file.binary && (
            <p>
              This is a binary file, so it cannot be merged line by line. Choose one version, or
              replace the file manually and mark it resolved.
            </p>
          )}
          {file.type === 'deleted by them' && (
            <p>
              <b>{file.theirsLabel}</b> deleted this file, while <b>{file.oursLabel}</b> modified
              it. Keep the modified file (“Use ours”) or accept the deletion (“Use theirs”).
            </p>
          )}
          {file.type === 'deleted by us' && (
            <p>
              <b>{file.oursLabel}</b> deleted this file, while <b>{file.theirsLabel}</b> modified
              it. Accept the deletion (“Use ours”) or keep the modified file (“Use theirs”).
            </p>
          )}
          {!file.binary && file.result == null && !file.type.startsWith('deleted') && (
            <p>The file is missing from the working tree.</p>
          )}
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-[0.92em]">
            <dt className="text-muted-foreground">Ours</dt>
            <dd>
              {file.oursLabel} {file.ours == null && '— deleted'}
            </dd>
            <dt className="text-muted-foreground">Theirs</dt>
            <dd>
              {file.theirsLabel} {file.theirs == null && '— deleted'}
            </dd>
          </dl>
          <Button variant="outline" onClick={() => void markResolvedChecked(r, [path])}>
            <Check /> Mark current working-tree file as resolved
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <TextMerge key={`${path}:${nonce}`} file={file} onSaved={() => setNonce((n) => n + 1)} />
    </div>
  )
}

const CHOICES: { value: ConflictChoice; label: string }[] = [
  { value: 'ours', label: 'Ours' },
  { value: 'theirs', label: 'Theirs' },
  { value: 'ours-theirs', label: 'Ours, then theirs' },
  { value: 'theirs-ours', label: 'Theirs, then ours' },
  { value: 'base', label: 'Base' },
  { value: 'none', label: 'Neither' }
]

function TextMerge({
  file,
  onSaved
}: {
  file: ConflictFile
  onSaved: () => void
}): React.JSX.Element {
  const r = useRepo()
  const parsed = React.useMemo(() => splitLines(file.result ?? ''), [file.result])
  const segments = React.useMemo(() => parseConflicts(file.result ?? ''), [file.result])
  const conflicts = segments.filter(
    (s): s is Extract<ConflictSegment, { type: 'conflict' }> => s.type === 'conflict'
  )
  const [choices, setChoices] = React.useState<(ConflictChoice | undefined)[]>(() =>
    conflicts.map(() => undefined)
  )
  const [manual, setManual] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const lang = languageFor(file.path)

  const computed = React.useMemo(
    () => resolveSegments(segments, choices, parsed.eol, parsed.trailingNewline),
    [segments, choices, parsed]
  )
  const result = manual ?? computed
  const remaining = countConflictMarkers(result)

  const save = async (stage: boolean): Promise<void> => {
    if (stage && remaining > 0) {
      const ok = await confirm({
        title: `${remaining} conflict(s) unresolved`,
        description: 'The result still contains conflict markers. Stage it anyway?',
        confirmLabel: 'Stage with markers',
        destructive: true
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await call('conflict.save', { repo: r.path, path: file.path, content: result, stage })
      toast({ kind: 'success', title: stage ? 'Saved and marked resolved' : 'Saved' })
      if (!stage) onSaved()
    } catch (e) {
      toastError(e, 'Save')
    } finally {
      setBusy(false)
      await r.refresh('worktree')
    }
  }

  const block = (lines: string[] | null, title: string, cls: string): React.ReactNode => (
    <div className="min-w-0 flex-1 overflow-hidden rounded border">
      <div className={cn('truncate px-2 py-0.5 text-[11px] font-medium', cls)} title={title}>
        {title}
      </div>
      <pre
        className="max-h-64 overflow-auto px-2 py-1 font-mono text-[12px] leading-5"
        data-selectable
      >
        {lines && lines.length ? (
          lines.map((l, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: highlightLine(l, lang) || '&nbsp;' }} />
          ))
        ) : (
          <span className="text-muted-foreground italic">(empty)</span>
        )}
      </pre>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[0.9em]">
        <span className={remaining ? 'text-conflict' : 'text-added'}>
          {remaining
            ? `${remaining} unresolved conflict${remaining === 1 ? '' : 's'}`
            : 'All conflicts resolved'}
        </span>
        {manual != null && (
          <Button size="sm" variant="ghost" onClick={() => setManual(null)}>
            <RotateCcw /> Discard manual edits
          </Button>
        )}
        <span className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(false)}>
            <Save /> Save
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save(true)}>
            <Check /> Save and mark resolved
          </Button>
        </span>
      </div>
      <div className="space-y-3 p-3">
        {conflicts.map((c, i) => (
          <section key={i} className="rounded-md border p-2" aria-label={`Conflict ${i + 1}`}>
            <div className="mb-2 flex flex-wrap items-center gap-1">
              <span className="mr-2 text-[0.9em] font-semibold">Conflict {i + 1}</span>
              {CHOICES.filter((ch) => ch.value !== 'base' || c.base).map((ch) => (
                <Button
                  key={ch.value}
                  size="sm"
                  variant={choices[i] === ch.value ? 'default' : 'outline'}
                  className="h-6 px-2 text-[11px]"
                  disabled={manual != null}
                  aria-pressed={choices[i] === ch.value}
                  onClick={() =>
                    setChoices((cs) =>
                      cs.map((x, j) => (j === i ? (x === ch.value ? undefined : ch.value) : x))
                    )
                  }
                >
                  {ch.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              {block(
                c.ours,
                `Ours — ${file.oursLabel}`,
                'bg-[color-mix(in_oklab,var(--info)_15%,transparent)]'
              )}
              {c.base && block(c.base, 'Base (common ancestor)', 'bg-muted')}
              {block(
                c.theirs,
                `Theirs — ${file.theirsLabel}`,
                'bg-[color-mix(in_oklab,var(--modified)_18%,transparent)]'
              )}
            </div>
          </section>
        ))}
        <section>
          <div className="mb-1 flex items-center gap-2 text-[0.9em] font-semibold">
            Result{' '}
            <span className="font-normal text-muted-foreground">
              — edit directly for custom resolutions
            </span>
          </div>
          <Textarea
            value={result}
            onChange={(e) => setManual(e.target.value)}
            rows={Math.min(30, Math.max(8, result.split('\n').length + 1))}
            className="font-mono text-[12px] leading-5"
            spellCheck={false}
            aria-label="Merge result"
          />
        </section>
      </div>
    </div>
  )
}
