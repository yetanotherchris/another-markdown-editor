# Research: Window State Persistence

Evidence behind the design decisions in `plan.md` for `011-window-state-persistence`.

## R1 — The config file location (FR-003)

The Recent Items feature (spec 004) stores its list in `config.json` at
`app.getPath('appData')/ame` — on Linux `~/.config/ame/config.json` (FR-004), on
macOS `~/Library/Application Support/ame/config.json`, on Windows
`%APPDATA%\ame\config.json` (`src/main/recentItemsPath.ts`). Spec 012 then moved
settings into the same file under a `.settings` key. The file shape is
`{ recentItems?, settings? }`, both stores read-modify-write via the shared
`atomicWrite` helper (temp + fsync + rename, `0o600`).

FR-003 requires window state in the **same per-user configuration file** as the
recent-items list. The established seam is `AME_CONFIG_DIR` → `<dir>/config.json`,
used by every e2e suite to isolate the config. Decision: add a `windowState`
section to the same file; `windowStatePath()` returns `recentItemsConfigPath()`.
`readConfigFile` already exists in `src/main/settingsFile.ts` and is reused.

## R2 — Reading the available displays (FR-006/FR-007)

Electron's `screen` module provides `screen.getAllDisplays()`, where each
`Display` exposes `workArea` (`{ x, y, width, height }` in **DIP**) and
`getPrimaryDisplay()` for the fallback. Both saved bounds and work-areas are in
DIP, so mixed scale factors compare consistently (FR-007 scenario 3).

Restoring a rectangle that is partially or fully off-screen is handled by
clamping against the chosen display's work-area:

1. Pick the display whose work-area contains the saved rect's centre; if none
   does (saved display disconnected, resolution shrunk), fall back to the
   primary display.
2. Clamp `width`/`height` to the work-area so the window is never larger than an
   available display.
3. Clamp `x`/`y` so the whole window is inside the work-area — a partially
   off-screen window is pushed back fully on-screen, never left straddling an
   edge.

This is the standard behaviour of the well-known `electron-window-state` package,
implemented here as a small pure function so it is unit-testable without mocking
Electron. The default bounds are the pre-feature `1200×800` (FR-006 "sensible
default").

## R3 — Debounced persistence (FR-002, SC-002)

A window drag fires many `move`/`resize` events per second. Writing the config
on every event would thrash the disk and risk overlapping atomic writes. The
settings store already uses a 500 ms debounce (`saveSettings` in `settings.ts`),
flushed on quit (`flushSettings` from `window-all-closed`, review #27). Window
state follows the identical pattern: debounce 500 ms, drain in `window-all-closed`
and on the window's `close` event. SC-002 (persist within 1 s of a change
completing) is comfortably met.

## R4 — Never save while minimized (FR-008)

A minimized window's `getBounds()` still returns its last normal position (Electron
keeps the restore rect), so saving while minimized is not strictly harmful — but
the spec forbids it. A `snapshotToState({ bounds, isMaximized, isMinimized })`
helper returns `null` for a minimized snapshot, so minimized windows are never
persisted and a close-from-minimized leaves the previous state intact. Restoring
always lands in the non-minimized normal/maximized state (spec edge: "the
restored window should not remain minimized").

## R5 — FR-013 explorer-closed rule

Spec 010 (clarification 2026-08-05) established **reveal-on-open**: opening a
folder always reveals the explorer and persists `explorerVisible: true`. Spec 011
FR-013 adds the converse: when **no folder is open**, the explorer panel is
closed and the persisted value records `false`. Since the app has no close-folder
action (a folder is only replaced by opening another), the only reachable
"no folder open" state is a fresh launch. A one-line main-side rule at startup —
if the loaded settings say `explorerVisible: true` while no workspace is open,
persist `false` — satisfies FR-013 without a new UI action and without
contradicting reveal-on-open (the moment a folder opens, `true` is persisted
again, and the existing `chrome.spec.ts` restart tests stay green).

FR-016 ("closing a folder … persists the closed state") is **not reachable**: no
close-folder action exists. Recorded as a gap in the spec (scope decision
2026-08-06); no code invents the action.

## Rejected alternatives

| Alternative | Rejected because |
|-------------|------------------|
| A separate `window-state.json` | Violates FR-003 (window state MUST be in the same per-user config file as the MRU list) |
| Persist only on `close` (no debounce) | Loses state on a crash or hard kill; FR-002 expects automatic persistence while running |
| Synchronous write on every `move`/`resize` | Disk thrash during a drag; overlapping writes risk violating the atomic-write contract |
| Reuse `electron-window-state` npm package | Constitution: prefer platform + existing dependencies; the rule is ~40 lines and needs no new dependency |
| Renderer-driven FR-013 (force-write `explorerVisible: false` in a startup effect) | Adds a renderer side effect and a second writer; a main-side check at startup is smaller and covers every startup path |
