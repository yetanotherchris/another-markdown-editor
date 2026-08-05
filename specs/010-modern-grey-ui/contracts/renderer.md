# Contracts: Modern Grey UI — renderer

The IPC, preload, shortcut, and e2e contracts for `010-modern-grey-ui`. The
four new operations are named methods on `DesktopApi` (Principle I) — never a
generic `invoke(channel, …)`.

## New IPC operations

| Operation | Channel | Request | Response | Main handler behaviour |
|-----------|---------|---------|----------|------------------------|
| `getRecentItems()` | `recent:list` | — | `Result<RecentItem[]>` | `loadRecentItems(recentItemsConfigPath())` (existing module) |
| `clearRecentItems()` | `recent:clear` | — | `Result<null>` | `saveRecentItems(…, [])` best-effort + `notifyRecentItemsOk()` / `reportRecentItemsWarning(e, 'clear')` (extract from `menu.ts` `clearRecentItems`) |
| `requestQuit()` | `app:requestQuit` | — | `Result<null>` | `mainWindow.close()` — re-enters the existing quit → `app:quitRequested` → dirty-doc flow |
| `toggleDevTools()` | `devtools:toggle` | — | `Result<null>` | `window.webContents.toggleDevTools()` |

Preload (`src/preload/index.ts`): four named methods invoking those channels.
`getRecentItems` returns only display strings (labels shortened by the shared
`shortenPath`); no path is re-validated or re-used by the renderer (Principle II).

## Settings

- `Settings` gains `explorerVisible: boolean` (default `true`).
- The renderer persists on every toggle and on drag collapse/expand via the
  existing pair `updateSettings({ explorerVisible })` +
  `window.api.updateSettings({ explorerVisible })` (see `handleSidebarResize`).

## Shortcut table (main-side, `before-input-event`)

`matchShortcut(event): MenuCommand | 'devtools' | null` — the single source of
truth, unit-tested. Key strings are the Electron `Input.key` values.

| Combination | Result | Renderer command |
|-------------|--------|------------------|
| Ctrl/Cmd + N | `new-file` | handleNew() |
| Ctrl/Cmd + O | `open-file` | openFileDialog() |
| Ctrl/Cmd + Shift + O | `open-folder` | runFolderOpenFlow() |
| Ctrl/Cmd + S | `save` | saveDocument(active) |
| Ctrl/Cmd + Shift + S | `save-as` | saveDocument(active, true) |
| Ctrl/Cmd + W | `close-tab` | handleCloseRequest(active.id) |
| F12 or Ctrl/Cmd + Shift + I | `devtools` | toggleDevTools() (main-side) |
| anything else | `null` | not handled (no preventDefault) |

The `before-input-event` handler sends `menu:command` for a `MenuCommand` result
and `preventDefault()`s; it is installed once per window in `src/main/index.ts`.

## Hamburger item model

Rendered by `HamburgerMenu`; accessible names are the labels. Recent Items is
its own parent menuitem (`aria-haspopup="menu"`, `aria-expanded`) that opens a
nested submenu — mirroring the native `File > Recent Items`. The submenu
grouping mirrors `menu.ts`: folders, separator, files, separator, Clear Recent
Items (the folders/files separator renders only when both groups are non-empty;
an empty history shows a disabled `No Recent Items` entry). On dropdown open the
menu fetches `window.api.getRecentItems()`; file entries →
`openRecentFile(path)`, folder entries → `runFolderOpenFlow(path)`.

## E2e helper contract (`tests/e2e/launch.ts` or `helpers.ts`)

- `openHamburger(window)`: click `getByRole('button', { name: 'Open menu' })`.
- `clickHamburgerItem(window, label)`: open the hamburger, click
  `getByRole('menuitem', { name: label })`, close the dropdown.
- `clickHamburgerRecent(window, label)`: open hamburger → Recent Items submenu →
  click the entry.
- `hamburgerRecentState(window)`: read the Recent Items submenu DOM to a
  `{ label, enabled }[]` (replaces recent.spec.ts `recentItemsState`).
- `hamburgerRecentStructure(window)`: the full submenu including separators and
  Clear Recent Items (replaces `recentMenuStructure`).
- Old selectors retired: `getByRole('button', { name: 'New' })`,
  `getByRole('button', { name: 'Open Folder' })`, and `clickFileMenu` (which
  read `Menu.getApplicationMenu()` — impossible once FR-002 removes the menu).

## E2e coverage for the chrome (`chrome.spec.ts`)

1. US1: hamburger + explorer-toggle buttons visible top-left; "+" button after
   the active tab; active tab is a `#EAEAEA` pill with an edit icon, label,
   close button; inactive tabs truncate.
2. US2 scenario 1: toggle hides the explorer, editor expands.
3. US2 scenario 2: toggle again restores the previous width.
4. US2 scenario 3 (amended 2026-08-05): hide → restart the app → the
   persisted `explorerVisible` is restored as the toggle default; an explicit
   folder open always reveals the explorer (reveal-on-open overrides a
   persisted hidden choice).
5. US3: "+" opens a new untitled tab without discarding unsaved changes.
6. US4: hamburger opens a dropdown; outside click closes it.
7. FR-009: hamburger, toggle, and "+" are focusable and activatable with Enter.
8. Shortcuts: Ctrl+N/Ctrl+S/Ctrl+O still work after the menu bar is removed.
