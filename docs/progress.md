# Progress and verification log

Updated 2026-10-11. This records what has actually been run, where, and with what result. Anything
not listed here should be treated as untested.

## Test environment

- Windows 11 (10.0.26200), x64
- Git 2.33.0.windows.2, no Git LFS installed
- Node.js with npm, Electron 44.7

## Latest results (2026-10-11, Windows 11)

| Check                                                                                                                           | Command                                                           | Result                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking (main, preload, tests, renderer)                                                                                  | `npm run typecheck`                                               | Passed                                                                                                                                                |
| Lint                                                                                                                            | `npm run lint`                                                    | Passed (0 problems)                                                                                                                                   |
| Formatting                                                                                                                      | `npm run format:check`                                            | Passed                                                                                                                                                |
| Unit tests (diff parsing, conflicts, graph layout, security validators, Git output parsing, hosting providers with mocked HTTP) | `npm run test:unit`                                               | 43 passed                                                                                                                                             |
| Integration tests (real Git, disposable repositories and local bare remotes)                                                    | `npm run test:integration`                                        | 32 passed                                                                                                                                             |
| End-to-end (Playwright driving Electron)                                                                                        | `npm run test:e2e`                                                | 4 passed: theme persistence; open → stage → commit → branch → history → command palette; conflict resolution and merge continue; discard confirmation |
| Production build                                                                                                                | `npm run build`                                                   | Passed                                                                                                                                                |
| Windows packaging                                                                                                               | `npx electron-builder --win --publish never`                      | Passed: `Spoon-0.1.0-setup-x64.exe` (107 MB), `-setup-arm64.exe` (101 MB), combined `-setup.exe` (208 MB), `-win.zip` (147 MB)                      |
| Packaged app smoke test                                                                                                         | launched `dist/win-unpacked/Spoon.exe` with a temporary profile | Window opened, process stable; closed after 8 s                                                                                                       |
| Code signature                                                                                                                  | `Get-AuthenticodeSignature`                                       | NotSigned (expected; no certificate configured)                                                                                                       |
| Third-party licence inventory                                                                                                   | `node scripts/license-inventory.mjs --check`                      | 92 packages, all permissive (MIT, Apache-2.0, BSD-3-Clause, ISC, 0BSD)                                                                                |
| Large-repository benchmark                                                                                                      | `npm run perf`                                                    | See [performance](performance.md) (50,000 commits / 20,000 files)                                                                                     |

## Not yet verified

- **macOS and Linux**: nothing has been run. Packaging targets are configured; CI is set up to run
  the full suite on all three OSes but has not run yet because the project has no remote.
- **Installers**: the NSIS installers were built but not installed/uninstalled (avoiding changes to
  the development machine). Windows arm64 build not launched (no arm64 hardware).
- **Hosting services**: GitHub, GitLab, Bitbucket Cloud and Azure DevOps providers are tested only
  against mocked HTTP responses; no live account testing.
- **Git LFS**: detection and commands implemented, not tested (git-lfs not installed).
- **Minimum Git version check** (Git older than 2.25 is rejected with a clear message): implemented,
  not exercised because no old Git was available.
- **Init with .gitignore starter**: implemented after the last manual pass; not covered by tests.
- **Screen readers**: keyboard navigation and ARIA labelling were implemented and partly exercised by
  E2E keyboard tests; no NVDA/VoiceOver pass yet.
- **Credential encryption**: `safeStorage` path exercised on Windows during development; Linux
  Secret Service and macOS Keychain paths untested.

## Open decisions for maintainers

- Licence: MIT chosen on 2026-10-11 ([licensing](licensing.md)). Change the copyright holder
  ("The Spoon contributors") if a person or organisation should be named instead.
- Enable private vulnerability reporting on https://github.com/Barkerbg001/spoon (used by
  `SECURITY.md`) and add a code-of-conduct contact to `CODE_OF_CONDUCT.md`.
- Confirm DCO sign-off for contributions.
- Obtain code-signing certificates if distributing binaries.
