# Contracts: Window State Persistence — renderer & main

Contracts for `011-window-state-persistence`. No IPC/preload changes — window
state never crosses the boundary (Principle I).

## Config file shape (FR-003)

`config.json` at `app.getPath('appData')/ame` (test seam `AME_CONFIG_DIR` →
`<dir>/config.json`):

```json
{
  "recentItems": [ ... ],
  "settings": { ... },
  "windowState": { "x": 100, "y": 100, "width": 1200, "height": 800, "isMaximized": false }
}
```

- Every store (recent items, settings, window state) read-modify-writes so none
  clobbers the others.
- Missing/malformed `windowState` → `null` → the window uses the centered default
  (1200×800, FR-006).
- A saved rect that is off-screen or larger than an available display is clamped
  to be fully visible (FR-007).

## Window lifecycle (main only)

- On launch, `createWindow` resolves `{ bounds, isMaximized }` from the saved
  state (clamped to the available displays) and creates the window at those
  bounds; a saved `isMaximized: true` window is maximized after creation (FR-001,
  FR-005).
- `move`, `resize`, `maximize`, `unmaximize`, and `close` events trigger a
  debounced (500 ms) write of the current normal bounds + maximized flag.
- A minimized window is never persisted (FR-008).
- Read/write failures never block startup or close (FR-009); `window-all-closed`
  flushes the pending write.

## Explorer state (FR-010–FR-016)

Already persisted via `settings.sidebarWidth` (width) and `settings.explorerVisible`
(visibility) from specs 010/012; this feature only adds the FR-013 rule: on a
startup with no workspace folder open, the persisted `explorerVisible` records
`false` (main-side check). FR-016 (close-folder persistence) is a spec gap — the
app has no close-folder action.

## E2e contract (`tests/e2e/window-state.spec.ts`)

1. **US1/FR-001** — pre-write a `config.json` with a known `windowState`; launch;
   the main window's bounds match the saved rect (clamped to the display).
2. **US2/FR-002** — move/resize the window (via `BrowserWindow.setBounds` in main);
   within 1 s the config file records the new bounds.
3. **US3/FR-005** — pre-write `isMaximized: true`; launch; `win.isMaximized()`
   is true.
4. **FR-006** — with a missing `windowState`, the window opens at the default
   bounds; with a malformed `windowState`, the same (and the app starts cleanly).
5. **FR-007** — pre-write an off-screen rect; launch; the window is fully inside
   an available display's work-area.
6. **FR-013** — with no folder open and a config whose `settings.explorerVisible`
   is `true`, after startup the persisted value is `false` (and the panel is
   closed); opening a folder still reveals the explorer (reveal-on-open,
   unchanged).

## E2e helper contract (`tests/e2e/launch.ts`)

- `launchApp(configDir, openFolderPath)` (existing) already launches with an
  isolated `AME_CONFIG_DIR`; window-state tests pre-write `config.json` into
  `configDir` before calling it.
- Bounds/maximized assertions run through `app.evaluate(({ BrowserWindow }) => …)`
  on the single main window.
