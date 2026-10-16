# Contributing to Spoon

Thanks for helping. This document covers how to propose changes; the
[development guide](docs/development.md) covers setup and architecture conventions.

## Before you start

- Search existing issues first. For larger features, open an issue to discuss the approach before
  writing a lot of code.
- Security problems must not be filed as public issues — see [SECURITY.md](SECURITY.md).
- Do not copy code, text, icons or screenshots from proprietary Git clients. Ideas
  and common Git workflows are fine; implementations must be original or come from compatibly
  licensed open-source projects with attribution.

## Making a change

1. Fork and create a branch from `main`.
2. `npm install`, then `npm run dev` to work on the app.
3. Add or update tests. Git behaviour belongs in `tests/integration`, pure logic in `tests/unit`,
   user flows in `tests/e2e`. Tests must only touch repositories they create in the temp folder.
4. Run `npm run check` (and `npm run test:e2e` for UI changes).
5. Update `docs/product/feature-matrix.md` if a feature's status changes.
6. Open a pull request using the template and describe what you tested and on which OS.

## Rules that reviews enforce

- Git runs only through `src/main/git` with argument arrays — never through a shell, and never with
  commands assembled from strings.
- Every IPC method has a zod schema in `src/shared/api.ts`. No generic "run command" or "read file"
  channels.
- Destructive or global actions (discarding, stashing, force pushing, changing global config,
  trusting a repository, disabling certificate checks) always require an explicit user choice.
- No telemetry, no new network calls without a setting and documentation.
- Secrets never go into settings files or logs.
- Keep the UI accessible: keyboard reachable, labelled controls, visible focus.

## Sign-off (proposed)

The project proposes the [Developer Certificate of Origin](https://developercertificate.org/): add
`Signed-off-by: Your Name <email>` to commits (`git commit -s`, or the sign-off option in Spoon).
Maintainers still need to confirm whether sign-off becomes mandatory.

## Licence of contributions

Spoon is licensed under the [MIT License](LICENSE). By submitting a contribution you agree that it
is released under that licence. You keep the copyright in your contribution.
