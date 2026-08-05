# Implementation Plan: Modern Grey UI

**Branch**: `010-modern-grey-ui` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-modern-grey-ui/spec.md`

## Summary

Restyle the application chrome to the user-provided rounded-corner, modern grey
look and reorganize the primary workspace controls. A **hamburger menu** (a React
dropdown — user decision, not an OS-native menu) and an adjacent **file-explorer
toggle** sit in a new top-left chrome bar. The "New File" text button is replaced
by a **"+" icon button placed immediately after the active tab** (FR-004). The
tab bar is restyled to the grey palette with a `#EAEAEA` active-tab pill
(edit icon + truncated label + XMark close). The **native menu bar is removed**
on Windows/Linux (FR-002) and its keyboard accelerators are re-registered in the
main process, so shortcuts keep working (spec edge case).

Persistence: a new `explorerVisible: boolean` setting (default `true` — a fresh
install keeps today's behaviour) records the explorer panel's visibility; every
toggle persists across restarts (FR-007). The chrome uses the exact FR-006
palette through CSS custom properties; the WYSIWYG editor content area is
untouched (FR-010).

Because the hamburger must expose every action currently living in the native
menu (FR-001/002) — recent items, quit, and devtools are main-side today — moving
the menu into the renderer adds four small **named** IPC operations
(`getRecentItems`, `clearRecentItems`, `requestQuit`, `toggleDevTools`): a fixed,
enumerated list, never a generic channel (Principle I).

Icons come from **`@heroicons/react`** (user decision on 2026-08-05; overrides
the constitution's prefer-existing-dependencies for these chrome icons, per the
spec's Assumptions): `Bars3` hamburger, `Squares2x2` explorer toggle, `Plus`
new-file, `XMark` tab close, `PencilSquare` active-tab edit indicator.

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and
renderer. Electron 43.2.0.

**Primary Dependencies**: NEW `@heroicons/react@^2.2.0` — peer range
`react >= 16 || ^19.0.0-rc` verified against the pinned version; the project
uses React 19.2.8. Existing, unchanged: `react-resizable-panels@^4.12.2` for the
explorer collapse, `react-arborist` for the tree, `lucide-react` (its chrome
usages are replaced; removal is a Phase 7 cleanup if nothing else imports it).
`@heroicons/react` icons are imported from `@heroicons/react/24/outline`.

**Storage**: `settings.json` in `app.getPath('userData')` via the existing
`src/main/settings.ts` module — gains `explorerVisible: boolean`, validated
`typeof === 'boolean'` on load and update (the current field-by-field pattern).
Recent items stay in their existing config, read through the new `getRecentItems`
IPC for the hamburger submenu.

**Testing**: Vitest 4 (node project for `tests/main`, jsdom for
`tests/renderer`). New unit tests: the pure shortcut-mapping function, the
settings defaults/validation with `explorerVisible`, and the hamburger item
model. Playwright e2e (`npm run test:e2e`) — every spec that referenced the
toolbar `New`/`Open Folder` buttons or the native menu is migrated to the
hamburger, and new coverage is added for the explorer toggle (incl. persistence
across a restart), the "+" button, and hamburger open/close/outside-click
behaviour.

**Target Platform**: Windows desktop primary (spec Assumptions: Windows-style
top-right controls). macOS and Linux supported; macOS keeps its system menu bar
(platform deviation, below).

**Project Type**: Desktop application (Electron), three build targets (main,
preload, renderer).

**Performance Goals**: Nothing is added to the keystroke path — the shortcut
mapper is a synchronous `before-input-event` lookup; the explorer toggle is one
imperative panel resize; the hamburger opens on click only.

**Constraints**: Renderer sandboxed, no `fs`, no Electron modules; the preload
API stays a fixed list of named operations (Principle I). Every new IPC op is a
named method — `getRecentItems`, `clearRecentItems`, `requestQuit`,
`toggleDevTools` — never an `invoke(channel, …)` escape hatch. Settings fields
are validated in main (Principle II). No save/close/quit decision changes
(Principle III): hamburger Quit routes through the same window-close flow as the
window X, so the native unsaved-changes prompt still protects the work. The
editor content area keeps its exact colors (FR-010).

**Scale/Scope**: Chrome restyle (toolbar, tab bar, hamburger, explorer toggle) +
native menu-bar removal + accelerator re-registration + one persisted setting +
four IPC ops. Out of scope: the WYSIWYG content area, the native confirmation
dialogs (spec 008, untouched), file operations, and explorer behaviour.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | All new chrome is renderer-side. The four new IPC operations are named methods on `DesktopApi`, and shortcuts are registered main-side (`before-input-event`) reusing the existing `menu:command` channel. No generic invoke, no new main-only chrome | **PASS** |
| II. Every Path Is Untrusted | `getRecentItems` returns display strings (labels shortened by the existing `shortenPath`); the renderer never feeds them back to the filesystem. No filesystem path crosses the new IPC. `explorerVisible` is validated as a boolean in main before save | **PASS** |
| III. Never Lose The User's Words | Save/close/quit decision flows are unchanged. Hamburger Quit triggers `mainWindow.close()`, which runs the exact `app:quitRequested` → renderer flush → native unsaved-changes flow as the window X (research R4) | **PASS** |
| IV. Calm, Predictable Editing | The explorer toggle animates through the panels library without stealing focus (the toggle button keeps focus); the hamburger is click-opened; nothing runs on the keystroke path except the synchronous shortcut lookup | **PASS** |
| V. Test What Can Corrupt Or Escape | New unit tests pin the shortcut map and settings validation; e2e drives the hamburger, the "+" button, and the explorer toggle including restart persistence, and migrates every spec that referenced the removed toolbar buttons / native menu | **PASS** |

## Phase 1 Design decisions

**Chrome bar and hamburger (`src/renderer/chrome/`)** — the `.toolbar` div is
replaced by a `.chrome-bar` containing a `HamburgerMenu` (Heroicons `Bars3`
button + dropdown) and an explorer-toggle icon button (Heroicons `Squares2x2`).
Both are real `<button>`s with `aria-label`s and visible focus rings (FR-009).
The dropdown is a React component (user decision: no OS-native `Menu.popup`): a
closed list of `<button role="menuitem">` rows with hover/active states, opened
on click, closed on outside click and on Escape, with `aria-expanded` on the
trigger (research R2).

The `.chrome-bar` sits inside a single `.header-bar` row that also holds the
tab bar (clarification 2026-08-05): `[hamburger] [explorer toggle] [tabs… +]`.
`TabBar` moves out of the editor `Panel` and up into that header; the sidebar
and editor content render below it.

- Item set (the current native menu's actions, FR-001/002):
  New File (Ctrl+N), Open File… (Ctrl+O), Open Folder… (Ctrl+Shift+O),
  Recent Items ▸ (folders, separator, files, separator, Clear Recent Items — same
  grouping and order as `menu.ts` today), separator, Save (Ctrl+S),
  Save As… (Ctrl+Shift+S), Close Tab (Ctrl+W), separator,
  View > Toggle Developer Tools, separator, Quit.
- Dispatch: the renderer already handles every `MenuCommand` in the body of the
  `onMenuCommand` IPC listener; that switch is extracted into a stable
  `handleMenuCommand(command)` callback so the hamburger, the IPC listener, and
  the keyboard shortcuts share one command bus. Recent-item file opens reuse
  `openRecentFile`; recent-folder opens reuse `runFolderOpenFlow(path)`;
  Quit reuses the window-close flow via `requestQuit`; devtools via
  `toggleDevTools`.
- Recent Items are fetched on dropdown open (`getRecentItems()`); the submenu is
  keyboard-navigable with real buttons.

**Explorer toggle and persistence** — `Settings.explorerVisible: boolean`
(default `true`: today a fresh install shows the explorer; once a user toggles,
the choice persists — FR-007, US2 scenario 3). The sidebar `Panel` is
`collapsible` with `collapsedSize={0}` and a `panelRef` from `usePanelRef()`;
the toggle calls `collapse()`/`expand()` imperatively. `react-resizable-panels`
v4.12.2 exposes `PanelImperativeHandle` with `collapse()/expand()/isCollapsed()`
but has NO `onCollapse`/`onExpand` props (verified in its `.d.ts`), so drag
collapse/expand is detected in `onResize` (`asPercentage <= 0` ⇒ collapsed) and
synced back to `explorerVisible` + persisted (same `updateSettings` +
`window.api.updateSettings` pair as `handleSidebarResize`). `expand()` restores
the pre-collapse width (US2 scenario 2); drag-resize still persists
`sidebarWidth` as today. The Separator stays mounted and is hidden with
`visibility: hidden` while collapsed — unmounting it (or persisting a collapsed
`sidebarWidth: 0`, which changes the Panel's `defaultSize` prop) re-runs the
Panel's registration effect and wipes the library's `expandToSize`, so a
toggle-expand snaps to `minSize` instead of the previous width (verified
2026-08-05, see Decision log). The initial state is applied on mount from the
loaded setting before first paint. Editor panel expands to fill the space
(FR-008). Opening a folder always reveals the explorer, overriding a persisted
hidden choice (clarification 2026-08-05; US2 scenario 3 amended).

**Menu-bar removal + accelerators** — Windows/Linux: `Menu.setApplicationMenu(
null)` (research R1) so the native menu bar is not shown (FR-002). The six
accelerators (`CmdOrCtrl+O`, `+Shift+O`, `+N`, `+S`, `+Shift+S`, `+W`) are
re-registered in a new electron-free-pure `src/main/shortcuts.ts`:
`matchShortcut(input, modifiers): MenuCommand | 'devtools' | null`, used from a
`webContents.on('before-input-event')` handler that sends `menu:command` (the
same channel the old menu used) and `preventDefault()`s when matched. F12 /
Ctrl+Shift+I toggles devtools main-side directly. macOS keeps a minimal native
application menu (About/Edit-roles/Quit plus the accelerators) because the system
menu bar is mandatory there and cannot be removed; the in-window hamburger is
present on all platforms (platform deviation, complexity table).

**Tab bar restyle + "+" button** — `TabBar` gains `onNew: () => void`. The "+"
button (Heroicons `Plus`) is placed immediately after the active tab (FR-004
literal reading; the tab order is unchanged and the "+" is inserted in DOM right
after the active tab). With zero documents the strip still renders with the "+"
at its start (spec edge: the "+" must remain present when no workspace is open).
The strip keeps its overflow scrolling and the "+" stays reachable through it.
Active tab: `#EAEAEA` rounded pill containing a decorative `PencilSquare` edit
indicator, the truncated label, and an `XMark` close button (replacing the `×`
glyph). Inactive tabs keep truncated labels and hover states. The `deletedOnDisk`
"!" and dirty "•" markers stay, recolored to the palette.

**Palette** — CSS custom properties in `App.css` scoped to the chrome:
`--bg:#FFFFFF`, `--surface:#F9F9FB` (secondary `#F8F8FA`), `--active-tab:#EAEAEA`,
`--text:#1A1A1A` (secondary `#222222`), `--muted:#666666` (secondary `#707070`),
`--border:#E5E5E5` (secondary `#ECECEC`), `--accent:#D96B27`,
`--control:#2D2D2D`. Chrome rules (`.toolbar`/`.tab-bar`/`.tab*`/`.sidebar*`/
`.resize-handle`/`.app-footer`) are re-expressed in these variables with the
rounded-corner look. No rule that targets `.editor-host`, `.milkdown`,
`.ProseMirror`, or `.source-*` changes (FR-010). `themeOverride` stays in
settings but is ignored by the chrome for this feature (spec edge case).

## Project Structure

### Documentation (this feature)

```text
specs/010-modern-grey-ui/
├── spec.md              # Requirements (FR-001…FR-010, US1–US4, edge cases)
├── plan.md              # This file
├── research.md          # R1…R4 evidence (menu removal, panels API, dropdown, quit path)
├── data-model.md        # Settings + chrome state + hamburger command model + TabBar props
├── quickstart.md        # Manual per-OS verification script
├── contracts/
│   └── renderer.md      # New IPC ops + shortcut table + hamburger item model + e2e helpers
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/
└── ipc-contract.ts              # MODIFY: + Settings.explorerVisible; + DesktopApi ops below

src/main/
├── index.ts                     # MODIFY: setApplicationMenu(null) on win/linux; register shortcuts
├── menu.ts                      # MODIFY: keep macOS-only minimal menu; win/linux path removed
├── shortcuts.ts                 # NEW: pure matchShortcut() + before-input-event wiring (R1/R3)
├── settings.ts                  # MODIFY: + explorerVisible default + validation
└── ipc/handlers.ts              # MODIFY: + settings field; + recent:list / recent:clear / app:requestQuit / devtools:toggle

src/preload/index.ts             # MODIFY: + getRecentItems, clearRecentItems, requestQuit, toggleDevTools

src/renderer/
├── App.tsx                      # MODIFY: chrome bar; explorer panel collapse wiring; extract handleMenuCommand; TabBar onNew
├── App.css                      # MODIFY: palette vars; restyle chrome; rounded tabs
├── chrome/HamburgerMenu.tsx     # NEW: Bars3 dropdown (React UI), Recent Items submenu, keyboard nav
├── chrome/chrome.css            # NEW (or in App.css): chrome bar + hamburger dropdown styles
└── tabs/TabBar.tsx              # MODIFY: + onNew; + button after active tab; XMark close; PencilSquare edit icon
```

```text
tests/
├── main/shortcuts.test.ts       # NEW: matchShortcut table (all six combos + devtools + non-matches)
├── main/settings.test.ts        # NEW (or extend ipc.test.ts): explorerVisible default/validation
├── renderer/hamburger.test.tsx  # NEW: item model, recent grouping, open/close/outside-click
└── e2e/                         # MODIFY: migrate menu/toolbar selectors + new chrome coverage
    ├── launch.ts                # + openHamburger / clickHamburgerItem / hamburgerRecentState helpers
    ├── app.spec.ts              # MODIFY: New/Open Folder → hamburger
    ├── tabs.spec.ts             # MODIFY: toolbar Open Folder → hamburger
    ├── organize.spec.ts         # MODIFY: toolbar Open Folder → hamburger
    ├── native.spec.ts           # MODIFY: New/Open Folder button assertions → new chrome; focus-ring
    ├── recent.spec.ts           # MODIFY: clickFileMenu → hamburger; recent state via DOM
    ├── source.spec.ts           # MODIFY: toolbar Open Folder → hamburger
    └── chrome.spec.ts           # NEW: explorer toggle + persistence, + button, hamburger behaviour
```

**Structure decision**: the chrome is a renderer concern (React + CSS), so all
new UI components live in `src/renderer/chrome/`. The pieces that must stay in
main are exactly the ones the renderer cannot touch — application-menu
registration, accelerator capture, recent-items storage, and window close —
exposed through the existing narrow preload surface as four named operations.
Shortcut *matching* is a pure module so it is unit-testable without Electron.
`menu.ts` shrinks to a macOS-only minimal menu; the renderer command bus is
unchanged.

## Phase status

- Phase 1: Setup — green baseline on `010-modern-grey-ui`; add `@heroicons/react`
- Phase 2: Foundational — `Settings.explorerVisible` (contract + main + renderer),
  the four new IPC ops + preload, `matchShortcut` + unit tests, hamburger item
  model + unit tests
- Phase 3: Chrome UI — chrome bar + HamburgerMenu + explorer toggle wiring + palette CSS
- Phase 4: Tab bar restyle + "+" button + XMark close + PencilSquare edit icon
- Phase 5: Menu-bar removal (win/linux) + accelerator registration + migrate
  `recent.spec.ts` native-menu helpers to the hamburger (atomic, like spec 008 T011)
- Phase 6: E2e migration of the remaining toolbar selectors + new chrome.spec.ts coverage
- Phase 7: Polish — grep leftovers, drop `lucide-react` if unused, quickstart
  manual pass, final four-command gate

## Deferred / later features

- `themeOverride` (dark mode) is ignored by the chrome this feature restyles; a
  later dark-chrome feature can apply it (spec edge case: palette takes
  precedence; overrides out of scope).
- Custom icons elsewhere in the app (context menus, tree) stay as-is.
- macOS "replace the system menu bar entirely" is impossible by OS design; a
  future macOS-first phase could relocate remaining native roles into the
  hamburger, but the OS-required menu stays for now.

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| New runtime dependency `@heroicons/react` | The spec's Assumptions name Heroicons (`Bars3`, `Squares2x2`, `Plus`, `XMark`, `PencilSquare`) and the user chose "Add Heroicons per spec" over reusing `lucide-react` on 2026-08-05. The chrome icons are a user-visible, spec-pinned deliverable | Reusing `lucide-react` (constitution-preferred) would not render the exact icons the spec and the user asked for |
| Removing the native menu bar and re-implementing Recent Items / Quit / DevTools in the renderer (four new IPC ops + a shortcut module) | FR-002 removes the menu bar and FR-001 moves its actions into the renderer hamburger; recent items, quit, and devtools are main-owned today, so the renderer needs named operations to reach them | Keeping the native menu (violates FR-002) or a generic `invoke(channel, …)` (forbidden by Principle I) |
| macOS keeps a minimal native application menu while Windows/Linux remove theirs | The macOS system menu bar is mandatory (OS requirement); it cannot be "no longer shown". The in-window hamburger exists on all platforms | Removing the macOS menu entirely is not possible; forcing the hamburger to also render native roles is duplicative |
| "+" button literally placed immediately after the active tab | FR-004 and US1 scenario 2 say "immediately after the active tab" (repeated in the Assumptions); when the active tab is mid-strip the "+" sits mid-strip, which some tabbed UIs avoid by pinning "+" at the end | Pinning "+" at the strip end is the common pattern but contradicts the spec text; the literal reading is the recorded decision (reversible) |

## Decision log (2026-08-05)

- Icon library: `@heroicons/react@^2.2.0` added per spec and user decision; the
  four chrome icons come from `@heroicons/react/24/outline`. Peer range
  `react >= 16 || ^19.0.0-rc` verified against the pinned version.
- Open Folder button: moved into the hamburger (user decision). The top-left
  chrome holds only the hamburger + explorer toggle.
- Buttons are icon-only with `title`/`aria-label` hover tooltips (user decision:
  no text labels on chrome buttons).
- Hamburger is a React dropdown, not OS-native (user decision).
- `explorerVisible` default `true`: a fresh install keeps today's behaviour
  (explorer shown); the persisted value governs after the first toggle. The spec
  only asserts persistence (US2 scenario 3), never a fresh-install default; this
  choice is the no-regression reading and is cheap to reverse.
- v4.12.2 has no `onCollapse`/`onExpand` panel props (verified in
  `react-resizable-panels.d.ts`); collapse state is synced through `onResize`.
- The six accelerators move from the native menu template to a
  `before-input-event` mapper reusing the existing `menu:command` channel, so the
  renderer's command handling is untouched and shortcuts keep working after
  FR-002.
- Hamburger Quit is `requestQuit()` → `mainWindow.close()` so the dirty-document
  native prompt and quit flow are the exact same code path as the window X
  (Principle III).
- Devtools: kept reachable via F12/Ctrl+Shift+I (main-side) and a View item in
  the hamburger through `toggleDevTools()`. Not part of the spec's visible goals
  but required by "all existing top-level menu actions" (FR-001).
- `themeOverride` is ignored by the chrome for this feature (spec edge case:
  palette takes precedence).
- E2e selectors change: `getByRole('button', { name: 'New' })` /
  `{ name: 'Open Folder' }` and `clickFileMenu` (which reads
  `Menu.getApplicationMenu()`) are replaced by hamburger-driven helpers. This is
  required by FR-002 (the native menu is gone) and is the largest test churn;
  Phase 5 and 6 split it so the suite stays green.
- `lucide-react` becomes unused by the chrome after Phase 4; Phase 7 removes the
  dependency only if a repo-wide grep confirms no other import remains.
- US2 scenario 2 fix (2026-08-05, verified): the Separator between the sidebar
  and the editor is ALWAYS mounted and hidden with `visibility: hidden` while
  collapsed, and a collapsed (0) width is never persisted. Originally the
  Separator was conditionally rendered (`{!collapsed && <Separator/>}`) and
  `handleSidebarResize` persisted `sidebarWidth: 0`. Both actions re-ran the
  Panel's registration effect (`registerPanel` rebuilds `group.panels` with a
  fresh `mutableValues`), resetting `expandToSize` so `expand()` fell back to
  `minSize` (15%) instead of the previous width (30%). Kept mounted + never
  persisting 0 keeps the panel object stable across collapse/expand, so
  `expand()` restores exactly.
- Reveal-on-open (2026-08-05, user decision): every successful folder open
  (Open Folder or a recent folder) calls `revealExplorer()` — it persists
  `explorerVisible: true` and calls `panel.expand()` if collapsed. This
  overrides a persisted "hidden" choice, which US2 scenario 3 did not anticipate;
  the spec and the e2e contract were amended accordingly.
- E2e accelerator tests use `webContents.sendInputEvent` (2026-08-05, verified):
  Playwright's CDP-synthesized `keyboard.press` does NOT reach the main process's
  `before-input-event` handler, so Ctrl+N/O/S could not be exercised that way.
  `sendInputEvent` goes through the real shortcut pipeline. `pressShortcut` in
  `chrome.spec.ts` wraps it.
