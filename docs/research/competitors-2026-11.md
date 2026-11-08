# Competitive research update: 2026-11-07

Extends `docs/research/fork.md` and `docs/research/competitors.md` (both dated 2026-10-11). New in this update: Fork releases after Mac 2.70 and Win 2.23, Sublime Merge, Tower, and the latest GitKraken Desktop, GitButler and GitHub Desktop releases.

Method: WebFetch of official pages, summarised by a fetch model. Items marked **[Uncertain]** were not confirmed in fetched content. Release pages on GitHub do not show years; "2026" is inferred from ordering and the page footer.

## Sources

| URL | Product | Version / date | Platform | Status |
|---|---|---|---|---|
| https://git-fork.com/releasenotes | Fork | 2.71 (23 Oct 2026), 2.70 (4 Sep 2026) | macOS | Loaded |
| https://git-fork.com/releasenoteswin | Fork | 2.24 (6 Nov 2026), 2.23 (25 Sep 2026) | Windows | Loaded |
| https://git-fork.com/ | Fork | Home page still advertises Mac 2.66.7 / Win 2.21.1, $59.99 | Both | Loaded (stale) |
| https://www.sublimemerge.com/ | Sublime Merge | Feature list | All | Loaded |
| https://www.sublimemerge.com/download | Sublime Merge | Stable build 2132 (18 Sep 2026); changelog back to build 1055 | All | Loaded |
| https://www.sublimemerge.com/docs/ | Sublime Merge | Docs index (small: getting started, diff context, key bindings, custom commands, CLI) | All | Loaded |
| https://www.sublimemerge.com/docs/getting_started | Sublime Merge | Undated | All | Loaded |
| https://www.sublimemerge.com/docs/search | Sublime Merge | n/a | All | Failed (socket hang up; page may not exist) |
| https://www.sublimemerge.com/download_changelog | Sublime Merge | n/a | All | Failed (404) |
| https://www.git-tower.com/release-notes/mac | Tower | Mac 4.x to 18.0 (6 Oct 2026); page also contains Windows notes up to 15.0 (2 Nov 2026) | macOS, Windows | Loaded (chars 0 to 200k of 231k) |
| https://www.git-tower.com/release-notes/windows | Tower | Win 6.0 to 15.0 (2 Nov 2026) | Windows | Loaded (first 100k chars) |
| https://www.git-tower.com/features/undo | Tower | Undated | Both | Loaded |
| https://www.git-tower.com/features/all-features | Tower | Undated | Both | Loaded |
| https://www.git-tower.com/help/guides/workflows/stacked-branches/mac | Tower | Undated | macOS | Loaded |
| https://www.git-tower.com/help/guides/branches-and-tags/merge-conflicts/mac (and /windows) | Tower | Undated | Both | Seen only as search excerpts **[Uncertain]** |
| https://help.gitkraken.com/gitkraken-desktop/current/ | GitKraken Desktop | 12.6.1 (20 Oct 2026), 12.6.0, 12.5.0 (15 Sep 2026) | All | Loaded |
| https://github.com/gitbutlerapp/gitbutler/releases | GitButler | 0.23.0 (27 Oct), 0.23.1 (28 Oct), 0.23.2 (2 Nov) | All | Loaded |
| https://github.com/desktop/desktop/releases (pages 1 to 3) | GitHub Desktop | 3.6.1 (25 Jun) to 3.6.11-beta1 (3 Nov) | Win, macOS | Loaded |

## Fork: entries newer than fork.md

| Platform | Version / date | Change |
|---|---|---|
| Mac | 2.71, 23 Oct 2026 | Workspaces are per window; Cmd+click opens a workspace in a new window |
| Mac | 2.71 | Repository settings and issue tracker rules shared between worktrees (Win had this in 2.23) |
| Mac | 2.71 | Faster worktree removal; diff top shadow when scrolled; ssh.bitbucket.org host support |
| Mac | 2.71 | Fixes: double-click staged the wrong file; parent-repo link missing for submodules opened in a worktree |
| Win | 2.24, 6 Nov 2026 | Middle-click closes tabs in the vertical tabs sidebar, so Windows now has vertical tabs (fork.md had this as Uncertain) |
| Win | 2.24 | Hatch pattern on side-by-side diff alignment lines; dark system menu; faster worktree removal; ssh.bitbucket.org |
| Win | 2.24 | Fixes: wrong line numbers in **Hunk History**; saving unstaged new files as a patch; local issue tracker rules not read in worktrees |
| Both | Mac 2.70 / Win 2.23 | Cherry-pick, revert (and on Win, bisect) state not detected with the **reftable** ref backend (already in fork.md's window; a useful implementation note) |
| Home | Current | Home page has not been updated past Mac 2.66.7 / Win 2.21.1 |

## (a) Review and commit

| Product | Behavior | Source | Version |
|---|---|---|---|
| Sublime Merge | Stage a whole file, one hunk, or selected lines ("Stage lines") | sublimemerge.com/docs/getting_started | Undated |
| Sublime Merge | Amend via the commit button dropdown ("Amend Previous Commit") | docs/getting_started | Undated |
| Sublime Merge | Structured history search: `commit:`, `contents:`, `branch:`, `tree`, `before`/`after`, `is-visible`; combine with and/or/not and parentheses; autocomplete and history dropdown | sublimemerge.com/download changelog | builds 1065, 1084, 2020, 2025, 2032, 2063, 2068, 2091 |
| Sublime Merge | Example query mixes `min-parents:2`, `author:`, `path:` | Search excerpt of official docs | **[Uncertain]**, search page did not load |
| Sublime Merge | Path, file and contents queries exclude merge commits | download changelog | build 1084 |
| Sublime Merge | Line-restricted file history search | download changelog | fix in build 1116 |
| Sublime Merge | Blame: Enter jumps to the originating commit; `smerge blame` CLI starts from HEAD | download changelog | builds 2121, 1092 |
| Sublime Merge | Configurable `diff_algorithm` (defaults to Git's setting), used by search and blame | download changelog | builds 2091, 2096 |
| Tower | Stage whole files, parts of files, or single lines; blame; file history | git-tower.com/features/all-features | Undated |
| Tower | Syntax highlighting in diffs and Blame, word-level change highlighting | Tower release notes | Win 15.0, 2 Nov 2026 |
| Tower | Combined diff when several commits are selected in History | Tower release notes | Win 14.1, 6 Oct 2026 |
| Tower | Quick amend shortcut | Tower release notes | Win 8.3, Dec 2024 |
| Tower | AI commit messages with custom prompts | Tower release notes | Mac 16.0 / 16.0.1, May 2026 |
| Tower | `gittower` CLI that can open blame, branch review and PRs, intended for handing agent work back for review | Tower release notes | Mac 18.0, 6 Oct 2026 |
| GitKraken | Selecting consecutive commits shows combined changes; can include uncommitted changes when the newest commit is selected | help.gitkraken.com current | 12.6.0, Oct 2026 |
| GitKraken | Staging a rename keeps it as a rename rather than delete plus add | help.gitkraken.com current | 12.6.1, 20 Oct 2026 |
| GitKraken | Staging a file name containing `[` or `*` no longer stages other matching files (pathspec-literal bug) | help.gitkraken.com current | 12.5.0, 15 Sep 2026 |
| Fork | Hunk History view exists (line-number fix) | git-fork.com/releasenoteswin | Win 2.24, 6 Nov 2026 |
| GitButler | Fix: commits and amends disturbed staged files | GitButler releases | 0.23.2, 2 Nov |

## (b) Branches and remotes

| Product | Behavior | Source | Version |
|---|---|---|---|
| Sublime Merge | Per-branch ahead/behind counters; clicking them pushes or pulls | download changelog | builds 1070, 2047 |
| Sublime Merge | "Diverged" banner with command tooltips and a Hard Reset option | download changelog | build 1103 |
| Sublime Merge | Push menu offers `--set-upstream`; Set/Unset Upstream commands; honours `push.default`, `pushDefault`, `pushRemote`, `branch.<name>.merge` | download changelog | builds 2020, 2025, 2032, 2068, 2071, 2121, 2123 |
| Sublime Merge | Branches with invalid tracking info are shown faded | download changelog | build 2083 |
| Sublime Merge | Docs recommend `--force-with-lease` after editing pushed commits | docs/getting_started | Undated |
| Tower | Force Push with Lease; a dedicated force-push toolbar button | Tower release notes | Mac 6.3 (Feb 2021), 6.4 (Mar 2021); Win 3.2 (May 2022) |
| Tower | Sync button: pull then push the HEAD branch; unsynced commits are shown | Tower release notes, all-features | Mac 10.2 (Nov 2023), Win 8.0 |
| Tower | Branch Review workspace compares branches against a base; "Fully Merged" detection that catches squash and rebase merges, with hints and links to evidence | Tower release notes | Win 14.0 (15 Sep 2026), Mac 17.0 (16 Jul 2026) |
| Tower | Automatic Branch Management: archive stale and merged branches; pinned branches | Tower release notes | Win 13.0 (Jul 2026), Mac 15.0 (Nov 2025) |
| Tower | Fork-point indication in History | Tower release notes | Win 13.2 (Aug 2026), Mac 15.0 |
| Tower | Stacked branches with parent tracking; "needs restacking" icon; Restack rebases each child onto its parent; Graphite integration | Tower help (stacked-branches), release notes | Mac 12.0 (Sep 2024); default-on in Win 11.0 (Feb 2026); stack flags moved to Git config in Mac 17.1 **[Uncertain on exact storage]** |
| Tower | Stack tracking repair ("Reset Tracking") and diverged-stack detection | Tower release notes | Win 12.2, 8 Jun 2026 |
| GitKraken | Fast-forward and merge no longer offered for remote branches behind the checked-out branch | help.gitkraken.com current | 12.6.0 |
| GitButler | `but push --dry-run` lists every branch that would be pushed; fix for pushing when target has no upstream | GitButler releases | 0.23.1, 28 Oct |
| GitHub Desktop | Per-repository account for HTTPS auth, separate from author identity | desktop/desktop releases | 3.6.11-beta1, 3 Nov |
| GitHub Desktop | Branch, remote and tag names starting with `-` work in fetch, push, checkout, merge, rebase, worktree ops | desktop/desktop releases | 3.6.7, 14 Oct |
| Fork | Branch filter in Push, Pull and Track dropdowns | git-fork.com/releasenoteswin | Win 2.23 (already in fork.md) |

## (c) History editing

| Product | Behavior | Source | Version |
|---|---|---|---|
| Sublime Merge | Context menu: Edit Commit Message, Edit Commit Contents (stops a rebase; Continue/Abort rebase buttons) | docs/getting_started; changelog | build 1092 |
| Sublime Merge | Move Commit Up / Down, Drop Commit, Squash Selected Commits, Fixup Commits, drop multiple commits | download changelog | builds 1079, 1084, 1092 |
| Sublime Merge | Edited commits are signed; edits work on detached HEAD and in worktrees | download changelog | builds 2047, 1092, 1116 |
| Sublime Merge | Interactive rebase supports `break` | download changelog | build 2047 |
| Sublime Merge | "Rebase Commit" in context menu for any commit; rebase branch preview | download changelog | builds 1116, 2068 |
| Tower | Interactive rebase by drag and drop; drag to merge, cherry-pick or squash commits | all-features; release notes | Mac 12.5.1 (Feb 2025) drag feedback badges |
| Tower | Autosquash support | Tower release notes | Mac 7.0 (Jul 2021), fixes in 16.0 |
| Tower | Rebase Onto; edit merge messages during rebase | Tower release notes | Mac 5.2 (2020); Win 4.1 |
| GitButler | TUI: multi-commit squash and hunk-level actions on committed changes | GitButler releases | 0.23.0, 27 Oct |
| GitKraken | Undo/redo of reset and rebase on detached HEAD kept in history | help.gitkraken.com current | 12.6.0 / 12.6.1 |
| Fork | Crash fix: Interactive Rebase from the root commit in large repos | git-fork.com/releasenoteswin | Win 2.23 |

## (d) Conflicts and recovery

| Product | Behavior | Source | Version |
|---|---|---|---|
| Sublime Merge | Three-column merge tool (Ours, Merged, Theirs), optional Base; Take Left/Right; Save and Stage | docs/getting_started; changelog | builds 1107, 1116 |
| Sublime Merge | Resolve Ours/Theirs dropdown; warning when saving with unresolved conflicts; warning when exiting the merge tool | download changelog | builds 2020, 2047 |
| Sublime Merge | Standalone merge tool via `smerge` CLI | download changelog | build 1107 |
| Sublime Merge | Reset option to keep local changes (`--keep`-style) | download changelog | build 2132, 18 Sep 2026 |
| Sublime Merge | Cherry-pick multiple commits with option to skip empty commits | download changelog | build 2130, 14 Sep 2026 |
| Sublime Merge | Stash with message, `--staged` stash, drop, delete all stashes | download changelog | builds 1065, 2038, 2047, 2077 |
| Sublime Merge | No undo or reflog feature found in changelog | download changelog | **[Uncertain]** absence |
| Tower | Undo (Cmd/Ctrl+Z) and Redo (Shift+Cmd/Ctrl+Z) for: deleting files, stage/unstage, discarding chunks/files, commits, create/checkout/delete branch, merge, rebase and interactive rebase, publish, save/delete/apply stash | git-tower.com/features/undo | Mac 4.0; Win 4.0 (Sep 2022) |
| Tower | Conflict detection before merge, rebase or pull; new Merge UI with conflict counts and rebase steps | Tower release notes | Mac 9.0, 26 Jul 2022 |
| Tower | Conflict wizard: two sides above, result below; pick a side or open a merge tool; reset a resolved file back to unmerged; Abort returns to pre-merge state | Tower help (merge-conflicts) | **[Uncertain]** (search excerpts only) |
| Tower | Wizard can resolve "both deleted" conflicts again; Merge Wizard labels sides with branch name and modified time | Tower release notes / search excerpt | Mac 9.3 (May 2023); 15.0 fix **[Uncertain version]** |
| Tower | Auto-stash for merges; snapshots; partial stash (including by dragging files onto a stash) | Tower release notes | Mac 9.1 (Nov 2022), 9.0, 4.3, 16.0 (May 2026); Win 6.0 |
| Tower | Reflog view (Cmd+6) to restore lost commits or branches | Tower search excerpt; all-features | **[Uncertain]** shortcut |
| Tower | Restack pauses on conflicts and lists conflicting files; Sync restacks only branches that will not conflict | Tower help (via search) | **[Uncertain]** |
| GitKraken | Undo/redo of dropping HEAD now asks whether to stash uncommitted changes first | help.gitkraken.com current | 12.5.0, 15 Sep 2026 |
| GitKraken | Undoing a discard no longer stashes other staged files | help.gitkraken.com current | 12.6.0 |
| GitKraken | Faster resolution of merges with many added and deleted files | help.gitkraken.com current | 12.6.0 / 12.6.1 |
| GitHub Desktop | Copilot conflict resolution: handles delete-vs-modify; Continue disabled until skipped files are resolved; does not overwrite manual resolutions | desktop/desktop releases | 3.6.4-beta1, 21 Jul |
| GitHub Desktop | Menu items re-enabled after cancelling a rebase from the "local changes overwritten" dialog | desktop/desktop releases | 3.6.5, 4 Sep |
| Fork | Cherry-pick, revert and bisect state not detected with reftable (fixed) | Fork RN | Mac 2.70, Win 2.23 |

## (e) Advanced

| Product | Behavior | Source | Version |
|---|---|---|---|
| Fork | Repository settings shared across worktrees (now on Mac too); faster worktree removal; submodule parent link in worktrees | Fork RN | Mac 2.71, Win 2.24 |
| Sublime Merge | Worktree management in the Locations bar | download changelog | build 2130, 14 Sep 2026 |
| Sublime Merge | Submodules in Locations bar with HEAD, counts, add, init/update/sync, Initialize All, Open Submodule; non-absorbed submodules | download changelog | builds 1075, 2020, 2071, 2079 |
| Sublime Merge | No branch-compare feature; selecting several commits diffs first to last | docs/getting_started | Undated |
| Tower | Worktrees: create, check out, manage; drag a branch onto the Worktrees group to create one; "Repair Worktree" for moved folders | Tower release notes | Mac 12.5 (Feb 2025), 12.5.1; Win 9.0 (Mar 2025), 14.1 (Oct 2026) |
| Tower | Compare Branches with conflict count and popover listing conflicting paths | Tower release notes | Mac 8.0 (Feb 2022); Win 6.0 (Mar 2024) |
| Tower | Submodules: fetch, update, open, manage | all-features | Undated |
| GitKraken | Worktree folder name shown under branch when different; more than one coding agent per worktree | help.gitkraken.com current | 12.6.1 |
| GitButler | Works in any Git repo without switching to `gitbutler/workspace`; linked worktrees supported | GitButler releases | 0.23.0, 27 Oct |
| GitButler | Experimental native app with integrated terminals and a commit graph | GitButler releases | 0.23.1 / 0.23.2 |
| GitHub Desktop | Worktree support (main/linked groups, fallback to main if linked folder deleted, "Always show worktree list"); release that introduced it not found, likely 3.6.0 | desktop/desktop releases | 3.6.2 to 3.6.8 **[Uncertain origin]** |

## Most implementable behaviors for a Git-CLI client

1. **Undo/redo for common operations, built on reflog plus saved state.** Before each mutating command, record HEAD, refs and a stash snapshot; undo with `git reset`/`update-ref`. Cover stage, discard, commit, branch create/delete, merge, rebase and stash. (Tower Cmd+Z; GitKraken Ctrl+Z.) Ask before discarding uncommitted changes during undo, as GitKraken 12.5.0 does.
2. **Pre-flight conflict prediction** for merge, rebase, cherry-pick and pull using `git merge-tree --write-tree --name-only`. Show conflict count and paths before running. (Tower Mac 9.0; Compare Branches conflict count in Mac 8.0 / Win 6.0.)
3. **Branch compare view with ahead/behind commit lists** (`git rev-list --left-right A...B`, `git log A..B`), plus a combined diff. (Tower Compare Branches and Branch Review; Sublime ahead/behind counters.)
4. **Clickable ahead/behind badges** that push or pull, and a "diverged" banner with fetch-and-rebase, merge, or hard reset choices. This also covers the rejected-push case. (Sublime Merge builds 2047, 1103; Tower Sync.)
5. **Push honours Git config and states the destination:** `push.default`, `remote.pushDefault`, `branch.<b>.pushRemote`, `--set-upstream` toggle, `--force-with-lease` only, plus a dry-run preview (`git push --dry-run`). (Sublime Merge; Tower; GitButler 0.23.1.)
6. **Commit-list editing without a rebase todo editor:** Move Up/Down, Squash Selected, Fixup, Drop, Edit Message, Edit Contents (stop at commit), all as generated `git rebase -i` todos via `GIT_SEQUENCE_EDITOR`; support `break`; sign edited commits. (Sublime Merge builds 1079 to 2047; Tower drag-and-drop rebase.)
7. **Structured history search grammar:** `author:`, `path:`, `contents:` (`git log -G/-S`), `commit:`, `branch:`, `before:`/`after:`, `min-parents:`, with and/or/not and autocomplete. (Sublime Merge.)
8. **Conflict UI with operation-aware Continue/Abort**, a "reset file to unmerged" action (`git checkout -m <path>`), and a block on Continue while files are unresolved. (Tower wizard; GitHub Desktop 3.6.4-beta1; Sublime unresolved-save warning.)
9. **Restack for dependent branches:** store a parent per branch in Git config, flag children whose base moved, and restack with `git rebase --onto` or `--update-refs`, pausing on conflicts. (Tower stacked branches; GitButler stacks.)
10. **"Fully merged" detection that catches squash and rebase merges** (`git cherry`, or patch-id comparison of `git merge-tree` results), used to offer branch cleanup. (Tower Win 14.0, Mac 17.0.)
11. **Worktree management in the sidebar**, with repair (`git worktree repair`), fallback when a linked folder vanishes, and shared repo settings but per-worktree view settings. (Fork Mac 2.71 / Win 2.23; Tower Win 14.1; GitHub Desktop 3.6.3; Sublime build 2130.)
12. **Robustness details:** use literal pathspecs (GitKraken 12.5.0 bug with `[` and `*`); pass `--end-of-options` for names starting with `-` (GitHub Desktop 3.6.7); detect in-progress operation state with Git itself (for example `git rev-parse -q --verify CHERRY_PICK_HEAD`, `git rev-parse --git-path`) rather than reading `.git` files directly, and test against a reftable repo. Fork Mac 2.70 / Win 2.23 fixed this class of bug; the exact root cause is **[Uncertain]**.
