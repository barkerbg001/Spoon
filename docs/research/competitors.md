# Competitor Research: Desktop Git Clients

- **Research date:** 2026-10-11
- **Prepared for:** Spoon (Electron + React + TypeScript desktop Git client that shells out to the installed Git CLI)
- **Method:** Official websites, help centres, docs and source repositories were fetched on the research date. Every claim below is tagged:
  - **[Verified]** — seen in content fetched on 2026-10-11; the supporting source is cited by its short key (see Sources).
  - **[Uncertain]** — from prior knowledge, inference, or not confirmed by a fetched page. Treat it as a lead to check, not a fact.
  - **[Proposed]** — a recommendation for Spoon, not a claim about any product.
- Marketing pages change frequently, and pricing figures were partly stripped from fetched HTML. Re-verify anything commercially important before relying on it.

## Sources

### Loaded successfully

| Key | URL |
| --- | --- |
| GK-client | https://www.gitkraken.com/git-client |
| GK-pricing | https://www.gitkraken.com/pricing |
| GK-rebase | https://help.gitkraken.com/gitkraken-desktop/interactive-rebase/ |
| GK-worktrees | https://help.gitkraken.com/gitkraken-desktop/worktrees/ |
| GK-keys | https://help.gitkraken.com/gitkraken-desktop/keyboard-shortcuts/ |
| GK-lfs | https://help.gitkraken.com/gitkraken-desktop/git-lfs/ |
| GK-submodules | https://help.gitkraken.com/gitkraken-desktop/submodules/ |
| GK-themes | https://help.gitkraken.com/gitkraken-desktop/themes/ |
| GL-home | https://www.gitkraken.com/gitlens |
| GL-features | https://help.gitkraken.com/gitlens/gitlens-features/ |
| ST-home | https://www.sourcetreeapp.com/ |
| ST-enterprise | https://www.sourcetreeapp.com/enterprise |
| ST-support | https://support.atlassian.com/sourcetree/ |
| ST-start | https://confluence.atlassian.com/get-started-with-sourcetree |
| GHD-home | https://desktop.github.com/ |
| GHD-repo | https://github.com/desktop/desktop (minimal content returned) |
| GHD-readme | https://raw.githubusercontent.com/desktop/desktop/development/README.md |
| GHD-license | https://raw.githubusercontent.com/desktop/desktop/development/LICENSE |
| GHD-vision | https://raw.githubusercontent.com/desktop/desktop/development/docs/process/what-is-desktop.md |
| GHD-about | https://docs.github.com/en/desktop/overview/about-github-desktop |
| GHD-commit | https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop |
| GHD-history | https://docs.github.com/en/desktop/managing-commits/options-for-managing-commits-in-github-desktop |
| GHD-keys | https://docs.github.com/en/desktop/overview/github-desktop-keyboard-shortcuts |
| SG-home | https://www.smartgit.dev/ |
| SG-features | https://www.smartgit.dev/features/ |
| SG-pricing | https://www.smartgit.dev/purchase/ |
| SG-journal | https://docs.syntevo.com/SmartGit/Latest/Manual/GUI/Journal-View |
| SG-search | Web search results that quoted docs.syntevo.com pages (Standard-Window, Log, Graph-View, 23.1 Local-Operations-on-the-Working-Tree). These were search excerpts, not full fetches. |
| GE-home | https://gitextensions.github.io/ |
| GE-readme | https://raw.githubusercontent.com/gitextensions/gitextensions/master/README.md |
| GE-license | https://raw.githubusercontent.com/gitextensions/gitextensions/master/LICENSE.md |
| GE-manual | https://git-extensions-documentation.readthedocs.io/en/main/ |
| GB-home | https://gitbutler.com/ |
| GB-downloads | https://gitbutler.com/downloads |
| GB-docs | https://docs.gitbutler.com/ |
| GB-parallel | https://docs.gitbutler.com/features/branch-management/virtual-branches |
| GB-stacked | https://docs.gitbutler.com/features/branch-management/stacked-branches |
| GB-conflicts | https://docs.gitbutler.com/features/branch-management/merging |
| GB-oplog | https://docs.gitbutler.com/features/timeline |
| GB-repo | https://github.com/gitbutlerapp/gitbutler (repository description only) |
| GB-license | https://raw.githubusercontent.com/gitbutlerapp/gitbutler/master/LICENSE.md |
| GA-site | https://gitahead.github.io/gitahead.com/ |
| GA-readme | https://raw.githubusercontent.com/gitahead/gitahead/master/README.md |
| GA-license | https://raw.githubusercontent.com/gitahead/gitahead/master/LICENSE.md |
| GA-releases | https://github.com/gitahead/gitahead/releases |

### Failed or unusable

- https://docs.smartgit.dev/smartgit/latest/ returned HTTP 500.
- https://docs.smartgit.dev/smartgit/25.1/ returned HTTP 500.
- https://docs.syntevo.com/SmartGit/Latest/Manual/Local-Operations-on-the-Working-Tree returned HTTP 404.
- https://help.gitkraken.com/gitkraken-desktop/undo-redo/ returned HTTP 404.
- https://help.gitkraken.com/gitkraken-desktop/merge-conflict-resolution-tool/ returned HTTP 404.
- https://help.gitkraken.com/gitkraken-desktop/gitkraken-desktop-faq/ returned HTTP 404.
- https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/addressing-merge-conflicts returned HTTP 404.
- https://product-downloads.atlassian.com/software/sourcetree/windows/ga/ReleaseNotes_3.4.html returned Access Denied.
- The GitHub HTML repository pages (desktop/desktop, gitbutlerapp/gitbutler) returned only a stub. Raw files were used instead.

---

## 1. GitKraken Desktop

**Licence and pricing.** GitKraken Desktop is free for local repositories and public remotes, with a 14-day trial of paid features **[Verified, GK-client, GK-pricing]**. The paid tiers are:

- **Pro:** adds private repos, Jira Cloud/Trello integration, conflict detection, Launchpad and shared Cloud Workspaces, with a maximum of 2 seats **[Verified, GK-pricing]**.
- **Advanced:** adds self-hosted and enterprise integrations, SAML SSO and Team Launchpad, up to 10 seats **[Verified, GK-pricing]**.
- **Business/Enterprise:** higher tiers exist **[Uncertain]**.

The dollar figures did not survive the HTML extraction, so prices are unconfirmed. An on-premise edition is sold either as a self-hosted Docker server or as a serverless licence-file version **[Verified, GK-client]**. The product is closed source **[Uncertain — not stated on fetched pages, but no source repository is published]**.

**Platforms.** macOS, Windows and Linux **[Verified, GK-client]**. It is built on Electron **[Uncertain]**.

**Repository management.** It uses tabs for multiple repos (Ctrl+T, Ctrl+1–9), opens repos from a command palette, and supports multiple profiles (Pro) and Workspaces that group repos **[Verified, GK-keys, GK-pricing]**.

**Commit graph and history.** The visual Commit Graph is the core of the product. It includes commit search, file blame and file history views **[Verified, GK-client, GK-keys]**. Each worktree with pending changes gets its own WIP node in the graph **[Verified, GK-worktrees]**.

**Staging.** You can stage or unstage a file with the S and U keys, stage everything with Ctrl+Shift+S, and use "stage all and commit" **[Verified, GK-keys]**. Hunk and line staging exist **[Uncertain]**.

**Diff viewer.** The diff view covers past changes, blame and history, and lets you edit code directly in the diff **[Verified, GK-client]**. Ctrl+D opens the diff or merge tool **[Verified, GK-keys]**.

**Branches and remotes.** Create a branch with Ctrl+B and fetch all with Ctrl+L **[Verified, GK-keys]**. Dragging one branch onto another offers merge/rebase actions **[Verified, GK-rebase]**.

**Conflict resolution.** There is a built-in merge tool plus AI auto-resolution, which explains its suggestions and gives a confidence level. Conflict detection (Pro) warns you when teammates who also use GitKraken edit the same area of the code **[Verified, GK-client, GK-pricing]**.

**Interactive rebase and undo.** The rebase view supports pick, reword, squash and drop, with P/S/R/D keyboard shortcuts and a Reset button. It has several limitations **[Verified, GK-rebase]**:

- No merge commits on the source branch.
- Neither branch may contain the repository's initial commit.
- A rebase started in GitKraken must be completed in GitKraken.

The app has global Undo/Redo (Ctrl+Z / Ctrl+Y) **[Verified, GK-keys]**. Exactly which operations can be undone was not confirmed, because the undo help page returned 404 **[Uncertain]**.

**Worktrees, submodules and LFS.**

- **Worktrees** (since version 10.5.0): create, open (optionally in a new tab), lock/unlock, and "remove worktree and delete branch". New worktrees inherit the source repo's hidden and soloed refs **[Verified, GK-worktrees]**.
- **Submodules:** a dedicated Submodules pane supports add, init-after-clone prompts, update, pointer updates and auto-update settings. Git subtree is not supported **[Verified, GK-submodules]**.
- **LFS:** you can initialise LFS, add track patterns from the WIP panel, and run pull/prune from a toolbar menu. LFS requires the system Git (2.39.3 or later) and Git LFS (3.0 or later). The LFS help page states that GitKraken does not usually need the system Git for basic use, which suggests it has its own Git implementation **[Verified, GK-lfs]**.

**Hosting integrations.** GitHub, GitLab, Bitbucket and Azure DevOps are supported. Enterprise and self-hosted variants require Advanced. Launchpad gathers PRs and issues, and you can act on GitHub PRs inside the app **[Verified, GK-client, GK-pricing]**.

**Keyboard workflows.** These are extensive **[Verified, GK-keys]**:

- Ctrl+/ opens the shortcut list.
- J/K/H/L move through the graph, Vim-style.
- Shift+J/K moves within a branch.
- Ctrl+P opens the command palette and Ctrl+Shift+H opens file history/blame search.
- Alt+T opens the terminal, and there are panel toggles.

**Themes, accessibility and performance.** Built-in light/dark themes can follow the system setting. Custom JSONC themes have been **disabled since 11.8.0** during a UI modernisation **[Verified, GK-themes]**. Accessibility support was not documented on the fetched pages **[Uncertain]**.

**Distinguishing features.** An "Agent Sessions" view starts coding agents (Claude Code, Codex, Copilot CLI and others) in fresh worktrees and tracks them **[Verified, GK-client, GK-worktrees]**. Other features include the Commit Composer (AI history restructuring), AI commit messages and explanations, Cloud Patches, an integrated terminal, and an MCP server **[Verified, GK-client, GK-pricing]**.

---

## 2. Sourcetree (Atlassian)

**Licence and pricing.** Free **[Verified, ST-home]**. It is proprietary and closed source **[Uncertain]**. An Atlassian/Bitbucket account may be needed at setup **[Uncertain]**. The enterprise edition lets users sign in with Bitbucket Data Center credentials **[Verified, ST-enterprise]**.

**Platforms.** Windows and macOS only **[Verified, ST-home]**. Enterprise MSI installs support silent deployment and centrally managed updates **[Verified, ST-enterprise]**.

**Repository management.** It supports Git and Mercurial **[Verified, ST-home]**, and a remote repository manager can search hosted repos and clone them **[Verified, ST-home]**.

**Commit graph and history.** It shows branching diagrams and local search across commits, file changes and branches **[Verified, ST-home]**.

**Staging.** You can stage or discard changes by file, hunk or line **[Verified, ST-home]**.

**Diff viewer.** It has an integrated changeset view **[Verified, ST-home — "review changesets"]**. It also supports external diff and merge tools **[Uncertain]**.

**Branches and remotes.** Git-flow is built in, along with cherry-pick and stash **[Verified, ST-home]**.

**Conflict resolution.** It relies mainly on external merge tools and has "resolve using mine/theirs" actions **[Uncertain]**.

**Interactive rebase and undo.** There is an interactive rebase tool **[Verified, ST-home]**. No dedicated undo or operation log was documented on fetched pages **[Uncertain]**.

**Worktrees, submodules and LFS.** Git LFS and submodules are supported **[Verified, ST-home]**. Worktree support is not advertised **[Uncertain — probably absent]**.

**Hosting integrations.** It is built around Bitbucket (Cloud and Data Center), and GitHub/GitLab accounts can be added **[Verified for Bitbucket, ST-home/ST-enterprise; Uncertain for others]**.

**Keyboard workflows, themes and performance.** Not documented in fetched content **[Uncertain]**. It is widely reported to slow down on large repositories, and the Windows and Mac versions are separate codebases **[Uncertain]**.

**Distinguishing features.** It has Mercurial support, Git-flow, a Windows enterprise deployment story, and a beta programme **[Verified, ST-home, ST-enterprise]**. Bug and suggestion tracking is split per platform on Atlassian's support site **[Verified, ST-support]**.

---

## 3. GitHub Desktop

**Licence and pricing.** Free and open source under the **MIT** licence **[Verified, GHD-license, GHD-about]**. The README states that the MIT grant does **not** cover GitHub trademarks or logos (the Invertocat designs in `app/static/logos`) **[Verified, GHD-readme]**.

**Platforms and stack.** It officially supports Windows and macOS, including Apple silicon, Windows ARM64 beta builds, and an MSI for machine-wide installs. Linux builds exist only through the community `shiftkey/desktop` fork **[Verified, GHD-readme, GHD-about]**. It is written in Electron, TypeScript and React, the same stack as Spoon **[Verified, GHD-readme]**.

**Product philosophy.** It aims to extend GitHub to the desktop rather than be a host-agnostic client, and prioritises beginners over advanced users when the two conflict **[Verified, GHD-vision]**. This is a deliberate gap Spoon can fill.

**Repository management.** You can add, clone or create repos and switch repos with Ctrl+T **[Verified, GHD-keys]**.

**Commit graph and history.** It shows a History tab (Ctrl+2) **[Verified, GHD-keys]**. There is no visual branch graph **[Verified via competitor claim on GK-client; consistent with prior knowledge]**.

**Staging and partial commits.** It does not expose a separate staging area. Instead, each file has a checkbox, and you click individual lines to include or exclude them from the commit **[Verified, GHD-commit]**. You can discard individual added lines, and discarded changes are saved to the OS Trash for recovery **[Verified, GHD-commit]**.

**Diff viewer.** Unified or split mode, a hide-whitespace option, configurable tab size, expandable context, and "Expand Whole File" **[Verified, GHD-commit]**.

**Branches and remotes.** Shortcuts exist for create, rename, delete, "update from default branch", compare and merge **[Verified, GHD-keys]**. It warns you before committing to a protected branch and enforces rulesets **[Verified, GHD-commit]**.

**Conflict resolution.** It shows a conflicts dialog and hands off to an editor or merge tool **[Uncertain — docs page 404]**.

**History editing and recovery.** Supported operations are: undo commit, reset to commit, amend, revert, cherry-pick, reorder and squash, mostly by drag and drop **[Verified, GHD-history, GHD-home]**. Stashing is supported **[Verified, GHD-home]**. There is no general operation-level undo **[Uncertain]**.

**Worktrees, submodules and LFS.** Basic LFS and submodule awareness exist **[Uncertain]**. Worktree management is not documented **[Uncertain]**.

**Hosting integrations.** Deep GitHub and GitHub Enterprise integration: built-in authentication, PR checkout, check status and re-runs, and create-PR/issue actions **[Verified, GHD-about, GHD-commit]**. It can generate Copilot commit messages that respect repository custom instructions **[Verified, GHD-commit]**. You can bypass commit hooks per commit **[Verified, GHD-commit]**.

**Keyboard workflows.** There is a full documented shortcut table for each OS. Space toggles file inclusion, Ctrl+Enter commits, and Ctrl+8/9 resize panes **[Verified, GHD-keys]**.

**Themes, accessibility and performance.** Light/dark/system themes and zoom are available **[Verified for zoom, GHD-keys; Uncertain for themes]**. The team has put notable accessibility work into the app **[Uncertain]**.

**Distinguishing features.** It is approachable, uses drag and drop for history editing, and has an MIT codebase on Spoon's own stack.

---

## 4. SmartGit (syntevo)

**Licence and pricing.** Commercial, proprietary software **[Verified, SG-pricing]**:

- **Free licences:** Hobby (non-commercial use, registration required, no enterprise integrations), Students & Education, and Open Source & Charities.
- **Commercial licences:** from $5 per user per month, or a perpetual licence with 1–3 years of updates. Each user can install on up to five machines.
- **Organisations:** an on-prem licence server is available.

**Platforms.** Windows, macOS and Linux **[Verified, SG-home]**. It is built on Java/SWT **[Uncertain]**.

**Repository management.** It offers three window styles **[Verified, SG-features, SG-search]**:

- **Standard:** a simplified window for best practices and Feature Flow.
- **Log:** full graph and history.
- **Working Tree:** a repositories/files/journal layout.

**Commit graph and history.** The customisable graph can filter by author or path and shows what is pushed versus pending **[Verified, SG-features]**. The Journal view shows a linear history of the current branch with colour-coded categories **[Verified, SG-journal]**:

- outgoing (ahead) commits;
- incoming commits;
- commits rewritten by a rebase;
- an "auxiliary branch" you can overlay.

The graph filter searches the repository incrementally **[Verified, SG-search]**.

**Staging.** Index and working tree are handled separately, and hunk staging is available **[Uncertain]**.

**Diff viewer.** A Changes view shows diffs for the selected file **[Verified, SG-search]**. Side-by-side view and in-diff editing are available **[Uncertain]**.

**Branches and remotes.** Guided Git Flow, Feature Flow and GitHub Flow workflows are built in **[Verified, SG-features]**. Refs and HEAD can be moved by drag and drop in the graph **[Verified, SG-search]**.

**Conflict resolution.** The Conflict Solver uses a three-way side-by-side layout with one-click resolutions, and external tools are optional **[Verified, SG-features]**.

**Interactive rebase and undo.** In the Journal or Graph you can split, squash, reorder (by drag and drop) and edit the message of any local commit **[Verified, SG-features, SG-search]**. "Undo Last Commit" moves the commit's contents back to the index **[Verified, SG-search (23.1 docs excerpt)]**. "Drag & Drop Undo" is advertised **[Verified, SG-home]**, but its details were not confirmed **[Uncertain]**.

**Worktrees, submodules and LFS.** LFS is supported **[Verified, SG-features]**. Search excerpts described submodule operations in the Repositories view and LFS locking, but these were not fully fetched **[Uncertain]**. Worktree support is unconfirmed **[Uncertain]**.

**Hosting integrations.** GitHub (including Enterprise) PRs, GitLab, Bitbucket, Azure DevOps, Jira and Gerrit **[Verified, SG-features, SG-home]**. It also supports Git Notes **[Verified, SG-home]**.

**Keyboard workflows, themes and accessibility.** Not confirmed (the docs site returned 500) **[Uncertain]**.

**Distinguishing features.** The Distributed Reviews add-on supports offline code review **[Verified, SG-features]**. Other features are commit-message spell checking **[Verified, SG-features]** and European (German) data residency positioning **[Verified, SG-home]**.

---

## 5. Git Extensions

**Licence and pricing.** Free under **GPL-3.0** **[Verified, GE-license]**. It is funded by OpenCollective backers **[Verified, GE-readme]**. Its icons come from Yusuke Kamiyamane under CC BY 3.0 **[Verified, GE-readme]**.

**Platforms and stack.** The upcoming version is **Windows-only**, built on .NET Desktop 10 and C# 14. The latest official release is v7.2.1 **[Verified, GE-readme]**. The website still mentions Mono-based multi-platform support for version 2.x, which is historical **[Verified, GE-home]**.

**Repository management.** A dashboard handles create, open and clone, and repos can be organised into categories **[Verified, GE-manual]**. It integrates with Windows Explorer and Visual Studio, and a VS Code extension exists **[Verified, GE-readme, GE-home]**.

**Commit graph and history.** The revision graph highlights the commits contained in the current revision **[Verified, GE-home]**. It also offers quick search, filters, reflog, file history with automatic rename tracking, and blame with drill-down **[Verified, GE-home, GE-manual]**.

**Staging.** You can stage selected lines **[Verified, GE-manual]**.

**Diff viewer.** The diff viewer and blame viewer have their own settings **[Verified, GE-manual]**.

**Branches and remotes.** Covers orphan branches, advanced merge options, rebase onto, PuTTY/OpenSSH key handling and Git Credential Manager **[Verified, GE-manual]**.

**Conflict resolution.** The manual has a "Handle merge conflicts" section **[Verified, GE-manual]**. It works mainly through external merge tools such as KDiff3 **[Uncertain]**.

**Interactive rebase and recovery.** Interactive rebase, autosquash, edit/reword, "modify an older commit", cherry-pick and revert are supported. For recovery there is **"Recover lost objects"** plus reflog **[Verified, GE-manual]**.

**Worktrees, submodules and LFS.** The manual has Worktrees and Submodules chapters **[Verified, GE-manual]**. LFS handling is unconfirmed **[Uncertain]**.

**Hosting integrations.** A GitHub plugin can view and create PRs and add an upstream remote; there is also Gerrit Code Review integration and build server integration **[Verified, GE-manual]**.

**Keyboard workflows.** Hotkeys are configurable, user scripts are supported, and there is a command-line interface **[Verified, GE-manual]**.

**Themes, accessibility and performance.** User-defined themes, colour and font settings, and Transifex translations **[Verified, GE-readme, GE-manual]**.

**Distinguishing features.** A plugin system (statistics, Gource, finding large files, deleting obsolete branches, periodic background fetch) and a maintenance toolset (compressing the Git database, fixing user names) **[Verified, GE-manual]**.

---

## 6. GitButler

**Licence and pricing.** The licence is **FSL-1.1-MIT (Functional Source License)** **[Verified, GB-license]**:

- Use, modification and redistribution are allowed for any purpose *except a Competing Use*, meaning a commercial product that substitutes for GitButler or offers substantially similar functionality.
- Each released version automatically becomes available under MIT on the **second anniversary** of its release.

The client is free to download **[Verified, GB-downloads]**. Any paid tiers or cloud features are unconfirmed **[Uncertain]**.

**Platforms and stack.** Tauri, Rust and Svelte **[Verified, GB-repo]**. Builds are available for macOS (Apple silicon and Intel), Linux (.deb, .rpm, x86-64 and ARM64) and Windows (MSI). The latest release is 0.22.3, dated 29 August 2026 **[Verified, GB-downloads]**. It ships both a desktop GUI and a `but` CLI, and a TUI is in development **[Verified, GB-docs, GB-downloads]**.

**Repository management.** It layers onto existing Git repos and remotes with no configuration **[Verified, GB-home]**.

**Commit graph and history.** Instead of a traditional graph, it offers a "Smartlog" that summarises active branches **[Verified, GB-home]**.

**Staging.** **Parallel branches** apply several branches to one working directory at once. Each branch is a lane with its own staging area, and you drag changes between lanes **[Verified, GB-parallel]**.

**Diff viewer.** Not documented on fetched pages **[Uncertain]**.

**Branches and remotes.** **Stacked branches** can be published as stacked PRs. It uses native GitHub stacked PRs when available, and otherwise falls back to ordinary PRs/MRs with the stack information kept in their descriptions **[Verified, GB-stacked]**. GitHub, GitLab and Bitbucket appear in the release notes **[Verified, GB-downloads]**, and there is a Gerrit mode **[Verified, GB-home]**.

**Conflict resolution.** When a rebase hits a conflict, the commit is stored as a "conflicted commit" and the rebase **continues** instead of stopping. You later resolve the conflict in a dedicated edit mode, and you can cancel back to your previous state **[Verified, GB-conflicts]**.

**History editing and undo.** Absorb, reorder, amend, split, squash and uncommit are supported **[Verified, GB-home]**. **Operations history** snapshots the full state into the Git object database before major actions, and any entry can be reverted. It also takes opportunistic snapshots of recently changed uncommitted files **[Verified, GB-oplog]**.

**Worktrees, submodules and LFS.** Worktree management is advertised as fast **[Verified, GB-home]**. Submodule and LFS support are unconfirmed **[Uncertain]**.

**Keyboard workflows and AI.** It has a JSON output mode, idempotent CLI commands, agent skills, and Cursor hook integration **[Verified, GB-home]**.

**Themes, accessibility and performance.** Not documented on fetched pages **[Uncertain]**.

**Distinguishing features.** It is a rethink of the Git workflow rather than a front-end for plain Git, and it is positioned strongly for AI coding agents **[Verified, GB-home]**.

---

## 7. GitAhead

**Licence and status.** **MIT**, copyright Scientific Toolworks (SciTools, 2018) **[Verified, GA-license, GA-readme]**. It is **no longer under active development**. Only low-level maintenance and bug-fix releases continue, and the maintainers suggest a rebranded fork for anything beyond trivial changes **[Verified, GA-readme, GA-site]**.

**Platforms and stack.** It is written in C++11 with Qt (5.9 or later; v2.7.0 moved to Qt 6.6.1), libgit2, cmark and libssh2/OpenSSL **[Verified, GA-readme, GA-releases]**. Version 2.7.0 stopped shipping pre-built Linux binaries and dropped support for macOS before 11 and 32-bit Windows. The latest release seen is v2.7.1 **[Verified, GA-releases]**. The release page shows no year; it is probably December 2023 **[Uncertain]**.

**Features.** All of the following are **[Verified, GA-releases, GA-site]**:

- A history and understanding-focused UI with a fast native interface.
- Hunk staging.
- Squash merge.
- Spell check in the commit editor.
- Save and apply diff actions.
- Compact history mode.
- Theme variables, and automatic dark mode on macOS.
- An indexed search with identifier tokenisation.
- Submodule update after pull.
- LFS error handling.
- Bitbucket API integration.
- Plugins (a line-length plugin).
- External tools such as Beyond Compare.

It also integrates with GitHub and GitLab accounts **[Uncertain]**. Interactive rebase and worktrees appear absent **[Uncertain]**.

**Distinguishing feature.** Its indexed history search makes it quick to answer "when did this identifier change?" **[Verified, GA-releases — indexer references; Uncertain on the exact scope]**.

---

## 8. GitLens for VS Code (GitKraken)

**Licence and pricing.** Community is free and covers local and public repos. Pro unlocks the Commit Graph, worktrees, Visual File History, Launchpad and AI features for private repos **[Verified, GL-home, GL-features]**. The help page states that the Commit Graph itself is included in Community for public and local repos **[Verified, GL-features]**. The source licence is mixed: most code appears to be MIT, with separately licensed Pro portions **[Uncertain — not fetched; check the repository before reusing anything]**.

**Platforms.** It runs in VS Code, Cursor, Windsurf, Kiro and other VS Code-based IDEs **[Verified, GL-home]**.

**Blame workflows.** All of the following are **[Verified, GL-features]**:

- Current-line blame annotation at the end of the line.
- Status bar blame with a configurable click action.
- Git CodeLens (recent change and authors) above files and blocks.
- Hovers showing details or diffs, with automatic issue linking for GitHub, GitLab, Bitbucket, Gerrit, Gitea and Azure DevOps.
- Full-file blame (Alt+B).
- File Changes highlighting.
- **File Heatmap** colouring lines by age (cold after 90 days, scaled to the median age).
- Revision navigation commands: previous/next revision, compare with working file, compare with a branch or tag.

**Commit graph.** The graph is described as running on a high-performance rendering engine. All of the following are **[Verified, GL-features]**:

- Draggable, toggleable columns.
- A Changes column with four display styles.
- Panel or editor layout, and a compact mode.
- Scrollbar markers and an experimental minimap.
- Hide/filter refs, including a "smart branches" filter.
- Rich search with prefixes (`message:`, `author:`, `file:`, `change:`, `@me`, `after:`/`before:`), regex and match-case, plus F3 navigation.
- Context-menu squash, drop and reword without opening a rebase editor.
- An inline "Undo Commit" action on HEAD and "Push to Commit" on unpushed rows.
- PR indicators on branches.

**Worktrees and Multi-WIP.** Work in progress across several worktrees is visible at once in the graph, alongside agent session tracking **[Verified, GL-home]**.

**Launchpad.** A prioritised view of PRs grouped by blocked, waiting and ready to merge **[Verified, GL-home]**.

**Collaboration.** Cloud Patches can be self-hosted on S3. Code Suggest works on github.com only **[Verified, GL-features]**.

---

## Cross-product comparison

The table uses these markers. Each cell reflects the tagged findings above; "?" cells are unconfirmed.

- ✔ = verified
- ~ = partial or limited (verified)
- ? = uncertain or not documented
- ✘ = verified absent or unsupported

| Capability | GitKraken | Sourcetree | GitHub Desktop | SmartGit | Git Extensions | GitButler | GitAhead | GitLens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open-source licence | ✘ | ✘ | MIT | ✘ | GPL-3.0 | FSL→MIT after 2 yrs | MIT | ? (mixed) |
| Free tier | ✔ (public/local) | ✔ | ✔ | ✔ (non-commercial) | ✔ | ✔ | ✔ | ✔ (public/local) |
| Windows / macOS / Linux | ✔/✔/✔ | ✔/✔/✘ | ✔/✔/fork only | ✔/✔/✔ | ✔/✘/✘ | ✔/✔/✔ | ~ (no Linux binaries since 2.7) | IDE |
| Visual commit graph | ✔ | ✔ | ✘ | ✔ | ✔ | ~ (smartlog) | ? | ✔ |
| Line-level staging | ? | ✔ | ✔ (line include) | ? | ✔ | ~ (lanes) | ~ (hunk) | ? |
| Split/unified diff | ? | ? | ✔ | ? | ? | ? | ? | IDE |
| Built-in 3-way merge tool | ✔ (+AI) | ? | ? | ✔ | ? | ✔ (edit mode) | ? | ✘ |
| Interactive rebase | ✔ (limits) | ✔ | ~ (reorder/squash) | ✔ | ✔ (+autosquash) | ✔ | ? | ~ (graph actions) |
| Operation undo / oplog | ✔ (Ctrl+Z, scope ?) | ? | ~ (undo commit) | ~ (undo last commit) | ~ (recover lost objects) | ✔ (snapshots) | ? | ~ (undo commit) |
| Worktrees | ✔ | ? | ? | ? | ✔ | ✔ | ? | ✔ (Pro) |
| Submodules | ✔ | ✔ | ? | ? | ✔ | ? | ✔ | ? |
| Git LFS | ✔ | ✔ | ? | ✔ | ? | ? | ~ | ? |
| Stacked PRs | ? | ✘? | ✘? | ? | ✘? | ✔ | ✘? | ? |
| Hosting PR integration | ✔ (GH/GL/BB/AzDO) | ~ (Bitbucket) | ✔ (GitHub) | ✔ (GH/GL/BB/AzDO) | ~ (GitHub plugin, Gerrit) | ✔ (GH/GL/BB) | ? | ✔ |
| Command palette | ✔ | ? | ? | ? | ? | ? | ? | IDE |
| Vim-style graph navigation | ✔ | ? | ✘? | ? | ? | ? | ? | ✘ |
| Custom themes | ✘ (disabled 11.8) | ? | ? | ? | ✔ | ? | ✔ (variables) | IDE |
| AI features | ✔ | ? | ✔ (Copilot) | ? | ? | ✔ (agent-focused) | ✘ | ✔ |
| Uses the system Git CLI | ~ (only needed for LFS) | ? | ? | ? | ? | ? | ✘ (libgit2) | ? |

---

## Ideas for Spoon

### Licence guidance for code reuse **[Proposed]**

Spoon is MIT/Apache-style. It must never copy proprietary code, assets, icons or product names.

- **Safe to reuse with attribution (permissive):**
  - **GitHub Desktop (MIT).** This is the most valuable source because it uses the same Electron/React/TypeScript stack. Reusable areas include Git CLI invocation and output parsing, diff rendering ideas, and keyboard-shortcut organisation. Keep the MIT notice. **Do not** copy GitHub logos, Octicon-style branded assets, or the "GitHub" name. The README explicitly excludes trademarks from the grant. Octicons have their own licence **[Uncertain — check before use]**.
  - **GitAhead (MIT).** A C++/Qt codebase, so it is mostly useful for algorithms and ideas such as graph layout and indexed search, not for direct code reuse. Its bundled dependencies carry their own licences: Qt is LGPL/GPL, and libgit2 is GPLv2 with a linking exception **[Uncertain]**. Copy only GitAhead-authored files.
- **Do NOT reuse code:**
  - **Git Extensions (GPL-3.0).** Copyleft would force Spoon to become GPL. Study its behaviour and documentation for inspiration only. Its icons are separately licensed under CC BY 3.0.
  - **GitButler (FSL-1.1-MIT).** A Git client is a "Competing Use", so current code is off-limits. Each version converts to MIT two years after release, so code released before roughly October 2024 *may* be MIT now. Any such reuse needs a per-version legal check, and the stack (Rust/Svelte) differs anyway **[Uncertain]**.
  - **GitLens.** Treat it as off-limits until the licence of each file is verified, because Pro-licensed portions exist **[Uncertain]**.
  - **GitKraken, Sourcetree, SmartGit (proprietary).** No code, assets, themes or screenshots may be used. Ideas and workflows are not copyrightable, but distinctive branding and UI artwork are.

### Feature ideas, ordered roughly by value-to-effort **[Proposed]**

1. **Operation log with one-click undo.** Before each mutating Git command, record HEAD, refs, the index tree and a stash-like snapshot of the working tree into a Spoon-owned ref namespace (for example `refs/spoon/oplog/*`). Then show a timeline with "Revert to before X". This combines the GitButler model with reflog-based recovery, works with the plain Git CLI, and goes beyond GitHub Desktop's undo-commit and SmartGit's undo-last-commit.
2. **First-class line and hunk staging in a real index view.** Show both staged and unstaged panes, as in Fork and Sourcetree, using `git apply --cached` with generated patches. Add GitHub Desktop's "discard goes to Trash" safety net for discarded lines.
3. **Rebase without a separate editor screen.** Offer squash, fixup, reword, drop, reorder by drag and drop, and "edit message of any local commit" from the graph context menu, as GitLens and SmartGit do. Support autosquash for fixup commits, as Git Extensions does. Unlike GitKraken, allow continuing a rebase that was started in the CLI and vice versa, which Spoon gets naturally by driving the real Git CLI. Detect existing `.git/rebase-merge` state on open.
4. **Built-in three-way conflict solver** with "take ours/theirs per hunk", and optional handoff to an external tool, as SmartGit offers. A later idea: GitButler-style "continue the rebase and mark conflicted commits", which could be prototyped with `git rebase` plus `rerere`.
5. **Worktree hub.** Create/open/lock/remove worktrees, offer "remove worktree and delete branch", and show **one WIP row per worktree** in the graph, as GitKraken and GitLens do. Worktree support is now core because developers run several coding agents in parallel.
6. **Graph polish.** Highlight the commits included in the current revision (Git Extensions). Colour-code the journal into incoming, outgoing and rewritten commits (SmartGit). Add a "smart branches" filter and hidden/soloed refs (GitLens, GitKraken), scrollbar markers for HEAD and search hits, and a search syntax (`author:`, `message:`, `file:`, `change:` mapped to `-S`/`-G`, `after:`/`before:`). Virtualise rendering for large repos.
7. **Keyboard-first design.** Add a command palette, J/K navigation, S/U to stage and unstage, Ctrl+Enter to commit, a discoverable shortcut cheat sheet (Ctrl+/), and fully remappable keys. Document per-OS shortcut tables, as GitHub Desktop does.
8. **Blame and history views inspired by GitLens.** Provide per-line blame with an age heatmap gutter, "blame previous revision" drill-down, file history that follows renames (`--follow`), and compare with any branch or tag.
9. **Submodule and LFS panes.** Show submodule status (out of sync, not initialised), prompt to initialise after clone, and offer LFS track/untrack, pull and prune with a strong warning on prune. Detect missing `git-lfs` on PATH and explain how to fix it, as GitKraken's LFS docs do.
10. **Hosting integration through a provider abstraction.** Treat GitHub, GitLab, Bitbucket, Azure DevOps and Gitea equally, unlike GitHub Desktop's GitHub-first stance. Start with PR status on branches and "create PR", and keep personal access tokens in the OS keychain.
11. **Themes and accessibility.** Ship a documented theme token file (JSON) that users can override. GitKraken has disabled custom themes, which gives Spoon an opening. Add high-contrast and colour-blind-safe graph palettes, full keyboard reachability, and screen-reader labels on graph rows.
12. **Agent-friendly but optional.** Expose a stable CLI or JSON automation surface and show worktree-based "sessions" without bundling AI. Keep the core local-first with no account requirement, in contrast to GitKraken's account and tier gating.
13. **Safety rails.** Warn before rewriting pushed commits, before committing to a protected branch, and before force-pushing. Use `--force-with-lease` by default. Offer a per-commit "bypass hooks" option, as GitHub Desktop does.

### Positioning summary **[Proposed]**

Spoon can occupy the space between GitHub Desktop and the paid tools:

- **Compared with GitHub Desktop:** it would be host-agnostic and add a visual graph, a real index and full interactive rebase.
- **Compared with GitKraken, SmartGit and Sourcetree:** it would be free and open source, with no tiered gating of private repos.
- **Compared with GitButler:** it would stay close to plain Git semantics, while borrowing the oplog/undo idea in a Git-native way.
- **Compared with GitAhead and Sourcetree:** it would be actively maintained on Windows, macOS and Linux.
