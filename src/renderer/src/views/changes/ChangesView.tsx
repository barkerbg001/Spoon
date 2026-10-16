import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Copy,
  ExternalLink,
  EyeOff,
  FileClock,
  FolderOpen,
  History,
  Minus,
  Package,
  Plus,
  ScanText,
  Undo2
} from 'lucide-react'
import type { DiffSource, FileChange } from '@shared/types'
import { ApiError, call } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast, toastError } from '@/app/state'
import { confirm } from '@/app/dialogs'
import { useRepo } from '@/app/repo/context'
import * as A from '@/app/repo/actions'
import { Button } from '@/components/ui/button'
import { EmptyState, Tip } from '@/components/ui/primitives'
import { ContextMenu, type MenuItem } from '@/components/ui/menu'
import { Split } from '@/components/ui/split'
import { PathLabel, StatusChip } from '@/components/FileStatus'
import { DiffView, type DiffActions } from '../diff/DiffView'
import { useDiff } from '../diff/useDiff'
import { ConflictView, markResolvedChecked } from '../conflict/ConflictView'
import { CommitBox } from './CommitBox'

type Section = 'conflicted' | 'unstaged' | 'staged'
type Row =
  | { kind: 'header'; section: Section; count: number }
  | { kind: 'file'; section: Section; file: FileChange }

const fileKey = (section: Section, f: FileChange): string => `${section}\0${f.path}`

export function ChangesView(): React.JSX.Element {
  const r = useRepo()
  const s = r.status
  const [collapsed, setCollapsed] = React.useState<Record<Section, boolean>>({
    conflicted: false,
    unstaged: false,
    staged: false
  })
  const [selection, setSelection] = React.useState<string[]>([])
  const [focus, setFocus] = React.useState<string | null>(null)
  const anchor = React.useRef<string | null>(null)

  const sections = React.useMemo(() => {
    if (!s) return { conflicted: [], unstaged: [], staged: [] } as Record<Section, FileChange[]>
    return {
      conflicted: s.conflicted,
      unstaged: [...s.unstaged, ...s.untracked].sort((a, b) => a.path.localeCompare(b.path)),
      staged: s.staged
    }
  }, [s])

  const rows = React.useMemo(() => {
    const out: Row[] = []
    for (const sec of ['conflicted', 'unstaged', 'staged'] as Section[]) {
      if (sec === 'conflicted' && sections.conflicted.length === 0) continue
      out.push({ kind: 'header', section: sec, count: sections[sec].length })
      if (!collapsed[sec])
        for (const f of sections[sec]) out.push({ kind: 'file', section: sec, file: f })
    }
    return out
  }, [sections, collapsed])

  const fileRows = React.useMemo(
    () => rows.filter((x): x is Extract<Row, { kind: 'file' }> => x.kind === 'file'),
    [rows]
  )
  const byKey = React.useMemo(
    () => new Map(fileRows.map((x) => [fileKey(x.section, x.file), x])),
    [fileRows]
  )

  // Keep selection valid as files move between sections; follow a staged/unstaged file to its new section.
  React.useEffect(() => {
    if (!focus) return
    if (byKey.has(focus)) return
    const path = focus.split('\0')[1]
    const moved = fileRows.find((x) => x.file.path === path)
    if (moved) {
      const k = fileKey(moved.section, moved.file)
      setFocus(k)
      setSelection([k])
    } else {
      setFocus(null)
      setSelection([])
    }
  }, [byKey, fileRows, focus])

  const focused = focus ? byKey.get(focus) : undefined
  const selectedRows = selection
    .map((k) => byKey.get(k))
    .filter((x): x is Extract<Row, { kind: 'file' }> => !!x)

  const source: DiffSource | null = !focused
    ? null
    : focused.section === 'staged'
      ? { kind: 'staged', path: focused.file.path, origPath: focused.file.origPath }
      : focused.file.kind === 'untracked'
        ? { kind: 'untracked', path: focused.file.path }
        : focused.section === 'unstaged'
          ? { kind: 'unstaged', path: focused.file.path }
          : null
  const diff = useDiff(r.path, source, r.statusVersion)

  const select = (
    k: string,
    e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }
  ): void => {
    if (e?.shiftKey && anchor.current) {
      const keys = fileRows.map((x) => fileKey(x.section, x.file))
      const a = keys.indexOf(anchor.current)
      const b = keys.indexOf(k)
      if (a >= 0 && b >= 0) {
        setSelection(keys.slice(Math.min(a, b), Math.max(a, b) + 1))
        setFocus(k)
        return
      }
    }
    if (e?.ctrlKey || e?.metaKey) {
      setSelection((sel) => (sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]))
    } else setSelection([k])
    anchor.current = k
    setFocus(k)
  }

  const stage = async (files: FileChange[]): Promise<void> => {
    if (!files.length) return
    await A.run(
      r,
      'Stage',
      () => call('index.stage', { repo: r.path, paths: files.map((f) => f.path) }),
      { scope: 'worktree' }
    )
  }
  const unstage = async (files: FileChange[]): Promise<void> => {
    if (!files.length) return
    await A.run(
      r,
      'Unstage',
      () =>
        call('index.unstage', {
          repo: r.path,
          paths: files.flatMap((f) => (f.origPath ? [f.path, f.origPath] : [f.path]))
        }),
      { scope: 'worktree' }
    )
  }

  const toggleStage = (items: Extract<Row, { kind: 'file' }>[]): void => {
    const staged = items.filter((x) => x.section === 'staged').map((x) => x.file)
    const unstaged = items.filter((x) => x.section === 'unstaged').map((x) => x.file)
    if (unstaged.length) void stage(unstaged)
    else if (staged.length) void unstage(staged)
  }

  const discardRows = (items: Extract<Row, { kind: 'file' }>[]): void => {
    const files = items.filter((x) => x.section === 'unstaged').map((x) => x.file)
    if (files.length) void A.discard(r, files)
    else if (items.length)
      toast({
        kind: 'info',
        title: 'Unstage the files first; only unstaged changes can be discarded.'
      })
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const keys = fileRows.map((x) => fileKey(x.section, x.file))
    const idx = focus ? keys.indexOf(focus) : -1
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next =
        keys[Math.max(0, Math.min(keys.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next) select(next, { shiftKey: e.shiftKey })
    } else if ((e.key === ' ' || e.key === 'Enter') && selectedRows.length) {
      e.preventDefault()
      toggleStage(selectedRows)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRows.length) {
      e.preventDefault()
      discardRows(selectedRows)
    } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setSelection(keys)
    }
  }

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 20
  })
  React.useEffect(() => {
    if (!focus) return
    const i = rows.findIndex((x) => x.kind === 'file' && fileKey(x.section, x.file) === focus)
    if (i >= 0) virt.scrollToIndex(i, { align: 'auto' })
  }, [focus, rows, virt])

  const menuFor = (row: Extract<Row, { kind: 'file' }>): MenuItem[] => {
    const items = selection.includes(fileKey(row.section, row.file)) ? selectedRows : [row]
    const files = items.map((x) => x.file)
    const single = items.length === 1 ? row.file : null
    const out: MenuItem[] = []
    if (row.section === 'unstaged')
      out.push({
        label: items.length > 1 ? `Stage ${items.length} files` : 'Stage',
        icon: <Plus />,
        shortcut: 'Space',
        onSelect: () => void stage(files)
      })
    if (row.section === 'staged')
      out.push({
        label: items.length > 1 ? `Unstage ${items.length} files` : 'Unstage',
        icon: <Minus />,
        shortcut: 'Space',
        onSelect: () => void unstage(files)
      })
    if (row.section === 'conflicted')
      out.push({
        label: 'Mark as resolved',
        icon: <CircleCheck />,
        onSelect: () =>
          void markResolvedChecked(
            r,
            files.map((f) => f.path)
          )
      })
    if (row.section === 'unstaged')
      out.push({
        label: 'Discard changes…',
        icon: <Undo2 />,
        shortcut: 'Del',
        danger: true,
        onSelect: () => discardRows(items)
      })
    if (row.section !== 'conflicted')
      out.push({
        label: 'Stash these files…',
        icon: <Package />,
        onSelect: () =>
          void A.stash(
            r,
            files.map((f) => f.path)
          )
      })
    out.push({ type: 'separator' })
    if (single) {
      out.push(
        {
          label: 'Open in editor',
          icon: <ExternalLink />,
          onSelect: () =>
            void call('shell.openEditor', { repo: r.path, path: single.path }).catch((e) =>
              toastError(e)
            )
        },
        {
          label: 'Show in folder',
          icon: <FolderOpen />,
          onSelect: () =>
            void call('shell.showInFolder', { repo: r.path, path: single.path }).catch((e) =>
              toastError(e)
            )
        },
        {
          label: 'Open in external diff tool',
          icon: <ScanText />,
          disabled: single.kind === 'untracked',
          reason: 'Untracked files have no previous version',
          onSelect: () =>
            void call('diff.externalTool', {
              repo: r.path,
              path: single.path,
              staged: row.section === 'staged'
            }).catch((e) => toastError(e))
        },
        {
          label: 'File history',
          icon: <History />,
          disabled: single.kind === 'untracked',
          reason: 'Untracked files have no history',
          onSelect: () => r.setView({ kind: 'fileHistory', path: single.path })
        },
        {
          label: 'Blame',
          icon: <FileClock />,
          disabled: single.kind === 'untracked' || single.index === 'A',
          reason: 'Not committed yet',
          onSelect: () => r.setView({ kind: 'blame', path: single.path })
        },
        { type: 'separator' }
      )
      if (single.kind === 'untracked') {
        const ext = single.path.includes('.')
          ? single.path.slice(single.path.lastIndexOf('.'))
          : null
        out.push({
          type: 'submenu',
          label: 'Ignore',
          icon: <EyeOff />,
          items: [
            {
              label: `Ignore "${single.path}"`,
              onSelect: () =>
                void A.run(
                  r,
                  'Ignore',
                  () => call('gitignore.append', { repo: r.path, pattern: `/${single.path}` }),
                  { success: 'Added to .gitignore' }
                )
            },
            ...(ext
              ? [
                  {
                    label: `Ignore all *${ext} files`,
                    onSelect: () =>
                      void A.run(
                        r,
                        'Ignore',
                        () => call('gitignore.append', { repo: r.path, pattern: `*${ext}` }),
                        { success: 'Added to .gitignore' }
                      )
                  }
                ]
              : []),
            ...(single.path.includes('/')
              ? [
                  {
                    label: `Ignore folder "${single.path.slice(0, single.path.lastIndexOf('/'))}/"`,
                    onSelect: () =>
                      void A.run(
                        r,
                        'Ignore',
                        () =>
                          call('gitignore.append', {
                            repo: r.path,
                            pattern: `/${single.path.slice(0, single.path.lastIndexOf('/'))}/`
                          }),
                        { success: 'Added to .gitignore' }
                      )
                  }
                ]
              : [])
          ]
        })
      }
    }
    out.push({
      label: items.length > 1 ? 'Copy paths' : 'Copy path',
      icon: <Copy />,
      onSelect: () => void A.copy(files.map((f) => f.path).join('\n'), 'Path copied')
    })
    return out
  }

  const actions: DiffActions | undefined =
    focused && focused.section !== 'conflicted' && focused.file.kind !== 'untracked'
      ? {
          modes: focused.section === 'staged' ? ['unstage'] : ['stage', 'discard'],
          onPartial: async (mode, selection, d) => {
            if (mode === 'discard') {
              const ok = await confirm({
                title: `Discard ${selection.length} selected line(s)?`,
                description:
                  'The selected changes are removed from the working tree. This cannot be undone.',
                confirmLabel: 'Discard',
                destructive: true
              })
              if (!ok) return
            }
            try {
              await call('index.applyPartial', {
                repo: r.path,
                path: focused.file.path,
                mode,
                fingerprint: d.fingerprint,
                selection,
                options: diff.options
              })
            } catch (e) {
              if (e instanceof ApiError && e.code === 'STALE')
                toast({ kind: 'info', title: e.message })
              else toastError(e, 'Partial operation')
            } finally {
              await r.refresh('worktree')
              diff.reload()
            }
          }
        }
      : undefined

  if (!s) return <EmptyState title="Loading…" />

  const total = sections.unstaged.length + sections.staged.length + sections.conflicted.length
  const sectionTitle: Record<Section, string> = {
    conflicted: 'Conflicts',
    unstaged: 'Unstaged',
    staged: 'Staged'
  }

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto outline-none"
        tabIndex={0}
        role="listbox"
        aria-multiselectable
        aria-label="Changed files"
        onKeyDown={onKeyDown}
      >
        {total === 0 ? (
          <EmptyState icon={<CircleCheck />} title="Working tree clean">
            No uncommitted changes{s.head.branch ? ` on ${s.head.branch}` : ''}.
          </EmptyState>
        ) : (
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((vi) => {
              const row = rows[vi.index]!
              const style: React.CSSProperties = {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: vi.size,
                transform: `translateY(${vi.start}px)`
              }
              if (row.kind === 'header') {
                const files = sections[row.section]
                return (
                  <div
                    key={vi.key}
                    style={style}
                    className="flex items-center gap-1 border-b bg-sidebar px-1.5 text-[0.85em] font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    <button
                      className="flex flex-1 items-center gap-1 text-left"
                      aria-expanded={!collapsed[row.section]}
                      onClick={() =>
                        setCollapsed((c) => ({ ...c, [row.section]: !c[row.section] }))
                      }
                    >
                      {collapsed[row.section] ? (
                        <ChevronRight className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      {sectionTitle[row.section]} <span className="font-normal">({row.count})</span>
                    </button>
                    {row.section === 'unstaged' && files.length > 0 && (
                      <>
                        <Tip content="Discard all unstaged changes…">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="size-6"
                            aria-label="Discard all"
                            onClick={() => void A.discard(r, files)}
                          >
                            <Undo2 />
                          </Button>
                        </Tip>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 normal-case"
                          onClick={() =>
                            void A.run(
                              r,
                              'Stage all',
                              () => call('index.stageAll', { repo: r.path }),
                              { scope: 'worktree' }
                            )
                          }
                        >
                          Stage all
                        </Button>
                      </>
                    )}
                    {row.section === 'staged' && files.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 normal-case"
                        onClick={() =>
                          void A.run(
                            r,
                            'Unstage all',
                            () => call('index.unstageAll', { repo: r.path }),
                            { scope: 'worktree' }
                          )
                        }
                      >
                        Unstage all
                      </Button>
                    )}
                  </div>
                )
              }
              const k = fileKey(row.section, row.file)
              const code =
                row.section === 'conflicted'
                  ? 'U'
                  : row.file.kind === 'untracked'
                    ? '?'
                    : row.section === 'staged'
                      ? row.file.index
                      : row.file.worktree
              return (
                <ContextMenu key={vi.key} items={() => menuFor(row)}>
                  <div
                    style={style}
                    role="option"
                    aria-selected={selection.includes(k)}
                    onMouseDown={(e) => {
                      if (e.button === 2 && selection.includes(k)) return
                      select(k, e)
                    }}
                    onDoubleClick={() => toggleStage([row])}
                    className={cn(
                      'group flex cursor-default items-center gap-1.5 px-2 text-[0.95em]',
                      selection.includes(k) ? 'bg-primary/15' : 'hover:bg-accent/60',
                      focus === k && 'shadow-[inset_2px_0_0_var(--primary)]'
                    )}
                  >
                    <StatusChip code={code} />
                    <PathLabel path={row.file.path} origPath={row.file.origPath} />
                    {row.file.conflict && (
                      <span className="ml-auto shrink-0 text-[0.85em] text-conflict">
                        {row.file.conflict}
                      </span>
                    )}
                    {row.section !== 'conflicted' && (
                      <Tip content={row.section === 'staged' ? 'Unstage' : 'Stage'}>
                        <button
                          className="ml-auto hidden size-5 shrink-0 items-center justify-center rounded hover:bg-background group-hover:flex"
                          aria-label={
                            row.section === 'staged'
                              ? `Unstage ${row.file.path}`
                              : `Stage ${row.file.path}`
                          }
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => toggleStage([row])}
                        >
                          {row.section === 'staged' ? (
                            <Minus className="size-3.5" />
                          ) : (
                            <Plus className="size-3.5" />
                          )}
                        </button>
                      </Tip>
                    )}
                  </div>
                </ContextMenu>
              )
            })}
          </div>
        )}
      </div>
      <CommitBox />
    </div>
  )

  const right =
    focused?.section === 'conflicted' ? (
      <ConflictView path={focused.file.path} />
    ) : (
      <DiffView
        repo={r.path}
        state={diff}
        actions={actions}
        emptyText={total ? 'Select a file to see its changes' : 'Nothing to show'}
        header={
          focused ? (
            <span className="flex items-center gap-2 text-[0.92em]">
              <PathLabel path={focused.file.path} origPath={focused.file.origPath} />
              <span className="shrink-0 text-muted-foreground">
                {focused.section === 'staged'
                  ? '(staged)'
                  : focused.file.kind === 'untracked'
                    ? '(untracked)'
                    : '(unstaged)'}
              </span>
            </span>
          ) : null
        }
      />
    )

  return <Split id="changes" initial={360} min={240} first={list} second={right} />
}
