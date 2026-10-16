// Domain models shared by the main process and the renderer.

export interface GitInfo {
  path: string
  version: string
  major: number
  minor: number
  lfsVersion: string | null
  capabilities: {
    /** `git switch` / `git restore` (2.23+) */
    switchRestore: boolean
    /** `fixup -C` in rebase todo lists (2.32+) */
    fixupAmend: boolean
    /** `git rebase --update-refs` (2.38+) */
    updateRefs: boolean
    /** `git merge-tree --write-tree` (2.38+) */
    mergeTreeWriteTree: boolean
  }
}

export type RepoOperation =
  'none' | 'merge' | 'rebase' | 'rebase-interactive' | 'cherry-pick' | 'revert' | 'am' | 'bisect'

export interface RepoHead {
  branch: string | null
  detached: boolean
  oid: string | null
  upstream: string | null
  ahead: number
  behind: number
  unborn: boolean
}

export type ChangeKind = 'staged' | 'unstaged' | 'untracked' | 'conflicted'

export interface FileChange {
  path: string
  origPath?: string
  /** Porcelain v2 XY codes, e.g. 'M', 'A', 'D', 'R', '.' */
  index: string
  worktree: string
  kind: ChangeKind
  /** For conflicts: e.g. 'both modified', 'deleted by them' */
  conflict?: string
  submodule?: boolean
}

export interface RepoStatus {
  repo: string
  head: RepoHead
  operation: RepoOperation
  /** Commit being applied when an operation is paused (rebase/cherry-pick/revert). */
  operationTarget?: string
  bisecting: boolean
  staged: FileChange[]
  unstaged: FileChange[]
  untracked: FileChange[]
  conflicted: FileChange[]
  stashCount: number
  isShallow: boolean
  isLinkedWorktree: boolean
}

export interface RepoSummary {
  path: string
  name: string
  gitDir: string
  commonDir: string
  bare: boolean
  isLinkedWorktree: boolean
  head: RepoHead
  operation: RepoOperation
  changeCount: number
}

export type RefType = 'head' | 'local' | 'remote' | 'tag' | 'stash' | 'other'

export interface RefLabel {
  name: string
  type: RefType
}

export interface Commit {
  hash: string
  parents: string[]
  authorName: string
  authorEmail: string
  authorTime: number
  committerName: string
  committerTime: number
  refs: RefLabel[]
  subject: string
}

/** A commit in a file's history, with the file's path in that commit (follows renames). */
export interface FileLogEntry extends Commit {
  path: string
  origPath?: string
}

export interface Branch {
  name: string
  fullName: string
  hash: string
  current: boolean
  upstream: string | null
  upstreamGone: boolean
  ahead: number
  behind: number
  subject: string
  date: number
}

export interface Tag {
  name: string
  hash: string
  /** Peeled commit for annotated tags */
  target: string
  annotated: boolean
  subject: string
  date: number
}

export interface Remote {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface Stash {
  index: number
  ref: string
  hash: string
  message: string
  date: number
}

export interface Worktree {
  path: string
  head: string | null
  branch: string | null
  bare: boolean
  detached: boolean
  locked: boolean
  prunable: boolean
  main: boolean
}

export interface Submodule {
  path: string
  hash: string
  /** ' ' up to date, '-' not initialised, '+' different commit checked out, 'U' conflicts */
  state: ' ' | '-' | '+' | 'U'
  describe: string
}

export interface RefsSnapshot {
  branches: Branch[]
  remoteBranches: Branch[]
  tags: Tag[]
  remotes: Remote[]
  stashes: Stash[]
  worktrees: Worktree[]
  submodules: Submodule[]
  head: RepoHead
}

export interface CommitFile {
  path: string
  origPath?: string
  status: string
  additions: number | null
  deletions: number | null
  binary: boolean
}

export interface CommitDetails {
  hash: string
  parents: string[]
  authorName: string
  authorEmail: string
  authorTime: number
  committerName: string
  committerEmail: string
  committerTime: number
  message: string
  refs: RefLabel[]
  files: CommitFile[]
  signature: string | null
}

export type DiffLineType = 'context' | 'add' | 'del' | 'meta'

export interface DiffLine {
  type: DiffLineType
  content: string
  oldNo: number | null
  newNo: number | null
  /** true when the line ends without newline ("\ No newline at end of file" follows) */
  noNewline?: boolean
}

export interface DiffHunk {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface DiffFile {
  oldPath: string
  newPath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'typechange'
  similarity?: number
  binary: boolean
  oldMode?: string
  newMode?: string
  hunks: DiffHunk[]
  /** Raw header lines (diff --git, index, ---/+++) used to rebuild partial patches */
  headerLines: string[]
}

export type DiffSource =
  | { kind: 'unstaged'; path: string }
  | { kind: 'staged'; path: string; origPath?: string }
  | { kind: 'untracked'; path: string }
  | { kind: 'commit'; hash: string; path: string; origPath?: string }
  | { kind: 'compare'; from: string; to: string; path: string; origPath?: string }
  | { kind: 'stash'; ref: string; path: string }

export interface DiffResult {
  source: DiffSource
  file: DiffFile | null
  /** Hash of the raw diff text, used to detect stale partial-staging requests */
  fingerprint: string
  truncated: boolean
  totalBytes: number
  isImage: boolean
  isLarge: boolean
}

export interface BlobContent {
  kind: 'text' | 'image' | 'binary' | 'missing' | 'too-large'
  text?: string
  dataUrl?: string
  size: number
}

export interface BlameLine {
  hash: string
  author: string
  authorTime: number
  summary: string
  line: number
  content: string
}

export interface TreeEntry {
  mode: string
  type: 'blob' | 'tree' | 'commit'
  hash: string
  path: string
  name: string
  size: number | null
}

export interface ReflogEntry {
  hash: string
  selector: string
  subject: string
  date: number
}

export interface ConflictRegion {
  start: number
  end: number
  ours: string[]
  base: string[] | null
  theirs: string[]
}

export interface ConflictFile {
  path: string
  type: string
  binary: boolean
  /** Stage contents; null if the stage does not exist (e.g. deleted on one side) */
  base: string | null
  ours: string | null
  theirs: string | null
  /** Current working-tree content (with markers) */
  result: string | null
  oursLabel: string
  theirsLabel: string
  markerCount: number
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface RebaseTodoItem {
  action: 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'
  hash: string
  subject: string
  /** New message for reword/squash */
  message?: string
}

export interface OpLogEntry {
  id: number
  repo: string | null
  command: string
  startedAt: number
  durationMs: number | null
  exitCode: number | null
  stderr: string
  running: boolean
}

export interface OpProgress {
  opId: string
  phase: string
  percent: number | null
  message: string
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'compact' | 'comfortable'

export interface Settings {
  theme: ThemeMode
  accent: string
  density: Density
  uiFontSize: number
  monoFont: string
  diffView: 'unified' | 'split'
  diffContext: number
  diffIgnoreWhitespace: boolean
  diffShowWhitespace: boolean
  diffWrap: boolean
  gitPath: string
  editorCommand: string
  terminalCommand: string
  diffTool: string
  mergeTool: string
  defaultCloneDir: string
  autoFetch: boolean
  autoFetchMinutes: number
  notifications: boolean
  reduceMotion: 'system' | 'on' | 'off'
  proxy: string
  shortcuts: Record<string, string>
  telemetry: false
}

export interface RecentRepo {
  path: string
  name: string
  lastOpened: number
  favorite: boolean
  group: string | null
}

export type HostingKind = 'github' | 'gitlab' | 'bitbucket' | 'azure'

export interface HostingAccount {
  id: string
  kind: HostingKind
  baseUrl: string
  username: string
  /** true when a token is stored in OS-encrypted storage */
  hasToken: boolean
}

export interface HostedRepoRef {
  kind: HostingKind
  host: string
  owner: string
  name: string
  webUrl: string
}

export interface PullRequest {
  number: number
  title: string
  author: string
  state: string
  draft: boolean
  sourceBranch: string
  targetBranch: string
  url: string
  updatedAt: string
  body?: string
  checks?: CheckRun[]
}

export interface CheckRun {
  name: string
  status: string
  conclusion: string | null
  url: string | null
}

export interface HostedRepo {
  fullName: string
  cloneUrl: string
  sshUrl: string
  webUrl: string
  private: boolean
  description: string | null
}

export interface AppInfo {
  version: string
  platform: string
  arch: string
  electron: string
  userData: string
  git: GitInfo | null
  gitError: string | null
}
