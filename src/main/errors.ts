import type { ApiErrorPayload, ErrorCode } from '@shared/api'

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public detail?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/** Translate Git stderr into an actionable error. */
export function classifyGitError(stderr: string, exitCode: number, command: string): AppError {
  const s = stderr.trim()
  const detail = s || `git exited with code ${exitCode}`
  if (/detected dubious ownership|unsafe repository/i.test(s)) {
    return new AppError(
      'UNSAFE_REPOSITORY',
      'Git refuses to use this repository because it is owned by another user. You can mark it as safe explicitly; this adds a safe.directory entry to your global Git configuration.',
      detail
    )
  }
  if (/not a git repository/i.test(s)) {
    return new AppError('NOT_A_REPOSITORY', 'This folder is not a Git repository.', detail)
  }
  if (
    /Authentication failed|could not read Username|could not read Password|Permission denied \(publickey|terminal prompts disabled|HTTP Basic: Access denied|returned error: 40[13]\b|403 Forbidden/i.test(
      s
    )
  ) {
    return new AppError(
      'AUTH',
      'Authentication failed. Spoon uses your Git credential helper and SSH agent; check that they are configured for this remote.',
      detail
    )
  }
  if (
    /Could not resolve host|unable to access|Connection timed out|Connection refused|Network is unreachable|Could not read from remote repository/i.test(
      s
    )
  ) {
    return new AppError(
      'NETWORK',
      'Could not reach the remote. Check the URL and your network connection.',
      detail
    )
  }
  if (
    /^CONFLICT|Merge conflict|could not apply|after resolving the conflicts|fix conflicts/im.test(s)
  ) {
    return new AppError(
      'CONFLICT',
      'The operation stopped because of conflicts. Resolve them, then continue or abort.',
      detail
    )
  }
  if (
    /Your local changes to the following files would be overwritten|Please commit your changes or stash them|cannot .* You have unstaged changes|contains uncommitted changes/i.test(
      s
    )
  ) {
    return new AppError(
      'GIT_FAILED',
      'You have uncommitted changes that would be affected. Commit, stash, or discard them first.',
      detail
    )
  }
  if (
    /\[rejected\].*\(fetch first\)|\[rejected\].*\(non-fast-forward\)|Updates were rejected/i.test(
      s
    )
  ) {
    return new AppError(
      'GIT_FAILED',
      'The remote has commits you do not have. Pull (or fetch and integrate) before pushing.',
      detail
    )
  }
  if (/stale info|\(stale info\)/i.test(s)) {
    return new AppError(
      'GIT_FAILED',
      'Force push was refused because the remote branch changed since your last fetch (force-with-lease protection).',
      detail
    )
  }
  const first = s.split('\n').find((l) => /^(fatal|error):/.test(l)) ?? s.split('\n')[0] ?? ''
  return new AppError(
    'GIT_FAILED',
    first.replace(/^(fatal|error):\s*/, '') || `Command failed: ${command}`,
    detail
  )
}

export function toErrorPayload(err: unknown): ApiErrorPayload {
  if (err instanceof AppError) return { code: err.code, message: err.message, detail: err.detail }
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      code: 'VALIDATION',
      message: 'Invalid request',
      detail: String((err as unknown as Error).message)
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { code: 'INTERNAL', message }
}
