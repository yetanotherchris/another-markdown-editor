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
| Trigger | `on.push.tags` MUST be the glob `'v[0-9]+.[0-9]+.[0-9]+'` (a glob: `.` is literal, `[0-9]` is a character class, `+` is one-or-more — NOT a regex). The strict `^v[0-9]+\.[0-9]+\.[0-9]+$` regex is enforced inside the `validate` job | FR-001, US1 s3 |
| Preflight | job `validate` (before `build`): strict semver regex check, `git merge-base --is-ancestor <ref> refs/remotes/origin/main` (non-zero → fail naming the tag), and `gh release view` — a tag whose version is already released fails clearly | FR-001/002, US1 s4, Edge Cases |
| Permissions | workflow default `permissions: contents: read`; job-scoped `contents: write` ONLY on `release` (no other scope, no secrets) | FR-013 |
| Build job | job `build`, `needs: validate`, `strategy.matrix` with `fail-fast: false` and the four legs `windows-latest`/`macos-15-intel`/`macos-latest`/`ubuntu-latest`; NO `continue-on-error` on any required leg | FR-004/010 |
| Version derivation | each leg derives `VERSION` = tag minus leading `v` AND uses it in packaging via `--config.extraMetadata.version=<VERSION>`; the `release` job rewrites `package.json`'s version to the tag and commits it to `main` with the manifests | FR-003 |
| Publish suppression | build legs run `electron-builder --publish never` | R1/R5 |
| macOS signing off | macOS legs set `CSC_IDENTITY_AUTO_DISCOVERY=false` | R5, Assumptions |
| Release job | job `release`, `needs: build`, `if: github.ref_type == 'tag'` | R1 |
| Completeness/verification | download all artifacts; assert the full required set exists (data-model artifact table); compute sha256 for the manifest targets BEFORE the release is public | FR-009 |
| Release creation | `softprops/action-gh-release` (SHA-pinned v3) creates a **draft** with `draft: true`, `files` = all artifacts and `fail_on_unmatched_files: true`; a second invocation (SHA-pinned v3, `tag_name`, `draft` omitted) publishes the draft AFTER the manifest commit | FR-009/010, R8 |
| Manifest updates | on main (explicit `git checkout -B main origin/main` + `git pull --rebase origin main`), run `updatescoop.ps1`, `updatebrew.ps1`, then `updatepackagejson.ps1` from the downloaded artifacts; commit via `stefanzweifel/git-auto-commit-action` (SHA-pinned v7) with `branch: main` and `file_pattern` covering the two manifests and `package.json` | FR-006/007/008 |
| Action pinning | all third-party actions pinned to full commit SHAs, kept current by Dependabot (`.github/dependabot.yml`) | Security review |

## 2. Artifact contract

- Every asset name embeds `productName-version-os-arch`: `Another Markdown
  Editor-<v>-windows-x64.exe`, `...-windows-x64.zip`, `...-macos-x64.dmg`,
  `...-macos-x64.zip`, `...-macos-arm64.dmg`, `...-macos-arm64.zip`,
  `...-linux-x64.AppImage` (FR-005). The `-setup` / `-portable` suffixes in
  earlier drafts do not exist: `electron-builder.yml` `win.artifactName` is
  `Another Markdown Editor-${version}-windows-${arch}.${ext}` for the `nsis`
  and `zip` targets.
- The required set is fixed (data-model.md artifact table). `release` fails if
  any is missing.
- Hashes in the manifests are SHA-256, lowercase, computed in CI from the exact
  downloaded files (FR-008), and are written to the manifests while the release
  is still a draft (before it becomes public — FR-009).

## 3. Scoop manifest contract (`scoop/another-markdown-editor.json`)

Valid JSON with:

- `version` equal to the tag version
- `description`, `homepage`, `license`
- `architecture.64bit.url` → the windows portable zip release URL
- `architecture.64bit.hash` → sha256 of that zip
- `architecture.64bit.bin` → `[["Another Markdown Editor.exe", "another-markdown-editor"]]`

The URL embeds the version: `.../releases/download/v<version>/Another Markdown Editor-<version>-windows-x64.zip`.

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
  required, include it). **External dependency:** the tap resolves to
  `github.com/yetanotherchris/homebrew-tap`, which must exist and host a copy of
  `Formula/another-markdown-editor.rb` for FR-012/SC-003 to hold. Until it is
  created this document command is the target state, not a working path.
- Windows: `scoop bucket add another-markdown-editor https://github.com/yetanotherchris/another-markdown-editor` followed by `scoop install another-markdown-editor`.

The commands must reference the package names used by the manifests
(`another-markdown-editor`), so a manifest rename must update the README in the
same change (US3 scenarios 1–4; FR-011/012).

## 6. Failure contract (FR-010, US4)

- A tag not matching the glob → workflow never runs.
- A valid tag whose version is already released → `validate` fails clearly,
  before any build.
- A valid tag not reachable from `main` → `validate` fails before any build.
- Any required build leg fails → `release` job never runs.
- Any required artifact missing → the draft release is never created.
- Any manifest-update or commit step fails → the draft is never published, so no
  public release exists. (The manifests may be committed on `main` before the
  publish step; if the final publish fails the draft stays unpublished — no
  *public* release, satisfying FR-010's core guarantee.)
- `fail_on_unmatched_files` → a release cannot be created with a missing asset.

## 7. Test contract (`tests/release/release-contracts.test.ts`)

Structural assertions over the committed files (research R7 — deliberately not a
YAML parse):

- Workflow: trigger glob present; `validate` job with strict semver regex,
  reachability gate and duplicate-release check; job-scoped `permissions`
  (`contents: read` default, `contents: write` on `release` only); the four
  matrix legs; `fail-fast: false`; no `continue-on-error: true` on required
  legs; `--publish never` AND `--config.extraMetadata.version` on build legs;
  `updatepackagejson.ps1` syncing `package.json` version to the tag; curated upload globs;
  `CSC_IDENTITY_AUTO_DISCOVERY=false` on macOS legs; `needs: build`; the
  required artifact set; `draft: true` + `fail_on_unmatched_files: true` +
  `tag_name` publish; `git checkout -B main`; `updatescoop.ps1` / `updatebrew.ps1`
  invoked with `branch: main` on the commit; the SHA pins for the third-party
  actions.
- Scoop manifest: parses as JSON; required fields present and typed.
- Formula: class name, `version` line, `on_macos`/`on_linux` blocks, `sha256`,
  the linux-arm64 `odie` guard, `app.install` / `bin.install` presence.
- README: `## Installation` section and the two exact commands.
