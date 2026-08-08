# Tasks: Universal Config Path

**Feature**: `022-universal-config-path` | **Date**: 2026-08-08

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/config-path.md](./contracts/config-path.md), [quickstart.md](./quickstart.md)

**Implementation strategy**: Add the pure path/migration module first (unit-test
it), then redirect the single config resolver, then hook the startup migration,
then e2e-verify against a redirected home.

---

## Phase 1: Foundational (Path Module + Resolver)

- [ ] T001 Create `src/main/configPath.ts` with `universalConfigDir`,
      `universalConfigPath`, `legacyConfigPath`, and `migrateConfigFile`
      (returns `nothing | migrated | new-wins | failed`), pure and electron-free
      (FR-001/002/005/006/007/008).
- [ ] T002 Rewrite `recentItemsConfigPath()` in `src/main/recentItemsPath.ts`:
      `MM_CONFIG_DIR` override first (unchanged, FR-009/010), then
      `universalConfigPath(...)` from `os.homedir()` + `process.platform` +
      `$XDG_CONFIG_HOME`, with an `appData/markdownmeister` fallback when the
      home directory is unavailable (FR-011).

**Checkpoint**: all config consumers now resolve to the universal path under the
seam; unit tests for the pure functions pass.

---

## Phase 2: User Story 2 - Startup Migration

- [ ] T003 Add `migrateConfigToUniversalLocation()` and call it first inside
      `app.whenReady()` in `src/main/index.ts` (before any `loadSettings`):
      skip when `MM_CONFIG_DIR` is set (US4), when `os.homedir()` is empty
      (FR-011), or when legacy equals universal (Linux without XDG); otherwise
      run `migrateConfigFile` and log a warning on failure (FR-004/008).

**Checkpoint**: an existing `appData/markdownmeister/config.json` moves to the
universal location on launch.

---

## Phase 3: User Story 1 + 3 + 4 - Verification

- [ ] T004 [US1] Add `tests/main/configPath.test.ts` covering the path values
      (win32/darwin/linux, XDG override, FR-011 fallback) and all four migration
      outcomes (nothing/migrated/new-wins/failed with legacy left) (FR-005-008).
- [ ] T005 [US2] Add `tests/e2e/universal-config.spec.ts` launching Electron
      with `USERPROFILE`/`HOME` redirected to a temp home: config lands at
      `<home>/.config/markdownmeister/config.json` and contains settings +
      recent items (US1/SC-001); a seeded `appData/markdownmeister/config.json`
      is migrated and the old location is empty (US2/SC-002/003); a missing
      `~/.config` is created on write (US3/FR-003); `MM_CONFIG_DIR` still
      isolates (US4/FR-010).
- [ ] T006 [US2] Run `npx playwright test tests/e2e/universal-config.spec.ts`
      and confirm green.

## Phase 4: Polish

- [ ] T007 Run the gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e` (the full existing suite must still pass — the seam
      keeps it isolated).
- [ ] T008 Archive the feature (`git mv specs/022-universal-config-path
      specs/archive/022-universal-config-path`), set the spec's **Status** to
      `Archived`, mark all tasks `[X]`, and update the
      `022-universal-config-path` row in `AGENTS.md` to `Archived` / `Complete`.

---

## Dependencies & Execution Order

- T001 → T002 → T003 (path module → resolver → startup hook).
- T004 (unit) can start after T001; T005/T006 after T003.
- T007 after all; T008 last.

## Implementation Strategy

1. Pure path + migration module with unit tests.
2. Resolver redirect + startup migration hook.
3. e2e with redirected home; gates; archive.
