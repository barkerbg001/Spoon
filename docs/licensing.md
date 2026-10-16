# Licensing

**Spoon is released under the [MIT License](../LICENSE)** (decided 2026-10-11).
Copyright holder: "The Spoon contributors" — each contributor keeps copyright in their own
contributions and licenses them under MIT. If an individual or organisation should be named as the
holder instead, change the copyright line in `LICENSE` and `electron-builder.yml`.

## Why MIT

| Considered       | Outcome                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **MIT**          | **Chosen.** Short, widely understood, maximises adoption and reuse; same licence as GitHub Desktop and 88 of 92 bundled dependencies. |
| Apache-2.0       | Adds an explicit patent grant, but longer and needs NOTICE handling. Little patent exposure for a Git GUI.                            |
| MPL-2.0          | File-level copyleft. Would keep improvements open, at the cost of more friction for reuse.                                            |
| GPL-3.0-or-later | Strong copyleft (Git Extensions uses it). Discourages embedding parts of Spoon elsewhere.                                             |
| FSL / BSL-style  | Not OSI open source, which conflicts with the project's goals.                                                                        |

Trade-off accepted: anyone, including commercial vendors, may build closed-source products from
Spoon code as long as they keep the copyright and licence notice.

## Where it applies

- `LICENSE` at the repository root; `"license": "MIT"` in `package.json`.
- Packaged apps ship `LICENSE.spoon.txt` and `THIRD_PARTY_NOTICES.md` in their resources folder.
- Contributions are accepted under the same licence (inbound = outbound); a DCO sign-off is
  proposed in `CONTRIBUTING.md` but not yet mandatory.

## Third-party code

Every bundled dependency is MIT, ISC, BSD-3-Clause, Apache-2.0 or 0BSD, all compatible with MIT
distribution. `npm run licenses` regenerates `THIRD_PARTY_NOTICES.md`; CI runs the `--check` mode so
a dependency with a missing or incompatible licence fails the build. Electron and Chromium licences
are added to packages by electron-builder (`LICENSE.electron.txt`, `LICENSES.chromium.html`).

The name "Spoon" and its logo are not covered by a trademark policy yet; MIT grants no trademark
rights.
