# Tasks: Modern Grey UI

**Feature**: `010-modern-grey-ui` | **Date**: 2026-08-05

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/renderer.md](./contracts/renderer.md)

**Implementation strategy**: Build the foundation first — the `explorerVisible`
setting, the four new named IPC operations, the pure shortcut mapper, and the
hamburger item model (Phase 2). Then land the renderer chrome in dependency
order: the hamburger + explorer toggle + palette (Phase 3, US1/US2/US4), then the
tab bar with the "+" button (Phase 4, US1/US3). FR-002 forces an atomic phase:
removing the native menu bar on Windows/Linux (Phase 5) simultaneously migrates
`recent.spec.ts`, whose `clickFileMenu` helper reads `Menu.getApplicationMenu()`
and breaks the instant the menu is gone. The remaining e2e selector migrations
and the new `chrome.spec.ts` coverage land in Phase 6. Everything is validated
with `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`
throughout (every task leaves the repo typecheck-clean).

The aria/e2e contract (accessible names, hamburger item labels, shortcut table)
is pinned in `contracts/renderer.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the branch baseline before any change; add the icon dependency.

- [X] T001 Establish a green baseline on the `010-modern-grey-ui` branch
      (created from clean `main` per AGENTS.md): run `npm run lint`,
      `npm run typecheck`, `npm run test`, and confirm the e2e suite passes
      (`npm run test:e2e`). Record the results in this file. Confirm the
      artifacts (`spec.md`, `plan.md`, `research.md`, `data-model.md`,
      `contracts/renderer.md`, `quickstart.md`) are present and consistent.
- [X] T002 [P] Add `@heroicons/react@^2.2.0` to `dependencies` in
      `package.json`, run `npm install`, and verify the four icons
      (`Bars3`, `Squares2x2`, `Plus`, `XMark`, `PencilSquare`) import from
      `@heroicons/react/24/outline` and typecheck (React 19 peer range verified
      in research R1-plan).

**Checkpoint**: baseline green; `@heroicons/react` installed and importable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: the persistence, IPC, shortcut, and command-bus foundations every user
story depends on.**

- [X] T003 Add `explorerVisible: boolean` (default `true`) to the `Settings`
      interface in `src/shared/ipc-contract.ts`; add the field to the defaults
      and to the field-by-field validation in `src/main/settings.ts`
      (`loadSettings`, `saveSettings`); add it to the renderer defaults in
      `src/renderer/state/settings.ts`; add the merge branch
      `explorerVisible: typeof p.explorerVisible === 'boolean' ? p.explorerVisible : current.explorerVisible`
      to the `settings:update` handler in `src/main/ipc/handlers.ts`.
- [X] T004 [P] Write unit tests for the settings change
      (`tests/main/settings.test.ts`): `explorerVisible` defaults to `true` on
      a missing field, survives round-trips, and rejects non-boolean values on
      update (data-model.md, contracts/renderer.md).
- [X] T005 Add the four named IPC operations to `DesktopApi` in
      `src/shared/ipc-contract.ts`, their handlers in `src/main/ipc/handlers.ts`
      (or a new `src/main/menuIpc.ts`), and their preload methods in
      `src/preload/index.ts`:
      `getRecentItems()` → `recent:list` (`loadRecentItems`), `clearRecentItems()`
      → `recent:clear` (extract `clearRecentItems` from `src/main/menu.ts`;
      keep the quiet footer warning/ok reporting), `requestQuit()` →
      `app:requestQuit` (`mainWindow.close()` — re-enters the existing
      quit/dirty-doc flow, Principle III), `toggleDevTools()` →
      `devtools:toggle` (`webContents.toggleDevTools()`). No generic channel.
- [X] T006 [P] Implement `src/main/shortcuts.ts`: a pure `matchShortcut(event)`
      → `MenuCommand | 'devtools' | null` for the six combinations
      (Ctrl/Cmd+N, +O, +Shift+O, +S, +Shift+S, +W) plus F12/Ctrl+Shift+I, and a
      `registerShortcuts(window)` that installs a `before-input-event` handler,
      sends `menu:command` for matches, and `preventDefault()`s (research R1).
      Write `tests/main/shortcuts.test.ts` covering every combination and
      non-matches (contracts/renderer.md table).
- [X] T007 Extract the body of the `onMenuCommand` listener in
      `src/renderer/App.tsx` into a stable `handleMenuCommand(command:
      MenuCommand)` callback so the IPC listener, the hamburger, and the keyboard
      shortcuts share one command bus (data-model.md).
- [X] T008 [P] Implement the pure hamburger item model + unit tests
      (`tests/renderer/hamburger.test.tsx`): the ordered item list
      (data-model.md `HamburgerAction`), the Recent Items grouping helper
      (folders → separator → files → separator → Clear Recent Items, mirroring
      `menu.ts`), and label uniqueness via `shortenPath`.

**Checkpoint**: `npm run typecheck` and `npm run test` pass; the shortcut table
and settings validation are pinned; the command bus is a single callback.

---

## Phase 3: US1 + US2 + US4 — Chrome bar, hamburger, explorer toggle (P1/P2)

**Goal**: the top-left chrome bar renders the hamburger (`Bars3`) and the
explorer toggle (`Squares2x2`); the hamburger dropdown opens/closes and exposes
every primary action; the explorer toggles with persisted state; the palette
restyles the chrome (FR-001, FR-005, FR-006, FR-007, FR-009).

**Independent Test**: contracts/renderer.md §E2e items 1, 2, 3, 4, 6, 7;
quickstart.md §1.

### Implementation

- [X] T009 [US1] [US4] Build `src/renderer/chrome/HamburgerMenu.tsx` + chrome
      styles: a `Bars3` button (`aria-label="Open menu"`,
      `aria-haspopup="menu"`, `aria-expanded`) opening a React dropdown of
      `<button role="menuitem">` rows with hover/active states; closes on
      outside click and Escape; focus moves into the menu on open and returns to
      the trigger on close (FR-009, research R2). Supports a nested Recent Items
      submenu.
- [X] T010 [US1] Replace the `.toolbar` in `src/renderer/App.tsx` with a
      `.chrome-bar` containing the `HamburgerMenu` and a `Squares2x2` explorer
      toggle button (`aria-label="Toggle file explorer"`); delete the lucide
      `Plus`/`FolderOpen` toolbar buttons (data-model.md aria contract).
- [X] T011 [US2] Wire the explorer collapse in `src/renderer/App.tsx`: the
      sidebar `Panel` becomes `collapsible` with `collapsedSize={0}` and a
      `panelRef` from `usePanelRef()`; the toggle calls `collapse()`/`expand()`;
      `onResize` syncs `explorerCollapsed` (`asPercentage <= 0`) and persists
      `explorerVisible` via `updateSettings` + `window.api.updateSettings`; the
      Separator renders only while visible; the initial state applies on mount
      from the loaded setting (US2 scenarios 1–3, FR-008, research R3).
- [X] T012 [US1] Add the palette as CSS custom properties in
      `src/renderer/App.css` and restyle the chrome rules (`.toolbar`→
      `.chrome-bar`, `.sidebar*`, `.resize-handle`, `.app-footer`, tab-bar base)
      with the FR-006 colors and rounded corners; leave every `.editor-host`,
      `.milkdown`, `.ProseMirror`, and `.source-*` rule byte-identical
      (FR-010).
- [X] T013 [US4] Dispatch the hamburger items in `App.tsx`: New File /
      Open File / Open Folder / Save / Save As / Close Tab via
      `handleMenuCommand`; Recent Items fetched with `getRecentItems()` on open
      (file → `openRecentFile(path)`, folder → `runFolderOpenFlow(path)`,
      Clear Recent Items → `clearRecentItems()`); Quit → `requestQuit()`;
      View > Toggle Developer Tools → `toggleDevTools()` (contracts/renderer.md).
- [X] T014 [US1] Confirm all chrome buttons are focusable with a visible focus
      ring and Enter/Space activation (FR-009); assert `aria-expanded` toggles
      with the dropdown.

**Checkpoint**: the chrome bar renders; the hamburger opens/closes and drives
every action; the explorer toggles and persists; chrome matches the grey palette.

---

## Phase 4: US1 + US3 — Tab bar restyle and the "+" button (P1/P2)

**Goal**: the tab bar matches the rounded-corner grey look and the "+" button
replaces the old "New File" text button (FR-003, FR-004).

**Independent Test**: contracts/renderer.md §E2e item 1, 5; quickstart.md §1.

### Implementation

- [X] T015 [US1] [US3] Add `onNew: () => void` to `TabBarProps` in
      `src/renderer/tabs/TabBar.tsx`; render a Heroicons `Plus` button
      (`aria-label="New file"`) immediately after the active tab (FR-004
      literal); when `documents.length === 0` render the strip with only the
      "+" at its start (spec edge); keep the strip's overflow scrolling so the
      "+" stays reachable.
- [X] T016 [US1] Restyle tabs in `App.css`: the active tab is a `#EAEAEA`
      rounded pill containing a decorative `PencilSquare` edit indicator, the
      truncated label, and a Heroicons `XMark` close button (replacing the `×`
      glyph); inactive tabs keep truncated ellipsis labels and get grey hover
      states; recolour the dirty "•" and deleted-on-disk "!" markers to the
      palette while keeping their `aria-label`s.
- [X] T017 [US3] Pass `handleNew` as `TabBar`'s `onNew` in `App.tsx`; verify the
      "+" opens a new untitled tab without touching other tabs (US3 scenario 2:
      unsaved changes in the current tab are preserved).
- [X] T018 [US1] Update `tests/renderer` unit coverage for `TabBar` if present
      (add a focused `TabBar.test.tsx` if none exists) asserting the "+"
      placement, the `XMark` close, and the active-pill classes.

**Checkpoint**: tabs render in the grey rounded style; the "+" creates a new
untitled file; close uses `XMark`.

---

## Phase 5: FR-002 — Remove the native menu bar + migrate recent.spec.ts (atomic)

**Goal**: Windows/Linux no longer show a native menu bar (FR-002); the six
shortcuts keep working through `before-input-event`; `recent.spec.ts`, which
reads `Menu.getApplicationMenu()`, migrates to the hamburger in the same change
so the suite stays green.

**Independent Test**: quickstart.md §1.7, §1.8; the migrated `recent.spec.ts`.

### Implementation

- [X] T019 Modify `src/main/index.ts` and `src/main/menu.ts`: on Windows/Linux
      call `Menu.setApplicationMenu(null)` (the hamburger is the menu chrome)
      and `registerShortcuts(mainWindow)`; on macOS keep a minimal native
      application menu (About/Edit-roles/Quit + the File/View accelerators)
      since the system menu bar is mandatory (research R1, complexity table).
      `refreshApplicationMenu` is retained only for macOS recent-items rebuilds.
- [X] T020 [P] Add the shared e2e chrome helpers to `tests/e2e/launch.ts`:
      `openHamburger(window)`, `clickHamburgerItem(window, label)`,
      `clickHamburgerRecent(window, label)`, `hamburgerRecentState(window)`,
      `hamburgerRecentStructure(window)` per contracts/renderer.md §E2e.
- [X] T021 Migrate `tests/e2e/recent.spec.ts`: replace `clickFileMenu`,
      `recentItemsState`, and `recentMenuStructure` (which read
      `Menu.getApplicationMenu()`) with the hamburger helpers, and update every
      call site (30+ `clickFileMenu('Open File'/'Open Folder')` usages). This
      task ships atomically with T019 — the native menu is gone after it.
- [X] T022 Update the `settings:get` fallback branch in
      `src/main/ipc/handlers.ts` (currently a hand-built `{ sidebarWidth: 30,
      themeOverride: null }` literal) to include `explorerVisible` so a settings
      read failure still returns a complete `Settings` object.

**Acceptance**: on Windows/Linux no native menu bar is visible, all six
shortcuts still work, and the Recent Items suite passes against the hamburger.

---

## Phase 6: E2E migration + chrome coverage

**Goal**: every spec that referenced the removed toolbar buttons is migrated,
and the new chrome behaviours get end-to-end coverage.

- [X] T023 Migrate `getByRole('button', { name: 'Open Folder' })` to
      `clickHamburgerItem(window, 'Open Folder')` in `tests/e2e/app.spec.ts`,
      `tests/e2e/tabs.spec.ts`, `tests/e2e/organize.spec.ts`, and
      `tests/e2e/source.spec.ts`.
- [X] T024 Migrate `tests/e2e/native.spec.ts`: the "New and Open Folder buttons
      show icons with accessible names" test and the focus-ring test target the
      new chrome (`Open menu`, `Toggle file explorer`, `New file`), and "New"
      clicks become `clickHamburgerItem(window, 'New File')`.
- [X] T025 [US2] [US3] [US4] Write `tests/e2e/chrome.spec.ts`:
      explorer toggle hides/expands the panel and restores its width (US2
      scenarios 1–2); hide → app restart → stays hidden (US2 scenario 3, via a
      fresh launch with the same `AME_CONFIG_DIR`); "+" creates a new untitled
      tab without discarding unsaved changes (US3); the hamburger opens and an
      outside click closes it (US4).
- [X] T026 [US1] In `chrome.spec.ts`, assert the visual anchors: active tab is
      the `#EAEAEA` pill with an edit icon, label, and close button; inactive
      labels truncate; hamburger + toggle sit top-left; shortcuts (Ctrl+N,
      Ctrl+S) work after the menu-bar removal (contracts/renderer.md §E2e).

**Acceptance**: the full e2e suite passes against the new chrome.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: remove dead references, verify per-OS presentation, run the full gate.

- [X] T027 Grep for retired selectors (`name: 'New'`, `name: 'Open Folder'`,
      `clickFileMenu`, `Menu.getApplicationMenu`) across `src/` and `tests/`;
      remove `lucide-react` from `package.json` only after `rg "lucide-react"`
      confirms no import remains. Selector grep is clean; `lucide-react` is
      retained because `src/renderer/explorer/Tree.tsx` still imports it.
- [ ] T028 [US1] Run quickstart.md on Windows; walk the macOS and Linux sections
      and record any platform discrepancy (menu-bar behaviour, shortcut
      behaviour) — fix `src/main/shortcuts.ts`/`menu.ts` and the contracts if
      reality diverges. (PENDING: requires a manual walkthrough on macOS/Linux
      that cannot be completed from a Windows host.)
- [X] T029 Final gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e` all green; verify plan/research/data-model/contracts
      are consistent with the final code; mark this task `[X]` only then.

**Checkpoint**: no retired selectors or native-menu references remain; the
four-command gate passes; per-OS behaviour verified per quickstart.md.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Foundational | Phase 1 | Phases 3–6 |
| Phase 3: US1/US2/US4 chrome | Phase 2 | Phase 5 (hamburger must exist before menu removal) |
| Phase 4: US1/US3 tab bar | Phase 2 | — (can precede or follow Phase 3; both touch `App.tsx`, run sequentially) |
| Phase 5: menu removal + recent.spec | Phase 3 | Phase 6 (native-menu-dependent specs break when the menu is gone) |
| Phase 6: e2e migration + chrome.spec | Phase 5 | Phase 7 |
| Phase 7: Polish | Phases 3–6 | — |

### Parallel Opportunities

- Phase 2: T004, T006, T008 touch disjoint files and run once T003/T005/T007
  exist; T005 and T006 are independent of T007.
- Phase 3 tasks all touch `src/renderer/App.tsx`/`App.css` — run sequentially.
- Phase 4 runs sequentially after (or alongside) Phase 3, also touching
  `App.tsx`; the tab bar work (T015/T016) is independent of the chrome-bar work
  (T009/T010) except for the shared `App.tsx` `onNew` wiring (T017).
- Phase 6 migrations (T023, T024) are per-spec and parallel once T020's helpers
  exist; T025/T026 build `chrome.spec.ts`.

### High-level guarantee

The preload surface gains exactly four named operations; the shortcut map is
one pure, unit-tested module; the hamburger and the keyboard share one
`handleMenuCommand` bus; the explorer visibility is one persisted boolean
validated in main; no save/close/quit decision changes (Principle III); the
editor content area keeps its exact colors (FR-010).

---

## Notes

- [P] tasks touch disjoint files; tasks sharing `src/renderer/App.tsx` or the
  same e2e spec run sequentially.
- T019 + T021 are intentionally atomic: removing the native menu breaks
  `recent.spec.ts`'s `Menu.getApplicationMenu()` helpers, so the migration ships
  in the same change (same pattern as spec 008 T011).
- Every task leaves the repo in `npm run typecheck`-clean state.
- MVP = end of Phase 3 (US1/US2/US4 with the engine in place); Phase 4 adds the
  "+"/tab bar (US1/US3); Phases 5–6 make the whole suite green against FR-002.
- Deviations from the research/plan must be written there per AGENTS.md — the
  shortcut table and aria names live in `contracts/renderer.md` and are enforced
  by unit tests and `chrome.spec.ts`.
- Review round 2026-08-06 (code-review subagents on PR #24): fixed a
  data-loss bug where hamburger Quit pre-armed `allowClose` and skipped the
  dirty-doc prompt (added two Quit e2e tests), reset the hamburger submenu on
  close paths, removed the dead launch-time explorer-restore effect (FR-007
  re-scoped via spec clarification 2026-08-06), and pinned the "+" at the end
  of the tab strip (user decision, superseding FR-004's literal reading). All
  deviations are recorded in spec.md / plan.md / research.md / contracts /
  data-model.md.
