import { z } from 'zod'
import type * as T from './types'

// ---------------------------------------------------------------------------
// Reusable validators. Values that end up as Git arguments must never start
// with "-" so they cannot be interpreted as options.
// ---------------------------------------------------------------------------

const noNul = (s: string): boolean => !s.includes('\0')
const notOption = (s: string): boolean => !s.startsWith('-')

export const repoPath = z.string().min(1).max(4096).refine(noNul, 'Invalid path')

export const relPath = z
  .string()
  .min(1)
  .max(4096)
  .refine(noNul, 'Invalid path')
  .refine((p) => !/^([a-zA-Z]:)?[\\/]/.test(p), 'Path must be relative to the repository')
  .refine((p) => !p.split(/[\\/]/).includes('..'), 'Path must stay inside the repository')

export const refName = z
  .string()
  .min(1)
  .max(512)
  .refine(noNul)
  .refine(notOption, 'Name must not start with "-"')
  .refine((s) => !/[\s~^:?*[\\]|\.\.|@\{|\.lock$|^\/|\/$|\.$/.test(s), 'Invalid Git reference name')

/** A revision expression such as a hash, a ref, HEAD~2 or stash@{0}. */
export const revision = z
  .string()
  .min(1)
  .max(512)
  .refine(noNul)
  .refine(notOption, 'Revision must not start with "-"')
  .refine((s) => !/\s/.test(s), 'Revision must not contain whitespace')

export const remoteName = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Invalid remote name')

export const remoteUrl = z
  .string()
  .min(1)
  .max(2048)
  .refine(noNul)
  .refine(notOption, 'URL must not start with "-"')
  .refine((s) => !/^ext::/i.test(s), 'The ext:: transport is not allowed')

export const opId = z.string().min(1).max(100)

const repo = { repo: repoPath }
const empty = z.object({})

export const diffSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unstaged'), path: relPath }),
  z.object({ kind: z.literal('staged'), path: relPath, origPath: relPath.optional() }),
  z.object({ kind: z.literal('untracked'), path: relPath }),
  z.object({
    kind: z.literal('commit'),
    hash: revision,
    path: relPath,
    origPath: relPath.optional()
  }),
  z.object({
    kind: z.literal('compare'),
    from: revision,
    /** "WORKTREE" compares against the working tree */
    to: revision,
    path: relPath,
    origPath: relPath.optional()
  }),
  z.object({ kind: z.literal('stash'), ref: revision, path: relPath })
])

export const diffOptions = z.object({
  ignoreWhitespace: z.boolean().default(false),
  context: z.number().int().min(0).max(100).default(3),
  maxBytes: z.number().int().min(10_000).max(50_000_000).default(1_000_000)
})

export const settingsPatch = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    density: z.enum(['compact', 'comfortable']),
    uiFontSize: z.number().int().min(10).max(20),
    monoFont: z.string().max(200),
    diffView: z.enum(['unified', 'split']),
    diffContext: z.number().int().min(0).max(50),
    diffIgnoreWhitespace: z.boolean(),
    diffShowWhitespace: z.boolean(),
    diffWrap: z.boolean(),
    gitPath: z.string().max(4096).refine(noNul),
    editorCommand: z.string().max(4096).refine(noNul),
    terminalCommand: z.string().max(4096).refine(noNul),
    diffTool: z
      .string()
      .max(100)
      .regex(/^[A-Za-z0-9._-]*$/),
    mergeTool: z
      .string()
      .max(100)
      .regex(/^[A-Za-z0-9._-]*$/),
    defaultCloneDir: z.string().max(4096).refine(noNul),
    autoFetch: z.boolean(),
    autoFetchMinutes: z.number().int().min(5).max(240),
    notifications: z.boolean(),
    reduceMotion: z.enum(['system', 'on', 'off']),
    proxy: z
      .string()
      .max(500)
      .refine((s) => s === '' || /^(https?|socks5h?):\/\/[^\s]+$/.test(s), 'Invalid proxy URL'),
    shortcuts: z.record(z.string().max(60), z.string().max(60))
  })
  .partial()

const rebaseTodo = z.object({
  action: z.enum(['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']),
  hash: z.string().regex(/^[0-9a-f]{7,64}$/),
  subject: z.string().max(2000),
  message: z.string().max(100_000).optional()
})

const hostingKind = z.enum(['github', 'gitlab', 'bitbucket', 'azure'])

// ---------------------------------------------------------------------------
// The contract. `m<Result>()(argsSchema)` pairs a runtime schema with a
// compile-time result type.
// ---------------------------------------------------------------------------

const m =
  <R>() =>
  <A extends z.ZodType>(args: A): { args: A; result: R } => ({
    args,
    result: undefined as unknown as R
  })

export const api = {
  // Application
  'app.info': m<T.AppInfo>()(empty),
  'app.refreshGit': m<T.AppInfo>()(empty),
  'settings.get': m<T.Settings>()(empty),
  'settings.set': m<T.Settings>()(settingsPatch),
  'oplog.list': m<T.OpLogEntry[]>()(empty),
  'oplog.clear': m<void>()(empty),
  'op.cancel': m<boolean>()(z.object({ opId })),
  'dialog.pickDirectory': m<string | null>()(
    z.object({ title: z.string().max(200), defaultPath: z.string().max(4096).optional() })
  ),
  'shell.openExternal': m<void>()(z.object({ url: z.string().url().max(4096) })),
  'shell.showInFolder': m<void>()(z.object({ ...repo, path: relPath.optional() })),
  'shell.openTerminal': m<void>()(z.object(repo)),
  'shell.openEditor': m<void>()(z.object({ ...repo, path: relPath.optional() })),

  // Repository management
  'recents.list': m<T.RecentRepo[]>()(empty),
  'recents.update': m<T.RecentRepo[]>()(
    z.object({
      path: repoPath,
      favorite: z.boolean().optional(),
      group: z.string().max(100).nullable().optional()
    })
  ),
  'recents.remove': m<T.RecentRepo[]>()(z.object({ path: repoPath })),
  'repo.open': m<T.RepoSummary>()(z.object({ path: repoPath })),
  'repo.trust': m<T.RepoSummary>()(z.object({ path: repoPath })),
  'repo.close': m<void>()(z.object(repo)),
  'repo.init': m<T.RepoSummary>()(z.object({ path: repoPath, initialBranch: refName.optional() })),
  'repo.clone': m<T.RepoSummary>()(
    z.object({
      url: remoteUrl,
      path: repoPath,
      opId,
      depth: z.number().int().min(1).max(1_000_000).optional(),
      recurseSubmodules: z.boolean().default(false)
    })
  ),
  'repo.summary': m<T.RepoSummary>()(z.object(repo)),
  'repo.status': m<T.RepoStatus>()(z.object(repo)),
  'repo.refs': m<T.RefsSnapshot>()(z.object(repo)),

  // History
  'history.log': m<{ commits: T.Commit[]; hasMore: boolean }>()(
    z.object({
      ...repo,
      skip: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(5000).default(500),
      refs: z.array(revision).max(200).optional(),
      allRefs: z.boolean().default(true),
      search: z
        .object({
          text: z.string().max(500).optional(),
          author: z.string().max(200).optional(),
          hash: z
            .string()
            .regex(/^[0-9a-fA-F]{4,64}$/)
            .optional(),
          path: relPath.optional(),
          since: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          until: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
        })
        .optional()
    })
  ),
  'history.commit': m<T.CommitDetails>()(z.object({ ...repo, hash: revision })),
  'history.compareFiles': m<T.CommitFile[]>()(
    z.object({ ...repo, from: revision, to: revision.nullable() })
  ),
  'history.fileLog': m<T.FileLogEntry[]>()(
    z.object({ ...repo, path: relPath, limit: z.number().int().min(1).max(5000).default(500) })
  ),
  'history.blame': m<T.BlameLine[]>()(
    z.object({ ...repo, path: relPath, rev: revision.optional() })
  ),
  'history.tree': m<T.TreeEntry[]>()(
    z.object({ ...repo, rev: revision, path: relPath.optional() })
  ),
  'history.reflog': m<T.ReflogEntry[]>()(
    z.object({
      ...repo,
      ref: revision.default('HEAD'),
      limit: z.number().int().max(5000).default(300)
    })
  ),
  'history.blob': m<T.BlobContent>()(
    z.object({ ...repo, rev: z.string().max(512).refine(noNul).refine(notOption), path: relPath })
  ),

  // Working tree
  'diff.get': m<T.DiffResult>()(z.object({ ...repo, source: diffSource, options: diffOptions })),
  'index.stage': m<void>()(z.object({ ...repo, paths: z.array(relPath).min(1).max(100_000) })),
  'index.stageAll': m<void>()(z.object(repo)),
  'index.unstage': m<void>()(z.object({ ...repo, paths: z.array(relPath).min(1).max(100_000) })),
  'index.unstageAll': m<void>()(z.object(repo)),
  'index.discard': m<void>()(
    z
      .object({
        ...repo,
        paths: z.array(relPath).max(100_000),
        untracked: z.array(relPath).max(100_000).default([])
      })
      .refine((a) => a.paths.length + a.untracked.length > 0, 'Nothing to discard')
  ),
  'index.applyPartial': m<void>()(
    z.object({
      ...repo,
      path: relPath,
      mode: z.enum(['stage', 'unstage', 'discard']),
      fingerprint: z.string().max(200),
      /** Indices into the flattened list of change lines of each hunk: [hunkIndex, lineIndex] */
      selection: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).min(1),
      options: diffOptions
    })
  ),
  'commit.create': m<T.CommandResult>()(
    z.object({
      ...repo,
      message: z.string().max(200_000),
      amend: z.boolean().default(false),
      signoff: z.boolean().default(false),
      noVerify: z.boolean().default(false),
      sign: z.enum(['config', 'force', 'never']).default('config'),
      allowEmpty: z.boolean().default(false)
    })
  ),
  'commit.lastMessage': m<string>()(z.object(repo)),
  'commit.template': m<string | null>()(z.object(repo)),

  // Branches and tags
  'branch.create': m<void>()(
    z.object({ ...repo, name: refName, start: revision.optional(), checkout: z.boolean() })
  ),
  'branch.checkout': m<void>()(z.object({ ...repo, ref: revision, track: z.boolean().optional() })),
  'branch.rename': m<void>()(z.object({ ...repo, from: refName, to: refName })),
  'branch.delete': m<void>()(z.object({ ...repo, name: refName, force: z.boolean() })),
  'branch.deleteRemote': m<void>()(z.object({ ...repo, remote: remoteName, name: refName })),
  'branch.setUpstream': m<void>()(
    z.object({ ...repo, branch: refName, upstream: revision.nullable() })
  ),
  'tag.create': m<void>()(
    z.object({
      ...repo,
      name: refName,
      target: revision,
      message: z.string().max(100_000).optional(),
      sign: z.boolean().default(false)
    })
  ),
  'tag.delete': m<void>()(z.object({ ...repo, name: refName })),
  'tag.push': m<T.CommandResult>()(
    z.object({
      ...repo,
      remote: remoteName,
      name: refName,
      delete: z.boolean().default(false),
      opId
    })
  ),

  // Remotes
  'remote.add': m<void>()(z.object({ ...repo, name: remoteName, url: remoteUrl })),
  'remote.remove': m<void>()(z.object({ ...repo, name: remoteName })),
  'remote.rename': m<void>()(z.object({ ...repo, from: remoteName, to: remoteName })),
  'remote.setUrl': m<void>()(
    z.object({ ...repo, name: remoteName, url: remoteUrl, push: z.boolean().default(false) })
  ),
  'remote.fetch': m<T.CommandResult>()(
    z.object({
      ...repo,
      remote: remoteName.optional(),
      all: z.boolean().default(true),
      prune: z.boolean().default(false),
      tags: z.boolean().default(false),
      opId
    })
  ),
  'remote.pull': m<T.CommandResult>()(
    z.object({ ...repo, strategy: z.enum(['merge', 'rebase', 'ff-only']), opId })
  ),
  'remote.push': m<T.CommandResult>()(
    z.object({
      ...repo,
      remote: remoteName,
      branch: refName,
      remoteBranch: refName.optional(),
      setUpstream: z.boolean().default(false),
      forceWithLease: z.boolean().default(false),
      tags: z.boolean().default(false),
      opId
    })
  ),

  // Integration operations
  'op.merge': m<T.CommandResult>()(
    z.object({
      ...repo,
      ref: revision,
      mode: z.enum(['default', 'no-ff', 'ff-only', 'squash']).default('default')
    })
  ),
  'op.rebase': m<T.CommandResult>()(z.object({ ...repo, onto: revision })),
  'op.cherryPick': m<T.CommandResult>()(
    z.object({
      ...repo,
      hashes: z.array(revision).min(1).max(1000),
      noCommit: z.boolean().default(false)
    })
  ),
  'op.revert': m<T.CommandResult>()(
    z.object({ ...repo, hash: revision, noCommit: z.boolean().default(false) })
  ),
  'op.reset': m<void>()(
    z.object({ ...repo, target: revision, mode: z.enum(['soft', 'mixed', 'hard', 'keep']) })
  ),
  'op.control': m<T.CommandResult>()(
    z.object({ ...repo, action: z.enum(['continue', 'abort', 'skip']) })
  ),
  'op.previewCommits': m<T.Commit[]>()(
    z.object({
      ...repo,
      from: revision,
      to: revision,
      limit: z.number().int().max(1000).default(200)
    })
  ),
  'rebase.interactive': m<T.CommandResult>()(
    z.object({ ...repo, base: revision.nullable(), todo: z.array(rebaseTodo).min(1).max(2000) })
  ),
  'stash.push': m<void>()(
    z.object({
      ...repo,
      message: z.string().max(10_000).optional(),
      includeUntracked: z.boolean().default(false),
      keepIndex: z.boolean().default(false),
      paths: z.array(relPath).max(10_000).optional()
    })
  ),
  'stash.apply': m<T.CommandResult>()(
    z.object({
      ...repo,
      index: z.number().int().min(0),
      pop: z.boolean(),
      restoreIndex: z.boolean().default(false)
    })
  ),
  'stash.drop': m<void>()(z.object({ ...repo, index: z.number().int().min(0) })),
  'stash.files': m<T.CommitFile[]>()(z.object({ ...repo, index: z.number().int().min(0) })),
  'reflog.createBranch': m<void>()(z.object({ ...repo, name: refName, hash: revision })),

  // Conflicts
  'conflict.get': m<T.ConflictFile>()(z.object({ ...repo, path: relPath })),
  'conflict.save': m<void>()(
    z.object({ ...repo, path: relPath, content: z.string().max(50_000_000), stage: z.boolean() })
  ),
  'conflict.take': m<void>()(
    z.object({ ...repo, path: relPath, side: z.enum(['ours', 'theirs', 'delete']) })
  ),
  'conflict.markResolved': m<void>()(z.object({ ...repo, path: relPath })),
  'conflict.externalTool': m<T.CommandResult>()(z.object({ ...repo, path: relPath, opId })),
  'diff.externalTool': m<void>()(
    z.object({ ...repo, path: relPath, staged: z.boolean().default(false) })
  ),

  // Worktrees, submodules, LFS
  'worktree.add': m<void>()(
    z.object({
      ...repo,
      path: repoPath,
      ref: revision.optional(),
      newBranch: refName.optional()
    })
  ),
  'worktree.remove': m<void>()(z.object({ ...repo, path: repoPath, force: z.boolean() })),
  'worktree.prune': m<void>()(z.object(repo)),
  'submodule.update': m<T.CommandResult>()(
    z.object({
      ...repo,
      init: z.boolean().default(true),
      recursive: z.boolean().default(true),
      opId
    })
  ),
  'submodule.sync': m<void>()(z.object(repo)),
  'submodule.add': m<T.CommandResult>()(z.object({ ...repo, url: remoteUrl, path: relPath, opId })),
  'lfs.status': m<{
    installed: boolean
    version: string | null
    tracked: string[]
    files: string[]
  }>()(z.object(repo)),
  'lfs.run': m<T.CommandResult>()(
    z.object({ ...repo, action: z.enum(['fetch', 'pull', 'push', 'install', 'prune']), opId })
  ),
  'lfs.track': m<void>()(
    z.object({
      ...repo,
      pattern: z.string().min(1).max(500).refine(noNul).refine(notOption),
      untrack: z.boolean().default(false)
    })
  ),

  // Repository configuration
  'gitignore.read': m<string>()(z.object(repo)),
  'gitignore.write': m<void>()(z.object({ ...repo, content: z.string().max(5_000_000) })),
  'gitignore.append': m<void>()(
    z.object({ ...repo, pattern: z.string().min(1).max(4096).refine(noNul) })
  ),
  'config.identity': m<{
    local: {
      name: string | null
      email: string | null
      signingKey: string | null
      gpgSign: boolean | null
    }
    global: {
      name: string | null
      email: string | null
      signingKey: string | null
      gpgSign: boolean | null
    }
  }>()(z.object({ repo: repoPath.optional() })),
  'config.setIdentity': m<void>()(
    z.object({
      repo: repoPath.optional(),
      scope: z.enum(['local', 'global']),
      name: z.string().max(200).nullable(),
      email: z.string().max(200).nullable(),
      signingKey: z.string().max(500).nullable().optional(),
      gpgSign: z.boolean().nullable().optional()
    })
  ),

  // Advanced
  'bisect.start': m<T.CommandResult>()(z.object({ ...repo, bad: revision, good: revision })),
  'bisect.mark': m<T.CommandResult>()(
    z.object({ ...repo, verdict: z.enum(['good', 'bad', 'skip']) })
  ),
  'bisect.reset': m<T.CommandResult>()(z.object(repo)),
  'bisect.log': m<string>()(z.object(repo)),
  'flow.start': m<void>()(
    z.object({
      ...repo,
      kind: z.enum(['feature', 'release', 'hotfix']),
      name: z
        .string()
        .min(1)
        .max(200)
        .regex(/^[A-Za-z0-9._\-/]+$/),
      develop: refName.default('develop'),
      main: refName.default('main')
    })
  ),
  'flow.finish': m<T.CommandResult>()(
    z.object({
      ...repo,
      branch: refName,
      develop: refName.default('develop'),
      main: refName.default('main'),
      deleteBranch: z.boolean().default(true)
    })
  ),

  // Hosting
  'hosting.accounts': m<T.HostingAccount[]>()(empty),
  'hosting.addAccount': m<T.HostingAccount>()(
    z.object({
      kind: hostingKind,
      baseUrl: z.string().url().max(500),
      token: z.string().min(1).max(1000)
    })
  ),
  'hosting.removeAccount': m<T.HostingAccount[]>()(z.object({ id: z.string().max(200) })),
  'hosting.detect': m<T.HostedRepoRef | null>()(
    z.object({ ...repo, remote: remoteName.optional() })
  ),
  'hosting.pullRequests': m<T.PullRequest[]>()(
    z.object({ ...repo, state: z.enum(['open', 'closed', 'all']).default('open') })
  ),
  'hosting.pullRequest': m<T.PullRequest>()(z.object({ ...repo, number: z.number().int().min(1) })),
  'hosting.checkoutPullRequest': m<void>()(
    z.object({ ...repo, number: z.number().int().min(1), opId })
  ),
  'hosting.repos': m<T.HostedRepo[]>()(z.object({ accountId: z.string().max(200) })),
  'hosting.webUrl': m<string | null>()(
    z.object({
      ...repo,
      target: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('repo') }),
        z.object({ kind: z.literal('commit'), hash: z.string().regex(/^[0-9a-f]{7,64}$/) }),
        z.object({ kind: z.literal('branch'), name: refName }),
        z.object({ kind: z.literal('compare'), name: refName })
      ])
    })
  ),
  'hosting.notifications': m<
    { title: string; repo: string; url: string | null; reason: string }[]
  >()(z.object({ accountId: z.string().max(200) }))
} as const

export type Api = typeof api
export type ApiMethod = keyof Api
export type ApiArgs<M extends ApiMethod> = z.input<Api[M]['args']>
export type ApiResult<M extends ApiMethod> = Api[M]['result']

/** Events pushed from the main process to the renderer. */
export interface ApiEvents {
  'repo.changed': { repo: string; scope: 'worktree' | 'refs' | 'all' }
  'op.progress': T.OpProgress
  'oplog.updated': T.OpLogEntry
  'theme.system': { dark: boolean }
}
export type ApiEvent = keyof ApiEvents

export const API_EVENTS: ApiEvent[] = [
  'repo.changed',
  'op.progress',
  'oplog.updated',
  'theme.system'
]

/** Errors are serialised across IPC as { code, message, detail }. */
export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_A_REPOSITORY'
  | 'UNSAFE_REPOSITORY'
  | 'REPO_NOT_OPEN'
  | 'GIT_NOT_FOUND'
  | 'GIT_FAILED'
  | 'CANCELLED'
  | 'STALE'
  | 'CONFLICT'
  | 'AUTH'
  | 'NETWORK'
  | 'UNSUPPORTED'
  | 'NOT_FOUND'
  | 'INTERNAL'

export interface ApiErrorPayload {
  code: ErrorCode
  message: string
  detail?: string
}

export type ApiResponse<R> = { ok: true; value: R } | { ok: false; error: ApiErrorPayload }
