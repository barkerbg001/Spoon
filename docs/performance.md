# Performance

## How to measure

```bash
npm run perf                                  # 50 000 commits, 20 000 files (defaults)
PERF_COMMITS=200000 PERF_FILES=60000 npm run perf
PERF_OUT=perf-results.txt npm run perf        # also append the table to a file
```

The benchmark (`tests/perf/large-repo.perf.ts`) streams a synthetic history into
`git fast-import` inside a temporary folder: an initial commit with `PERF_FILES` files, then
`PERF_COMMITS` commits including a merged two-commit side branch every 40 commits, 200 extra
branches and 300 tags. It checks out the working tree, modifies 2 000 files, adds 200 untracked
files, and times the same main-process functions the UI calls. The repository is deleted afterwards.

## Results

Measured 2026-10-11 on Windows 11 x64, Node 22.14, Git 2.33.0.windows.2, consumer laptop SSD.
Times are wall-clock for a single run.

| Operation                                               |   Time | Notes                         |
| ------------------------------------------------------- | -----: | ----------------------------- |
| Generate history (fast-import)                          | 40.3 s | setup only                    |
| Check out working tree (20 000 files)                   | 47.0 s | setup only                    |
| Repository summary (open)                               | 1.51 s | includes status               |
| Status, porcelain v2                                    | 1.47 s | 2 000 unstaged, 200 untracked |
| Status, second run                                      | 1.36 s |                               |
| Refs snapshot                                           | 0.59 s | 202 branches, 300 tags        |
| History: first page (400 commits, all refs, topo order) | 0.95 s |                               |
| History: page at offset 20 000                          | 0.88 s |                               |
| History: 5 000 commits in one call                      | 0.95 s |                               |
| History: message search                                 | 0.98 s | 279 hits                      |
| Graph layout, 50 000 commits                            | 225 ms | pure JS, renderer             |
| Graph layout, 5 000 real commits                        |  28 ms |                               |
| Diff of one modified file                               | 136 ms |                               |
| Parse a 100 000-line diff                               |  74 ms |                               |

## Interpretation and design choices

- **History** is dominated by Git's `--topo-order` walk, which must read all commits reachable from
  every ref before emitting the first one. Loading 400 or 5 000 commits costs almost the same, so
  the UI uses 400-commit pages and keeps scrolling smooth through virtualisation (only visible rows
  are rendered). A commit-graph file (`git commit-graph write`, or `fetch.writeCommitGraph`) makes
  this walk much faster; Spoon does not change repository configuration on its own.
- **Status** on Windows is bounded by file-system scanning of 20 000 files. Users with very large
  trees can enable `core.fsmonitor` and `core.untrackedCache` in Git; Spoon honours them because it
  runs the user's Git. Background refreshes use `GIT_OPTIONAL_LOCKS=0` and are debounced (350 ms),
  coalesced, and limited to the active tab on window focus.
- **Graph layout** is linear and incremental: each page continues from the previous page's lane
  state, so loading more history never re-lays out earlier rows.
- **Diffs** are truncated by byte size in the main process; the full diff is loaded only after an
  explicit "Load full diff". Diff rows, history rows, blame lines and file lists are virtualised.

## Not yet measured

- macOS and Linux (expected to be faster for status because of cheaper `lstat`).
- Memory usage over long sessions, and renderer frame times while scrolling (the virtualised lists
  felt smooth during manual testing but were not profiled).
- Repositories with very large single files in history (blame and file history of huge files).
