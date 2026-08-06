# Quickstart: Release Binary Naming validation

**Date**: 2026-08-04 | **Feature**: [009-release-binary-naming](./spec.md) |
**Contracts**: [contracts/release.md](./contracts/release.md)

Manual validation of the asset rename.

## 1. Automate gate (local)

```bash
npm run lint
npm run typecheck
npm run test          # unit tests; no release-contract suite (removed 2026-08-05)
```

Expected: all green.

## 2. Package locally (proves electron-builder naming)

```bash
npx electron-builder --publish never --win --x64   # on Windows
npx electron-builder --publish never --mac         # on macOS
npx electron-builder --publish never --linux       # on Linux
```

Expected: `dist/` contains the artifacts named `ameditor-<version>-windows-x64.exe`,
`...-windows-x64.zip`, `...-macos-x64.dmg` / `...-macos-x64.zip`,
`...-linux-x64.AppImage`. The product name inside each package
(`Another Markdown Editor`) is unchanged.

## 3. Release flow (GitHub)

Tag `v<version>` from `main` and push. Expected: the workflow uploads and
verifies the seven `ameditor-*` artifacts, updates the Scoop manifest and
Homebrew formula to the renamed URLs, and publishes the release.

## 4. Install (package managers)

```bash
brew install yetanotherchris/tap/another-markdown-editor   # macOS/Linux
scoop install another-markdown-editor                      # Windows
```

Expected: installs succeed against the renamed assets and the installed app
version equals the tag version. The command is `ameditor` on every package
manager (`ameditor --version` launches the app).

## Exit criteria

- The three-command gate is green with the renamed assertions.
- A local packaging run produces `ameditor-*` assets.
- brew and scoop installs succeed from a release built on this branch.
