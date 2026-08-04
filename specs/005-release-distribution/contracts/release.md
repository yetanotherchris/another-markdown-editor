# Contract: Release Distribution

**Date**: 2026-08-04 | **Feature**: [005-release-distribution](./spec.md) |
**Data model**: [data-model.md](./data-model.md)

The authoritative contract between the release workflow, the package
definitions, the README, and the tests that validate them. `tests/release/release-contracts.test.ts`
enforces the machine-checkable parts of this document.

---

## 1. Workflow contract (`.github/workflows/build-release.yml`)

| Requirement | Contract | Spec |
|-------------|----------|------|
| Trigger | `on.push.tags` MUST match exactly `'v[0-9]+.[0-9]+.[0-9]+'` | FR-001, US1 s3 |
| Permissions | `permissions: contents: write` (no other scope, no secrets) | FR-013 |
| Build job | job `build`, `strategy.matrix` with `fail-fast: false` and the four legs `windows-latest`/`macos-15-intel`/`macos-latest`/`ubuntu-latest`; NO `continue-on-error` on any required leg | FR-004/010 |
| Version derivation | each leg derives `VERSION` = tag minus leading `v` and uses it in packaging | FR-003 |
| Publish suppression | build legs run `electron-builder --publish never` | R1/R5 |
| macOS signing off | macOS legs set `CSC_IDENTITY_AUTO_DISCOVERY=false` | R5, Assumptions |
| Release job | job `release`, `needs: build`, `if: github.ref_type == 'tag'` | R1 |
| Reachability gate | before anything else, `git merge-base --is-ancestor <ref> refs/remotes/origin/main`; non-zero → fail with a message naming the tag | FR-002, US1 s4 |
| Completeness/verification | download all artifacts; assert the full required set exists (data-model artifact table); compute sha256 for the manifest targets | FR-009 |
| Release creation | `softprops/action-gh-release@v2` with `files` = all artifacts and `fail_on_unmatched_files: true` | FR-010 |
| Manifest updates | run `updatescoop.ps1` then `updatebrew.ps1` from the downloaded artifacts; commit via `stefanzweifel/git-auto-commit-action@v5` on `main` | FR-006/007/008 |

## 2. Artifact contract

- Every asset name embeds `productName-version-os-arch`: `Another Markdown
  Editor-<v>-windows-x64-setup.exe`, `...-windows-x64-portable.zip`,
  `...-macos-x64.dmg`, `...-macos-x64.zip`, `...-macos-arm64.dmg`,
  `...-macos-arm64.zip`, `...-linux-x64.AppImage` (FR-005).
- The required set is fixed (data-model.md artifact table). `release` fails if
  any is missing.
- Hashes in the manifests are SHA-256, lowercase, computed in CI from the exact
  downloaded files (FR-008).

## 3. Scoop manifest contract (`scoop/another-markdown-editor.json`)

Valid JSON with:

- `version` equal to the tag version
- `description`, `homepage`, `license`
- `architecture.64bit.url` → the windows portable zip release URL
- `architecture.64bit.hash` → sha256 of that zip
- `architecture.64bit.bin` → `[["Another Markdown Editor.exe", "another-markdown-editor"]]`

The URL embeds the version: `.../releases/download/v<version>/Another Markdown Editor-<version>-windows-x64-portable.zip`.

## 4. Homebrew formula contract (`Formula/another-markdown-editor.rb`)

Ruby class `AnotherMarkdownEditor < Formula` with:

- `version "<v>"`
- `on_macos do` block: `if Hardware::CPU.arm?` → arm64 zip URL + sha256; `else` → x64 zip URL + sha256
- `on_linux do` block: AppImage URL + sha256
- `install`: macOS → `app.install "Another Markdown Editor.app"`; Linux → install the AppImage into `bin` (chmod +x)

URLs embed the version like the Scoop URL.

## 5. README installation contract (`README.md`)

A clearly headed `## Installation` section containing, copyable verbatim:

- macOS/Linux: `brew install yetanotherchris/tap/another-markdown-editor` (and a
  note that the tap is added automatically by brew; if a separate tap-add is
  required, include it).
- Windows: `scoop bucket add another-markdown-editor https://github.com/yetanotherchris/another-markdown-editor` followed by `scoop install another-markdown-editor`.

The commands must reference the package names used by the manifests
(`another-markdown-editor`), so a manifest rename must update the README in the
same change (US3 scenarios 1–4; FR-011/012).

## 6. Failure contract (FR-010, US4)

- A tag not matching the regex → workflow never runs.
- A valid tag not reachable from `main` → `release` job fails before any publish.
- Any required build leg fails → `release` job never runs.
- Any required artifact missing or hash-verification failing → no release, no
  manifest commit.
- `fail_on_unmatched_files` → a release cannot be created with a missing asset.

## 7. Test contract (`tests/release/release-contracts.test.ts`)

Structural assertions over the committed files (research R7 — deliberately not a
YAML parse):

- Workflow: trigger regex present; `permissions` has exactly `contents: write`;
  the four matrix legs; `fail-fast: false`; no `continue-on-error: true` on
  required legs; `--publish never` on build legs; `CSC_IDENTITY_AUTO_DISCOVERY=false`
  on macOS legs; `needs: build`; reachability step; `fail_on_unmatched_files: true`;
  `updatescoop.ps1` and `updatebrew.ps1` invoked; `git-auto-commit-action`.
- Scoop manifest: parses as JSON; required fields present and typed.
- Formula: class name, `version` line, `on_macos`/`on_linux` blocks, `sha256`,
  `app.install` / `bin.install` presence.
- README: `## Installation` section and the two exact commands.
