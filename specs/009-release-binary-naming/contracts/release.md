# Contract: Release Binary Naming

**Date**: 2026-08-04 | **Feature**: [009-release-binary-naming](./spec.md) |
**Data model**: [data-model.md](./data-model.md)

Amends the artifact-naming parts of `specs/005-release-distribution/contracts/release.md`.
`tests/release/release-contracts.test.ts` enforces the machine-checkable parts
of this document.

---

## 1. Artifact contract (amends 005 contracts §2)

- Every asset name is `ameditor-<version>-<os>-<arch>.<ext>`: `ameditor-<v>-windows-x64.exe`,
  `...-windows-x64.zip`, `...-macos-x64.dmg`, `...-macos-x64.zip`,
  `...-macos-arm64.dmg`, `...-macos-arm64.zip`, `...-linux-x64.AppImage`
  (FR-001/002, spec 005 FR-005 preserved). The `-setup` / `-portable` suffixes
  still do not exist.
- `electron-builder.yml` `win.artifactName` /
  `mac.artifactName` / `linux.artifactName` use the `ameditor-` prefix with the
  literal os token (`windows` / `macos` / `linux`) as before.
- The required set is fixed (data-model.md artifact table); `release` fails if
  any is missing.

## 2. Workflow contract (amends 005 contracts §1 upload/verify rows)

- Build legs upload only the curated installers: globs
  `dist/ameditor-*.exe`, `dist/ameditor-*.zip`, `dist/ameditor-*.dmg`,
  `dist/ameditor-*.AppImage` (spec 009 FR-003).
- The release job's required-artifact verification enumerates the seven
  `ameditor-$VERSION-*` names (spec 009 FR-003).

## 3. Scoop manifest contract (amends 005 contracts §3)

- `architecture.64bit.url` → the windows portable zip release URL for
  `ameditor-<version>-windows-x64.zip`; the URL embeds the version like before.
- `architecture.64bit.bin` → maps the packaged `ameditor.exe` to the command
  `another-markdown-editor` (FR-004/FR-008).

## 4. Homebrew formula contract (amends 005 contracts §4)

- `on_macos` / `on_linux` URLs reference the renamed `ameditor-*` assets.
- `install`: macOS → `app.install "Another Markdown Editor.app"` (unchanged);
  Linux → `bin.install "ameditor-<version>-linux-x64.AppImage"` (renamed).

## 5. Test contract (amends 005 contracts §7)

The release-contract suite asserts the renamed upload globs, the renamed
required set, the renamed Scoop URL, and the renamed `bin.install` AppImage
filename, and passes.
