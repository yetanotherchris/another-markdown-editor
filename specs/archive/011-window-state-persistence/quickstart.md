# Quickstart: Window State Persistence

Manual verification script for `011-window-state-persistence`. Automated
coverage lives in `tests/e2e/window-state.spec.ts`; these steps prove the same
flows by hand.

## Prerequisites

- `npm install`, `npm run build` (or `npm run dev`).

## 1. The window restores its position and size (US1, FR-001)

1. Launch the app. Move and resize the window to a distinctive spot/size.
2. Quit and relaunch.
3. **Expected**: the window opens at the saved position and size — no manual
   save step.

## 2. Position/size changes are saved automatically (US2, FR-002)

1. With the app running, move and resize the window.
2. Wait ~1 second (the debounce), then quit.
3. **Expected**: on the filesystem,
   `~/.config/ame/config.json` (Linux) / `%APPDATA%\ame\config.json` (Windows) /
   `~/Library/Application Support/ame/config.json` (macOS) contains
   `"windowState": { "x": …, "y": …, "width": …, "height": …, "isMaximized": false }`
   alongside `recentItems` and `settings` — nothing was clobbered.

## 3. Maximized state is restored (US3, FR-005)

1. Maximize the window, then quit.
2. Relaunch.
3. **Expected**: the window opens maximized.

## 4. A missing or malformed saved state falls back to defaults (FR-006)

1. Quit. Delete (or corrupt) `config.json`.
2. Relaunch.
3. **Expected**: the window opens centered at the default 1200×800 and the app
   starts normally.

## 5. An off-screen saved position is repaired (FR-007)

1. Quit. Edit `config.json` so `windowState` puts the window far outside the
   screen (e.g. `"x": 100000, "y": 100000`), keeping a valid size.
2. Relaunch.
3. **Expected**: the window appears fully visible on an available display.

## 6. Minimizing and quitting does not persist the minimized state (FR-008)

1. Minimize the window, then quit (or close from the taskbar).
2. Relaunch.
3. **Expected**: the window restores to its previous normal (or maximized) state,
   never minimized.

## 7. Explorer: closed when no folder is open, persisted closed (FR-013)

1. Launch the app without opening a folder. Quit.
2. Inspect `config.json`: `"settings": { "explorerVisible": false, ... }`.
3. Open a folder.
4. **Expected**: the explorer appears (reveal-on-open, unchanged from spec 010)
   and persists `explorerVisible: true`.

## 8. Explorer width persists (FR-010/FR-011, regression from spec 010)

1. Open a folder, drag the explorer splitter to a new width, quit.
2. Relaunch and reopen the folder.
3. **Expected**: the explorer restores to the saved width.

## 9. Regression: Recent Items and Settings still work

1. Open a file, then the settings dialog (hamburger → Settings…) and change the
   editor font.
2. Quit, relaunch.
3. **Expected**: the recent entry reopens, the font choice persists, and the
   window restores — all from the same `config.json`.
