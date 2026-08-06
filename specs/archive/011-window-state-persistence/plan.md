# Implementation Plan: Window State Persistence

**Branch**: `011-window-state-persistence` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-window-state-persistence/spec.md`

## Summary

Persist the main window's position, size, and maximized state so the next launch
restores the user's layout (FR-001–FR-009), stored in the **same per-user
configuration file** as the recent-items list — `config.json` at
`app.getPath('appData')/ame` (the Recent Items location from spec 004, also
already shared by spec 012 settings). The explorer panel's width and visibility
are already persisted via `settings.sidebarWidth` / `settings.explorerVisible`
(spec 010/012); this feature verifies those requirements (FR-010–FR-015) and
adds the FR-013 rule that with no folder open the persisted explorer state
records closed.

**The defining decision**: window state is a **main-process concern** with a
**pure, Electron-free store** (`windowStateFile.ts`) and a **pure display-fit
module** (`windowStateFit.ts`) so every validation and clamping rule is
unit-testable without mocking Electron — exactly the pattern established by
`settingsFile.ts` / `recentItems.ts`. Electron wiring (`windowState.ts`) resolves
the path, debounces saves, skips while minimized (FR-008), flushes on quit
(FR-009), and applies bounds + maximized state at window creation (FR-001,
FR-005). **No new IPC, no preload change, no renderer change for the window
itself** (Principle I: the renderer never learns about or feeds back window
bounds).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: No new runtime dependencies. Electron's `screen`
module (for display work-areas) is used in the wiring module only; the pure
fit/validation logic takes plain rects so it needs no Electron import.

**Storage**: `config.json` at `app.getPath('appData')/ame/config.json` (test
seam `AME_CONFIG_DIR` → `<dir>/config.json`). Shape becomes
`{ recentItems?, settings?, windowState? }` where `windowState` is
`{ x, y, width, height, isMaximized }`. All three stores read-modify-write so
none clobbers the others (`windowStateFile.writeWindowStateFile` preserves
`.recentItems` and `.settings`; `saveRecentItems` and `writeSettingsFile`
already preserve the others).

**Testing**: Vitest 4 (node for `tests/main`, jsdom for `tests/renderer`);
Playwright e2e via `npm run test:e2e`. New unit tests: the pure store
(load/validate/write round-trip, malformed/missing tolerance, read-modify-write
preserving siblings), and the pure fit logic (off-screen repositioning, size
clamping, maximized restore, minimize-skip). New e2e suite
`tests/e2e/window-state.spec.ts` proving restore-on-launch, automatic
persistence on move/resize, maximized restore, off-screen fallback, and the
FR-013 explorer-closed rule.

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: Nothing on the keystroke path. Window move/resize events
are debounced (500 ms, matching the settings debounce); the save is a small
read-modify-write of a tiny JSON file. No work happens during the move itself.

**Constraints**: Renderer sandboxed (no Node); all disk I/O in main. The preload
API is unchanged. No new IPC channel. `screen` is only referenced from
`windowState.ts` (main), never from pure modules. Bounds are integers (Electron
returns them as such); the fit logic clamps to the union of available display
work-areas so a window never restores off-screen or larger than a display
(FR-006/FR-007).

**Scale/Scope**: One new persisted section (`windowState`) in the shared config,
three new main-process modules, `createWindow` wiring, an FR-013 alignment in
the existing explorer/settings flow, unit + e2e coverage. Out of scope:
per-document or per-workspace window state, fullscreen persistence, z-order,
virtual-desktop assignment, and a "close folder" action (see FR-016 note).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | The window state is entirely main-process; the renderer never reads or writes it. No new IPC channel, no generic `invoke`, no `fs` in the renderer. The preload surface is untouched | **PASS** |
| II. Every Path Is Untrusted | The only path involved is the config file path resolved in main (`recentItemsConfigPath`), reused by recent items and settings. No renderer-supplied path crosses the IPC. Window rects are pure numbers clamped against display work-areas — never used as paths | **PASS** |
| III. Never Lose The User's Words | Window state is not user documents; but writes still use the shared `atomicWrite` (temp + fsync + rename) with `0o600`, so the config holding the MRU list and settings is never truncated or made world-readable. A failed read/write never blocks startup or close (FR-009) | **PASS** |
| IV. Calm, Predictable Editing | Nothing on the keystroke path; window restore is silent; the 500 ms debounce means the user is never forced to wait or to save explicitly. Restoring a maximized window never forces focus changes beyond the platform default | **PASS** |
| V. Test What Can Corrupt Or Escape | Unit tests pin the read-modify-write (windowState survives recent-items and settings writes and vice versa), malformed-config tolerance, off-screen clamping (FR-007), size clamping, minimised-skip (FR-008), and the FR-013 explorer-closed rule; e2e covers the launch/restore/persist user journeys | **PASS** |

## Phase 1 Design decisions

**Pure store — `src/main/windowStateFile.ts`** (mirrors `settingsFile.ts`):

- `WindowState` interface: `{ x: number; y: number; width: number; height: number; isMaximized: boolean }` (FR-004, FR-005).
- `loadWindowStateFile(filePath)`: reads `readConfigFile(filePath).windowState` and validates **each field** (finite numbers, positive width/height, boolean `isMaximized`). Missing/malformed/non-object → `null`, which the caller treats as "no saved state" (FR-006/FR-009). Field-by-field recovery mirrors the settings pattern: a partially-corrupt object keeps every recoverable value.
- `writeWindowStateFile(filePath, state)`: **read-modify-write** — loads the current config (tolerant → `{}`), merges `.windowState`, writes back via `atomicWrite(…, 0o600)` with `mkdirSync` first. Never clobbers `.recentItems` or `.settings`.
- `snapshotToState(snapshot)`: pure helper converting a `{ bounds, isMaximized, isMinimized }` snapshot into a `WindowState | null` — returns `null` when minimized (FR-008). Unit-testable without Electron.

**Pure fit logic — `src/main/windowStateFit.ts`** (mirrors the "pure domain" rule):

- `DEFAULT_WINDOW` = `{ width: 1200, height: 800 }` (the pre-feature default; safe default per FR-006).
- `fitWindowToDisplays(bounds, displays)`: given the saved rect and the available display work-areas (`{ x, y, width, height }` each), returns a rect guaranteed to be **fully visible on an available display**:
  - pick the display whose work-area contains the window's center; if none contains it (saved display disconnected), fall back to the primary display (FR-007 scenario 1, FR-006);
  - clamp width/height so the window fits within that work-area (FR-007 scenario 2);
  - clamp x/y so the window is fully inside the work-area (partial intersection is repaired — the window is pushed back on-screen, never left straddling an edge);
  - scale-factor differences are handled automatically because work-areas and bounds are both in DIP (FR-007 scenario 3).
- `centerIn(display)`: the default position for a fresh/restored window — centered on the primary display's work-area (FR-006 "sensible default position").

**Electron wiring — `src/main/windowState.ts`** (mirrors `settings.ts`):

- `windowStatePath()` returns `recentItemsConfigPath()` (FR-003: same per-user config file as the MRU list; honours `AME_CONFIG_DIR`).
- `loadWindowState()` → the pure store, `null` when missing/malformed.
- `resolveLaunchState()`: combines `loadWindowState()` with `screen.getAllDisplays().map(d => d.workArea)`, returning `{ bounds, isMaximized }` where `bounds` is the fitted rect (or the centered default when there is no saved state). Used by `createWindow`.
- `trackWindowState(win)`: subscribes to `move`, `resize`, `maximize`, `unmaximize`, and `close`; snapshots via `snapshotToState` (which drops minimized windows, FR-008) and schedules a **debounced 500 ms** write; `close` and `flushWindowState()` (called from `window-all-closed`, like `flushSettings`) drain the pending write so a fast quit cannot lose the last position (FR-002/FR-009). A `maximize` snapshot records `isMaximized: true` with the current bounds.
- All writes are best-effort: a failure is caught and ignored — it must not block startup, window creation, or close (FR-009).

**Window creation — `src/main/index.ts`**:

- `createWindow()` resolves launch state **before** constructing `BrowserWindow`, passes `x/y/width/height` into the constructor (FR-001), then calls `win.maximize()` immediately after creation when the saved state was maximized (FR-005). `trackWindowState` is attached after creation.

**Explorer FR-013 alignment** (no close-folder action — see decision below):

- When the app starts with **no workspace folder open**, the persisted
  `settings.explorerVisible` records **closed** (`false`). Implemented in main at
  startup: if `loadSettings()` shows `explorerVisible: true` while no workspace
  is open, persist `false`. This keeps the stored state honest without a new UI
  action and without contradicting spec 010's reveal-on-open (which still sets
  `true` the moment a folder is opened — that behaviour is unchanged and its
  e2e stays green).
- FR-016 ("closing a folder … persists the closed state") is **not reachable**:
  the app has no close-folder action (a folder is only ever replaced by opening
  another). Recorded here and in the spec as a gap; the reachable FR-013
  behaviour above covers the "no folder open" persistence rule.

## Project Structure

### Documentation (this feature)

```text
specs/011-window-state-persistence/
├── spec.md              # Requirements (FR-001…FR-016, US1–US4, edge cases)
├── plan.md              # This file
├── research.md          # R1…R4 evidence (config location, display APIs, debounce)
├── data-model.md        # WindowState + config.json shape + fit contract
├── quickstart.md        # Manual per-OS verification script
├── contracts/
│   └── renderer.md      # Config shape, fit contract, e2e anchors
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/
└── ipc-contract.ts             # UNCHANGED (window state never crosses IPC)

src/main/
├── windowStateFile.ts          # NEW: pure store — WindowState type, load/validate/
│                               #   write read-modify-write, snapshotToState
├── windowStateFit.ts           # NEW: pure fit — DEFAULT_WINDOW, fitWindowToDisplays,
│                               #   centerIn (Electron-free)
├── windowState.ts              # NEW: Electron wiring — path, launch state, debounced
│                               #   trackWindowState, flushWindowState
├── settingsFile.ts             # MODIFY (or reuse): expose readConfigFile already there
└── index.ts                    # MODIFY: resolveLaunchState → BrowserWindow bounds →
                               #   maximize() when saved maximized → trackWindowState;
                               #   flushWindowState in window-all-closed
```

```text
tests/
├── main/windowStateFile.test.ts  # NEW: store round-trip, malformed tolerance,
│                                 #   read-modify-write preserving recentItems/settings,
│                                 #   snapshotToState minimize-skip
├── main/windowStateFit.test.ts   # NEW: off-screen reposition, size clamp, default
│                                 #   centering, maximized-fit
└── e2e/window-state.spec.ts      # NEW: restore on launch, move/resize persistence,
                                  #   maximized restore, off-screen fallback, malformed
                                  #   config, FR-013 explorer-closed, quickstart §N
```

**Structure decision**: window persistence is a main-process concern (it must not
reach the renderer); the pure store + pure fit split keeps every rule
unit-testable and Electron-free, matching the existing `settingsFile.ts` /
`recentItems.ts` precedent. `windowState.ts` is the only module that imports
Electron, so the audit surface for the new feature is one thin file.

## Phase status

- Phase 1: Setup — green baseline on `011-window-state-persistence` (created from
  clean `main` per AGENTS.md). Pre-existing `main` defect fixed as part of
  baseline: the shebang in `scripts/check-maintainability.mjs` broke vitest's
  module transform on this machine, failing `npm run test`; replaced it with a
  comment (Node still runs the script via `node scripts/...`).
- Phase 2: Foundational — `windowStateFile.ts` + `windowStateFit.ts` + unit tests.
- Phase 3: US1/US2 — `createWindow` restore + `trackWindowState` persistence + e2e
  for restore/persist.
- Phase 4: US3 — maximized restore + off-screen/malformed fallback e2e.
- Phase 5: US4 — FR-013 explorer-closed alignment + e2e.
- Phase 6: Polish — quickstart manual pass, final four-command gate.

## Deferred / later features

- A "Close Folder" action (spec FR-016's premise). The app has none today; the
  FR-013 closed-state rule covers the reachable case. Adding the action would be
  a separate feature (scope decision 2026-08-06).
- Per-document or per-workspace window state (spec Assumption: out of scope).
- Fullscreen state persistence (spec Assumption: only normal and maximized).
- Persisting z-order or virtual-desktop assignment (spec Assumption: out of scope).

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Window state stored in the shared MRU `config.json` alongside settings | FR-003 is explicit: the window state MUST live in the same per-user configuration file as the recent-items list. Reusing the file means every store read-modify-writes, which all three already do | A separate `window-state.json` (violates FR-003) or Electron's `win.getBounds()` only (never persisted, violates FR-002) |
| Debounced (500 ms) window-state writes rather than a write per event | A window drag fires dozens of `move`/`resize` events per second; writing the config on every one would thrash the disk and break the atomic-write contract under load (SC-002 requires persistence within 1 s of a change *completing*) | Synchronous write on every event (disk thrash, slower than needed) or write only on `close` (loses state on a crash or kill, weakens FR-002) |
| FR-013 explorer-closed rule implemented in main at startup, not in the renderer | The renderer knows the workspace state but writes settings through the same debounced main path; the main-side check keeps the "no folder open ⇒ persisted closed" invariant with one small, testable function and no UI change | A renderer effect that force-writes `explorerVisible: false` (adds a startup side effect and a second writer for the same value; the main check is simpler and covers every startup) |

*(FR-016 gap: the spec assumes a close-folder action that does not exist. Recorded
in the spec's Assumptions + decision log; no code invents it.)*

## Decision log

### 2026-08-06

- **Window state is main-only, no new IPC**: the renderer never reads or writes
  window bounds; the feature needs no preload/IPC change (Principle I).
- **Storage**: `config.json` gains a `windowState` section; `windowStatePath()` =
  `recentItemsConfigPath()`; all three stores read-modify-write; atomic `0o600`.
- **Pure modules**: `windowStateFile.ts` (store + validation + snapshot) and
  `windowStateFit.ts` (display clamping + centering) are Electron-free and
  unit-tested; `windowState.ts` is the only Electron-touching file.
- **Debounce**: 500 ms matching the settings debounce; flushed on `close` and in
  `window-all-closed` so a fast quit cannot lose the last position (FR-002/FR-009).
- **Minimize rule (FR-008)**: `snapshotToState` returns `null` when the window is
  minimized, so a minimized close is never persisted; restore always lands in a
  non-minimized state.
- **FR-016 deferred**: no close-folder action exists; the reachable FR-013 rule
  is implemented and the gap recorded (scope decision 2026-08-06).
- **Baseline repair**: removed the `#!/usr/bin/env node` shebang from
  `scripts/check-maintainability.mjs` (pre-existing `main` defect that broke
  `npm run test` under vitest's transform on this machine; the CLI still runs via
  `node scripts/check-maintainability.mjs`).
