# Implementation Plan: Release Binary Naming

**Branch**: `009-release-binary-naming` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-release-binary-naming/spec.md`

## Summary

Rename the published installable asset names from
`Another Markdown Editor-<version>-<os>-<arch>.<ext>` to
`ameditor-<version>-<os>-<arch>.<ext>`. The change is confined to asset file
names: `electron-builder.yml` `artifactName` templates, the release workflow's
upload globs and required-set, the two PowerShell manifest-update scripts, the
Scoop manifest and Homebrew formula URLs/file names, and the release-contract
tests. The packaged application identity (product name, `.app`/`.exe` bundle
names, in-app name) is unchanged.

## Technical Context

**Language/Version**: Same stack as the release feature (spec 005): YAML
workflow, PowerShell 7 update scripts (AGENTS.md: `.ps1`, never `.bat`), Ruby
formula, JSON Scoop manifest, TypeScript contract tests.

**Primary Dependencies**: None new. `electron-builder` already produces the
assets; its `artifactName` template controls the file name.

**Storage**: N/A. Committed files change: `electron-builder.yml`,
`.github/workflows/build-release.yml`, `updatescoop.ps1`, `updatebrew.ps1`,
`another-markdown-editor.json`, `Formula/another-markdown-editor.rb`,
`tests/release/release-contracts.test.ts`.

**Testing**: The contract suite `tests/release/release-contracts.test.ts` pins
the renamed globs, required set, and manifest references; `npm run test` must
stay green. Note: on `main` at branch creation the suite is already failing
because the last release commit (`292ade0`, v0.0.83) bumped the manifests while
the contract tests still assert `0.1.0`; this change updates those same
assertions to the renamed names and to the current `0.0.83` version in one
commit.

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
| V. Test What Can Corrupt Or Escape | Contract tests updated and passing pin the renamed names (SC-002) | **PASS** |

## Phase 0: research.md

No open technical question. The rename is a string substitution of the asset
prefix across seven files. The one non-obvious point — the contract suite is
already red on `main` (tests assert `0.1.0`, manifests are `0.0.83`) — is
recorded in the Technical Context and fixed in the same commit.

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
another-markdown-editor.json   # MODIFY: windows zip URL
Formula/another-markdown-editor.rb   # MODIFY: URLs + bin.install file name
tests/release/release-contracts.test.ts  # MODIFY: assert renamed names
```

## Complexity Tracking

> No constitution violations. The rename is mechanical; the only deviation from
> "perfectly scoped" is that the commit also reconciles the contract tests'
> stale version assertion (`0.1.0` → `0.0.83`) that predates this feature and
> is failing on `main`.

## Phase status

- Phase 1: Spec artifacts for the rename
- Phase 2: Implement the rename across the seven files
- Phase 3: Update contract tests; run `npm run test`, `npm run lint`, `npm run typecheck`
- Phase 4: Commit, push, open PR against `main`

**Status 2026-08-04**: Complete. Rename implemented across all seven files;
contract tests updated to assert `ameditor-*` names and the current `0.0.83`
version (reconciling the pre-existing failure on `main`). Gates green: 276 unit
tests pass, lint clean, typecheck clean. Both PowerShell update scripts verified
against a simulated v9.9.9 renamed artifact set (correct URLs/hashes; bundle
names preserved).

## Deferred / later features

- Renaming the packaged application identity (`.app`/`.exe`/product name) —
  explicitly out of scope (spec Assumptions).
- Renaming the package/repo names (`another-markdown-editor`) — out of scope.

## Decision log (2026-08-04)

- The asset prefix becomes `ameditor`; the `-<version>-<os>-<arch>.<ext>` suffix
  is preserved so FR-005 (spec 005) keeps holding.
- Scope is the asset file names only (the example in the input is the AppImage
  filename). The command name exposed by Scoop/Homebrew
  (`another-markdown-editor`), the package names, and the README install commands
  are unchanged — renaming them would be a different, larger change.
- The macOS `.app` name inside the zip and the Windows `.exe` inside the zip are
  unchanged; only the archive/installer file names change.
- The contract tests are updated to the renamed names AND to the current release
  version `0.0.83` (they were stale and failing on `main`).
