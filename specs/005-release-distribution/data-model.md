# Data Model: Release Distribution

**Date**: 2026-08-04 | **Feature**: [005-release-distribution](./spec.md)

Entities for the release pipeline. There is no application runtime state — all
entities are CI/repository artefacts described so the workflow, manifests and
tests share one vocabulary (plan R1–R9).

---

## ReleaseTag

A version marker that authorizes a release.

| Field | Type | Validation |
|-------|------|------------|
| `name` | string | MUST match `^v\d+\.\d+\.\d+$` (FR-001). The trigger filter is a glob (`'v[0-9]+.[0-9]+.[0-9]+'`); the strict regex is enforced in the `validate` job. Pre-release/`v1.0.0-beta.1` excluded (Assumptions). |
| `target` | commit | MUST be reachable from `main` (FR-002, Assumptions). |
| `version` | string | Derived: `name` with the leading `v` stripped, e.g. tag `v1.0.0` → `1.0.0` (FR-003). |

**States**: pushed (unauthorized) → validated (regex + reachable + no existing
release) → authorized → drafted → released. A tag not matching the glob never
starts the workflow; a matching tag whose target is not reachable from `main`,
or whose version already has a release, is rejected inside the `validate` job
with an explicit failure (US1 scenarios 3–4, Edge Cases).

## ReleaseArtifact

A built, versioned, platform-specific installable produced by the build matrix.

| Field | Type | Validation |
|-------|------|------------|
| `os` | enum | `windows` \| `macos` \| `linux` |
| `arch` | enum | `x64` \| `arm64` (windows/linux: x64; macos: x64 + arm64 — R4) |
| `version` | string | equals the tag's `version` (FR-003, FR-008) |
| `fileName` | string | MUST identify os, arch, version: `Another Markdown Editor-<version>-<os>-<arch>.<ext>` (FR-005) |
| `sha256` | string | lowercase hex, computed in CI from the built artifact (FR-008, FR-009) |
| `target` | enum | NSIS installer (windows, direct download) · portable zip (windows, Scoop) · dmg (macos, direct) · zip (macos, Homebrew) · AppImage (linux, direct + Homebrew) |

**Required artifact set per release** (FR-004, FR-010 — all must exist and
verify before publication):

| os | arch | target | fileName |
|----|------|--------|----------|
| windows | x64 | nsis | `Another Markdown Editor-<v>-windows-x64.exe` |
| windows | x64 | zip | `Another Markdown Editor-<v>-windows-x64.zip` |
| macos | x64 | dmg | `Another Markdown Editor-<v>-macos-x64.dmg` |
| macos | x64 | zip | `Another Markdown Editor-<v>-macos-x64.zip` |
| macos | arm64 | dmg | `Another Markdown Editor-<v>-macos-arm64.dmg` |
| macos | arm64 | zip | `Another Markdown Editor-<v>-macos-arm64.zip` |
| linux | x64 | AppImage | `Another Markdown Editor-<v>-linux-x64.AppImage` |

**State transitions**: built → uploaded as workflow artifact → downloaded by the
release job → verified present and non-empty → attached to a **draft** GitHub
Release → hashed into both manifests → manifests committed to `main` → draft
published. Any missing artifact or failed hash/manifest step aborts before the
draft becomes public (FR-009/010, US4 scenarios 1–2).

## PackageDefinition

Versioned metadata that installs the artifact for a specific package manager.

### Scoop manifest (`another-markdown-editor.json`)

| Field | Type | Validation |
|-------|------|------------|
| `version` | string | equals tag `version` (FR-008) |
| `description` / `homepage` / `license` | string | present |
| `architecture.64bit.url` | string | the release download URL for the windows portable zip (FR-007) |
| `architecture.64bit.hash` | string | SHA-256 of that zip, lowercase (FR-008) |
| `architecture.64bit.bin` | array | `[["Another Markdown Editor.exe", "another-markdown-editor"]]` |

### Homebrew formula (`Formula/another-markdown-editor.rb`)

| Field | Type | Validation |
|-------|------|------------|
| `version` | string | equals tag `version` (FR-008) |
| `on_macos` block | url + sha256 | arm64 and x64 zip URLs + hashes |
| `on_linux` block | url + sha256 | linux AppImage URL + hash |
| `install` | code | macOS: `app.install "Another Markdown Editor.app"`; Linux: install the AppImage to `bin` |

**State transition**: template at HEAD → rewritten by `updatescoop.ps1` /
`updatebrew.ps1` from the verified downloaded artifacts → committed to `main`
while the GitHub Release is still a draft. Only after every artifact is verified
and hashed, and the release is public, are users pointed at it (US4 scenario 3).

## ReleaseWorkflow

The GitHub Actions process that orchestrates the above.

| Element | Validation |
|---------|------------|
| Trigger | `push` on tags matching glob `v[0-9]+.[0-9]+.[0-9]+`; strict `^v[0-9]+\.[0-9]+\.[0-9]+$` regex checked in `validate` (FR-001) |
| Permissions | workflow default `contents: read`; `contents: write` job-scoped to `release` only (FR-013) |
| Preflight job | `validate` before `build`: semver regex, `git merge-base --is-ancestor <ref> refs/remotes/origin/main`, and `gh release view` (existing release → fail) |
| Build job | matrix over the four legs (R4); `needs: validate`; `fail-fast: false`; required legs have NO `continue-on-error` (FR-010); each leg packages with `--config.extraMetadata.version=<VERSION>` (FR-003) |
| Release job | `needs: build`; downloads all artifacts; verifies required set (FR-009); creates a **draft** release with `fail_on_unmatched_files: true`; checks out `main`, updates + commits both manifests (FR-006/007/008); publishes the draft last |

**Guarantee**: a valid main-reachable tag produces exactly one public release
containing every required artifact and both manifests pointing at that version,
and no *public* release or manifest state exists for a version that failed any
required step (FR-004/010, US4 scenario 3).
