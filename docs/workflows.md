# Everyday workflows

A short guide to workflows whose behavior is not obvious from the UI. For the full feature list see
the [feature matrix](product/feature-matrix.md).

## Undo the last Git operation

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
- Not covered: staging, discarding, stashes and pushes. There is no redo.

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
