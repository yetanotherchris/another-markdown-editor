# Data Model: Release Binary Naming

**Date**: 2026-08-04 | **Feature**: [009-release-binary-naming](./spec.md)

This feature only changes the `fileName` rule of the existing `ReleaseArtifact`
entity from spec 005. All other entities and rules are unchanged and remain
authoritative in `specs/005-release-distribution/data-model.md`.

---

## ReleaseArtifact (amended)

| Field | Type | Validation |
|-------|------|------------|
| `os` | enum | `windows` \| `macos` \| `linux` (unchanged) |
| `arch` | enum | `x64` \| `arm64` (unchanged) |
| `version` | string | equals the tag's `version` (unchanged) |
| `fileName` | string | **MUST identify os, arch, version: `ameditor-<version>-<os>-<arch>.<ext>` (FR-001/002)** — the product-name prefix `Another Markdown Editor` is replaced by `ameditor`. |
| `sha256` | string | lowercase hex (unchanged) |
| `target` | enum | unchanged |

**Required artifact set per release** (unchanged except `fileName`):

| os | arch | target | fileName |
|----|------|--------|----------|
| windows | x64 | nsis | `ameditor-<v>-windows-x64.exe` |
| windows | x64 | zip | `ameditor-<v>-windows-x64.zip` |
| macos | x64 | dmg | `ameditor-<v>-macos-x64.dmg` |
| macos | x64 | zip | `ameditor-<v>-macos-x64.zip` |
| macos | arm64 | dmg | `ameditor-<v>-macos-arm64.dmg` |
| macos | arm64 | zip | `ameditor-<v>-macos-arm64.zip` |
| linux | x64 | AppImage | `ameditor-<v>-linux-x64.AppImage` |

**State transitions**: unchanged from spec 005.

## PackageDefinition (unchanged, references renamed assets)

- Scoop manifest `architecture.64bit.url` → the windows portable zip
  `ameditor-<v>-windows-x64.zip`; `architecture.64bit.bin` maps the packaged
  `ameditor.exe` to the command `another-markdown-editor` (FR-004/FR-008).
- Homebrew formula per-arch URLs → the renamed macOS zips / Linux AppImage;
  `install` still references `Another Markdown Editor.app` on macOS (bundle name
  unchanged) and installs the renamed AppImage to `bin` on Linux (FR-005).
