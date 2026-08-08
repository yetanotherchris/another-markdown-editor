# Quickstart: Universal Config Path

Runnable verification for spec 022. Contract: [contracts/config-path.md](./contracts/config-path.md).

## Prerequisites

- `npm ci`; build with `npm run build`.

## Verify the universal location (US1/US3)

1. Launch the app (from a build), open a folder, open a file, then quit.
2. The config file exists at `~/.config/markdownmeister/config.json`
   (`%USERPROFILE%\.config\markdownmeister\config.json` on Windows; on Linux
   `$XDG_CONFIG_HOME/markdownmeister/config.json` when `$XDG_CONFIG_HOME` is
   set). It contains the settings and recent-items sections.
3. Delete `~/.config` entirely, relaunch, open a file, quit → the directory and
   file are recreated (FR-003).

## Verify the migration (US2)

1. If you have an existing `%APPDATA%\markdownmeister\config.json` (or
   `~/Library/Application Support/markdownmeister/config.json`), launch the app
   once: the file is moved to the universal location and the old location is
   empty. Recent items and settings are preserved (FR-004/006, SC-002/003).
2. If both exist (manual copy), the universal file wins and the old one is left
   in place (FR-007).

## Verify isolation (US4)

```sh
$env:MM_CONFIG_DIR = "$env:TEMP\mm-isolated-config"
```

Launch with the seam set → config is read/written under `MM_CONFIG_DIR`, never
`~/.config/markdownmeister` (FR-009/010).

## Automated checks

```sh
npx vitest run tests/main/configPath.test.ts   # pure path + migration outcomes
npx playwright test tests/e2e/universal-config.spec.ts
```

The e2e suite redirects `USERPROFILE`/`HOME` to a temp home so the universal
path and migration are exercised without touching the real profile.

## Regression gates

```sh
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
