import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, type BrowserWindow, dialog, Notification, shell } from 'electron'
import type { z } from 'zod'
import type { Api, ApiMethod, ApiResult } from '@shared/api'
import type { AppInfo, HostedRepoRef, HostingAccount, OpProgress } from '@shared/types'
import { AppError } from './errors'
import { clearOps, listOps } from './oplog'
import { cancelOp, discoverGit, getGitInfo, git, setProxy } from './git/runner'
import {
  getStatus,
  getSummary,
  registerRepo,
  requireRepo,
  resolveRepo,
  unregisterRepo,
  type RepoCtx
} from './git/repo'
import * as history from './git/history'
import * as changes from './git/changes'
import * as branches from './git/branches'
import * as ops from './git/ops'
import * as conflicts from './git/conflicts'
import * as extras from './git/extras'
import { AppStore } from './store'
import { SecretStore } from './secrets'
import { RepoWatcher } from './watcher'
import { isSafeExternalUrl, openEditor, openTerminal } from './launch'
import { DEFAULT_BASE, PROVIDERS, type HostingProvider } from './hosting/providers'
import { parseRemoteUrl } from '@shared/remoteUrl'

export interface CallContext {
  progress: (p: OpProgress) => void
  window: BrowserWindow | null
}

type Handler<M extends ApiMethod> = (
  args: z.output<Api[M]['args']>,
  call: CallContext
) => Promise<ApiResult<M>> | ApiResult<M>
export type Handlers = { [M in ApiMethod]: Handler<M> }

/** Methods that modify a repository: serialised per repository (shared by linked worktrees). */
export const MUTATING = new Set<ApiMethod>([
  'index.stage',
  'index.stageAll',
  'index.unstage',
  'index.unstageAll',
  'index.discard',
  'index.applyPartial',
  'commit.create',
  'branch.create',
  'branch.checkout',
  'branch.rename',
  'branch.delete',
  'branch.deleteRemote',
  'branch.setUpstream',
  'tag.create',
  'tag.delete',
  'tag.push',
  'remote.add',
  'remote.remove',
  'remote.rename',
  'remote.setUrl',
  'remote.fetch',
  'remote.pull',
  'remote.push',
  'op.merge',
  'op.rebase',
  'op.cherryPick',
  'op.revert',
  'op.reset',
  'op.control',
  'rebase.interactive',
  'stash.push',
  'stash.apply',
  'stash.drop',
  'reflog.createBranch',
  'conflict.save',
  'conflict.take',
  'conflict.markResolved',
  'conflict.externalTool',
  'worktree.add',
  'worktree.remove',
  'worktree.prune',
  'submodule.update',
  'submodule.sync',
  'submodule.add',
  'lfs.run',
  'lfs.track',
  'gitignore.write',
  'gitignore.append',
  'bisect.start',
  'bisect.mark',
  'bisect.reset',
  'flow.start',
  'flow.finish',
  'hosting.checkoutPullRequest'
])

export class Services {
  readonly store: AppStore
  readonly secrets: SecretStore
  private watchers = new Map<string, RepoWatcher>()
  private fetchTimer: NodeJS.Timeout | null = null
  gitError: string | null = null

  constructor(
    dir: string,
    private readonly broadcast: (
      event: 'repo.changed',
      payload: { repo: string; scope: 'worktree' | 'refs' | 'all' }
    ) => void
  ) {
    this.store = new AppStore(dir)
    this.secrets = new SecretStore(join(dir, 'secrets.json'))
    setProxy(this.store.getSettings().proxy)
  }

  async initGit(): Promise<void> {
    try {
      await discoverGit(this.store.getSettings().gitPath)
      this.gitError = null
    } catch (e) {
      this.gitError = (e as Error).message
    }
  }

  openRepo(ctx: RepoCtx): void {
    registerRepo(ctx)
    if (!this.watchers.has(ctx.root)) {
      const w = new RepoWatcher(ctx, (repo, scope) =>
        this.broadcast('repo.changed', { repo, scope })
      )
      w.start()
      this.watchers.set(ctx.root, w)
    }
    this.store.touchRecent(ctx.root)
  }

  closeRepo(path: string): void {
    const ctx = requireRepo(path)
    this.watchers.get(ctx.root)?.stop()
    this.watchers.delete(ctx.root)
    unregisterRepo(ctx.root)
  }

  scheduleAutoFetch(): void {
    if (this.fetchTimer) clearInterval(this.fetchTimer)
    this.fetchTimer = null
    const s = this.store.getSettings()
    if (!s.autoFetch) return
    this.fetchTimer = setInterval(() => {
      for (const root of this.watchers.keys()) {
        const ctx = requireRepo(root)
        git(['fetch', '--all', '--quiet'], { cwd: ctx.root, log: true, timeoutMs: 120_000 })
          .then(() => this.broadcast('repo.changed', { repo: ctx.root, scope: 'refs' }))
          .catch(() => undefined)
      }
    }, s.autoFetchMinutes * 60_000)
  }

  stopAll(): void {
    for (const w of this.watchers.values()) w.stop()
    if (this.fetchTimer) clearInterval(this.fetchTimer)
  }
}

function appInfo(s: Services): AppInfo {
  return {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron ?? '',
    userData: app.getPath('userData'),
    git: getGitInfo(),
    gitError: s.gitError
  }
}

function notifyDone(call: CallContext, s: Services, title: string, body: string): void {
  if (!s.store.getSettings().notifications) return
  if (call.window?.isFocused()) return
  if (Notification.isSupported()) new Notification({ title, body }).show()
}

// Hosting helpers -----------------------------------------------------------------

interface Detected {
  ref: HostedRepoRef
  remote: string
  provider: HostingProvider
  account: HostingAccount | null
}

async function detectHosting(
  s: Services,
  ctx: RepoCtx,
  remoteName?: string
): Promise<Detected | null> {
  const remotes = await branches.listRemotes(ctx)
  const ordered = remoteName
    ? remotes.filter((r) => r.name === remoteName)
    : [...remotes.filter((r) => r.name === 'origin'), ...remotes.filter((r) => r.name !== 'origin')]
  const accounts = s.store.accounts.read()
  for (const r of ordered) {
    const url = r.fetchUrl
    if (!parseRemoteUrl(url) && !/dev\.azure\.com|visualstudio\.com/i.test(url)) continue
    for (const acc of accounts) {
      const p = PROVIDERS[acc.kind]
      const ref = p.toRef(url, acc.baseUrl)
      if (ref) return { ref, remote: r.name, provider: p, account: acc }
    }
    for (const p of Object.values(PROVIDERS)) {
      const ref = p.toRef(url, DEFAULT_BASE[p.kind])
      if (ref) return { ref, remote: r.name, provider: p, account: null }
    }
  }
  return null
}

function tokenFor(s: Services, d: Detected | null): { d: Detected; token: string } {
  if (!d)
    throw new AppError(
      'NOT_FOUND',
      'No remote of this repository points to a supported hosting service.'
    )
  if (!d.account)
    throw new AppError(
      'AUTH',
      `Connect a ${d.provider.label} account in Settings → Accounts to use pull requests.`
    )
  const token = s.secrets.get(d.account.id)
  if (!token)
    throw new AppError(
      'AUTH',
      'The stored token for this account is unavailable. Remove and reconnect the account.'
    )
  return { d, token }
}

// Handlers ------------------------------------------------------------------------

export function createHandlers(s: Services): Handlers {
  const repo = (p: string): RepoCtx => requireRepo(p)

  return {
    'app.info': () => appInfo(s),
    'app.refreshGit': async () => {
      await s.initGit()
      return appInfo(s)
    },
    'settings.get': () => s.store.getSettings(),
    'settings.set': async (patch) => {
      const prev = s.store.getSettings()
      const next = s.store.updateSettings(patch)
      if (patch.gitPath !== undefined && patch.gitPath !== prev.gitPath) await s.initGit()
      if (patch.proxy !== undefined) setProxy(next.proxy)
      if (patch.autoFetch !== undefined || patch.autoFetchMinutes !== undefined)
        s.scheduleAutoFetch()
      return next
    },
    'oplog.list': () => listOps(),
    'oplog.clear': () => clearOps(),
    'op.cancel': ({ opId }) => cancelOp(opId),
    'dialog.pickDirectory': async ({ title, defaultPath }, call) => {
      const opts = {
        title,
        defaultPath: defaultPath || s.store.getSettings().defaultCloneDir || homedir(),
        properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
      }
      const r = call.window
        ? await dialog.showOpenDialog(call.window, opts)
        : await dialog.showOpenDialog(opts)
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    'shell.openExternal': async ({ url }) => {
      if (!isSafeExternalUrl(url))
        throw new AppError(
          'VALIDATION',
          'Only http(s) links without embedded credentials can be opened.'
        )
      await shell.openExternal(url)
    },
    'shell.showInFolder': async ({ repo: r, path }) => {
      const ctx = repo(r)
      if (path) shell.showItemInFolder(changes.insideRepo(ctx, path))
      else await shell.openPath(ctx.root)
    },
    'shell.openTerminal': ({ repo: r }) =>
      openTerminal(repo(r).root, s.store.getSettings().terminalCommand),
    'shell.openEditor': async ({ repo: r, path }) => {
      const ctx = repo(r)
      await openEditor(
        path ? changes.insideRepo(ctx, path) : ctx.root,
        ctx.root,
        s.store.getSettings().editorCommand
      )
    },

    'recents.list': () => s.store.recents.read().filter((r) => existsSync(r.path) || r.favorite),
    'recents.update': ({ path, favorite, group }) =>
      s.store.updateRecent(path, { favorite, group }),
    'recents.remove': ({ path }) => s.store.removeRecent(path),
    'repo.open': async ({ path }) => {
      const ctx = await resolveRepo(path)
      s.openRepo(ctx)
      return getSummary(ctx)
    },
    'repo.trust': async ({ path }) => {
      // Explicit user action: adds this exact path to the global safe.directory list.
      const abs = resolve(path).replace(/\\/g, '/')
      await git(['config', '--global', '--add', 'safe.directory', abs], {
        cwd: homedir(),
        log: true
      })
      const ctx = await resolveRepo(path)
      s.openRepo(ctx)
      return getSummary(ctx)
    },
    'repo.close': ({ repo: r }) => s.closeRepo(r),
    'repo.init': async ({ path, initialBranch }) => {
      const abs = resolve(path)
      mkdirSync(abs, { recursive: true })
      if (existsSync(join(abs, '.git')))
        throw new AppError(
          'VALIDATION',
          'This folder already contains a Git repository. Open it instead.'
        )
      const args = ['init']
      if (initialBranch && (getGitInfo()?.minor ?? 0) >= 28)
        args.push(`--initial-branch=${initialBranch}`)
      await git(args, { cwd: abs, log: true })
      const ctx = await resolveRepo(abs)
      s.openRepo(ctx)
      return getSummary(ctx)
    },
    'repo.clone': async (a, call) => {
      const target = resolve(a.path)
      const existed = existsSync(target)
      if (existed && readdirSync(target).length > 0)
        throw new AppError('VALIDATION', 'The destination folder already exists and is not empty.')
      mkdirSync(dirname(target), { recursive: true })
      const args = ['clone', '--progress']
      if (a.depth) args.push(`--depth=${a.depth}`)
      if (a.recurseSubmodules) args.push('--recurse-submodules')
      args.push('--', a.url, target)
      try {
        await git(args, {
          cwd: dirname(target),
          opId: a.opId,
          onProgress: call.progress,
          log: true
        })
      } catch (e) {
        if (!existed && existsSync(target)) rmSync(target, { recursive: true, force: true })
        throw e
      }
      notifyDone(call, s, 'Clone finished', basename(target))
      const ctx = await resolveRepo(target)
      s.openRepo(ctx)
      return getSummary(ctx)
    },
    'repo.summary': ({ repo: r }) => getSummary(repo(r)),
    'repo.status': ({ repo: r }) => getStatus(repo(r)),
    'repo.refs': ({ repo: r }) => branches.refsSnapshot(repo(r)),

    'history.log': (a) => history.log(repo(a.repo), a),
    'history.commit': ({ repo: r, hash }) => history.commitDetails(repo(r), hash),
    'history.compareFiles': ({ repo: r, from, to }) => history.compareFiles(repo(r), from, to),
    'history.fileLog': ({ repo: r, path, limit }) => history.fileLog(repo(r), path, limit),
    'history.blame': ({ repo: r, path, rev }) => history.blame(repo(r), path, rev),
    'history.tree': ({ repo: r, rev, path }) => history.tree(repo(r), rev, path),
    'history.reflog': ({ repo: r, ref, limit }) => history.reflog(repo(r), ref, limit),
    'history.blob': ({ repo: r, rev, path }) => history.blob(repo(r), rev, path),

    'diff.get': ({ repo: r, source, options }) => changes.getDiff(repo(r), source, options),
    'index.stage': ({ repo: r, paths }) => changes.stage(repo(r), paths),
    'index.stageAll': ({ repo: r }) => changes.stageAll(repo(r)),
    'index.unstage': ({ repo: r, paths }) => changes.unstage(repo(r), paths),
    'index.unstageAll': ({ repo: r }) => changes.unstageAll(repo(r)),
    'index.discard': ({ repo: r, paths, untracked }) => changes.discard(repo(r), paths, untracked),
    'index.applyPartial': (a) => changes.applyPartial(repo(a.repo), a),
    'commit.create': (a) => changes.commit(repo(a.repo), a),
    'commit.lastMessage': ({ repo: r }) => changes.lastMessage(repo(r)),
    'commit.template': ({ repo: r }) => changes.commitTemplate(repo(r)),

    'branch.create': (a) => branches.createBranch(repo(a.repo), a),
    'branch.checkout': ({ repo: r, ref, track }) => branches.checkout(repo(r), ref, track),
    'branch.rename': ({ repo: r, from, to }) => branches.renameBranch(repo(r), from, to),
    'branch.delete': ({ repo: r, name, force }) => branches.deleteBranch(repo(r), name, force),
    'branch.deleteRemote': ({ repo: r, remote, name }) =>
      branches.deleteRemoteBranch(repo(r), remote, name),
    'branch.setUpstream': ({ repo: r, branch, upstream }) =>
      branches.setUpstream(repo(r), branch, upstream),
    'tag.create': (a) => branches.createTag(repo(a.repo), a),
    'tag.delete': ({ repo: r, name }) => branches.deleteTag(repo(r), name),
    'tag.push': (a, call) => branches.pushTag(repo(a.repo), a, call.progress),

    'remote.add': ({ repo: r, name, url }) => branches.addRemote(repo(r), name, url),
    'remote.remove': ({ repo: r, name }) => branches.removeRemote(repo(r), name),
    'remote.rename': ({ repo: r, from, to }) => branches.renameRemote(repo(r), from, to),
    'remote.setUrl': ({ repo: r, name, url, push }) =>
      branches.setRemoteUrl(repo(r), name, url, push),
    'remote.fetch': async (a, call) => {
      const res = await branches.fetch(repo(a.repo), a, call.progress)
      notifyDone(call, s, 'Fetch finished', basename(a.repo))
      return res
    },
    'remote.pull': async (a, call) => {
      const res = await branches.pull(repo(a.repo), a, call.progress)
      notifyDone(call, s, 'Pull finished', basename(a.repo))
      return res
    },
    'remote.push': async (a, call) => {
      const res = await branches.push(repo(a.repo), a, call.progress)
      notifyDone(call, s, 'Push finished', basename(a.repo))
      return res
    },

    'op.merge': (a) => ops.merge(repo(a.repo), a),
    'op.rebase': ({ repo: r, onto }) => ops.rebase(repo(r), onto),
    'op.cherryPick': ({ repo: r, hashes, noCommit }) => ops.cherryPick(repo(r), hashes, noCommit),
    'op.revert': ({ repo: r, hash, noCommit }) => ops.revert(repo(r), hash, noCommit),
    'op.reset': ({ repo: r, target, mode }) => ops.reset(repo(r), target, mode),
    'op.control': ({ repo: r, action }) => ops.control(repo(r), action),
    'op.previewCommits': ({ repo: r, from, to, limit }) =>
      ops.previewCommits(repo(r), from, to, limit),
    'rebase.interactive': (a) => ops.interactiveRebase(repo(a.repo), a),
    'stash.push': (a) => ops.stashPush(repo(a.repo), a),
    'stash.apply': ({ repo: r, index, pop, restoreIndex }) =>
      ops.stashApply(repo(r), index, pop, restoreIndex),
    'stash.drop': ({ repo: r, index }) => ops.stashDrop(repo(r), index),
    'stash.files': ({ repo: r, index }) => ops.stashFiles(repo(r), index),
    'reflog.createBranch': ({ repo: r, name, hash }) => ops.branchFromReflog(repo(r), name, hash),

    'conflict.get': ({ repo: r, path }) => conflicts.getConflict(repo(r), path),
    'conflict.save': ({ repo: r, path, content, stage }) =>
      conflicts.saveResolution(repo(r), path, content, stage),
    'conflict.take': ({ repo: r, path, side }) => conflicts.takeSide(repo(r), path, side),
    'conflict.markResolved': ({ repo: r, path }) => conflicts.markResolved(repo(r), path),
    'conflict.externalTool': ({ repo: r, path, opId }) =>
      conflicts.externalMergeTool(repo(r), path, s.store.getSettings().mergeTool, opId),
    'diff.externalTool': ({ repo: r, path, staged }) =>
      conflicts.externalDiffTool(repo(r), path, s.store.getSettings().diffTool, staged),

    'worktree.add': async (a) => {
      await extras.addWorktree(repo(a.repo), a)
    },
    'worktree.remove': ({ repo: r, path, force }) => extras.removeWorktree(repo(r), path, force),
    'worktree.prune': ({ repo: r }) => extras.pruneWorktrees(repo(r)),
    'submodule.update': (a, call) => extras.submoduleUpdate(repo(a.repo), a, call.progress),
    'submodule.sync': ({ repo: r }) => extras.submoduleSync(repo(r)),
    'submodule.add': (a, call) => extras.submoduleAdd(repo(a.repo), a, call.progress),
    'lfs.status': ({ repo: r }) => extras.lfsStatus(repo(r)),
    'lfs.run': (a, call) => extras.lfsRun(repo(a.repo), a, call.progress),
    'lfs.track': ({ repo: r, pattern, untrack }) => extras.lfsTrack(repo(r), pattern, untrack),
    'gitignore.read': ({ repo: r }) => extras.readGitignore(repo(r)),
    'gitignore.write': ({ repo: r, content }) => extras.writeGitignore(repo(r), content),
    'gitignore.append': ({ repo: r, pattern }) => extras.appendGitignore(repo(r), pattern),
    'config.identity': ({ repo: r }) => extras.getIdentity(r ? repo(r) : null, homedir()),
    'config.setIdentity': (a) => extras.setIdentity(a.repo ? repo(a.repo) : null, homedir(), a),

    'bisect.start': ({ repo: r, bad, good }) => ops.bisectStart(repo(r), bad, good),
    'bisect.mark': ({ repo: r, verdict }) => ops.bisectMark(repo(r), verdict),
    'bisect.reset': ({ repo: r }) => ops.bisectReset(repo(r)),
    'bisect.log': ({ repo: r }) => ops.bisectLog(repo(r)),
    'flow.start': (a) => ops.flowStart(repo(a.repo), a),
    'flow.finish': (a) => ops.flowFinish(repo(a.repo), a),

    'hosting.accounts': () =>
      s.store.accounts.read().map((a) => ({ ...a, hasToken: s.secrets.has(a.id) })),
    'hosting.addAccount': async ({ kind, baseUrl, token }) => {
      const provider = PROVIDERS[kind]
      const url = new URL(baseUrl)
      if (url.protocol !== 'https:')
        throw new AppError('VALIDATION', 'Hosting URLs must use https.')
      const clean = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
      const username = await provider.whoami(clean, token)
      const account: HostingAccount = {
        id: randomUUID(),
        kind,
        baseUrl: clean,
        username,
        hasToken: true
      }
      s.secrets.set(account.id, token)
      s.store.accounts.write([...s.store.accounts.read(), { ...account, hasToken: false }])
      return account
    },
    'hosting.removeAccount': ({ id }) => {
      s.secrets.delete(id)
      const list = s.store.accounts.read().filter((a) => a.id !== id)
      s.store.accounts.write(list)
      return list.map((a) => ({ ...a, hasToken: s.secrets.has(a.id) }))
    },
    'hosting.detect': async ({ repo: r, remote }) =>
      (await detectHosting(s, repo(r), remote))?.ref ?? null,
    'hosting.webUrl': async ({ repo: r, target }) => {
      const d = await detectHosting(s, repo(r))
      return d ? d.provider.webUrl(d.ref, target) : null
    },
    'hosting.pullRequests': async ({ repo: r, state }) => {
      const { d, token } = tokenFor(s, await detectHosting(s, repo(r)))
      return d.provider.pullRequests(d.ref, d.account!.baseUrl, token, state)
    },
    'hosting.pullRequest': async ({ repo: r, number }) => {
      const { d, token } = tokenFor(s, await detectHosting(s, repo(r)))
      return d.provider.pullRequest(d.ref, d.account!.baseUrl, token, number)
    },
    'hosting.checkoutPullRequest': async ({ repo: r, number, opId }, call) => {
      const ctx = repo(r)
      const { d, token } = tokenFor(s, await detectHosting(s, ctx))
      const pr = await d.provider.pullRequest(d.ref, d.account!.baseUrl, token, number)
      const refspec = d.provider.pullRefspec(number)
      const branchExists = async (b: string): Promise<boolean> =>
        (
          await git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], {
            cwd: ctx.root,
            readOnly: true,
            okCodes: [0, 1, 128]
          })
        ).exitCode === 0
      if (refspec) {
        const local = `pr/${number}`
        const tracking = `refs/remotes/${d.remote}/pr/${number}`
        await git(['fetch', '--progress', d.remote, `+${refspec}:${tracking}`], {
          cwd: ctx.root,
          opId,
          onProgress: call.progress,
          log: true
        })
        if (await branchExists(local)) await branches.checkout(ctx, local)
        else await git(['checkout', '-b', local, tracking, '--'], { cwd: ctx.root, log: true })
      } else {
        await git(['fetch', '--progress', d.remote, pr.sourceBranch], {
          cwd: ctx.root,
          opId,
          onProgress: call.progress,
          log: true
        })
        if (await branchExists(pr.sourceBranch)) await branches.checkout(ctx, pr.sourceBranch)
        else await branches.checkout(ctx, `${d.remote}/${pr.sourceBranch}`, true)
      }
    },
    'hosting.repos': async ({ accountId }) => {
      const acc = s.store.accounts.read().find((a) => a.id === accountId)
      const token = acc && s.secrets.get(acc.id)
      if (!acc || !token) throw new AppError('AUTH', 'Account not found or token unavailable.')
      return PROVIDERS[acc.kind].repos(acc.baseUrl, token)
    },
    'hosting.notifications': async ({ accountId }) => {
      const acc = s.store.accounts.read().find((a) => a.id === accountId)
      const token = acc && s.secrets.get(acc.id)
      if (!acc || !token) throw new AppError('AUTH', 'Account not found or token unavailable.')
      return PROVIDERS[acc.kind].notifications(acc.baseUrl, token)
    }
  }
}
