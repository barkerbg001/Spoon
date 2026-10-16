# Development guide

## Prerequisites

- Node.js 20.19 or newer (22 LTS recommended) and npm.
- Git 2.25 or newer on `PATH` (tests were run with 2.33).
- Windows, macOS or Linux. Tests have only been run on Windows so far.

## Commands

| Command                                  | What it does                                               |
| ---------------------------------------- | ---------------------------------------------------------- |
| `npm install`                            | Install dependencies                                       |
| `npm run dev`                            | Start the app with hot reload (electron-vite)              |
| `npm run build`                          | Production build into `out/`                               |
| `npm start`                              | Run the production build                                   |
| `npm run typecheck`                      | TypeScript for main/preload/tests and renderer             |
| `npm run lint`                           | ESLint (flat config in `eslint.config.js`)                 |
| `npm run format` / `format:check`        | Prettier                                                   |
| `npm test`                               | Unit + integration tests (Vitest)                          |
| `npm run test:unit` / `test:integration` | One suite                                                  |
| `npm run test:e2e`                       | Build, then Playwright drives the Electron app             |
| `npm run perf`                           | Large-repository benchmark ([performance](performance.md)) |
| `npm run check`                          | typecheck + lint + format check + tests                    |
| `npm run package:dir` / `package:win` …  | Packaging ([packaging](packaging.md))                      |
| `npm run icons` / `licenses`             | Regenerate icons / third-party notices                     |

Set `SPOON_SCREENSHOTS=docs/screenshots` when running `npm run test:e2e` to refresh the README
screenshots. `SPOON_USER_DATA=<folder>` runs the app with a separate settings folder.

## Testing rules

- Tests only ever touch repositories they create in the OS temp folder. Never point tests or manual
  destructive experiments at real projects.
- Integration tests isolate Git configuration with `GIT_CONFIG_GLOBAL` (a temp file) and
  `GIT_CONFIG_NOSYSTEM=1`, and use local bare repositories as remotes.
- E2E tests stub the native folder picker in the main process and use a temporary user-data folder.

## Adding a Git feature

1. Add the method to `src/shared/api.ts` with a zod schema. Use the shared validators (`refName`,
   `revision`, `relPath`, `remoteUrl`, …) for anything that becomes a Git argument.
2. Implement it in the relevant `src/main/git/*.ts` module using `rgit` (read-only) or `mgit`
   (mutating). Pass arguments as an array; put `--end-of-options` or `--` before user values when
   the subcommand supports it.
3. Map it in `src/main/handlers.ts`. If it mutates the repository, add it to `MUTATING` so it runs
   under the per-repository lock.
4. Call it from the renderer with `call('method', args)`; wrap user-visible actions with `run`/
   `runNetwork` from `app/repo/actions.tsx` so errors, progress and refreshes are handled uniformly.
5. Destructive actions need an explicit `confirm()` that says exactly what will be lost.
6. Add an integration test in `tests/integration` and update the feature matrix.

## Project conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`; no `any`.
- The renderer may not import Node built-ins or `electron` (enforced by ESLint).
- UI components follow shadcn/ui conventions (Radix primitives, Tailwind, `cn()`), icons from Lucide.
- Keep comments for constraints the code cannot express.
