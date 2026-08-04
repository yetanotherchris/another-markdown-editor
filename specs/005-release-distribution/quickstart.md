# Quickstart: Release Distribution validation

**Date**: 2026-08-04 | **Feature**: [005-release-distribution](./spec.md) |
**Contracts**: [contracts/release.md](./contracts/release.md)

Manual validation of the release pipeline end-to-end. The GitHub Actions
workflow cannot run locally, so the real tag→release→install flow is validated
on a fork (or the real repo, with care). The machine-checkable parts are
covered by `npm run test` (`tests/release/release-contracts.test.ts`).

## Prerequisites

- Node/npm installed; repo checked out on the `005-release-distribution` branch.
- A GitHub fork with Actions enabled (fork used unless you are the maintainer).
- Homebrew on macOS/Linux (or Linuxbrew) and Scoop on Windows for the install
  checks.

## 1. Automate gate (local, no GitHub needed)

```bash
npm ci
npm run lint
npm run typecheck
npm run test          # includes tests/release/release-contracts.test.ts
npm run test:e2e      # existing regression gate must stay green
```

Expected: all four commands exit 0. `npm run test` reports the release-contract
tests (workflow trigger/gates/permissions, Scoop manifest JSON shape, Homebrew
formula shape, README commands) passing.

## 2. Package locally (proves electron-builder config)

```bash
npx electron-builder --publish never --win --x64   # on Windows
npx electron-builder --publish never --mac         # on macOS
npx electron-builder --publish never --linux       # on Linux
```

Expected: `dist/` contains the artifacts named per contracts §2
(`Another Markdown Editor-<version>-windows-x64-setup.exe`,
`...-portable.zip`, `...-macos-x64.dmg`/`...-macos-x64.zip`, `...-linux-x64.AppImage`).
On macOS, `CSC_IDENTITY_AUTO_DISCOVERY=false` is required (no signing).

## 3. Release flow (GitHub)

From the fork's `main`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Expected:

- The `Build and Release` workflow runs. The four build legs succeed (none has
  `continue-on-error`), then the `release` job runs.
- The release job's reachability gate passes (tag pushed from `main`).
- A single GitHub Release `v0.1.0` appears containing all seven required
  artifacts (contracts §2).
- The workflow commits the updated `scoop/another-markdown-editor.json` and
  `Formula/another-markdown-editor.rb` to `main` with version `0.1.0` and the
  computed SHA-256 hashes.

Negative cases (each verified once on the fork):

- Push `v0.1` (wrong shape): workflow does not run (FR-001).
- Tag a non-main commit with `v0.1.1` and push: workflow runs, `release` job
  fails at the reachability gate; no release appears (FR-002, US1 s4).
- (Optional) Break a build leg in a scratch branch and tag it: no release is
  created (FR-010).

## 4. Install (package managers)

macOS/Linux:

```bash
brew install yetanotherchris/tap/another-markdown-editor
another-markdown-editor --version   # or launch the app
```

Windows:

```bash
scoop bucket add another-markdown-editor https://github.com/yetanotherchris/another-markdown-editor
scoop install another-markdown-editor
```

Expected: the installed app version equals the tag version (US2 s1–2).
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
