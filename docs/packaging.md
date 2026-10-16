# Packaging, signing and releases

Packaging uses [electron-builder](https://www.electron.build/) with `electron-builder.yml`.
Every script passes `--publish never`: Spoon never uploads artifacts or creates releases
automatically. Artifacts are written to `dist/`.

| Command                 | Output                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run package:dir`   | Unpacked app for the current platform (fastest smoke test)                                                   |
| `npm run package:win`   | NSIS installer (x64, arm64) and zip (x64)                                                                    |
| `npm run package:mac`   | dmg and zip (x64, arm64) — must run on macOS                                                                 |
| `npm run package:linux` | AppImage, deb and tar.gz — run on Linux                                                                      |
| `npm run icons`         | Regenerates `build/icon.png`, `build/icon.ico`, `build/icon.icns`, `build/icons/*.png` from `build/icon.svg` |
| `npm run licenses`      | Regenerates `THIRD_PARTY_NOTICES.md` (bundled into the app's resources)                                      |

All JavaScript dependencies are bundled by electron-vite, so the packaged app contains only
`out/`, `package.json` and resources; there are no native modules to rebuild.

Git itself is **not** bundled. Spoon uses the Git found on `PATH` or in common install locations,
or the executable configured in Settings → Git. Minimum supported Git: 2.25 (tested with 2.33).

## Code signing

Unsigned builds work, but Windows SmartScreen and macOS Gatekeeper warn users. Signing requires
certificates that only the project maintainers can obtain; none are configured in this repository.

### Windows

- Option A: an OV/EV code-signing certificate. Provide it to electron-builder through environment
  variables in CI: `CSC_LINK` (base64 or path of the `.pfx`) and `CSC_KEY_PASSWORD`. EV certificates
  on hardware tokens require a signing service or a self-hosted runner.
- Option B: Azure Trusted Signing (Microsoft-managed certificates). Configure
  `win.azureSignOptions` in `electron-builder.yml` and the `AZURE_*` credentials in CI.
- Without either, electron-builder still runs `signtool` but produces an unsigned executable.

### macOS

- Requires an Apple Developer ID Application certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`).
- Notarisation: set `notarize: true` in `electron-builder.yml` and provide `APPLE_API_KEY`,
  `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` (App Store Connect API key) in CI.
- `hardenedRuntime` is already enabled. Spoon launches the system Git and external tools, which the
  hardened runtime permits without extra entitlements.

### Linux

AppImage and deb packages are typically unsigned; publish SHA-256 checksums alongside releases.
For repositories (apt), sign the repository metadata with the project's GPG key.

## Suggested release process (manual)

1. Update `version` in `package.json` and the roadmap/progress docs.
2. Run `npm run check` and `npm run test:e2e` on each platform (or CI).
3. Build on each OS with signing secrets available: `npm run package:win|mac|linux`.
4. Smoke-test the installers on clean machines (open, clone, commit, push to a test remote).
5. Create the release and upload artifacts **by hand** (or from a protected, manually triggered
   workflow), together with checksums and `THIRD_PARTY_NOTICES.md`.

Auto-update is intentionally not configured; it requires a signed release channel and a decision
about where updates are hosted.
