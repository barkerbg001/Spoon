import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Columns2,
  FileWarning,
  Image as ImageIcon,
  Minus,
  Pilcrow,
  Plus,
  Rows2,
  Space,
  Undo2,
  WrapText
} from 'lucide-react'
import type { BlobContent, DiffFile, DiffLine, DiffResult } from '@shared/types'
import { countChanges } from '@shared/diff'
import { call } from '@/lib/api'
import { useStore } from '@/lib/store'
import { highlightLine, languageFor, showWhitespace } from '@/lib/highlight'
import { cn, formatBytes } from '@/lib/utils'
import { app, updateSettings } from '@/app/state'
import { Button } from '@/components/ui/button'
import { EmptyState, Spinner, Tip } from '@/components/ui/primitives'
import { sidesOf, type DiffState } from './useDiff'

export type PartialMode = 'stage' | 'unstage' | 'discard'

export interface DiffActions {
  /** Which partial operations are offered for this diff */
  modes: PartialMode[]
  onPartial: (mode: PartialMode, selection: [number, number][], diff: DiffResult) => Promise<void>
}

type Row =
  | { kind: 'hunk'; hunk: number; header: string }
  | { kind: 'line'; hunk: number; index: number; line: DiffLine }
  | {
      kind: 'pair'
      hunk: number
      left: { index: number; line: DiffLine } | null
      right: { index: number; line: DiffLine } | null
    }

function buildRows(file: DiffFile, split: boolean): Row[] {
  const rows: Row[] = []
  file.hunks.forEach((h, hi) => {
    rows.push({ kind: 'hunk', hunk: hi, header: h.header })
    if (!split) {
      h.lines.forEach((line, index) => rows.push({ kind: 'line', hunk: hi, index, line }))
      return
    }
    let i = 0
    while (i < h.lines.length) {
      const l = h.lines[i]!
      if (l.type === 'context' || l.type === 'meta') {
        rows.push({
          kind: 'pair',
          hunk: hi,
          left: { index: i, line: l },
          right: { index: i, line: l }
        })
        i++
        continue
      }
      const dels: { index: number; line: DiffLine }[] = []
      const adds: { index: number; line: DiffLine }[] = []
      while (i < h.lines.length && h.lines[i]!.type === 'del')
        dels.push({ index: i, line: h.lines[i++]! })
      while (i < h.lines.length && h.lines[i]!.type === 'add')
        adds.push({ index: i, line: h.lines[i++]! })
      for (let k = 0; k < Math.max(dels.length, adds.length); k++)
        rows.push({ kind: 'pair', hunk: hi, left: dels[k] ?? null, right: adds[k] ?? null })
    }
  })
  return rows
}

const key = (h: number, l: number): string => `${h}:${l}`

export function DiffView({
  repo,
  state,
  actions,
  header,
  emptyText
}: {
  repo: string
  state: DiffState
  actions?: DiffActions
  header?: React.ReactNode
  emptyText?: string
}): React.JSX.Element {
  const settings = useStore(app, (s) => s.settings)
  const split = settings?.diffView === 'split'
  const wrap = settings?.diffWrap ?? false
  const ws = settings?.diffShowWhitespace ?? false
  const { diff, loading, error } = state
  const file = diff?.file ?? null

  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const anchor = React.useRef<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => setSelected(new Set()), [diff?.fingerprint])

  const rows = React.useMemo(() => (file ? buildRows(file, split) : []), [file, split])
  const lang = React.useMemo(
    () => (file ? languageFor(file.newPath || file.oldPath) : null),
    [file]
  )
  const changeKeys = React.useMemo(() => {
    const keys: string[] = []
    file?.hunks.forEach((h, hi) =>
      h.lines.forEach((l, li) => (l.type === 'add' || l.type === 'del') && keys.push(key(hi, li)))
    )
    return keys
  }, [file])

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'hunk' ? 28 : 20),
    overscan: 30
  })

  const canSelect =
    !!actions &&
    actions.modes.length > 0 &&
    !!file &&
    !file.binary &&
    !state.options.ignoreWhitespace &&
    !diff?.truncated

  const toggleLine = (h: number, l: number, shift: boolean): void => {
    if (!canSelect) return
    const k = key(h, l)
    setSelected((prev) => {
      const next = new Set(prev)
      if (shift && anchor.current) {
        const a = changeKeys.indexOf(anchor.current)
        const b = changeKeys.indexOf(k)
        if (a >= 0 && b >= 0) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(changeKeys[i]!)
          return next
        }
      }
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
    anchor.current = k
  }

  const applyPartial = async (mode: PartialMode, keys: string[]): Promise<void> => {
    if (!actions || !diff || keys.length === 0) return
    setBusy(true)
    try {
      await actions.onPartial(
        mode,
        keys.map((k) => k.split(':').map(Number) as [number, number]),
        diff
      )
      setSelected(new Set())
    } finally {
      setBusy(false)
    }
  }

  const hunkKeys = (h: number): string[] => changeKeys.filter((k) => k.startsWith(`${h}:`))

  const toolbar = (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-panel px-2">
      <div className="min-w-0 flex-1 truncate">{header}</div>
      {file && !file.binary && (
        <span className="mr-2 font-mono text-[11px]">
          <span className="text-added">+{countChanges(file).add}</span>{' '}
          <span className="text-removed">−{countChanges(file).del}</span>
        </span>
      )}
      <Tip content={split ? 'Unified view' : 'Split view'}>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Toggle split view"
          aria-pressed={split}
          onClick={() => void updateSettings({ diffView: split ? 'unified' : 'split' })}
        >
          {split ? <Rows2 /> : <Columns2 />}
        </Button>
      </Tip>
      <Tip
        content={
          settings?.diffIgnoreWhitespace
            ? 'Show whitespace changes'
            : 'Ignore whitespace changes (disables line staging)'
        }
      >
        <Button
          size="icon-sm"
          variant={settings?.diffIgnoreWhitespace ? 'secondary' : 'ghost'}
          aria-label="Ignore whitespace"
          aria-pressed={settings?.diffIgnoreWhitespace}
          onClick={() =>
            void updateSettings({ diffIgnoreWhitespace: !settings?.diffIgnoreWhitespace })
          }
        >
          <Space />
        </Button>
      </Tip>
      <Tip content="Show whitespace characters">
        <Button
          size="icon-sm"
          variant={ws ? 'secondary' : 'ghost'}
          aria-label="Show whitespace characters"
          aria-pressed={ws}
          onClick={() => void updateSettings({ diffShowWhitespace: !ws })}
        >
          <Pilcrow />
        </Button>
      </Tip>
      <Tip content="Wrap long lines">
        <Button
          size="icon-sm"
          variant={wrap ? 'secondary' : 'ghost'}
          aria-label="Wrap lines"
          aria-pressed={wrap}
          onClick={() => void updateSettings({ diffWrap: !wrap })}
        >
          <WrapText />
        </Button>
      </Tip>
    </div>
  )

  let body: React.ReactNode
  if (error)
    body = (
      <EmptyState icon={<FileWarning />} title="Could not load diff">
        {error}
      </EmptyState>
    )
  else if (!diff && loading)
    body = (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  else if (!diff) body = <EmptyState title={emptyText ?? 'Select a file to see its changes'} />
  else if (diff.isImage) body = <ImageCompare repo={repo} diff={diff} />
  else if (!file)
    body = (
      <EmptyState title="No changes">
        {state.options.ignoreWhitespace
          ? 'Only whitespace changed (whitespace changes are hidden).'
          : 'The file content is identical; only metadata may differ.'}
      </EmptyState>
    )
  else if (file.binary) body = <BinaryInfo repo={repo} diff={diff} />
  else
    body = (
      <div
        ref={scrollRef}
        className={cn('min-h-0 flex-1 overflow-auto', wrap && 'diff-wrap')}
        data-selectable
        tabIndex={0}
        aria-label="Diff"
        onKeyDown={(e) => e.key === 'Escape' && setSelected(new Set())}
      >
        {(file.oldMode !== file.newMode && file.oldMode && file.newMode) ||
        file.status === 'renamed' ? (
          <div className="border-b bg-muted/50 px-3 py-1 text-[0.9em] text-muted-foreground">
            {file.status === 'renamed' && (
              <>
                Renamed from <span className="font-mono">{file.oldPath}</span>
                {file.similarity != null && ` (${file.similarity}% similar)`}.{' '}
              </>
            )}
            {file.oldMode && file.newMode && file.oldMode !== file.newMode && (
              <>
                Mode changed {file.oldMode} → {file.newMode}.
              </>
            )}
          </div>
        ) : null}
        {file.hunks.length === 0 && <EmptyState title="No content changes" />}
        <div
          style={{
            height: virt.getTotalSize(),
            position: 'relative',
            minWidth: '100%',
            width: wrap ? '100%' : 'max-content'
          }}
        >
          {virt.getVirtualItems().map((vi) => {
            const row = rows[vi.index]!
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={wrap ? virt.measureElement : undefined}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start}px)`,
                  minHeight: vi.size
                }}
              >
                {row.kind === 'hunk' ? (
                  <div className="sticky left-0 flex h-7 items-center gap-2 border-y bg-muted/60 px-2 font-mono text-[11px] text-muted-foreground">
                    <span className="truncate">{row.header}</span>
                    {canSelect && (
                      <span className="ml-auto flex gap-1 font-sans">
                        {actions!.modes.map((m) => (
                          <Button
                            key={m}
                            size="sm"
                            variant={m === 'discard' ? 'ghost' : 'outline'}
                            className={cn(
                              'h-5 px-1.5 text-[11px]',
                              m === 'discard' && 'text-destructive'
                            )}
                            disabled={busy}
                            onClick={() => void applyPartial(m, hunkKeys(row.hunk))}
                          >
                            {m === 'stage'
                              ? 'Stage hunk'
                              : m === 'unstage'
                                ? 'Unstage hunk'
                                : 'Discard hunk'}
                          </Button>
                        ))}
                      </span>
                    )}
                  </div>
                ) : row.kind === 'line' ? (
                  <UnifiedLine
                    line={row.line}
                    lang={lang}
                    ws={ws}
                    selected={selected.has(key(row.hunk, row.index))}
                    selectable={canSelect}
                    onToggle={(shift) => toggleLine(row.hunk, row.index, shift)}
                  />
                ) : (
                  <div className="grid grid-cols-2">
                    <SplitCell
                      side="left"
                      cell={row.left}
                      lang={lang}
                      ws={ws}
                      selected={!!row.left && selected.has(key(row.hunk, row.left.index))}
                      selectable={canSelect}
                      onToggle={(shift) => row.left && toggleLine(row.hunk, row.left.index, shift)}
                    />
                    <SplitCell
                      side="right"
                      cell={row.right}
                      lang={lang}
                      ws={ws}
                      selected={!!row.right && selected.has(key(row.hunk, row.right.index))}
                      selectable={canSelect}
                      onToggle={(shift) =>
                        row.right && toggleLine(row.hunk, row.right.index, shift)
                      }
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      {diff?.truncated && (
        <div className="flex items-center gap-2 border-b bg-[color-mix(in_oklab,var(--modified)_14%,transparent)] px-3 py-1.5 text-[0.9em]">
          <FileWarning className="size-4 text-modified" />
          <span className="flex-1">
            This diff is large ({formatBytes(diff.totalBytes)}); only the first part is shown. Line
            staging is disabled for partial diffs.
          </span>
          <Button size="sm" variant="outline" onClick={state.loadAll}>
            Load full diff
          </Button>
        </div>
      )}
      {actions && file && !file.binary && state.options.ignoreWhitespace && (
        <div className="border-b bg-muted/50 px-3 py-1 text-[0.88em] text-muted-foreground">
          Line and hunk staging is unavailable while whitespace changes are hidden.
        </div>
      )}
      {selected.size > 0 && actions && (
        <div
          className="flex items-center gap-2 border-b bg-accent px-3 py-1.5 text-[0.9em]"
          role="toolbar"
          aria-label="Selected lines"
        >
          <span className="flex-1">
            {selected.size} line(s) selected — Shift+click to extend, Esc to clear
          </span>
          {actions.modes.map((m) => (
            <Button
              key={m}
              size="sm"
              variant={m === 'discard' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() => void applyPartial(m, [...selected])}
            >
              {m === 'stage' ? <Plus /> : m === 'unstage' ? <Minus /> : <Undo2 />}
              {m === 'stage' ? 'Stage lines' : m === 'unstage' ? 'Unstage lines' : 'Discard lines'}
            </Button>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  )
}

function renderContent(content: string, lang: string | null, ws: boolean): string {
  return ws ? showWhitespace(content) : highlightLine(content, lang)
}

function Gutter({ n }: { n: number | null }): React.JSX.Element {
  return (
    <span className="inline-block w-12 shrink-0 select-none px-1.5 text-right text-muted-foreground/70">
      {n ?? ''}
    </span>
  )
}

const UnifiedLine = React.memo(function UnifiedLine({
  line,
  lang,
  ws,
  selected,
  selectable,
  onToggle
}: {
  line: DiffLine
  lang: string | null
  ws: boolean
  selected: boolean
  selectable: boolean
  onToggle: (shift: boolean) => void
}): React.JSX.Element {
  const change = line.type === 'add' || line.type === 'del'
  return (
    <div
      className={cn(
        'diff-line flex',
        line.type === 'add' && 'diff-add',
        line.type === 'del' && 'diff-del',
        selected && 'diff-selected',
        line.type === 'meta' && 'text-muted-foreground italic'
      )}
    >
      <span
        className={cn('flex shrink-0', change && selectable && 'cursor-pointer hover:bg-accent')}
        role={change && selectable ? 'checkbox' : undefined}
        aria-checked={change && selectable ? selected : undefined}
        aria-label={change && selectable ? `Select line ${line.newNo ?? line.oldNo}` : undefined}
        onMouseDown={(e) => change && selectable && (e.preventDefault(), onToggle(e.shiftKey))}
      >
        <Gutter n={line.oldNo} />
        <Gutter n={line.newNo} />
        <span
          className={cn(
            'w-4 shrink-0 select-none text-center',
            line.type === 'add' && 'text-added',
            line.type === 'del' && 'text-removed'
          )}
        >
          {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
        </span>
      </span>
      <span
        className="min-w-0 flex-1 pr-4"
        dangerouslySetInnerHTML={{
          __html:
            renderContent(line.content, lang, ws) +
            (line.noNewline ? '<span class="ws"> ⏎̸ no newline at end of file</span>' : '')
        }}
      />
    </div>
  )
})

function SplitCell({
  side,
  cell,
  lang,
  ws,
  selected,
  selectable,
  onToggle
}: {
  side: 'left' | 'right'
  cell: { index: number; line: DiffLine } | null
  lang: string | null
  ws: boolean
  selected: boolean
  selectable: boolean
  onToggle: (shift: boolean) => void
}): React.JSX.Element {
  if (!cell)
    return <div className={cn('diff-line bg-muted/40', side === 'left' && 'border-r')}>&nbsp;</div>
  const { line } = cell
  const change = line.type === 'add' || line.type === 'del'
  return (
    <div
      className={cn(
        'diff-line flex min-w-0 overflow-hidden',
        side === 'left' && 'border-r',
        line.type === 'add' && 'diff-add',
        line.type === 'del' && 'diff-del',
        selected && 'diff-selected'
      )}
    >
      <span
        className={cn('flex shrink-0', change && selectable && 'cursor-pointer hover:bg-accent')}
        role={change && selectable ? 'checkbox' : undefined}
        aria-checked={change && selectable ? selected : undefined}
        onMouseDown={(e) => change && selectable && (e.preventDefault(), onToggle(e.shiftKey))}
      >
        <Gutter n={side === 'left' ? line.oldNo : line.newNo} />
      </span>
      <span
        className="min-w-0 flex-1 overflow-hidden pr-2"
        dangerouslySetInnerHTML={{ __html: renderContent(line.content, lang, ws) }}
      />
    </div>
  )
}

function useBlobs(
  repo: string,
  diff: DiffResult
): { before: BlobContent | null; after: BlobContent | null; loading: boolean } {
  const [state, setState] = React.useState<{
    before: BlobContent | null
    after: BlobContent | null
    loading: boolean
  }>({ before: null, after: null, loading: true })
  React.useEffect(() => {
    const s = sidesOf(diff.source)
    let alive = true
    const missing: BlobContent = { kind: 'missing', size: 0 }
    const deleted = diff.file?.status === 'deleted'
    const added = diff.file?.status === 'added' || diff.source.kind === 'untracked'
    Promise.all([
      s.old && !added
        ? call('history.blob', { repo, rev: s.old, path: s.oldPath }).catch(() => missing)
        : Promise.resolve(missing),
      s.new && !deleted
        ? call('history.blob', { repo, rev: s.new, path: s.newPath }).catch(() => missing)
        : Promise.resolve(missing)
    ]).then(([before, after]) => alive && setState({ before, after, loading: false }))
    return () => {
      alive = false
    }
  }, [repo, diff])
  return state
}

function BinaryInfo({ repo, diff }: { repo: string; diff: DiffResult }): React.JSX.Element {
  const { before, after, loading } = useBlobs(repo, diff)
  return (
    <EmptyState icon={<FileWarning />} title="Binary file">
      <p>
        Git reports this file as binary, so a line diff is not available. Content is never rendered
        or executed.
      </p>
      {loading ? (
        <Spinner className="mt-2" />
      ) : (
        <p className="mt-2 font-mono text-[12px]">
          {before?.kind === 'missing' ? 'added' : `before: ${formatBytes(before?.size ?? 0)}`} →{' '}
          {after?.kind === 'missing' ? 'deleted' : `after: ${formatBytes(after?.size ?? 0)}`}
        </p>
      )}
    </EmptyState>
  )
}

function ImageCompare({ repo, diff }: { repo: string; diff: DiffResult }): React.JSX.Element {
  const { before, after, loading } = useBlobs(repo, diff)
  const [mode, setMode] = React.useState<'side' | 'swipe' | 'onion'>('side')
  const [pos, setPos] = React.useState(50)
  if (loading)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )
  const img = (b: BlobContent | null, label: string): React.ReactNode =>
    b?.kind === 'image' && b.dataUrl ? (
      <figure className="flex min-w-0 flex-1 flex-col items-center gap-2">
        <div className="checkerboard flex max-h-[60vh] items-center justify-center overflow-auto rounded border p-2">
          <img
            src={b.dataUrl}
            alt={label}
            className="max-h-[56vh] max-w-full object-contain"
            draggable={false}
          />
        </div>
        <figcaption className="text-[0.85em] text-muted-foreground">
          {label} · {formatBytes(b.size)}
        </figcaption>
      </figure>
    ) : (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground">
        <ImageIcon className="size-8 opacity-50" />
        <span className="text-[0.9em]">
          {label}:{' '}
          {b?.kind === 'too-large'
            ? 'too large to preview'
            : b?.kind === 'missing'
              ? 'does not exist'
              : 'cannot be previewed (SVG and unknown formats are never rendered)'}
        </span>
      </div>
    )
  const both = before?.kind === 'image' && after?.kind === 'image'
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      {both && (
        <div
          className="flex justify-center gap-1"
          role="radiogroup"
          aria-label="Image comparison mode"
        >
          {(['side', 'swipe', 'onion'] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? 'secondary' : 'ghost'}
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
            >
              {m === 'side' ? 'Side by side' : m === 'swipe' ? 'Swipe' : 'Onion skin'}
            </Button>
          ))}
        </div>
      )}
      {!both || mode === 'side' ? (
        <div className="flex gap-4">
          {img(before, 'Before')}
          {img(after, 'After')}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="checkerboard relative inline-block max-w-full rounded border">
            <img
              src={before!.dataUrl}
              alt="Before"
              className="block max-h-[60vh] max-w-full"
              draggable={false}
            />
            <img
              src={after!.dataUrl}
              alt="After"
              className="absolute inset-0 block h-full w-full object-contain"
              style={
                mode === 'swipe' ? { clipPath: `inset(0 0 0 ${pos}%)` } : { opacity: pos / 100 }
              }
              draggable={false}
            />
            {mode === 'swipe' && (
              <div className="absolute inset-y-0 w-px bg-primary" style={{ left: `${pos}%` }} />
            )}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label={mode === 'swipe' ? 'Swipe position' : 'Opacity of the new image'}
            className="w-64 accent-[var(--primary)]"
          />
        </div>
      )}
    </div>
  )
}
