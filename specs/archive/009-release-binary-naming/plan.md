# Implementation Plan: Release Binary Naming

**Branch**: `009-release-binary-naming` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-release-binary-naming/spec.md`

## Summary

Rename the published installable asset names from
`Another Markdown Editor-<version>-<os>-<arch>.<ext>` to
`ameditor-<version>-<os>-<arch>.<ext>`. The change is confined to asset file
names: `electron-builder.yml` `artifactName` templates, the release workflow's
upload globs and required-set, the two PowerShell manifest-update scripts, the
Scoop manifest and Homebrew formula URLs/file names. The packaged application
identity (product name, `.app`/`.exe` bundle names, in-app name) is unchanged.

The Scoop/Homebrew command name is `ameditor` (spec 009 FR-004), matching the
renamed launcher binary. The automated release-contract suite was removed
2026-08-05 (see Decision log); release verification is manual via quickstart.md.

## Technical Context

**Language/Version**: Same stack as the release feature (spec 005): YAML
workflow, PowerShell 7 update scripts (AGENTS.md: `.ps1`, never `.bat`), Ruby
formula, JSON Scoop manifest, TypeScript contract tests.

**Primary Dependencies**: None new. `electron-builder` already produces the
assets; its `artifactName` template controls the file name.

**Storage**: N/A. Committed files change: `electron-builder.yml`,
`.github/workflows/build-release.yml`, `updatescoop.ps1`, `updatebrew.ps1`,
`another-markdown-editor.json`, `Formula/another-markdown-editor.rb`.

**Testing**: `npm run test` covers the unit suites only. There is no automated
release-contract suite (`tests/release/` was removed 2026-08-05); the renamed
globs, required set, manifest references, and the `ameditor` command name are
verified manually via quickstart.md (spec 009 Assumptions, Decision log).

**Target Platform**: Windows x64, macOS x64 + arm64, Linux x64 (unchanged).

**Project Type**: Desktop application (Electron) release automation.

**Performance Goals**: N/A.

**Constraints**: No renderer/main-process change (Principle I). No product-name
change. No URL-encoding needed for the asset prefix anymore (space removed), but
the manifests' URL strings still must match the actual published file names.

**Scale/Scope**: Seven committed files change; no runtime surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | Release automation only; the app (main/preload/renderer) is untouched | **PASS** |
| II. Every Path Is Untrusted | No path crosses a trust boundary; asset names are embedded constants, and manifest URLs are still built from the deterministic release URL + version | **PASS** |
| III. Never Lose The User's Words | No user-document read/write | **PASS** |
| IV. Calm, Predictable Editing | CI/asset-naming only; no runtime UX change | **PASS** |
| V. Test What Can Corrupt Or Escape | Manual release verification (quickstart.md) checks the renamed names; unit suites remain the regression gate (SC-002) | **PASS** |

## Phase 0: research.md

No open technical question. The rename is a string substitution of the asset
prefix across the packaging and manifest files. The prior contract suite was
already red on `main` (tests asserted `0.1.0`, manifests were `0.0.83`); the
suite is removed (2026-08-05 Decision log) and release verification is manual.

## Phase 1: data-model.md, contracts, quickstart.md

- [data-model.md](./data-model.md) — the `ReleaseArtifact.fileName` rule updated
  to the `ameditor` prefix.
- [contracts/release.md](./contracts/release.md) — the artifact contract:
  `ameditor-<v>-<os>-<arch>.<ext>` naming, the required set, and the manifest
  references.
- [quickstart.md](./quickstart.md) — manual validation with the renamed assets.

## Project Structure

### Documentation (this feature)

```text
specs/009-release-binary-naming/
├── spec.md              # Requirements (this feature)
├── plan.md              # This file
├── data-model.md        # ReleaseArtifact.fileName rule update
├── quickstart.md        # Manual validation with renamed assets
├── contracts/
│   └── release.md       # Renamed artifact contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
electron-builder.yml                 # MODIFY: artifactName -> ameditor-${version}-...
.github/workflows/build-release.yml  # MODIFY: upload globs + required set
updatescoop.ps1                      # MODIFY: zip file name + URL
updatebrew.ps1                       # MODIFY: zip/AppImage file names + URLs + bin.install
another-markdown-editor.json   # MODIFY: windows zip URL + bin command -> ameditor
Formula/another-markdown-editor.rb   # MODIFY: URLs + bin.install file name + command -> ameditor
```

## Complexity Tracking

> No constitution violations. The rename is mechanical. Deviation (2026-08-05):
> the release-contract suite is removed and its vitest/eslint references dropped
> per the user's decision that release verification is manual (Decision log);
> the manifests additionally fix the Scoop command name to `ameditor` (FR-004).

## Phase status

- Phase 1: Spec artifacts for the rename
- Phase 2: Implement the rename across the packaging and manifest files
- Phase 3: Remove the release-contract suite; run `npm run test`, `npm run lint`, `npm run typecheck`
- Phase 4: Commit, push, open PR against `main`

**Status 2026-08-04**: Complete. Rename implemented; contract tests updated to
assert `ameditor-*` names and the current `0.0.83` version (reconciling the
pre-existing failure on `main`). Gates green: 276 unit tests pass, lint clean,
typecheck clean. Both PowerShell update scripts verified against a simulated
v9.9.9 renamed artifact set (correct URLs/hashes; bundle
names preserved).

## Deferred / later features

- Renaming the packaged application identity (`.app`/`.exe`/product name) —
  explicitly out of scope (spec Assumptions).
- Renaming the package/repo names (`another-markdown-editor`) — out of scope.

## Decision log (2026-08-04)

- The asset prefix becomes `ameditor`; the `-<version>-<os>-<arch>.<ext>` suffix
  is preserved so FR-005 (spec 005) keeps holding.
- Scope is the asset file names only (the example in the input is the AppImage
  filename). The package/repo names (`another-markdown-editor`) and the README
  install commands are unchanged — renaming them would be a different, larger
  change.
- The macOS `.app` name inside the zip and the Windows `.exe` inside the zip are
  unchanged; only the archive/installer file names change.
- The contract tests are updated to the renamed names AND to the current release
  version `0.0.83` (they were stale and failing on `main`).

## Decision log (2026-08-05)

- The command name exposed by Scoop/Homebrew is `ameditor`, matching the renamed
  launcher binary (spec 009 FR-004 and its 2026-08-04 clarification). The
  earlier decision to keep `another-markdown-editor` as the command was
  reverted: it contradicts FR-004, and a Scoop install exposed no `ameditor`
  command. `another-markdown-editor.json` maps `ameditor.exe` → `ameditor`;
  `Formula/another-markdown-editor.rb` installs the Linux AppImage as
  `bin/ameditor`.
- The automated release-contract suite `tests/release/release-contracts.test.ts`
  is removed. Release verification (asset names, URLs, hashes, command name) is
  manual via quickstart.md. Its vitest project, eslint override, and spec 005
  Test contract were removed accordingly. Rejected alternative: keeping the
  suite, which duplicated manual checks and drifted stale across release bumps.
