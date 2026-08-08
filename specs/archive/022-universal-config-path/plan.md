# Implementation Plan: Universal Config Path

**Branch**: `022-universal-config-path` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-universal-config-path/spec.md`

## Summary

The per-user configuration file moves to a platform-independent location:
`~/.config/markdownmeister/config.json` on **all** platforms (Linux honours
`$XDG_CONFIG_HOME`, FR-002). Every config read/write — recent items, settings,
window state, spellcheck dictionary — flows through the single
`recentItemsConfigPath()` seam, so changing that one resolver redirects the
whole app. A one-time startup migration moves an existing config from the old
`appData/markdownmeister` location to the universal location (rename, not copy;
new config wins, FR-004/006/007), and the write path already creates the
directory recursively (FR-003). `MM_CONFIG_DIR` keeps bypassing the universal
logic for test isolation (FR-009/010); if the home directory cannot be
determined the app falls back to `appData` (FR-011).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: Electron 43 (`app.getPath`), Node `os` (`homedir`). No new dependencies.

**Storage**: the single shared `config.json` per-user file — moves from
`appData/markdownmeister` to `~/.config/markdownmeister`.

**Testing**: Vitest (pure path/migration unit tests in the main project); Playwright e2e (redirect `USERPROFILE`/`HOME` to a temp home so the universal path + migration are exercised without touching the real profile).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), WYSIWYG markdown editor.

**Performance Goals**: none — path resolution is trivial; migration is a single
rename at startup.

**Constraints**: Renderer never touches the filesystem (main-only change); the
migration MUST NOT run when `MM_CONFIG_DIR` is set (tests must never touch the
developer's real config); migration is a rename (not a copy), new-wins, and
failure is non-fatal.

**Scale/Scope**: one new main module + one resolver change + one startup hook +
unit + e2e coverage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | Main-only; no renderer/IPC/preload change; `MM_CONFIG_DIR` seam unchanged (FR-009/010) | **PASS** |
| II. Every Path Is Untrusted | Config paths are resolved by main from `os.homedir()` / `app.getPath('appData')` / `$XDG_CONFIG_HOME` — never renderer-supplied; migration renames only the two known resolved paths | **PASS** |
| III. Never Lose The User's Words | Migration preserves all config data (rename, FR-006); new-wins leaves the old file in place (FR-007); failure is non-fatal with the old file left (FR-008) | **PASS** |
| IV. Calm, Predictable Editing | No editor interaction; a one-time startup rename | **PASS** |
| V. Test What Can Corrupt Or Escape | Config persistence is a data-integrity area — unit tests cover every migration outcome (nothing/migrated/new-wins/failed) and e2e covers the universal path + migration with an isolated home | **PASS** |

**Post-design re-check**: no principle is violated.

## Phase 1 Design decisions

**One resolver, three pure functions.** A new `src/main/configPath.ts` exports:
`universalConfigDir`, `legacyConfigPath`, and `migrateConfigFile`. The existing
`recentItemsConfigPath()` (the single seam every config user calls) is rewritten
to return the universal path (or the `MM_CONFIG_DIR` override, unchanged). All
path computation is pure — unit-testable without Electron.

**Startup migration, guarded by the test seam.** `index.ts` runs
`migrateConfigToUniversalLocation()` first inside `app.whenReady()`, before any
config is read. It returns immediately when `MM_CONFIG_DIR` is set (tests must
never move the developer's real config), when the home directory is unavailable
(FR-011), or when the legacy path equals the universal path (Linux, XDG unset).
Otherwise `migrateConfigFile` runs: `new-wins` (both exist → leave old),
`migrated` (rename), `nothing` (no legacy), `failed` (leave old + log).

**Directory creation on write.** `writeSettingsFile`/`writeWindowStateFile`
already `mkdirSync(dir, { recursive: true })`, which satisfies FR-003 when the
config is first written.

## Project Structure

### Documentation (this feature)

```text
specs/022-universal-config-path/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R4 decisions
├── data-model.md        # Universal/Legacy Config Path entities
├── quickstart.md        # Manual verification script
├── contracts/
│   └── config-path.md   # Path resolution + migration contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/main/configPath.ts              # NEW: universalConfigDir/Path, legacyConfigPath, migrateConfigFile
src/main/recentItemsPath.ts         # recentItemsConfigPath → universal path (+ MM_CONFIG_DIR + FR-011 fallback)
src/main/index.ts                   # startup migration hook (guarded by MM_CONFIG_DIR)
tests/main/configPath.test.ts       # NEW: pure path + migration unit tests
tests/e2e/universal-config.spec.ts  # NEW: isolated-home e2e (universal path, migration, dir creation)
```

**Structure decision**: a new pure module mirrors the existing `settingsFile` /
`recentItemsPath` split (pure + electron-free where possible); `recentItemsPath`
keeps the thin Electron seam.

## Phase status

- Phase 1: Foundational — `configPath.ts` + resolver change + startup hook
- Phase 2: US1+US3 — universal path write + directory creation (resolver + write path)
- Phase 3: US2 — migration (startup hook + unit tests)
- Phase 4: US4 — `MM_CONFIG_DIR` isolation confirmed; e2e with redirected home
- Phase 5: Polish — gates, spec archive, status table

## Deferred / later features

- Multi-config or per-workspace config (out of scope)
- A migration UI / prompt (spec: silent one-time move)

## Complexity tracking

None — no principle violated. The migration is a single guarded rename.
