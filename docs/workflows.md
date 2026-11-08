# Everyday workflows

A short guide to workflows whose behavior is not obvious from the UI. For the full feature list see
the [feature matrix](product/feature-matrix.md).

## Undo and redo Git operations

Click **Undo** in the toolbar, press **Ctrl+Z** (Windows/Linux) or **Cmd+Z** (macOS) outside a text
field, or run "Undo last Git operation…" from the command palette.

- Spoon shows exactly what will move back, for example "Move main from 1fdd02d back to 97b2359",
  "Switch back to main" or "Delete feature/x", and asks before doing it.
- Undoing a commit or amend keeps its changes **staged**, so you can fix and commit again.
- Undoing a merge, rebase, interactive rebase, cherry-pick, revert or hard reset moves the branch back
  with `git reset --keep`: your uncommitted changes stay, and if they would be overwritten Git refuses
  and nothing changes.
- You can undo several steps in a row (up to 30 per repository while Spoon is open).
- Undo is refused if a reference it would move has changed since (for example you committed from a
  terminal). Use the **Reflog** view in that case.
- **Redo** (toolbar **Redo**, **Ctrl+Shift+Z** / **Cmd+Shift+Z**, or "Redo undone Git operation…")
  re-applies what you just undid, again with a preview. Redo is only available until you run another
  undoable operation, and it is refused if anything changed since the undo.
- Not covered: staging, discarding, stashes and pushes. The undo history lives in memory and is
  cleared when Spoon closes.

## Pushing

- **Rejected push.** If the remote branch has commits you don't have, Spoon offers to fetch and then
  rebase your branch onto it (or merge it) and push again, or just fetch so you can review first. If the
  rebase or merge stops on conflicts, the conflict workspace opens; push again after continuing.
- **Force push.** Tick "Force push with lease" in the Push dialog. The confirmation lists the remote
  commits that would be removed and the commit the remote branch is at according to your last fetch.
  The push is pinned to that exact commit: if anyone pushed since (even if a background fetch has seen
  it), Git refuses, and Spoon offers to fetch so you can look at the new commits.

## Pulling

Choose fast-forward only, merge or rebase (optionally remembered per repository). If a merge or rebase
pull stops on conflicts, the conflict workspace opens with Continue/Abort. If a fast-forward-only pull
fails because the branches diverged, pull again with merge or rebase.

## Finding when code changed

In History, set the search mode to **Changes (code)** and type the text. Spoon lists commits that added
or removed that exact text (`git log -S`).

## Comparing branches

Right-click a branch → **Compare with current branch**, or use "Compare branches or commits…" in the
command palette. The header shows the commits each side has that the other lacks (expand either list),
and the file list shows the combined difference.

## Worktrees

- Right-click a branch → **New worktree for this branch…** to check it out in a separate folder; the
  worktree opens in a new tab. Worktrees appear in the sidebar when there is more than one.
- Checking out a branch that is already checked out in another worktree offers to open that worktree.
- **Remove…** shows the worktree's uncommitted changes first. Git refuses to remove a worktree with
  changes unless you tick "Discard these N change(s)". The branch itself is kept. You cannot remove the
  main worktree or the one the current tab is working in.

## Repository statistics

Click **Statistics** in the sidebar (under Reflog) or run "Show repository statistics" from the
command palette. The header names the repository, the branches counted and the date range.

- **Branches:** _Current branch_ counts the commits HEAD can reach (works with a detached HEAD too).
  _All local branches_ counts commits reachable from any branch under `refs/heads`; remote-tracking
  branches and tags are not included. A commit that several branches contain is counted once.
- **Date range:** _Last 30 days_, _Last 90 days_ (both end today and include it, by your computer's
  calendar), _All time_, or _Custom_ (both days included). Dates are **author dates on the author's
  own clock** — the time zone recorded in each commit — so a commit made at 23:30 in New York counts
  on that day even though it was already the next day in UTC. The activity, weekday and hour charts
  use the same dates.
- **Overview:** total commits (merges shown separately), unique contributors, active days, first and
  latest commit, commit activity over time (per day, week starting Monday, or month depending on the
  range), and commits by weekday and by hour. Every chart has **Show values** for a table.
- **Contributors:** grouped by e-mail after applying the repository's `.mailmap`, shown with their
  most used name. _Commits_ excludes merges; _Merges_ is listed separately. Click a column heading to
  sort.
- **Files and lines** load separately (they read every commit's diff and can take a while on large
  histories; there is a **Cancel** button). Merge commits are excluded because a merge's diff repeats
  work already counted. A _file change_ is one file in one commit. Renames are detected (`-M`), count
  once for the new name with only the edited lines, and older changes are credited to the newest name.
  Binary files count as file changes but add no line counts. Results are reused while the branch tips,
  range and `.mailmap` are unchanged.
- **Shallow clones** are labelled: the numbers cover only the history present on your computer.
- Statistics refresh automatically when commits or branches change, including commits made outside
  Spoon. Statistics never modify the repository.
