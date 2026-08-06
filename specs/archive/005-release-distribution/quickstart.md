# Quickstart: Release Distribution validation

**Date**: 2026-08-04 | **Feature**: [005-release-distribution](./spec.md) |
**Contracts**: [contracts/release.md](./contracts/release.md)

Manual validation of the release pipeline end-to-end. The GitHub Actions
workflow cannot run locally, so the real tag→release→install flow is validated
on a fork (or the real repo, with care). There is no automated release-contract
suite (removed 2026-08-05); the checks below are the verification path.

## Prerequisites

- Node/npm installed; repo checked out on the `005-release-distribution` branch.
- A GitHub fork with Actions enabled (fork used unless you are the maintainer).
- Homebrew on macOS/Linux (or Linuxbrew) and Scoop on Windows for the install
  checks.
- **Homebrew tap prerequisite (FR-012):** `brew install
  yetanotherchris/tap/another-markdown-editor` resolves to the repository
  `github.com/yetanotherchris/homebrew-tap`. That tap must exist and host a copy
  of `Formula/another-markdown-editor.rb` before the brew install path can
  succeed (see spec.md `## Clarifications`). Until it exists, validate the
  formula by installing it from this repo's `Formula/` directory instead.

## 1. Automate gate (local, no GitHub needed)

```bash
npm ci
npm run lint
npm run typecheck
npm run test          # unit suites; no release-contract suite (removed 2026-08-05)
npm run test:e2e      # existing regression gate must stay green
```

Expected: all commands exit 0.

## 2. Package locally (proves electron-builder config)

```bash
npx electron-builder --publish never --win --x64   # on Windows
npx electron-builder --publish never --mac         # on macOS
npx electron-builder --publish never --linux       # on Linux
```

Expected: `dist/` contains the artifacts named per contracts §2
(`ameditor-<version>-windows-x64.exe`,
`...-windows-x64.zip`, `...-macos-x64.dmg`/`...-macos-x64.zip`, `...-linux-x64.AppImage`).
On macOS, `CSC_IDENTITY_AUTO_DISCOVERY=false` is required (no signing). Note the
name is `-windows-x64.exe` / `-windows-x64.zip`, NOT `-setup.exe` /
`-portable.zip`. Artifact names use `${version}` from `package.json` for a local
`--publish never` run; in CI the tag version is injected via
`--config.extraMetadata.version`, and the release job rewrites `package.json`'s
version to the tag (`updatepackagejson.ps1`) so the two always agree.

## 3. Release flow (GitHub)

From the fork's `main`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Expected:

- The `Build and Release` workflow runs. The `validate` job passes (semver
  regex, reachability gate, no existing release), the four build legs succeed
  (none has `continue-on-error`), then the `release` job runs.
- The release job verifies the required artifact set, then creates a **draft**
  GitHub Release `v0.1.0` containing all seven required artifacts (contracts
  §2), updates both manifests and `package.json`'s version on `main`, commits
  them (`branch: main`), and only then **publishes** the draft. Tagging does not
  require a matching `package.json`; the release job reconciles it.
- The workflow commits the updated `another-markdown-editor.json`,
  `Formula/another-markdown-editor.rb`, and `package.json` to `main` with version
  `0.1.0` and the computed SHA-256 hashes, and the published release references
  them.

Negative cases (each verified once on the fork):

- Push `v0.1` (wrong shape): workflow does not run (FR-001).
- Tag a non-main commit with `v0.1.1` and push: workflow runs, `validate` job
  fails at the reachability gate; no release appears (FR-002, US1 s4).
- Re-tag an already-released version and push: `validate` fails clearly; no
  release overwritten (spec Edge Cases).
- (Optional) Break a build leg in a scratch branch and tag it: no release is
  created (FR-010).

## 4. Install (package managers)

macOS/Linux:

```bash
brew install yetanotherchris/tap/another-markdown-editor
ameditor --version   # or launch the app
```

Windows:

```bash
scoop bucket add another-markdown-editor https://github.com/yetanotherchris/another-markdown-editor
scoop install another-markdown-editor
```

Expected: the installed app version equals the tag version (US2 s1–2), and
`ameditor` is the command that launches it on every platform.
Verify the checksum path: `scoop install` fails if the manifest hash does not
match the downloaded artifact (US2 s3).

## 5. README walk

Open the README, find `## Installation`, and follow the platform example
verbatim in a clean environment (US3). The commands must succeed against the
current release.

## Exit criteria

- The four-command gate is green.
- A fork run produces a release with all seven artifacts and both updated
  manifests.
- brew and scoop installs succeed on their platforms and report the tag version.
