# Roadmap

Updated 2026-10-11. Status of individual features lives in the [feature matrix](product/feature-matrix.md);
this page orders what comes next. Items are proposals until a maintainer accepts them.

## 0.1 — current (done)

Local Git workflow end to end on Windows: tabs, history graph, changes with line staging, commit,
branches/remotes/tags, merge/rebase/interactive rebase/cherry-pick/revert/reset, stash, conflict
workspace, worktrees, submodules, bisect, git-flow, reflog recovery, blame/file history/tree,
command palette, themes, settings, encrypted hosting tokens with GitHub/GitLab/Bitbucket/Azure
provider implementations (unverified against live services), packaging configuration.

## 0.2 — verify and harden (next)

1. **Cross-platform verification**: run unit, integration and E2E suites on macOS and Linux in CI;
   fix path, watcher and terminal-launch differences; build and smoke-test dmg/AppImage/deb.
2. **Live hosting verification** with test accounts on GitHub, GitLab, Bitbucket Cloud and Azure
   DevOps (PR list/detail/checks, checkout, repo list); promote from Experimental when verified.
3. **Git LFS** verification on a machine with git-lfs installed.
4. **Accessibility pass** with NVDA (Windows) and VoiceOver (macOS); high-contrast theme check.
5. Code signing for Windows and macOS (see [packaging](packaging.md)).
6. More E2E coverage: interactive rebase editor, partial line staging through the UI, clone dialog
   against a local bare remote, settings persistence of shortcuts.

## 0.3 — Workflow improvements

- Undo for recent local operations built on the reflog.
- Commit graph: column-width preferences, collapsed merge branches, "show only first parent".
- Blame "ignore whitespace / ignore revisions" and history of a line range (`git log -L`).
- Multi-repository operations (fetch all open repositories) and repository groups in tabs.
- Patch create/apply (`format-patch`, `am`) and archive export.
- Git hooks visibility and commit signing verification display (good/bad signature).
- OAuth device-flow sign-in for GitHub and GitLab (no client secrets), if a project OAuth app is
  registered.

## Later / exploratory

- Optional AI commit-message suggestions: off by default, user-provided endpoint and key, explicit
  preview before use, never sends content without consent.
- Stacked branches / dependent branch rebasing using `--update-refs` (Git ≥ 2.38 capability is already
  detected).
- Background `git maintenance`/commit-graph suggestions for large repositories (never applied
  without consent).
- Auto-update via a signed release channel.
