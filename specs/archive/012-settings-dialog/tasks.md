# Tasks: Settings Dialog

**Feature**: `012-settings-dialog` | **Date**: 2026-08-06

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/renderer.md](./contracts/renderer.md)

**Implementation strategy**: Foundational work first — the `editorFont` setting
(contract + main + renderer) and the storage consolidation that moves settings
into the MRU `config.json` with read-modify-write on both stores plus the legacy
migration (Phase 2). Then the hamburger `Settings…` entry and the
keyboard-accessible dialog (Phase 3, US1), the editor font application via CSS
variables (Phase 4, US2), restart persistence (Phase 5, US3), and dirty-doc /
malformed-config non-interference (Phase 6, US4). Phase 7 polishes the config
reads in the existing `chrome.spec.ts` and runs the final four-command gate.
Everything is validated with `npm run lint`, `npm run typecheck`, `npm run test`,
`npm run test:e2e` throughout.

The settings field, config-file shape, and dialog aria contract are pinned in
`contracts/renderer.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the branch baseline before any change.

- [X] T001 Establish a green baseline on the `012-settings-dialog` branch
      (created from clean `main` per AGENTS.md): run `npm run lint`,
      `npm run typecheck`, `npm run test`, and confirm the e2e suite passes
      (`npm run test:e2e`). Record the results in this file. Confirm the
      artifacts (`spec.md`, `plan.md`, `research.md`, `data-model.md`,
      `contracts/renderer.md`, `quickstart.md`) are present and consistent.

**Checkpoint**: baseline green; artifacts present.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: the `editorFont` setting and the shared-config-file storage every user
story depends on.**

- [X] TT002 Add `editorFont: 'sans-serif' | 'serif'` to the `Settings` interface
      in `src/shared/ipc-contract.ts`; add `editorFont: 'sans-serif'` to the
      defaults in `src/main/settingsFile.ts` and the field-by-field load
      validation; add it to the renderer defaults in
      `src/renderer/state/settings.ts`; add the merge branch to the
      `settings:update` handler and the field to the `settings:get` fallback
      literal in `src/main/ipc/handlers.ts` (data-model.md, contracts/renderer.md).
- [X] TT003 Consolidate settings storage into the MRU config file
      (`config.json` at `appData/ame`; `AME_CONFIG_DIR` seam): change
      `loadSettingsFile`/`writeSettingsFile` in `src/main/settingsFile.ts` to
      read/write the `.settings` key with field-by-field validation and
      read-modify-write (preserve `.recentItems`); change `saveRecentItems` in
      `src/main/recentItems.ts` to read-modify-write (preserve `.settings`);
      change `settingsPath()` in `src/main/settings.ts` to return
      `recentItemsConfigPath()`; add the one-time migration from the legacy
      `userData/settings.json` (or `AME_CONFIG_DIR/settings.json`) into
      `config.json` (plan.md, data-model.md).
- [X] TT004 [P] Update `tests/main/settings.test.ts` for the new file shape
      (`.settings` key) and add coverage: `editorFont` defaults to `'sans-serif'`
      on a missing field, survives round-trips, rejects invalid values on load;
      a settings write preserves a pre-existing `recentItems` key and vice versa
      (shared-file round-trip); a malformed config yields defaults (FR-009).
- [X] TT005 [P] Add a migration unit test in `tests/main/settings.test.ts`: a
      legacy `settings.json` with valid values is imported into `config.json`
      on first load when `config.json` has no `.settings` key; when `config.json`
      already has `.settings`, the legacy file is ignored.
- [X] TT006 [P] Update `tests/e2e/chrome.spec.ts` config reads: assertions that
      read `path.join(configDir, 'settings.json')` for persisted
      `explorerVisible` now read `path.join(configDir, 'config.json')` →
      `.settings.explorerVisible` (settings moved into the shared config).

**Checkpoint**: `npm run typecheck` and `npm run test` pass; settings and recent
items share `config.json` without clobbering each other; the legacy migration is
pinned.

---

## Phase 3: US1 — Hamburger entry + Settings dialog (P1)

**Goal**: a user can open a clearly-labelled Settings dialog from the hamburger
("main menu"), keyboard-accessible, whose first setting is the editor font
choice between sans-serif and serif (FR-001, FR-003, FR-004, FR-007).

**Independent Test**: contracts/renderer.md §E2e items 1 and 6; quickstart.md §1, §6.

### Implementation

- [X] TT007 [US1] Add the `Settings…` action to the hamburger model in
      `src/renderer/chrome/menuModel.ts`: `HamburgerAction` gains
      `action: 'settings'`; `hamburgerMenuStructure` places it after
      `Toggle Developer Tools` and before `Quit` (separator-separated).
- [X] TT008 [US1] Extend `src/renderer/chrome/HamburgerMenu.tsx` with an
      `onOpenSettings: () => void` prop; dispatch `action === 'settings'` to it
      and close the dropdown.
- [X] TT009 [US1] Build `src/renderer/chrome/SettingsDialog.tsx`: a modal
      (`role="dialog"`, `aria-modal="true"`, `aria-labelledby` heading
      "Settings") with a focus trap, Escape + Close-button dismissal, focus
      return to the hamburger trigger, and a first setting "Editor Font" as a
      radio group (`Sans-serif` / `Serif`, arrow-key navigable). Selecting an
      option calls `onEditorFontChange(font)` immediately.
- [X] TT010 [US1] Mount the dialog in `src/renderer/App.tsx`: add
      `settingsOpen` state, `onOpenSettings` wired to the hamburger, and the
      `SettingsDialog` (single instance). Add the dialog styles to
      `src/renderer/App.css`.
- [X] TT011 [US1] Update `tests/renderer/menuModel.test.ts` for the new
      `Settings…` item and its placement.

**Checkpoint**: the hamburger shows `Settings…`; the dialog opens, is
keyboard-accessible, and closes on Escape/Close with focus returning.

---

## Phase 4: US2 — Choose the editor font (P1)

**Goal**: selecting a font updates the editing surface immediately and the
choice is saved (FR-005, FR-007 scenario 3).

**Independent Test**: contracts/renderer.md §E2e items 2 and 3; quickstart.md §2, §3.

### Implementation

- [X] TT012 [US2] Add `editorFont` state to `src/renderer/App.tsx` (initialized
      from `getSettings().editorFont`, synced after `loadSettingsFromMain()`
      resolves) and render `data-editor-font={editorFont}` on `.app-container`.
- [X] TT013 [US2] Add the serif override to `src/renderer/App.css`: for
      `[data-editor-font='serif'] .milkdown`, set `--crepe-font-default` and
      `--crepe-font-title` to the system serif stack; sans-serif keeps Inter.
- [X] TT014 [US2] Wire the dialog's `onEditorFontChange` in `App.tsx`:
      `updateSettings({ editorFont })` + `window.api.updateSettings({ editorFont })`
      + `setEditorFont(font)` (apply immediately, persist).

**Checkpoint**: choosing Serif re-renders the editing surface in serif and saves.

---

## Phase 5: US3 — Persist settings across restarts (P1)

**Goal**: the font choice survives restarts (FR-006).

**Independent Test**: contracts/renderer.md §E2e item 4; quickstart.md §4.

### Implementation

- [X] TT015 [US3] Write `tests/e2e/settings.spec.ts` covering US1–US3: open the
      dialog from the hamburger, first setting is Editor Font with two options,
      selecting Serif changes the editor's computed font-family to a serif stack,
      `config.json` records `settings.editorFont = "serif"`, reopen shows the
      Serif radio checked, and a restart with the same `AME_CONFIG_DIR` still
      renders serif. Add the `openSettingsDialog` helper to
      `tests/e2e/launch.ts` if needed.

**Checkpoint**: the settings e2e suite passes, including restart persistence.

---

## Phase 6: US4 — Close without losing work + tolerance (P2)

**Goal**: the dialog never alters documents or dirty state (FR-008), and missing
or malformed config opens with defaults and writes a valid config on change
(FR-009).

**Independent Test**: contracts/renderer.md §E2e items 5, 7, 8; quickstart.md §5, §7.

### Implementation

- [X] TT016 [US4] Add e2e coverage to `tests/e2e/settings.spec.ts`: type into a
      document (dirty), open the dialog, change the font, close it — the
      document content and dirty marker are unchanged (FR-008).
- [X] TT017 [US4] Add e2e coverage for tolerance: with no `config.json`, the
      dialog opens with Sans-serif selected and selecting Serif writes a valid
      config; with a malformed `config.json`, the dialog still opens with
      defaults (FR-009).

**Checkpoint**: dirty-doc non-interference and missing/malformed-config
tolerance are proven in e2e.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: verify consistency and run the full gate.

- [X] TT018 [US1] Grep for stale references to the old settings path
      (`userData/settings.json`, `settingsPath`) across `src/` and `tests/` and
      update any remaining comment/code that implies settings live outside
      `config.json`.
- [X] TT019 Run quickstart.md on Windows and note any platform discrepancy
      (the macOS/Linux sections are identical for this feature — the shared
      config path and the dialog are platform-agnostic).
- [X] TT020 Final gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e` all green; verify plan/research/data-model/contracts
      are consistent with the final code; mark this task `[X]` only then.

**Checkpoint**: no stale settings-path references; the four-command gate passes.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Foundational | Phase 1 | Phases 3–7 |
| Phase 3: US1 hamburger + dialog | Phase 2 | Phase 4 (dialog must exist before font wiring lands) |
| Phase 4: US2 font application | Phase 3 | Phase 5 (font must apply before persistence e2e) |
| Phase 5: US3 persistence e2e | Phase 4 | Phase 6 |
| Phase 6: US4 non-interference + tolerance | Phase 5 | Phase 7 |
| Phase 7: Polish | Phases 2–6 | — |

### Parallel Opportunities

- Phase 2: T004, T005, T006 are unit/e2e test tasks over the storage change
  (T003) — they can run once T002/T003 land; T004 and T005 are [P].
- Phase 3 tasks all touch `App.tsx`/hamburger — run sequentially.

### High-level guarantee

No new IPC operations (Principle I); `editorFont` is a closed union validated in
main (no CSS injection); settings and recent items share one config file with
read-modify-write on both stores (FR-002); the dialog never touches document
state (FR-008); missing/malformed config yields defaults and a change writes a
valid config (FR-009); legacy settings are migrated once.

---

## Notes

- [P] tasks touch disjoint files.
- T003 touches spec-004's `saveRecentItems` — a read-modify-write only; the
  recent-items behaviour and tests are unchanged.
- Every task leaves the repo in `npm run typecheck`-clean state.
- MVP = end of Phase 4 (US1 + US2 with the dialog and font application);
  Phases 5–6 add the persistence and tolerance e2e coverage; Phase 7 polishes.
- Code-review round 2026-08-06 (PR #27, review subagents): fixed a stale-snapshot
  clobber in `settings:update` (now an authoritative in-memory merge), made
  `writeSettingsFile` atomic with `0o600` + `mkdir`, added a quit flush for the
  debounced settings write, restored focus return + the focus-trap gap in the
  dialog, widened the migration gate, made the malformed-config e2e non-vacuous,
  and moved `openSettingsDialog` into `tests/e2e/launch.ts` per
  contracts/renderer.md. All deviations recorded in plan.md's decision log.
