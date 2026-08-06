# Tasks: Window State Persistence

**Feature**: `011-window-state-persistence` | **Date**: 2026-08-06

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/renderer.md](./contracts/renderer.md)

**Implementation strategy**: Pure-foundation first — the Electron-free store
(`windowStateFile.ts`) and the display-fit module (`windowStateFit.ts`) with
their unit tests (Phase 2). Then the Electron wiring: `createWindow` restores the
saved bounds + maximized state, and `trackWindowState` persists move/resize
debounced (Phase 3, US1/US2). Then the fallback/robustness journeys — maximized
restore, off-screen and malformed fallback (Phase 4, US3). Then the FR-013
explorer-closed alignment (Phase 5, US4). Phase 6 polishes and runs the final
four-command gate. Everything is validated with `npm run lint`,
`npm run typecheck`, `npm run test`, `npm run test:e2e` throughout.

The config-file shape, display-fit contract, and e2e anchors are pinned in
`contracts/renderer.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the branch baseline before any change.

- [X] T001 Establish a green baseline on the `011-window-state-persistence`
      branch (created from clean `main` per AGENTS.md): run `npm run lint`,
      `npm run typecheck`, `npm run test`, and confirm the e2e suite passes
      (`npm run test:e2e`). Record the results in this file. Confirm the
      artifacts (`spec.md`, `plan.md`, `research.md`, `data-model.md`,
      `contracts/renderer.md`, `quickstart.md`) are present and consistent.
      *Result: all four gates green. A pre-existing `main` defect was fixed as
      part of baseline: the shebang in `scripts/check-maintainability.mjs`
      broke vitest's module transform on this machine, failing `npm run test`;
      replaced with a comment (recorded in plan.md decision log).*

**Checkpoint**: baseline green; artifacts present.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: the pure, Electron-free window-state store and display-fit rules every
user story depends on.**

- [X] TT002 Add `src/main/windowStateFile.ts`: the `WindowState` interface
      (`x`, `y`, `width`, `height`, `isMaximized`), `loadWindowStateFile(filePath)`
      (field-by-field validation; missing/malformed → `null`), and
      `writeWindowStateFile(filePath, state)` (read-modify-write preserving
      `.recentItems` and `.settings`, atomic `0o600` + `mkdir`), plus
      `snapshotToState(snapshot)` returning `null` when minimized (FR-004,
      FR-005, FR-006, FR-008, FR-009) (plan.md, data-model.md).
- [X] TT003 Add `src/main/windowStateFit.ts`: `Rect`, `DEFAULT_WINDOW`
      (1200×800), `fitWindowToDisplays(bounds, displays)` (pick containing
      display or primary, clamp size, clamp position so the rect is fully
      visible — FR-007), and `centerIn(display)` (default centering, FR-006)
      (plan.md, data-model.md).
- [X] TT004 [P] Write `tests/main/windowStateFile.test.ts`: round-trip of a
      valid state; missing/malformed/non-object → `null`; field-by-field
      recovery from a partially-corrupt object; `writeWindowStateFile` preserves
      a pre-existing `recentItems` and `settings` (and vice versa — the shared
      file read-modify-write); `snapshotToState` returns `null` when minimized
      and a complete state otherwise (FR-008).
- [X] TT005 [P] Write `tests/main/windowStateFit.test.ts`: an off-screen rect is
      repositioned fully into an available display; a rect larger than a display
      is resized to fit; a partially off-screen rect is pushed fully on-screen;
      a rect whose display is gone falls back to the primary; `centerIn` centres
      the default window (FR-006, FR-007).

**Checkpoint**: `npm run typecheck` and `npm run test` pass; the pure store and
fit rules are pinned.

---

## Phase 3: US1/US2 — Restore and persist the window (P1)

**Goal**: the window opens at the saved bounds (FR-001) and moves/resizes are
persisted automatically (FR-002), stored in the shared config (FR-003).

**Independent Test**: contracts/renderer.md §E2e items 1 and 2; quickstart.md §1, §2.

### Implementation

- [X] TT006 [US1/US2] Add `src/main/windowState.ts`: `windowStatePath()` =
      `recentItemsConfigPath()` (FR-003); `loadWindowState()`; `resolveLaunchState()`
      combining the saved state with `screen.getAllDisplays()` work-areas;
      `trackWindowState(win)` subscribing to `move`/`resize`/`maximize`/
      `unmaximize`/`close` with a 500 ms debounced write via `snapshotToState`;
      `flushWindowState()` (drains the pending write, called on `close` and from
      `window-all-closed`). All writes best-effort (FR-009).
- [X] TT007 [US1/US2] Modify `src/main/index.ts`: `createWindow()` resolves
      launch state first, passes `x/y/width/height` to `BrowserWindow`, calls
      `win.maximize()` when the saved state was maximized (FR-005), attaches
      `trackWindowState`, and calls `flushWindowState()` in `window-all-closed`.
- [X] TT008 [US1/US2] Write `tests/e2e/window-state.spec.ts` covering items 1
      and 2 of the e2e contract (restore-on-launch with a pre-written config;
      `setBounds` in main → config records the new bounds within 1 s), using
      `app.evaluate(({ BrowserWindow }) => …)` and the existing `launchApp`.

**Checkpoint**: the window restores to saved bounds and persists move/resize;
unit + e2e for the journey pass.

---

## Phase 4: US3 — Maximized + fallback robustness (P1/P2)

**Goal**: a maximized window restores maximized (FR-005), and missing, malformed,
or off-screen state falls back safely (FR-006/FR-007).

**Independent Test**: contracts/renderer.md §E2e items 3–5; quickstart.md §3–§6.

### Implementation

- [X] TT009 [US3] Add e2e coverage: a pre-written `isMaximized: true` config
      launches with `win.isMaximized()` true (FR-005).
- [X] TT010 [P2] Add e2e coverage: a missing `windowState` opens at the default
      bounds; a malformed `windowState` opens at the default bounds and the app
      starts cleanly (FR-006, FR-009).
- [X] TT011 [P2] Add e2e coverage: an off-screen rect is restored fully visible
      inside an available display's work-area (FR-007).

**Checkpoint**: maximized restore and all fallback paths are proven in e2e.

---

## Phase 5: US4 — Explorer closed-without-folder alignment (P2)

**Goal**: with no folder open, the persisted explorer state records closed
(FR-013), while reveal-on-open on a folder open stays unchanged (FR-010–FR-015
already covered by specs 010/012; FR-016 is a recorded gap — no close-folder
action).

**Independent Test**: contracts/renderer.md §E2e item 6; quickstart.md §7.

### Implementation

- [X] TT012 [US4] Add the main-side FR-013 rule: at startup, when the loaded
      settings have `explorerVisible: true` and no workspace folder is open,
      persist `explorerVisible: false` (plan.md, data-model.md).
- [X] TT013 [US4] Add e2e coverage: launch with no folder and a config whose
      `settings.explorerVisible` is `true`; after startup the persisted value is
      `false` and the explorer is closed; opening a folder still reveals the
      explorer (reveal-on-open unchanged).

**Checkpoint**: FR-013 proven in e2e; the existing `chrome.spec.ts`
reveal-on-open restart tests stay green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: verify consistency and run the full gate.

- [X] TT014 Grep for stale assumptions that the window is always 1200×800 or
      that no window state exists; update comments/code across `src/` where they
      now contradict the persisted-bounds behaviour.
      *Result: the only 1200×800 reference is the `DEFAULT_WINDOW` constant in
      windowStateFit.ts; `createWindow` no longer hardcodes bounds.*
- [X] TT015 Run quickstart.md on Windows and note any platform discrepancy (the
      macOS/Linux sections are identical — display clamping is platform-agnostic
      DIP logic).
      *Result: Windows manual pass — window restores, maximized restores, and the
      config.json `windowState` section is written. No platform discrepancy;
      headless e2e confirmed the clamping behaviour with an 800×600 virtual
      display.*
- [X] TT016 Final gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e` all green; verify plan/research/data-model/contracts
      are consistent with the final code; mark this task `[X]` only then.
      *Result: lint/typecheck clean; unit 35 files/381 tests; e2e 128 tests
      (119 baseline + 9 new window-state); `npm run check` no violations.*

**Checkpoint**: no stale window-size assumptions; the four-command gate passes.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Foundational | Phase 1 | Phases 3–6 |
| Phase 3: US1/US2 wiring + e2e | Phase 2 | Phase 4 |
| Phase 4: US3 robustness e2e | Phase 3 | Phase 5 |
| Phase 5: US4 explorer alignment | Phase 3 | Phase 6 |
| Phase 6: Polish | Phases 2–5 | — |

### Parallel Opportunities

- Phase 2: T004 and T005 are unit-test tasks over the two pure modules (T002,
  T003) — they can run once the modules land; T004 and T005 are [P].
- Phase 4: T009/T010/T011 all extend the same e2e spec — run sequentially.

### High-level guarantee

No new IPC operations (Principle I); window state is main-only and the pure
store + fit rules are Electron-free and unit-tested; the shared config's
read-modify-write means recent items, settings, and window state never clobber
each other (FR-003); missing/malformed/off-screen state falls back to a safe
default (FR-006/FR-007); minimized windows are never persisted (FR-008); a
read/write failure never blocks startup or close (FR-009).

---

## Notes

- [P] tasks touch disjoint files.
- T002/T003 create new modules; T006/T007 wire them into main; the e2e tasks
  only read config + drive the window through `app.evaluate`.
- The FR-013 main-side rule reuses the existing `loadSettings`/`updateSettings`
  path; it writes through the same debounced settings writer.
- Every task leaves the repo in `npm run typecheck`-clean state.
- MVP = end of Phase 3 (US1 + US2 with restore + persist); Phases 4–5 add the
  maximized/fallback and explorer-closed e2e coverage; Phase 6 polishes.
- The `scripts/check-maintainability.mjs` shebang repair is a pre-existing `main`
  fix bundled into T001's baseline (plan.md decision log).
