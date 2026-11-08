# Repository Statistics: competitor research for Spoon

Researched 2026-11-08. Official sources only. Quotes are under 15 words. Version and date are given as the source states them.

## Sources

| # | URL | Product | Version/date | Platform | Status |
|---|-----|---------|--------------|----------|--------|
| 1 | https://git-fork.com/releasenotes | Fork | 1.0.67 to 2.5x (2018 to 2025) | macOS | loaded |
| 2 | https://git-fork.com/releasenoteswin | Fork | 1.16 to 2.8 (2018 to 2025) | Windows | loaded |
| 3 | https://www.git-fork.com/update/feed.xml | Fork changelog feed | 2.52, 2.53 (2025) | macOS (inferred from `mac/` links) | loaded |
| 4 | https://git-fork.com/ | Fork homepage | current | Mac + Win | loaded |
| 5 | https://fork.dev/blog/posts/ | Fork blog | posts up to Aug 2020 | both | loaded; no statistics post found |
| 6 | https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors | GitHub Insights: Contributors | current docs | web | loaded |
| 7 | https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/analyzing-changes-to-a-repositorys-content | GitHub Insights: Commit activity, Code frequency | current docs | web | loaded |
| 8 | https://docs.github.com/en/rest/metrics/statistics | GitHub REST statistics API (backs Insights) | current docs | web/API | loaded |
| 9 | https://docs.gitlab.com/user/analytics/repository_analytics/ | GitLab Repository analytics | current docs | web | loaded |
| 10 | https://docs.gitlab.com/user/analytics/contributor_analytics/ | GitLab Contributor analytics | current docs | web | loaded |
| 11 | https://git-scm.com/docs/gitmailmap | Git | page last updated 2.32.0, unchanged through 2.56.0 | all | loaded |
| 12 | https://git-scm.com/docs/git-shortlog | Git | 2.56.0 (2026-09-28) | all | loaded |
| 13 | https://git-scm.com/docs/git-log | Git | 2.56.0 (2026-09-28) | all | loaded (two passes) |
| 14 | docs.syntevo.com (search) | SmartGit | Latest/26.1 | all | searched; no statistics view documented |

## Fork

### Release-note entries (verified)

**macOS (source 1, plus source 3 for the Overview/Treemap naming)**
- 1.0.97 (21 Aug 2020): "Generate statistics for repository (Repository → Statistics)"
- 1.0.99 (23 Oct 2020): "New repository stats: commits by weekday and commits by day hour"
- 2.3 (22 Jan 2021): "Take .mailmap file into account" (general; not specific to statistics)
- 2.4 (19 Feb 2021): "Allow to select time range for statistics"
- 2.17 (24 Mar 2022): "Handle .mailmap in interactive rebase window"
- 2.19 (17 Jun 2022), Fixed: "Fixed repository statistics"
- 2.30 (23 Jun 2023), Fixed: "Repository statistics doesn't work on small repos"
- 2.52 (18 Apr 2025): the release-notes page says "Repository Treemap allowing to observe repository activity over time". The feed (source 3) words the same release as "Introducing Repository Overview allowing you to observe repository changes over time".
- 2.53 (23 May 2025, feed): "Renamed 'Repository Overview' to 'Repository Treemap'"

**Windows (source 2)**
- 1.53 (31 Jul 2020): "Generate statistics for repository (Repository -> Statistics)"
- 1.54 (18 Sep 2020): "New repository stats: commits by weekday and commits by day hour"
- 1.55 (30 Oct 2020), Fixed: "Repository details not refreshed on Statistics tab in Repository Manager"
- 1.59 (12 Feb 2021): "Allow to select time range for statistics"
- 1.61 (9 Apr 2021): "Support .mailmap"
- 1.71 (11 Mar 2022): "Handle .mailmap in IR window"
- 2.3 (29 Nov 2024), Fixed: "Fix cropped labels on pie chart in Statistics view". This shows a pie chart exists in the Windows Statistics view.
- 2.8 (9 May 2025): "Repository Treemap allowing to observe repository activity over time"

Fork's version numbers differ by platform. Mac 2.3 (Jan 2021) and Windows 2.3 (Nov 2024) are different releases.

"Activity Manager" entries (Mac 1.0.67 onward, Win 1.16 onward) are a log of git operations, not repository statistics, so they are excluded.

### What the Statistics view shows
- Verified: entry point is Repository → Statistics. On Windows there is also a Statistics tab in Repository Manager (Win 1.55). The homepage carousel caption reads "Repository Manager Summary and Statistics".
- Verified: commits by weekday chart, commits by hour-of-day chart, and a selectable time range.
- Verified (Windows): the Statistics view includes a pie chart.
- [Uncertain] What the pie chart shows (likely commits per author), whether a contributor list, line additions/deletions, or file statistics exist, and which branch is used (HEAD, all refs, or current branch). No official page describes these. The blog stops at Aug 2020 and has no statistics post.
- [Uncertain] Whether .mailmap support (Mac 2.3, Win 1.61) applies to statistics author grouping. It is likely, since Fork reads author names through git, but this is not stated.
- Treemap (Mac 2.52 / Win 2.8): verified only that it shows "repository activity over time". Its size and colour encoding and its file/folder granularity are [Uncertain].

## GitHub Insights (sources 6, 7, 8)

- **Contributors graph:** shows the top 100 contributors. Counts only commits on the default branch. "Merge commits and empty commits aren't counted". The author email must be linked to a GitHub account, or the commits don't appear. After force-pushes or history rewrites, data can take about 24 hours to refresh.
- **Commit activity:** covers the past year and excludes merge commits. Shows weekly totals, plus a per-weekday breakdown for the selected week.
- **Code frequency:** "content additions and deletions for each week" across the repository's history. Can be shown as a table or exported as CSV or PNG.
- **REST statistics API:** "All statistics exclude merge commits." Contributor statistics also skip empty commits. Results are cached by the default branch's SHA. The API returns 202 while it computes, then 200.
- **Limit:** commit and code frequency data are only available below 10,000 commits. At 10,000 or more, `code_frequency` returns 422, and `contributors` reports additions and deletions as 0.
- **Weeks:** start on Sunday. The participation window uses UTC-midnight boundaries.
- **Punch card (weekday × hour):** uses "the time zone of each individual commit", meaning the author's local time, not the viewer's.
- **Additions/deletions:** given per week, per author in `contributors` and as repository totals in `code_frequency`.
- [Uncertain] Whether GitHub uses .mailmap or co-author trailers. The docs don't say. Identity comes from linking emails to accounts.

## GitLab (sources 9, 10)

- **Repository analytics:** shows programming languages for the default branch only. Commit statistics cover the last month and can be switched to another branch. Commit patterns show counts by day of month, weekday, and hour. Charts refresh about 10 minutes after a commit to the default branch.
- **Contributor analytics:** has a branch dropdown (shows main by default). A date range is chosen by dragging handles on the chart.
- [Uncertain] How GitLab treats merge commits and time zones, and whether it uses mailmap. The docs don't say.

## SmartGit (source 14)
- No statistics or contributor view was found in the official docs. [Uncertain] whether one exists. Tower and GitKraken were not checked in depth.

## Git CLI (sources 11, 12, 13)

- **.mailmap:** read from the repo's top-level `.mailmap`, or from `mailmap.file` / `mailmap.blob`. Git does not follow symlinks for a working-tree `.mailmap`.
- **.mailmap line formats (four):**
  - `Proper Name <commit@email>`
  - `<proper@email> <commit@email>`
  - `Proper Name <proper@email> <commit@email>`
  - `Proper Name <proper@email> Commit Name <commit@email>`
- **.mailmap matching:** "Both E-Mails and names are matched case-insensitively."
- [Uncertain, not on the page] The `mailmap.blob` default of `HEAD:.mailmap` in bare repos.
- **git log:** `log.mailmap` is "True by default", so `git log`, `git show` and `git whatchanged` assume `--use-mailmap`. The `%aN`/`%aE`/`%cN`/`%cE` placeholders always respect .mailmap.
- **git log --numstat:** reports binary files as `-  -` instead of `0 0`. Merge commits show no diff unless a `--diff-merges` variant is given (default `off`; `first-parent` when `--first-parent` is used). As a result, merges contribute 0 lines to `--numstat` totals by default.
- **git log dates:** shown in each commit's original time zone by default. A `-local` suffix converts them to the viewer's time zone.
- **git shortlog:** groups by author by default. `-s` gives counts only, `-n` sorts by count, `-e` shows emails, `-c` is the same as `--group=committer`. `--group=trailer:co-authored-by` counts co-authors (combine it with `--group=author`); commits without the trailer are not counted, and commits with several trailers may count more than once. `--no-merges` is the same as `--max-parents=1`. Mapping goes through gitmailmap.
- **git shortlog pitfall:** with no revision, if stdin is not a terminal (as when spawned from Electron) or there is no current branch, it reads a log from stdin instead of the repo. Always pass an explicit revision such as `HEAD`.

## Design implications for Spoon

1. **Exclude merges by default.** Use `git log --no-merges` for commit counts, as GitHub's Contributors and Commit activity views do. Offer a "include merge commits" toggle.
2. **Branch scope:** GitHub and GitLab default to the default branch. Fork's scope is unknown. Default to the current HEAD (or the default branch), with a selector for "current branch / default branch / all branches (`--all`)".
3. **Identity:** group authors by `%aN <%aE>` so .mailmap is applied regardless of user config. Optionally count Co-authored-by trailers, with a note that they inflate totals.
4. **Additions and deletions:** use `--numstat --no-merges`. Treat binary `-` as 0 lines but count the file as changed. Merges add no lines by default, which matches GitHub's merge exclusion.
5. **Weekday × hour:** bucket by the author date in the commit's own time zone (GitHub punch-card semantics, git default). Offer a "my local time" option (`--date=iso-local` style).
6. **Weeks start Sunday** (GitHub). Consider following the locale instead, and label it.
7. **Time range:** offer presets plus a custom range (`--since`/`--until`), as Fork (2021) and GitLab do.
8. **Large repos:** GitHub stops computing line statistics at 10k commits. Spoon runs locally, so it can compute them, but should stream or cancel `--numstat` work and cache results by HEAD SHA (GitHub caches by default-branch SHA).
9. **shortlog in Electron:** always pass an explicit revision to `git shortlog`, or it reads from stdin.
10. **Parity with Fork:** weekday chart, hour chart, a pie chart (probably per author), a time range selector, and later a treemap of activity by path.
