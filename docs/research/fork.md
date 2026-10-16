# Competitive research: Fork (git-fork.com)

- **Research date:** 2026-10-11
- **Subject:** Fork, a commercial desktop Git client for macOS and Windows
- **Purpose:** Find features and UX ideas worth adapting in Spoon (Electron + React + TypeScript, runs the installed Git CLI)

## Sources consulted

All sources were accessed on 2026-10-11.

| URL | Status |
| --- | --- |
| https://git-fork.com/ | Loaded |
| https://git-fork.com/releasenotes (macOS) | Loaded (full history, Fork 1.0.x in 2016 to Fork 2.70 in Sep 2026) |
| https://git-fork.com/releasenoteswin (Windows) | Loaded (full history, Fork 1.14 in 2018 to Fork 2.23 in Sep 2026) |
| https://fork.dev/blog | Loaded (posts from 2019–2020: Quick Launch, Windows 1.38, Windows 1.48, collapsible graph) |
| https://git-fork.com/buy | Loaded |
| https://git-fork.com/license | Loaded |
| https://git-fork.com/faq | **Failed (HTTP 404)**. I could not find an official FAQ or docs site. |
| Web search ("Fork git client 2026 …") | Used only to find the URLs above. No claim relies on third-party results. |

**Tag legend:**
- **[Verified]**: I saw this in fetched official content, and the source is named.
- **[Uncertain]**: Inferred, from memory, or not confirmed in fetched content.
- **[Proposed]**: A recommendation for Spoon.

Short source names used below: *Home* = git-fork.com, *Mac RN* = macOS release notes, *Win RN* = Windows release notes, *Blog* = fork.dev/blog, *Buy* = git-fork.com/buy, *License* = git-fork.com/license.

**Versioning note:** The macOS and Windows builds use separate version numbers. In late 2026, Mac is at about 2.70 and Windows at about 2.23. Features usually reach both platforms within a few weeks of each other, but not always. Some recent release-note entries have a date but no version header, so the version numbers given for 2026 are approximate.

---

## 1. Overview & pricing/licensing model

- Fork describes itself as "a fast and friendly git client for Mac and Windows". **[Verified, Home]**
- It is built by a small family team: Dan Pristupov (Swift/Cocoa) and Tanya Pristupova (.NET/WPF). They say they work on it in their spare time. **[Verified, Home]**
- The two platforms appear to be separate native codebases: Cocoa on Mac and WPF/.NET on Windows. **[Verified]** that the Windows build moved to .NET 4.7.2 in Win 2.0 (Aug 2024) and became 64-bit in Win 1.82 (Feb 2023), per Win RN. **[Uncertain]** that the codebases are fully separate; I inferred this from the developers' bios and the separate release notes.
- **Price:** $59.99, one-time purchase, for personal and commercial use. One user can use it on up to 3 machines at a time. **[Verified, Buy]**
- **Free evaluation:** Users can download and evaluate Fork for free but must buy a license for long-term use. **[Verified, Home, License]**
- **License terms:**
  - One key covers both Mac and Windows. **[Verified, License]**
  - The license is proprietary and forbids reverse engineering. **[Verified, License]**
  - It is governed by Czech law. **[Verified, License]**
  - Fork is not open source. **[Verified, License]**
- **Minimum OS listed on Home:** OS X 10.11+ and Windows 7+. **[Verified, Home]** These numbers look outdated. Mac RN mentions support for macOS 26 Tahoe and a fix for running on macOS 10.13 (2.39, Jan 2024). **[Uncertain]** what the real minimum versions are today.
- **Bundled Git:** Fork ships its own Git build. Release notes regularly say "Update git to 2.45.2" and similar (Mac 2.44, Jun 2024; Win 1.99, Jul 2024), and Git LFS updates are bundled too. **[Verified, Mac RN/Win RN]** This is a key difference from Spoon, which uses the system Git.

## 2. Repository management (tabs, repository manager, groups)

- **Tabs:**
  - Repositories open in tabs. **[Verified, Mac RN/Win RN, many tab-related entries]**
  - Recent additions:
    - restore closed tabs with Shift+Cmd+T or Ctrl+Shift+T (Mac 2.67-ish, May 2026; Win Jun 2026);
    - a tab context menu with Rename, Color, Open in Terminal, and Show in Finder (Mac 2.68, Jun 2026; Win Jul 2026 adds Open in Terminal and Explorer);
    - badges on tabs for uncommitted changes (Mac 2.45, Aug 2024);
    - when two repos share a name, the tab title shows the first path component that differs (Mac 2.58 / Win 2.12, 2025).
  - **[Verified, Mac RN/Win RN]**
- **Vertical tabs:** Added to Mac in Fork 2.70 (4 Sep 2026). **[Verified, Mac RN]** I saw no equivalent in Win RN. **[Uncertain]** whether Windows has it.
- **Repository Manager:**
  - Shows a summary and statistics. **[Verified, Home]**
  - Renders README.md as Markdown (Mac 1.0.86, Nov 2019). **[Verified, Mac RN]**
  - Shows remote details (Mac 2.7, 2021), flags invalid repos (Mac 2.14), and rescans folders for repos with performance optimizations (Mac 2.31; Win 1.88). **[Verified, Mac RN/Win RN]**
  - Supports folders created from a selection (Mac 2.36). **[Verified, Mac RN]**
- **Workspaces:**
  - Workspaces organize many repositories (Mac 2.26, Feb 2023). **[Verified, Mac RN]**
  - Workspaces can be nested using `/` (Mac 2.27; Win 1.83). **[Verified, Mac RN/Win RN]**
  - Windows can show the active workspace in the title bar (Win 1.70). **[Verified, Win RN]**
- **Support for "multiple source code directories"** was added on Mac 2.60 (Nov 2025) and Win 2.15 (Dec 2025). **[Verified, Mac RN/Win RN]**
- **Command-line launcher:** A `fork` CLI opens repos, including `fork .` (Mac 2.23 fix; Win 1.38 blog). **[Verified, Mac RN/Blog]**
- **Other ways to open repos:** Drag and drop onto the app icon or from Explorer. **[Verified, Mac RN/Win RN]**

## 3. Commit graph & history

- **Commit list and graph:**
  - Branch labels are drawn in their graph colors (Win 1.38 per Blog; Mac 2.53, May 2025). **[Verified, Blog/Mac RN]**
  - Compact branch labels (Mac Jun 2022). **[Verified, Mac RN]**
  - The active branch is emphasized (Mac 2.30). **[Verified, Mac RN]**
  - Message prefixes (for example `feat:`) are highlighted (Mac 2.44; Win 1.99). **[Verified, Mac RN/Win RN]**
  - Author avatars come from Gravatar, with GitHub later as the default (Blog; Mac 1.0.98). **[Verified, Blog/Mac RN]**
- **Collapsible merges:** You can collapse or expand merge commits in the graph with a click or the ←/→ keys, and "collapse all" from the context menu. The blog demonstrates this on the Swift repository, which has more than 100k commits. **[Verified, Blog, Aug 2020]** Collapse state is remembered between restarts (Mac May 2026; Win "per repository", Jun 2026). **[Verified, Mac RN/Win RN]**
- **History filters and views:**
  - "First parent" view mode (Mac 1.0.89, Jan 2020). **[Verified, Mac RN]**
  - You can hide particular branches, folders, or remotes and filter by them (Mac 2.6, Mar 2021). **[Verified, Mac RN]**
- **Stashes:** Stashes appear in the commit list, and as of 2.22 / Win 1.77 also in their own sidebar section. **[Verified, Home, Mac RN]**
- **Search:**
  - Commit search covers message, diff, and path, and shows file matches (Mac 1.0.98, Sep 2020). **[Verified, Mac RN]**
  - Search matches can be deleted, so you can use them as a to-do list (Mac 1.0.99). **[Verified, Mac RN]**
- **File and line history:**
  - History for a file or directory, and Blame. **[Verified, Home]**
  - Blame has a timeline (Mac 2.10, 2021) and backward/forward navigation (Mac 2.11). **[Verified, Mac RN]**
  - File history has a timeline (Mac 2.26). **[Verified, Mac RN]**
  - "File History for a selected piece of code", similar to `git log -L` (Mac 2.59, Nov 2025; Win 2.14). **[Verified, Mac RN/Win RN]**
  - History for a hunk from the File Tree (Mac 2.60). **[Verified, Mac RN]**
- **File tree:** You can browse the repository's file tree at any commit. **[Verified, Home]**
- **Statistics:**
  - Repository statistics, including commits by weekday and hour, with a selectable time range (Mac 1.0.97, Aug 2020; Win 1.53). **[Verified, Mac RN/Win RN]**
  - A "Repository Treemap" shows repository activity over time (Mac 2.52, Apr 2025; Win May 2025). **[Verified, Mac RN/Win RN]**
- **Bisect:**
  - Visual bisect mode that tracks progress on a timeline (Mac 1.0.90, Feb 2020; Win 1.48 per Blog). **[Verified, Blog, Mac RN]**
  - Good and bad commits are colored (2025). **[Verified, Mac RN/Win RN]**
  - Bisect UX polish in 2026. **[Verified, Mac RN/Win RN]**
- **Issue tracker links:** References to Jira, Redmine, and similar trackers are turned into links (Win 1.38 per Blog). GitHub issue references are also highlighted. **[Verified, Blog, Mac RN]**

## 4. Staging & partial staging (hunks/lines)

- You can stage and unstage line by line. **[Verified, Home]**
- **Chunk-level staging history:**
  - Subchunk staging works in "Entire File" mode (Mac Jun 2022). **[Verified, Mac RN]**
  - "Make chunk staging more precise" (Mac 2.20, Jul 2022; Win 1.76 "Rework partial staging"). **[Verified, Mac RN/Win RN]**
  - When "ignore whitespace" is on and staging a chunk fails, Fork offers to turn the option off (Mac 2.42; Win 1.97, 2024). **[Verified, Mac RN/Win RN]** This is a known edge case: patches built from a whitespace-ignoring diff may not apply.
- **Partial stash:** You can stash individual files (Win 1.48 per Blog). You can save a snapshot to a stash (Mac 1.0.99). Applying a stash tries to restore the staged state (Win, Jul 2025). **[Verified, Blog, Mac RN, Win RN]**
- **Side-by-side in the Local Changes view** (Mac Aug 2022). **[Verified, Mac RN]**
- **Background operations and visual polish:**
  - Stage, unstage, and discard run on a background thread (Win 2.13, Oct 2025). **[Verified, Win RN]**
  - Less flicker when staging (Mac 2.59 / Win 2.14). **[Verified, Mac RN/Win RN]**
  - Snapping for the split view in the stage view (2026). **[Verified, Mac RN/Win RN]**
- **Commit composer:**
  - Separate subject and description fields, a configurable subject length limit, and a "wrap at ruler" option. **[Verified, Mac RN]**
  - Spell checking (Mac 1.0.23; Win 1.24). **[Verified, Mac RN/Win RN]**
  - Recent commit messages (Mac 1.0.12). **[Verified, Mac RN]**
  - Drafts can be generated by the `prepare-commit-msg` hook (Win 1.70). **[Verified, Win RN]**
  - Warns when you amend an already-pushed commit (Win 1.91). **[Verified, Win RN]**
  - Commit & Push shortcut, Option+Cmd+Return (Mac 2.68 fix). **[Verified, Mac RN]**
- **Patches:**
  - Apply a patch from the clipboard with Cmd/Ctrl+V (Mac 2.64; Win 2.17, 2026). **[Verified, Mac RN/Win RN]**
  - Windows shows whether a patch will apply without conflicts. **[Verified, Win RN]**
  - "Copy as patch" (Mac 2.29). **[Verified, Mac RN]**
  - Save a stash as a patch (Mac Jul 2026). **[Verified, Mac RN]**

## 5. Diff viewer (side-by-side, image diff, whitespace)

- **Viewing modes:**
  - "Advanced Diff Viewer" plus side-by-side diff. **[Verified, Home]**
  - Side-by-side with a spacebar quick look (Win 1.38 per Blog; Mac 1.0.88, Dec 2019). **[Verified, Blog/Mac RN]**
  - Inline highlighting within side-by-side diffs. **[Verified, Blog]**
  - Token-based inline diff highlighting (Win, Jun 2026). **[Verified, Win RN]**
- **Image diff:**
  - Diffs for common image formats. **[Verified, Home]**
  - Side-by-side, swipe, and onion-skin modes (Win 1.38 per Blog; Mac 2.12, Sep 2021; also for LFS images, Mac 2.27). **[Verified]**
  - Pixel diff, including 16-bit RGBA (Mac 2.68). **[Verified, Mac RN]**
  - HEIC, WebP, and TGA formats, plus a checkerboard background in dark mode. **[Verified, Mac RN/Win RN]**
- **Whitespace and context:**
  - Ignore-whitespace option in commit and revision views (Mac 1.0.44, 2017; 1.0.65, 2018). **[Verified, Mac RN]**
  - A single dropdown for context size (Mac 2.32 / Win 1.88, 2023). **[Verified, Mac RN/Win RN]**
- **Navigation:**
  - Inline search with Ctrl+F (Blog).
  - Previous/next chunk with Cmd/Ctrl+Up/Down (2026).
  - A scrollbar minimap (Win 1.40; hidden when the document fits, 2026).
  - Context search re-applied when switching files (Mac Jul 2026).
  - **[Verified, Blog, Mac RN, Win RN]**
- **Special content:**
  - Diffs of submodule commit lists (Mac 2.38).
  - File mode changes (Mac 2.8).
  - Binary↔LFS changes (Mac 2.40).
  - PDF preview (Mac 2.3).
  - Large untracked files are not loaded by default (Mac 2.38).
  - **[Verified, Mac RN]**
- **Accessibility:** An option to show -/+ markers to help color-blind users (Mac 2.10, Jul 2021). **[Verified, Mac RN]**
- **External tools:**
  - Integrations with many external diff/merge tools (Araxis, Kaleidoscope, KDiff3, BBDiff, UnityYAMLMerge, VS Code). **[Verified, Mac RN/Win RN]**
  - Windows supports multiple configured external tools (Win 2.4, Jan 2025). **[Verified, Win RN]**

## 6. Branch & remote ops (fetch/pull/push options, force push handling)

- Fetch, pull, and push; create and delete branches and tags; cherry-pick and revert; Git-flow. **[Verified, Home]**
- **Force push:** "Use --force-with-lease instead of --force during push" (Mac 1.0.58, Oct 2017). An earlier release (1.0.17, Aug 2016) added a plain `--force` push option. **[Verified, Mac RN]** **[Uncertain]** whether the force-push UI includes extra confirmation or explanation.
- **Pushing multiple refs:**
  - Push several branches at once (Mac 1.0.86; Win 1.48). **[Verified, Mac RN/Blog]**
  - Windows uses `--atomic` for multi-branch pushes (Win 2.0). **[Verified, Win RN]**
  - Push multiple tags (Win 1.91). **[Verified, Win RN]**
- **Push dialog safety and convenience:**
  - Warns about unpushed submodules (Mac 2.35; Win 1.90). **[Verified]**
  - You can edit the remote branch name on push (Mac 2.1). **[Verified, Mac RN]**
  - You can add a remote while pushing in a repo that has none (Win 1.94). **[Verified, Win RN]**
- **Quick Fetch/Pull:** Hold ⌥ to fetch or pull without a dialog (Mac 1.0.85). **[Verified, Mac RN]**
- **Automatic fetch:**
  - Background fetch every 10 minutes (Mac 2.36). **[Verified, Mac RN]**
  - Skipped while another fetch is running (Mac 2.27). **[Verified, Mac RN]**
  - Kept out of the Activity Manager log through separate sections (Mac 2.48 / Win 2.3). **[Verified, Mac RN/Win RN]**
- **Branch status indicators:**
  - Icons show upstream status: local-only, pushed, or upstream deleted (Blog Win 1.48; Mac 1.0.90). **[Verified]**
  - Warning when the active branch has an invalid upstream (Mac/Win Jul 2026). **[Verified]**
- **Drag and drop:** Drag a branch onto another on the sidebar to merge or rebase, including remote branches (Blog; Mac 1.0.86). **[Verified]**
- **Uncommitted changes when switching branches:**
  - "Stash and reapply" options on pull, checkout, and track (Mac 1.0.85, 2.18, 2.47). **[Verified, Mac RN]**
  - When fast-forward isn't possible, Fork offers merge/rebase/reset on remote checkout (Win 1.74). **[Verified, Win RN]**
- **"Lean branching":** Fork's own branching model for keeping history clean. It has a toolbar Branch button and a "sync" (rebase on main) action (Mac 2.16, Feb 2022; Win 1.70). **[Verified, Mac RN/Win RN]**
- **Batch operations and filtering:**
  - Fast-forward multiple branches, and delete multiple branches or tags (Mac/Win 2022). **[Verified]**
  - Filter branches in Push, Pull, and Track dropdowns (Win 2.23, Sep 2026). **[Verified, Win RN]**
- **Merge and cherry-pick options:**
  - Squash and no-commit merge options, plus `cherry-pick -x` (Mac Feb 2021). **[Verified, Mac RN]**
  - Shows whether a cherry-pick or revert will conflict before you run it (Mac 2.66 / Win 2.19, 2026). **[Verified]**
- **Remotes:** A "Test connection" button in the remote and clone dialogs (Mac 1.0.88; Win per Blog). **[Verified]**
- **Activity Manager:** Shows the exact Git commands Fork runs and their output (Blog Win 1.48; Mac 1.0.88). Windows adds a "verbose output" preference (Win 2.16). **[Verified]**

## 7. Conflict resolution (merge conflict helper/merger)

- A merge-conflict helper and a built-in merge-conflict resolver. **[Verified, Home]**
- **Merger features:**
  - An alternative 3-column layout (Mac 2.13 / Win 1.68, 2021). **[Verified]**
  - Shows branch names instead of "ours/theirs" (same releases). **[Verified]**
  - Navigation hyperlinks (Mac May 2022). **[Verified, Mac RN]**
  - Conflict marks on the scrollbar (Mac 2.53 / Win 2.9, 2025). **[Verified]**
- **Non-text conflicts:** The merger can resolve images, LFS files, and submodules (Mac 2.6, Mar 2021). **[Verified, Mac RN]**
- **Predicting and reviewing conflicts:**
  - The rebase dialog warns when the rebase will cause conflicts (Mac 2.55 / Win 2.11, Aug 2025). **[Verified]**
  - Shows a diff for conflicted files that were resolved in an external tool (Mac 2.58 / Win 2.13). **[Verified]**
  - Revision links during rebase conflicts (Win 1.72). **[Verified, Win RN]**
- **Abort safety:** Aborting a merge does not discard local changes (Mac 2.29 / Win 1.84). **[Verified]**

## 8. Interactive rebase & recovery (reflog, undo)

- **Visual interactive rebase:** You can edit, reorder, and squash commits. **[Verified, Home]**
- **Quick actions:** Quick interactive-rebase actions from the branch context menu (Win 1.38 per Blog). **[Verified, Blog]**
- **Other interactive rebase options:**
  - Rebase onto the root commit (Mac 1.0.98). **[Verified, Mac RN]**
  - Respects `.mailmap` (Mac 2.17). **[Verified, Mac RN]**
  - Asks for confirmation on Esc (Win, per Blog). **[Verified, Blog]**
- **Drag-and-drop editing:** Reorder and squash commits in the active branch directly by drag and drop (Mac 2.55 / Win 2.11, Aug 2025). **[Verified]**
- **`--update-refs`:** Supported in the rebase dialog and in interactive rebase (Mac 2.61/2.63; Win 2.15/2.16, Dec 2025–Feb 2026). **[Verified]**
- **Reflog recovery:**
  - "Restore lost commits with Reflog" through a "Lost commit mode". **[Verified, Home; Mac RN 2.39]**
  - Cmd/Ctrl+Shift+. toggles the reflog view (2026). **[Verified]**
- **Undo:** I found no general "Undo last operation" feature in the fetched notes. **[Uncertain]** whether Fork has one. I believe it does not and relies on reflog.
- **Reset:** Reset a file to a given revision from File History, and reset HEAD while in detached HEAD (Mac Feb 2021). **[Verified, Mac RN]**

## 9. Worktrees, submodules, Git LFS

- **Worktrees:**
  - Existing worktrees appear in the sidebar (Mac 2.31 / Win 1.87, 2023), with nesting. **[Verified]**
  - Create and delete worktrees (Mac 2.41 / Win 1.96, 2024). **[Verified]**
  - A "Create Worktree" dialog that can be opened from Quick Launch (2026). **[Verified]**
  - Check out a remote branch as a worktree (Mac 2.68 / Win Jul 2026). **[Verified]**
  - Optionally remove the worktree when deleting its branch, and mark branches that are checked out in another worktree. **[Verified]**
  - Submodules work inside worktrees (2026). **[Verified]**
  - Windows 2.23 (Sep 2026) stores view settings per worktree and shares repository settings across worktrees. **[Verified, Win RN; not yet seen in Mac RN]**
- **Submodules:**
  - Updated automatically on checkout by default (2022). **[Verified]**
  - Nested in the sidebar, with an indicator for uncommitted changes. **[Verified]**
  - Bulk update. **[Verified]**
  - Open in a tab next to the parent tab. **[Verified]**
  - Clicking the submodule title opens the parent repo. **[Verified]**
  - Custom commands for submodules. **[Verified]**
- **Git LFS:**
  - Supported. **[Verified, Home]**
  - Lock and unlock files (Blog Win 1.48; Mac 1.0.90), with a Locks dialog that has a filter and multi-unlock (2021–2023). **[Verified]**
  - LFS prune (Mac 1.0.85). **[Verified]**
  - An LFS status dialog (Mac 2.37 / Win 1.92). **[Verified]**
  - Progress shown for push, pull, and checkout. **[Verified]**
  - A warning for large files that are not tracked by LFS (Mac 2.0). **[Verified]**
- **Reftable:** Detection of in-progress operations was fixed for repositories using the reftable backend (2026). **[Verified]**

## 10. Hosting integrations (GitHub, GitLab, Bitbucket, Azure DevOps)

- **GitHub notifications:** Shown in the app (Home). Includes unread marks and commit comments (Mac 2.7, 2.8). **[Verified]**
- **Pull requests:**
  - Implemented for GitHub early on (Mac 1.0.40, Mar 2017), with PR templates. **[Verified, Mac RN]**
  - "Reworked Pull Requests" (Mac 1.0.90, Feb 2020). **[Verified, Mac RN]**
  - Create PRs for GitHub, Bitbucket, GitLab, and Azure DevOps from the branch menu (Blog Win 1.48; Win 1.44). **[Verified]**
  - Filter PRs and Issues by author or assignee (Win 1.64). **[Verified, Win RN]**
  - **[Uncertain]** whether Fork supports full in-app PR review (comments, approvals). I saw no evidence of it.
- **Account types:**
  - GitHub and GitLab, including GitHub Enterprise, Bitbucket Server, and GitLab Server (Mac 2.6, 2021). **[Verified]**
  - Gitea (Mac 2.15 / Win 1.70, 2022). **[Verified]**
  - Azure DevOps remotes get an icon and web links. **[Verified]**
  - Multiple accounts per service (Mac 2.5). **[Verified]**
  - Bitbucket OAuth (Mac 2.5). **[Verified]**
  - GitHub personal access tokens (Mac 2.9) and updatable tokens (Mac 2.44). **[Verified]**
  - A pre-scoped GitLab token link (Mac 2.42). **[Verified]**
  - A clone dialog that lists your hosted repositories. **[Verified]**
- **URL custom commands:** Can be used to create PRs on custom servers (Mac 1.0.99). **[Verified, Mac RN]**
- **SSH:**
  - An SSH key manager (Mac 1.0.55) with ED25519 key generation (Mac 2.30). **[Verified]**
  - An SSH configuration dialog (Mac Feb 2021). **[Verified]**
  - A first-time SSH helper for GitHub and GitLab. **[Verified]**
- **GPG signing:** Supported (Home; Mac 1.0.58). **[Verified]** **[Uncertain]** whether SSH-based commit signing is supported. I saw no mention of it.
- **AI integrations (new in 2025–2026):**
  - Claude Code for branch review and commit messages (Mac 2.59–2.60; Win 2.14–2.15). Windows requires Claude at `%userprofile%\.local\bin\claude.exe`. **[Verified]**
  - Codex support for messages and review (Mac 2.64). **[Verified, Mac RN]**
  - Editable prompts (Mac 2.64). **[Verified, Mac RN]**
  - Review of SHA ranges (Mac 2.61). **[Verified, Mac RN]**
  - Cursor as an AI agent for commit messages (Mac 2.70). **[Verified, Mac RN]**
  - I did not see Codex or Cursor in Win RN. **[Uncertain]** whether Windows supports them.

## 11. Keyboard workflows (Quick Launch / command palette)

- **Quick Launch** (Cmd+P / Ctrl+P):
  - Added in Mac 1.0.84 (Sep 2019) and Win 1.39. **[Verified, Mac RN/Win RN/Blog]**
  - Commands include checkout branch with smart completion and file history by filename. **[Verified, Blog]**
  - Fuzzy search (Mac 1.0.85 / Win 1.40), later extended to file paths (2025). **[Verified]**
  - Shows pinned branches (Mac 2.31). **[Verified]**
  - Opens repositories, in a new tab by default (Mac 2.25). **[Verified]**
  - Can create worktrees (2026). **[Verified]**
- **Custom commands:**
  - User-defined commands appear in Quick Launch (Blog example: Gerrit push). **[Verified, Blog]**
  - Commands can run bash or sh, open a URL, or show simple dialogs (Mac 1.0.99). **[Verified]**
  - "UI custom commands" with text fields, branch pickers, and file selectors (Mac 2.29 / Win 1.85, 2023). **[Verified]**
  - Commands can be shared with a team using an OS selector (Mac/Win 2023). **[Verified]**
  - Nested commands and reordering. **[Verified]**
- **Shortcuts:**
  - ⌘B / Ctrl+B for quick checkout. **[Verified]**
  - Shift+Cmd+G / Ctrl+Shift+G to create a tag. **[Verified]**
  - Cmd+D / Ctrl+Shift+D to collapse commit details. **[Verified]**
  - Spacebar for a commit-details popup. **[Verified]**
  - Tab / Shift+Tab to move between the sidebar, commit list, and details. **[Verified]**
  - Arrow keys in the sidebar (all 2026). **[Verified]**
  - Delete key removes a branch from the commit list (Mac 1.0.85). **[Verified]**

## 12. Themes, accessibility, performance

- **Themes:**
  - Dark theme since Mac 1.0.30 (Nov 2016). **[Verified]**
  - Native Mojave dark mode (Mac 1.0.71). **[Verified]**
  - Light/dark can be set independently of the system (Mac 2.15, Jan 2022). **[Verified]**
  - Windows 11 styling (Win 1.66–1.68), and a refreshed visual style in Win 2.16 (Feb 2026). **[Verified]**
  - macOS Tahoe adaptations (Mac 2.56–2.58). **[Verified]**
- **Accessibility:**
  - More readable dark-theme diffs for color-blind users (Mac 1.0.73). **[Verified]**
  - The -/+ marker option (Mac 2.10). **[Verified]**
  - Higher-contrast line numbers (Mac 2.12). **[Verified]**
  - UI zoom with Ctrl+= / Ctrl+- on Windows (Win 1.38). **[Verified]**
  - Configurable code font size (Win 1.24) and a monospace option for commit messages. **[Verified]**
  - Broader keyboard navigation (2026). **[Verified]**
  - **[Uncertain]** how well Fork supports screen readers. Nothing in the fetched content mentions it.
- **Performance:**
  - Marketed as "fast". **[Verified, Home]**
  - The notes repeatedly mention performance work: large repositories (Mac 1.0.56), many branches, faster checkout, filtering, Repository Manager rescans, and minified files. **[Verified, Mac RN]**
  - Out-of-memory fix for very large minified files (Mac 2.68). **[Verified]**
  - Background-threaded worktree removal and staging (2025–2026). **[Verified]**
  - Blame performance rework (Windows). **[Verified, Win RN]**
- **Native builds:** Native Apple Silicon build (Mac 2.1, Dec 2020). **[Verified]**

## 13. Notable release-note features with approximate versions/dates

| Approx. date | Mac | Windows | Feature |
| --- | --- | --- | --- |
| Mar 2017 | 1.0.40 | — | GitHub pull requests |
| Oct 2017 | 1.0.58 | — | GPG signing; `--force-with-lease` push |
| Sep–Oct 2019 | 1.0.84–85 | 1.39–1.40 | Quick Launch command palette, fuzzy search |
| Feb 2020 | 1.0.90 | 1.48 (Apr–May 2020) | Bisect, LFS locks, PR rework, upstream status icons |
| Aug 2020 | 1.0.97 | 1.53 | Repository statistics |
| Aug 2020 | both (Blog) | both (Blog) | Collapsible merges in the graph |
| Mar 2021 | 2.6 | ~1.60 | Enterprise/self-hosted servers; merger handles images, LFS, submodules |
| Sep 2021 | 2.12 | 1.38 (2019) | Swipe/onion image diff (Windows got it first) |
| Nov 2021 | 2.13 | 1.68 | 3-column merger; branch names instead of ours/theirs |
| Jan–Feb 2022 | 2.15–2.16 | 1.70 | Gitea, independent theme, Lean branching |
| Feb 2023 | 2.26 | ~1.83 | Workspaces |
| May 2023 | 2.29 | 1.85 | UI custom commands |
| Jul 2023 / Mar 2024 | 2.31 / 2.41 | 1.87 / 1.96 | Show worktrees / create and delete worktrees |
| Apr 2025 | 2.52 | ~2.8 (May) | Repository Treemap |
| Aug 2025 | 2.55 | 2.11 | Drag-and-drop reorder/squash; rebase conflict prediction |
| Nov 2025 | 2.59–2.60 | 2.14–2.15 | Claude code review and commit messages; history of selected code |
| Feb 2026 | 2.63 | 2.16 | `--update-refs` in interactive rebase; Create Worktree dialog |
| Mar 2026 | 2.64 | — | Codex AI support; editable AI prompts |
| Apr 2026 | 2.66 | 2.19 | Collapsible details; cherry-pick/revert conflict prediction |
| Jun 2026 | 2.68 | ~Jul 2026 | Checkout remote branch as worktree; tab context menu |
| Sep 2026 | 2.70 | 2.23 | Mac: vertical tabs, Cursor AI. Win: per-worktree view settings, branch filters in dropdowns |

**Platform differences seen in the notes:**
- Windows had side-by-side diff and swipe/onion image modes about 2 years before Mac.
- Windows has UI zoom and a verbose Git output preference.
- Mac has vertical tabs and Codex/Cursor AI integrations.
- The Windows Claude integration depends on a fixed install path.
- Windows added an "experimental vertical layout for wide monitors" (Win 1.29, 2019) and a "one-line vertical commit list layout" (Win 1.33).
- All of the above is **[Verified]** from the respective release notes.

## 14. Distinguishing features

- **Native per platform** (Cocoa and WPF), with a reputation for speed. The speed claim is marketed. **[Verified, Home]**
- **One-time $59.99 license** covering both OSes on up to 3 machines. **[Verified, Buy/License]**
- **Visual history tools:**
  - collapsible merge graph;
  - first-parent mode;
  - statistics and Treemap;
  - visual bisect;
  - blame and history timelines.
  - **[Verified]**
- **Extensibility through custom commands:** shell, URL, and UI-form commands that can be shared with a team and surface in Quick Launch. **[Verified]**
- **Conflict prevention:** Fork predicts conflicts before you rebase, cherry-pick, revert, or apply a patch. **[Verified]**
- **Lean branching workflow:** a built-in, opinionated alternative to git-flow. **[Verified]**
- **Strong LFS and submodule tooling,** plus mature worktree support in 2026. **[Verified]**
- **Transparency:** The Activity Manager shows the actual Git commands Fork runs. **[Verified]**

---

## Implications for Spoon

1. **[Proposed] Command palette with custom commands.** Spoon should have a Ctrl/Cmd+P Quick Launch with fuzzy search over commands, branches, file paths, and repositories.
   - Let users add their own commands: shell, URL, and simple form inputs with variables such as `${branch}`, `${repo:path}`, and `${file}`.
   - Store them as a JSON file that can be checked into a repo for team sharing.
   - This matches Fork's most extensible feature, and it fits naturally in Electron.

2. **[Proposed] Transparent Git log.** Since Spoon runs the installed Git CLI, an "Activity" panel could show every command, its duration, stdout and stderr, and exit code.
   - Automatic background fetches should be in a separate section.
   - This builds trust and makes debugging easier, as Fork's Activity Manager does.

3. **[Proposed] Predict conflicts before acting.** Before a rebase, cherry-pick, revert, merge, or patch apply, run a dry run and show "will conflict" or "clean" in the dialog.
   - On Git 2.38+ this can use `git merge-tree --write-tree`.
   - Patches can use `git apply --check`.

4. **[Proposed] Collapsible merge graph and first-parent mode.** Use ←/→ to collapse or expand merges, add "collapse all", and persist the collapse state per repository and worktree.

5. **[Proposed] Partial staging edge cases.** When a hunk or line fails to stage with ignore-whitespace enabled, explain why and offer to retry without the option, as Fork does.
   - Run stage, unstage, and discard off the UI thread, in a worker or async child process, to avoid flicker.

6. **[Proposed] Safe force push.** Default to `--force-with-lease`, preferably with `--force-if-includes` on newer Git, and never offer plain `--force` without an explicit second confirmation.
   - Use `--atomic` for multi-branch pushes.
   - Warn about unpushed submodules.

7. **[Proposed] First-class worktrees.** Show worktrees in the sidebar and support "check out remote branch as worktree".
   - Mark branches that are checked out elsewhere.
   - Offer to delete the worktree along with its branch.
   - Keep view settings per worktree, as in Fork Windows 2.23.

8. **[Proposed] Drag-and-drop history editing.** Let users reorder or squash commits of the current branch directly in the graph, implemented as a generated interactive-rebase todo.
   - Expose `--update-refs` for stacked branches.

9. **[Proposed] Recovery affordances.** Provide a "lost commits" (reflog) view toggle. Fork has no general undo, so Spoon could stand out with an **operation-level Undo** that records ref and HEAD positions before each mutating command.

10. **[Proposed] Image and binary diffs.** Offer side-by-side, swipe, onion-skin, and pixel-diff modes, which are straightforward with Canvas in Electron.
    - Handle LFS pointers and binary↔LFS transitions.

11. **[Proposed] Accessibility from day one.** Include:
    - a -/+ marker option for color-blind users;
    - UI zoom;
    - configurable fonts;
    - complete keyboard navigation between panes (Tab and arrow keys);
    - ARIA roles for screen readers, which Fork does not visibly address.

12. **[Proposed] Optional AI hooks.** Instead of hard-coding vendors and install paths (a pain point visible in Fork's Windows notes), let users configure any CLI agent command for commit-message drafts and branch review. Make prompts editable and support SHA ranges.

13. **[Proposed] Hosting integrations without lock-in.** Start with "Create PR" deep links for GitHub, GitLab, Bitbucket, Azure DevOps, and Gitea, generated from the remote URL. Add API-based PR listing and filtering later.
    - Support multiple accounts per host.

14. **[Proposed] Differentiate on openness.** Spoon is open source and uses the system Git; many commercial clients are proprietary and bundle their own Git.
    - Detect the Git version and warn about versions that are too old for features like `merge-tree` and `--update-refs`.
    - Document exactly which commands each action runs.
