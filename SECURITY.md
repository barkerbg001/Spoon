# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately, not in public issues, using GitHub's
[Report a vulnerability](https://github.com/Barkerbg001/spoon/security/advisories/new) form
(private security advisories must be enabled in the repository's Security settings).

Include the Spoon version, OS, Git version, steps to reproduce and the impact you expect. We aim to
acknowledge reports within 5 working days. Supported versions: the latest release only (pre-1.0).

## Security model

Spoon opens repositories that may come from untrusted sources, so repository content is treated as
untrusted data.

**Renderer isolation.** The UI runs with `contextIsolation`, `sandbox` and no `nodeIntegration`, under
a strict Content Security Policy (no remote scripts, no `eval`). Navigation away from the app and new
windows are blocked. External links open in the system browser only for validated `https:`/`http:`
URLs. File contents, commit messages and diffs are rendered as text, never as HTML.

**Narrow IPC.** The preload exposes one typed `invoke` function. Each method is validated with a zod
schema and only accepted from the app's own window. There is no generic command execution or file
access: file operations are limited to paths inside an open repository, resolved and checked against
the repository root.

**Running Git.** Git is spawned with argument arrays and `shell: false`. User-supplied values are
validated (ref names, revisions, paths, remote URLs) and separated with `--end-of-options`/`--` where
Git supports it. `GIT_TERMINAL_PROMPT=0` prevents hidden prompts. Spoon respects Git's
`safe.directory` protection and only adds an entry after the user explicitly trusts a repository.

**Never done silently.** Changing global Git configuration, disabling certificate verification,
trusting a repository, discarding changes, stashing changes and force pushing all require an explicit
confirmation. Force pushes use `--force-with-lease`.

**Credentials.** Hosting tokens are encrypted with Electron `safeStorage` (Windows DPAPI, macOS
Keychain, Linux Secret Service). If OS encryption is unavailable, tokens are not saved. Git
credentials stay with your Git credential helper. Logs and error messages pass through a redactor
that removes URL credentials, tokens and authorization headers.

**Privacy.** No telemetry. Network access happens only for Git remote operations you trigger and
hosting integrations you configure.

## Known limitations

- Builds are not code-signed yet.
- Git hooks and configured tools (diff/merge tools, credential helpers) in a repository you trust run
  as Git normally runs them; trusting a repository means trusting its configuration.
