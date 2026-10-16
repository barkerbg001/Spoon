// Remove credentials and tokens from text before it is logged or shown.

const PATTERNS: [RegExp, string][] = [
  // user:password@ or token@ in URLs
  [/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1***@'],
  // GitHub tokens
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '***'],
  // GitLab tokens
  [/\bglpat-[A-Za-z0-9_-]{16,}\b/g, '***'],
  // Authorization headers
  [/(authorization:\s*(?:basic|bearer|token)\s+)\S+/gi, '$1***'],
  [/(extraheader\s*=?\s*authorization:)[^\n]*/gi, '$1 ***'],
  // password=... in credential protocol output
  [/(password=)[^\n]*/gi, '$1***']
]

export function redact(text: string): string {
  let out = text
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl)
  return out
}
