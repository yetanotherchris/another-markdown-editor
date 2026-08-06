# Data Model: Window State Persistence

Types and state affected by `011-window-state-persistence`.

## WindowState (persisted)

Defined in `src/main/windowStateFile.ts` (main-only — never crosses IPC):

```ts
export interface WindowState {
  x: number            // window left edge, DIP
  y: number            // window top edge, DIP
  width: number        // window width, DIP
  height: number       // window height, DIP
  isMaximized: boolean // FR-005 — a maximized window restores maximized
}
```

- Stored under the `windowState` key in the shared config file (FR-003).
- Load: `loadWindowStateFile(filePath)` → `WindowState | null`. Missing,
  malformed, or non-object → `null` (FR-006/FR-009). Field-by-field validation:
  `x`/`y` finite numbers, `width`/`height` finite positive numbers, `isMaximized`
  boolean; a partially-corrupt object keeps every recoverable value.
- Write: `writeWindowStateFile(filePath, state)` → read-modify-write preserving
  `.recentItems` and `.settings`; atomic `0o600` + `mkdirSync` first.
- Snapshot: `snapshotToState(snapshot)` → `WindowState | null`. Returns `null`
  when `snapshot.isMinimized` is true (FR-008).

## Config file (shared with Recent Items + Settings — FR-003)

`config.json` at `app.getPath('appData')/ame` (test seam `AME_CONFIG_DIR` →
`<dir>/config.json`) now holds three stores:

```json
{
  "recentItems": [ { "path": "...", "kind": "file|folder", "name": "...", "lastOpenedAt": 123 } ],
  "settings": {
    "sidebarWidth": 30,
    "themeOverride": null,
    "explorerVisible": true,
    "editorFont": "sans-serif"
  },
  "windowState": { "x": 100, "y": 100, "width": 1200, "height": 800, "isMaximized": false }
}
```

Read/write contract:

- `readConfigFile(filePath)` (existing, in `settingsFile.ts`): tolerant whole-file
  read → `Record<string, unknown>` (or `{}`).
- `windowStateFile`: reads `.windowState`, validates per-field; writes
  read-modify-write preserving the other two sections.
- `saveRecentItems` / `writeSettingsFile`: unchanged — already read-modify-write
  and thus preserve `.windowState` automatically once it exists.

## Display-fit contract (FR-006/FR-007)

Defined in `src/main/windowStateFit.ts` (Electron-free; rects are plain values):

```ts
export interface Rect { x: number; y: number; width: number; height: number }
export const DEFAULT_WINDOW: Rect = { x: 0, y: 0, width: 1200, height: 800 }

export function fitWindowToDisplays(bounds: Rect, displays: Rect[]): Rect
export function centerIn(display: Rect): Rect
```

- `fitWindowToDisplays(bounds, displays)`:
  1. choose the display whose work-area contains the bounds' centre; if none,
     the first display (primary);
  2. clamp `width`/`height` to that work-area;
  3. clamp `x`/`y` so the rect is fully inside the work-area.
  Guarantees the returned rect is fully visible on an available display.
- `centerIn(display)` = `DEFAULT_WINDOW` centred on the display's work-area
  (the "sensible default position and size", FR-006).
- `resolveLaunchState(loadWindowState(), displays)` (in `windowState.ts`):
  `null` saved state → `{ bounds: centerIn(primary), isMaximized: false }`;
  otherwise `{ bounds: fitWindowToDisplays(saved, displays), isMaximized: saved.isMaximized }`.

## Explorer FR-013 rule (main, startup)

On startup in main: if the loaded settings have `explorerVisible: true` while no
workspace folder is open, persist `explorerVisible: false`. This keeps the
persisted explorer state honest for the "no folder open" case (FR-013) without a
close-folder action (FR-016 gap, see plan).

## Window lifecycle (main wiring, `src/main/index.ts` + `windowState.ts`)

```text
app.whenReady
  → resolveLaunchState()                  (bounds + isMaximized, clamped to displays)
  → new BrowserWindow({ x, y, width, height, ... })
  → win.maximize()                        when saved isMaximized (FR-005)
  → trackWindowState(win)                 move/resize/maximize/unmaximize/close
      → snapshotToState(...)              null when minimized (FR-008)
      → debounced 500 ms write            SC-002
      → flush on close + window-all-closed (FR-009)
```

## No renderer/preload changes

- `DesktopApi` (`src/shared/ipc-contract.ts`): unchanged.
- Preload (`src/preload/index.ts`): unchanged.
- Renderer (`src/renderer/App.tsx`, settings state): unchanged for window state.
  Explorer `explorerVisible`/`sidebarWidth` settings are unchanged and remain the
  persisted source for the panel (FR-010–FR-015 already covered by specs 010/012).
