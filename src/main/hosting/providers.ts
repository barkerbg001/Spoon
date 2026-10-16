import type { CheckRun, HostedRepo, HostedRepoRef, HostingKind, PullRequest } from '@shared/types'
import { hostOf, parseRemoteUrl } from '@shared/remoteUrl'
import { AppError } from '../errors'

export type Fetcher = typeof fetch

export interface WebTarget {
  kind: 'repo' | 'commit' | 'branch' | 'compare'
  hash?: string
  name?: string
}

/** Common interface for hosting services. Network calls go to official REST APIs only. */
export interface HostingProvider {
  kind: HostingKind
  label: string
  /** Implementation maturity shown in the UI. */
  maturity: 'supported' | 'experimental'
  matches(remoteHost: string, baseUrl: string): boolean
  toRef(remoteUrl: string, baseUrl: string): HostedRepoRef | null
  whoami(baseUrl: string, token: string): Promise<string>
  pullRequests(
    ref: HostedRepoRef,
    baseUrl: string,
    token: string,
    state: 'open' | 'closed' | 'all'
  ): Promise<PullRequest[]>
  pullRequest(ref: HostedRepoRef, baseUrl: string, token: string, n: number): Promise<PullRequest>
  repos(baseUrl: string, token: string): Promise<HostedRepo[]>
  notifications(
    baseUrl: string,
    token: string
  ): Promise<{ title: string; repo: string; url: string | null; reason: string }[]>
  /** Refspec source for fetching a pull request head, or null if the service has none. */
  pullRefspec(n: number): string | null
  webUrl(ref: HostedRepoRef, target: WebTarget): string
}

let fetcher: Fetcher = (...a) => fetch(...a)
export function setFetcher(f: Fetcher): void {
  fetcher = f
}

async function request<T>(url: string, headers: Record<string, string>): Promise<T> {
  let res: Response
  try {
    res = await fetcher(url, {
      headers: { 'User-Agent': 'Spoon', Accept: 'application/json', ...headers }
    })
  } catch (e) {
    throw new AppError('NETWORK', 'Could not reach the hosting service.', String(e))
  }
  if (res.status === 401)
    throw new AppError(
      'AUTH',
      'The hosting service rejected the token (401). Reconnect the account with a valid token.'
    )
  if (res.status === 403 || res.status === 429) {
    const remaining =
      res.headers.get('x-ratelimit-remaining') ?? res.headers.get('ratelimit-remaining')
    const reset =
      res.headers.get('x-ratelimit-reset') ??
      res.headers.get('ratelimit-reset') ??
      res.headers.get('retry-after')
    if (remaining === '0' || res.status === 429) {
      const when =
        reset && /^\d+$/.test(reset)
          ? Number(reset) > 1e9
            ? new Date(Number(reset) * 1000).toLocaleTimeString()
            : `${reset}s`
          : 'later'
      throw new AppError(
        'NETWORK',
        `API rate limit reached. Try again ${when === 'later' ? 'later' : `after ${when}`}.`
      )
    }
    throw new AppError(
      'AUTH',
      'The token does not have permission for this request (403). Check its scopes.'
    )
  }
  if (res.status === 404)
    throw new AppError(
      'NOT_FOUND',
      'Not found on the hosting service (or the token cannot see it).'
    )
  if (!res.ok) throw new AppError('NETWORK', `Hosting service returned HTTP ${res.status}.`)
  return (await res.json()) as T
}

const trimSlash = (s: string): string => s.replace(/\/+$/, '')

// GitHub ----------------------------------------------------------------------

type GhPull = {
  number: number
  title: string
  user: { login: string } | null
  state: string
  draft?: boolean
  merged_at?: string | null
  head: { ref: string; sha: string }
  base: { ref: string }
  html_url: string
  updated_at: string
  body?: string | null
}

const ghApi = (baseUrl: string): string =>
  hostOf(baseUrl) === 'github.com' ? 'https://api.github.com' : `${trimSlash(baseUrl)}/api/v3`
const ghHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
})
const ghPr = (p: GhPull): PullRequest => ({
  number: p.number,
  title: p.title,
  author: p.user?.login ?? 'unknown',
  state: p.merged_at ? 'merged' : p.state,
  draft: !!p.draft,
  sourceBranch: p.head.ref,
  targetBranch: p.base.ref,
  url: p.html_url,
  updatedAt: p.updated_at,
  body: p.body ?? undefined
})

export const github: HostingProvider = {
  kind: 'github',
  label: 'GitHub',
  maturity: 'supported',
  matches: (remoteHost, baseUrl) =>
    remoteHost === hostOf(baseUrl) ||
    (hostOf(baseUrl) === 'github.com' && remoteHost === 'ssh.github.com'),
  toRef(remoteUrl, baseUrl) {
    const p = parseRemoteUrl(remoteUrl)
    if (!p || !this.matches(p.host, baseUrl)) return null
    const [owner, name] = p.path.split('/')
    if (!owner || !name) return null
    return {
      kind: 'github',
      host: hostOf(baseUrl),
      owner,
      name,
      webUrl: `${trimSlash(baseUrl)}/${owner}/${name}`
    }
  },
  async whoami(baseUrl, token) {
    return (await request<{ login: string }>(`${ghApi(baseUrl)}/user`, ghHeaders(token))).login
  },
  async pullRequests(ref, baseUrl, token, state) {
    const list = await request<GhPull[]>(
      `${ghApi(baseUrl)}/repos/${ref.owner}/${ref.name}/pulls?state=${state}&per_page=50&sort=updated&direction=desc`,
      ghHeaders(token)
    )
    return list.map(ghPr)
  },
  async pullRequest(ref, baseUrl, token, n) {
    const p = await request<GhPull>(
      `${ghApi(baseUrl)}/repos/${ref.owner}/${ref.name}/pulls/${n}`,
      ghHeaders(token)
    )
    const pr = ghPr(p)
    const checks: CheckRun[] = []
    try {
      const runs = await request<{
        check_runs: {
          name: string
          status: string
          conclusion: string | null
          html_url: string | null
        }[]
      }>(
        `${ghApi(baseUrl)}/repos/${ref.owner}/${ref.name}/commits/${p.head.sha}/check-runs?per_page=100`,
        ghHeaders(token)
      )
      for (const r of runs.check_runs)
        checks.push({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url })
      const statuses = await request<{
        statuses: { context: string; state: string; target_url: string | null }[]
      }>(
        `${ghApi(baseUrl)}/repos/${ref.owner}/${ref.name}/commits/${p.head.sha}/status`,
        ghHeaders(token)
      )
      for (const s of statuses.statuses)
        checks.push({
          name: s.context,
          status: s.state === 'pending' ? 'in_progress' : 'completed',
          conclusion: s.state === 'pending' ? null : s.state,
          url: s.target_url
        })
    } catch {
      /* checks are optional (token may lack scope) */
    }
    return { ...pr, checks }
  },
  async repos(baseUrl, token) {
    const list = await request<
      {
        full_name: string
        clone_url: string
        ssh_url: string
        html_url: string
        private: boolean
        description: string | null
      }[]
    >(`${ghApi(baseUrl)}/user/repos?per_page=100&sort=updated`, ghHeaders(token))
    return list.map((r) => ({
      fullName: r.full_name,
      cloneUrl: r.clone_url,
      sshUrl: r.ssh_url,
      webUrl: r.html_url,
      private: r.private,
      description: r.description
    }))
  },
  async notifications(baseUrl, token) {
    const list = await request<
      {
        reason: string
        subject: { title: string; url: string | null; type: string }
        repository: { full_name: string; html_url: string }
      }[]
    >(`${ghApi(baseUrl)}/notifications?per_page=50`, ghHeaders(token))
    return list.map((n) => {
      const num = n.subject.url ? /\/(pulls|issues)\/(\d+)$/.exec(n.subject.url) : null
      const url = num
        ? `${n.repository.html_url}/${num[1] === 'pulls' ? 'pull' : 'issues'}/${num[2]}`
        : n.repository.html_url
      return { title: n.subject.title, repo: n.repository.full_name, url, reason: n.reason }
    })
  },
  pullRefspec: (n) => `refs/pull/${n}/head`,
  webUrl(ref, t) {
    if (t.kind === 'commit') return `${ref.webUrl}/commit/${t.hash}`
    if (t.kind === 'branch') return `${ref.webUrl}/tree/${encodeURIComponent(t.name ?? '')}`
    if (t.kind === 'compare')
      return `${ref.webUrl}/compare/${encodeURIComponent(t.name ?? '')}?expand=1`
    return ref.webUrl
  }
}

// GitLab ----------------------------------------------------------------------

type GlMr = {
  iid: number
  title: string
  author: { username: string } | null
  state: string
  draft?: boolean
  work_in_progress?: boolean
  source_branch: string
  target_branch: string
  web_url: string
  updated_at: string
  description?: string | null
}
const glApi = (baseUrl: string): string => `${trimSlash(baseUrl)}/api/v4`
const glHeaders = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` })
const glProject = (ref: HostedRepoRef): string => encodeURIComponent(`${ref.owner}/${ref.name}`)
const glMr = (m: GlMr): PullRequest => ({
  number: m.iid,
  title: m.title,
  author: m.author?.username ?? 'unknown',
  state: m.state,
  draft: !!(m.draft ?? m.work_in_progress),
  sourceBranch: m.source_branch,
  targetBranch: m.target_branch,
  url: m.web_url,
  updatedAt: m.updated_at,
  body: m.description ?? undefined
})

export const gitlab: HostingProvider = {
  kind: 'gitlab',
  label: 'GitLab',
  maturity: 'supported',
  matches: (remoteHost, baseUrl) => remoteHost === hostOf(baseUrl),
  toRef(remoteUrl, baseUrl) {
    const p = parseRemoteUrl(remoteUrl)
    if (!p || !this.matches(p.host, baseUrl)) return null
    const parts = p.path.split('/')
    const name = parts.pop()!
    // GitLab supports nested groups: owner is the full namespace path.
    return {
      kind: 'gitlab',
      host: hostOf(baseUrl),
      owner: parts.join('/'),
      name,
      webUrl: `${trimSlash(baseUrl)}/${p.path}`
    }
  },
  async whoami(baseUrl, token) {
    return (await request<{ username: string }>(`${glApi(baseUrl)}/user`, glHeaders(token)))
      .username
  },
  async pullRequests(ref, baseUrl, token, state) {
    const s = state === 'open' ? 'opened' : state === 'closed' ? 'closed' : 'all'
    const list = await request<GlMr[]>(
      `${glApi(baseUrl)}/projects/${glProject(ref)}/merge_requests?state=${s}&per_page=50&order_by=updated_at`,
      glHeaders(token)
    )
    return list.map(glMr)
  },
  async pullRequest(ref, baseUrl, token, n) {
    const m = await request<GlMr>(
      `${glApi(baseUrl)}/projects/${glProject(ref)}/merge_requests/${n}`,
      glHeaders(token)
    )
    const checks: CheckRun[] = []
    try {
      const pipes = await request<{ id: number; status: string; web_url: string; ref: string }[]>(
        `${glApi(baseUrl)}/projects/${glProject(ref)}/merge_requests/${n}/pipelines`,
        glHeaders(token)
      )
      const latest = pipes[0]
      if (latest) {
        const done = ['success', 'failed', 'canceled', 'skipped'].includes(latest.status)
        checks.push({
          name: `Pipeline #${latest.id}`,
          status: done ? 'completed' : 'in_progress',
          conclusion: done ? latest.status : null,
          url: latest.web_url
        })
      }
    } catch {
      /* optional */
    }
    return { ...glMr(m), checks }
  },
  async repos(baseUrl, token) {
    const list = await request<
      {
        path_with_namespace: string
        http_url_to_repo: string
        ssh_url_to_repo: string
        web_url: string
        visibility: string
        description: string | null
      }[]
    >(
      `${glApi(baseUrl)}/projects?membership=true&order_by=last_activity_at&per_page=100`,
      glHeaders(token)
    )
    return list.map((r) => ({
      fullName: r.path_with_namespace,
      cloneUrl: r.http_url_to_repo,
      sshUrl: r.ssh_url_to_repo,
      webUrl: r.web_url,
      private: r.visibility !== 'public',
      description: r.description
    }))
  },
  async notifications(baseUrl, token) {
    const list = await request<
      {
        action_name: string
        target_title?: string
        body?: string
        target_url: string | null
        project?: { path_with_namespace: string }
      }[]
    >(`${glApi(baseUrl)}/todos?state=pending&per_page=50`, glHeaders(token))
    return list.map((t) => ({
      title: t.target_title ?? t.body ?? 'To-do',
      repo: t.project?.path_with_namespace ?? '',
      url: t.target_url,
      reason: t.action_name
    }))
  },
  pullRefspec: (n) => `refs/merge-requests/${n}/head`,
  webUrl(ref, t) {
    if (t.kind === 'commit') return `${ref.webUrl}/-/commit/${t.hash}`
    if (t.kind === 'branch') return `${ref.webUrl}/-/tree/${encodeURIComponent(t.name ?? '')}`
    if (t.kind === 'compare')
      return `${ref.webUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(t.name ?? '')}`
    return ref.webUrl
  }
}

// Bitbucket Cloud (experimental) ---------------------------------------------------

type BbPr = {
  id: number
  title: string
  author?: { display_name?: string; nickname?: string }
  state: string
  source: { branch: { name: string } }
  destination: { branch: { name: string } }
  links: { html: { href: string } }
  updated_on: string
  description?: string
}
const bbHeaders = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` })
const bbPr = (p: BbPr): PullRequest => ({
  number: p.id,
  title: p.title,
  author: p.author?.nickname ?? p.author?.display_name ?? 'unknown',
  state: p.state.toLowerCase(),
  draft: false,
  sourceBranch: p.source.branch.name,
  targetBranch: p.destination.branch.name,
  url: p.links.html.href,
  updatedAt: p.updated_on,
  body: p.description
})

export const bitbucket: HostingProvider = {
  kind: 'bitbucket',
  label: 'Bitbucket Cloud',
  maturity: 'experimental',
  matches: (remoteHost) => remoteHost === 'bitbucket.org',
  toRef(remoteUrl) {
    const p = parseRemoteUrl(remoteUrl)
    if (!p || p.host !== 'bitbucket.org') return null
    const [owner, name] = p.path.split('/')
    if (!owner || !name) return null
    return {
      kind: 'bitbucket',
      host: 'bitbucket.org',
      owner,
      name,
      webUrl: `https://bitbucket.org/${owner}/${name}`
    }
  },
  async whoami(_baseUrl, token) {
    return (
      (
        await request<{ username?: string; display_name?: string }>(
          'https://api.bitbucket.org/2.0/user',
          bbHeaders(token)
        )
      ).username ?? 'bitbucket'
    )
  },
  async pullRequests(ref, _b, token, state) {
    const s =
      state === 'open' ? '?state=OPEN' : state === 'closed' ? '?state=MERGED&state=DECLINED' : ''
    const r = await request<{ values: BbPr[] }>(
      `https://api.bitbucket.org/2.0/repositories/${ref.owner}/${ref.name}/pullrequests${s}`,
      bbHeaders(token)
    )
    return r.values.map(bbPr)
  },
  async pullRequest(ref, _b, token, n) {
    return bbPr(
      await request<BbPr>(
        `https://api.bitbucket.org/2.0/repositories/${ref.owner}/${ref.name}/pullrequests/${n}`,
        bbHeaders(token)
      )
    )
  },
  async repos() {
    throw new AppError('UNSUPPORTED', 'Repository browsing is not implemented for Bitbucket yet.')
  },
  async notifications() {
    return []
  },
  pullRefspec: () => null,
  webUrl(ref, t) {
    if (t.kind === 'commit') return `${ref.webUrl}/commits/${t.hash}`
    if (t.kind === 'branch') return `${ref.webUrl}/src/${encodeURIComponent(t.name ?? '')}`
    if (t.kind === 'compare')
      return `${ref.webUrl}/pull-requests/new?source=${encodeURIComponent(t.name ?? '')}`
    return ref.webUrl
  }
}

// Azure DevOps (experimental) ------------------------------------------------------

function azureParse(remoteUrl: string): { org: string; project: string; repo: string } | null {
  const https = /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)/i.exec(
    remoteUrl
  )
  if (https)
    return {
      org: decodeURIComponent(https[1]!),
      project: decodeURIComponent(https[2]!),
      repo: decodeURIComponent(https[3]!)
    }
  const legacy =
    /^https:\/\/(?:[^@/]+@)?([^.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/?#]+)/i.exec(
      remoteUrl
    )
  if (legacy)
    return {
      org: legacy[1]!,
      project: decodeURIComponent(legacy[2]!),
      repo: decodeURIComponent(legacy[3]!)
    }
  const ssh = /^(?:ssh:\/\/)?git@ssh\.dev\.azure\.com[:/]v3\/([^/]+)\/([^/]+)\/([^/]+)$/i.exec(
    remoteUrl
  )
  if (ssh)
    return { org: ssh[1]!, project: decodeURIComponent(ssh[2]!), repo: decodeURIComponent(ssh[3]!) }
  return null
}

type AzPr = {
  pullRequestId: number
  title: string
  createdBy?: { uniqueName?: string; displayName?: string }
  status: string
  isDraft?: boolean
  sourceRefName: string
  targetRefName: string
  creationDate: string
  description?: string
}
const azHeaders = (token: string): Record<string, string> => ({
  Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`
})

export const azure: HostingProvider = {
  kind: 'azure',
  label: 'Azure DevOps',
  maturity: 'experimental',
  matches: (remoteHost) =>
    remoteHost === 'dev.azure.com' ||
    remoteHost === 'ssh.dev.azure.com' ||
    remoteHost.endsWith('.visualstudio.com'),
  toRef(remoteUrl) {
    const a = azureParse(remoteUrl)
    if (!a) return null
    return {
      kind: 'azure',
      host: 'dev.azure.com',
      owner: `${a.org}/${a.project}`,
      name: a.repo,
      webUrl: `https://dev.azure.com/${encodeURIComponent(a.org)}/${encodeURIComponent(a.project)}/_git/${encodeURIComponent(a.repo)}`
    }
  },
  async whoami() {
    return 'Azure DevOps PAT'
  },
  async pullRequests(ref, _b, token, state) {
    const [org, project] = ref.owner.split('/')
    const s = state === 'open' ? 'active' : state === 'closed' ? 'completed' : 'all'
    const r = await request<{ value: AzPr[] }>(
      `https://dev.azure.com/${encodeURIComponent(org!)}/${encodeURIComponent(project!)}/_apis/git/repositories/${encodeURIComponent(ref.name)}/pullrequests?searchCriteria.status=${s}&api-version=7.1`,
      azHeaders(token)
    )
    return r.value.map((p) => ({
      number: p.pullRequestId,
      title: p.title,
      author: p.createdBy?.uniqueName ?? p.createdBy?.displayName ?? 'unknown',
      state: p.status,
      draft: !!p.isDraft,
      sourceBranch: p.sourceRefName.replace(/^refs\/heads\//, ''),
      targetBranch: p.targetRefName.replace(/^refs\/heads\//, ''),
      url: `${ref.webUrl}/pullrequest/${p.pullRequestId}`,
      updatedAt: p.creationDate,
      body: p.description
    }))
  },
  async pullRequest(ref, b, token, n) {
    const list = await this.pullRequests(ref, b, token, 'all')
    const pr = list.find((p) => p.number === n)
    if (!pr) throw new AppError('NOT_FOUND', `Pull request ${n} not found.`)
    return pr
  },
  async repos() {
    throw new AppError(
      'UNSUPPORTED',
      'Repository browsing is not implemented for Azure DevOps yet.'
    )
  },
  async notifications() {
    return []
  },
  // Azure Repos only exposes the synthetic merge ref; checkout uses the source branch instead.
  pullRefspec: () => null,
  webUrl(ref, t) {
    if (t.kind === 'commit') return `${ref.webUrl}/commit/${t.hash}`
    if (t.kind === 'branch' || t.kind === 'compare')
      return `${ref.webUrl}?version=GB${encodeURIComponent(t.name ?? '')}`
    return ref.webUrl
  }
}

export const PROVIDERS: Record<HostingKind, HostingProvider> = { github, gitlab, bitbucket, azure }

/** Default web base URL per service (used when no account is configured). */
export const DEFAULT_BASE: Record<HostingKind, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://bitbucket.org',
  azure: 'https://dev.azure.com'
}
