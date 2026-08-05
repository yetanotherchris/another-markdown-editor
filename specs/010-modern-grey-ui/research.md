# Research: Modern Grey UI

Evidence gathered 2026-08-05 for the `010-modern-grey-ui` plan. Each item was
verified against the pinned dependency versions or the running code, not
recalled from memory.

## R1 — Removing the native menu bar and keeping accelerators

- The current app sets `Menu.setApplicationMenu(menu)` in `src/main/menu.ts`
  (called from `createWindow` in `src/main/index.ts`). On Windows/Linux this
  renders the in-window menu bar; FR-002 requires it gone.
- `Menu.setApplicationMenu(null)` removes the menu bar on Windows/Linux. On
  macOS the system menu bar is mandatory and `setApplicationMenu(null)` is not a
  real option — the platform requires an application menu for Cmd+Q, clipboard,
  and accessibility roles. Hence: Windows/Linux remove it; macOS keeps a minimal
  menu (plan Complexity Tracking).
- Accelerators only fire when a menu is actually installed, so removing the menu
  silently disables Ctrl+O / Ctrl+Shift+O / Ctrl+N / Ctrl+S / Ctrl+Shift+S /
  Ctrl+W. The spec edge case ("keyboard shortcuts that were previously accessed
  through the native menu bar … must remain functional") requires re-registration.
  `webContents.on('before-input-event')` is the per-window capture point in the
  main process: synchronous, main-side, and it can `preventDefault()` the
  keypress after mapping it to a `menu:command` (the exact channel the old menu
  used). `globalShortcut` is rejected: it is process-global, not window-scoped,
  and would interfere while other windows have focus.
- The existing renderer `onMenuCommand` listener in `App.tsx` already routes
  every `MenuCommand` (`open-file`, `open-folder`, `save`, `save-as`,
  `close-tab`, `new-file`, `open-recent`). Reusing this channel means the
  shortcut mapper needs no new renderer code beyond what the hamburger uses.

## R2 — React hamburger dropdown (renderer)

- User decision (2026-08-05): the hamburger is a React UI, not an OS-native
  `Menu.popup()`. The dropdown is a closed list of `<button role="menuitem">`
  rows; the trigger is a real `<button aria-haspopup="menu">` with
  `aria-expanded`. Outside-click close via a document `pointerdown` listener;
  Escape closes; focus stays on the trigger when closed and moves into the menu
  when open (FR-009 keyboard reachability).
- Recent Items must appear inside the hamburger because FR-001 says "all existing
  top-level menu actions" and Recent Items lives in the File menu today. The
  renderer does not currently hold the recent-items list (it lives in
  `src/main/recentItems.ts`), so a pull IPC (`getRecentItems`) is the narrowest
  addition; the hamburger fetches on open. Grouping (folders → separator →
  files → separator → Clear Recent Items) mirrors `buildRecentItemsSubmenu` in
  `menu.ts`; the shortenPath label logic is already shared from
  `src/shared/shortenPath.ts` and is reused for identical labels.

## R3 — react-resizable-panels collapse API (v4.12.2)

Verified in `node_modules/react-resizable-panels/dist/react-resizable-panels.d.ts`:

- `Panel` accepts `panelRef?: Ref<PanelImperativeHandle | null>`; `usePanelRef()`
  returns `RefObject<PanelImperativeHandle | null>`.
- `PanelImperativeHandle` exposes `collapse()`, `expand()`, `isCollapsed()`.
  `collapse()` collapses to `collapsedSize`; `expand()` restores "its most
  recent size" (US2 scenario 2 — previous width preserved). **Caveat (verified
  2026-08-05):** "its most recent size" is stored on the registered panel object
  (`expandToSize`), which is replaced whenever the Panel's registration effect
  re-runs — that happens if its `defaultSize` prop changes (e.g. because a
  collapsed `sidebarWidth: 0` was persisted) or the panel re-registers. A
  re-registered panel has `expandToSize: undefined`, so `expand()` falls back to
  `minSize`. Hence the App keeps the Separator mounted (hidden via
  `visibility: hidden` while collapsed) and never persists a collapsed width.
- Props: `collapsible?: boolean`, `collapsedSize?: number | string` (default 0).
- There is **no `onCollapse` / `onExpand` prop** in v4.12.2. The only size
  callback is `onResize(panelSize: { asPercentage, inPixels }, id, prevPanelSize)`.
  Therefore drag-collapse/drag-expand is detected in `onResize` by
  `panelSize.asPercentage <= collapsedSize` ⇒ collapsed. On mount
  `prevPanelSize` is undefined and `onResize` still fires once with a transient
  size 0 before the real layout size, so the App guards that first resize (an
  `explorerRestoreDoneRef`) and never persists it as a user choice. There is no
  launch-time collapse-from-settings to apply: the panel only mounts while a
  workspace is open, and opening a folder always reveals the explorer
  (clarification 2026-08-05), so a persisted hidden choice is never observed
  (clarification 2026-08-06 — the launch-time restore effect was dead code and
  was removed).
- The `Separator` must be a direct child of the `Group`. It is ALWAYS mounted
  and hidden with `visibility: hidden` while collapsed: a conditional render
  (`{!collapsed && <Separator/>}`) makes the Group re-register the separator on
  every collapse/expand, re-running the Panel's registration effect and wiping
  `expandToSize` (US2 scenario 2 regression, verified 2026-08-05). Hidden keeps
  the panel object stable and leaves no stray resize strip.

## R4 — Quit path and no data loss

- Quit today: window close (the native X, or the mac/win menu `role: 'quit'`)
  → `app:quitRequested` → renderer flushes live content, and if any document is
  dirty shows the native unsaved-changes box (spec 008), then `confirmQuit`.
  For the hamburger Quit item, the renderer cannot create this flow by itself
  (it can only *respond* via `confirmQuit`), so a named `requestQuit()` IPC that
  calls `mainWindow.close()` re-enters the exact existing flow — no new decision
  logic, Principle III preserved. `role: 'quit'` in the removed menu would have
  bypassed the renderer guard if naively re-added as `app.quit()`, so routing
  through window-close is the safe equivalent.
- Verified 2026-08-06 (review round): the original `requestQuit` handler called
  `tryCloseWindow()`, which sets `allowClose = true` BEFORE `window.close()` —
  the close handler then returned early at `if (allowClose) return` and never
  sent `app:quitRequested`, so the renderer's flush + unsaved-changes prompt
  never ran and dirty documents were silently discarded (Principle III
  violation). `requestQuit` now closes the window WITHOUT arming `allowClose`;
  only the renderer's confirmed `quit:respond` may arm it. The contract's
  "re-enters the quit → dirty-doc flow" wording is now true of the code.
- FR-010 is honored by leaving every `.editor-host` / `.milkdown` /
  `.ProseMirror` / `.source-*` CSS rule byte-identical; only chrome rules
  (`.toolbar`, `.tab-bar`, `.tab*`, `.sidebar*`, `.resize-handle`, `.app-footer`)
  are recolored.

## R5 — Settings persistence shape

- `src/main/settings.ts` loads `settings.json` field-by-field with fallbacks and
  writes debounced 500 ms; `src/renderer/state/settings.ts` mirrors defaults.
  `settings:update` in `handlers.ts` merges a `Partial<Settings>` with the same
  field-by-field validation. Adding `explorerVisible` is a three-point change
  (interface, main defaults/validation, renderer defaults) plus the same merge
  branch in the `settings:update` handler — matching the existing `sidebarWidth`
  pattern exactly (the toggle calls `updateSettings` + `window.api.updateSettings`
  in the same pair as `handleSidebarResize`).

## E2e impact inventory (verified by grep on tests/e2e)

- `getByRole('button', { name: 'New' })`: native.spec.ts (US2 icon-label test,
  focus test), app.spec.ts.
- `getByRole('button', { name: 'Open Folder' })`: app, native, tabs, organize,
  source specs — the primary "open a workspace" affordance in the suite.
- `clickFileMenu(label)` in recent.spec.ts drives `Menu.getApplicationMenu()`
  (native menu) — 30+ call sites; must migrate to the hamburger together with
  menu removal (Phase 5, atomic).
- `recentItemsState()` / `recentMenuStructure()` in recent.spec.ts read the
  native menu; they migrate to reading the hamburger DOM.
- `chrome.spec.ts` (new) covers contracts/renderer.md §E2e. Main-side
  accelerators are tested via `webContents.sendInputEvent` (NOT
  `page.keyboard.press`): CDP-synthesized keyboard events never reach the
  `before-input-event` handler in the main process, so `keyboard.press` cannot
  drive Ctrl+N/O/S (verified 2026-08-05).
- These migrations are required by FR-002, not optional cleanup.

## R6 — `recent:list` handler shape (review round, 2026-08-06)

- The contract originally said `recent:list` delegates to
  `loadRecentItems(recentItemsConfigPath())`. The shipped handler instead does a
  strict read: `fs.statSync(path.dirname(config))` must be a directory, then
  `JSON.parse(fs.readFileSync(config))`, with `ENOENT` → `ok([])` and any other
  failure → `err('IO', 'Recent Items could not be loaded')`. This is a
  deliberate defensive superset — a corrupt config can never surface a
  malformed list through the IPC — and it reuses the same `normalizeRecentItems`
  shape so the renderer contract is unchanged. Recorded in the plan decision log
  and reworded in contracts/renderer.md.
- The old "returns only display strings; no path crosses the IPC" claim was
  wrong: `RecentItem[]` carries full paths and the hamburger feeds them back via
  `openRecentFile` / `runFolderOpenFlow`. Safe only because main re-validates
  every such path against the recorded list (`isRecentEntry`) before any
  filesystem access (Principle II).
