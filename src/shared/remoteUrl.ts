export interface ParsedRemote {
  host: string
  /** Path without leading slash and without .git, e.g. "owner/repo" or "group/sub/repo" */
  path: string
}

/** Parse https://, ssh://, git:// and scp-like (git@host:owner/repo.git) remote URLs. */
export function parseRemoteUrl(url: string): ParsedRemote | null {
  const trimmed = url.trim()
  let host: string
  let path: string
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(trimmed)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed)
      if (u.protocol === 'file:') return null
      host = u.hostname.toLowerCase()
      path = decodeURIComponent(u.pathname)
    } catch {
      return null
    }
  } else if (scp && !/^[a-zA-Z]$/.test(scp[1]!)) {
    host = scp[1]!.toLowerCase()
    path = scp[2]!
  } else {
    return null
  }
  path = path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
  if (!path.includes('/')) return null
  return { host, path }
}

export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}
