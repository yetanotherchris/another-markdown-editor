# Tasks: Editor Spellcheck

**Input**: Design documents from `/specs/020-editor-spellcheck/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for this feature — AGENTS.md requires Playwright e2e
specs for every user-visible feature phase, and the correction/dictionary flows
are constitution-aligned test territory (research R6).

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Renderer code: `src/renderer/`, tests: `tests/renderer/`, e2e: `tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The phase branch and the isolated-profile test seam every e2e
scenario depends on

- [X] T001 [P] Create the implementation branch `phase-020-editor-spellcheck` from clean main before any source work begins
- [X] T002 Add the `AME_USER_DATA_DIR` test seam to src/main/index.ts: at module load, if the env var is set, `app.setPath('userData', process.env.AME_USER_DATA_DIR)` so the e2e suite gets an isolated Chromium profile (spellcheck dictionary) per test (research R6)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `spellcheckEnabled` setting and the pure menu-action module every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Add `spellcheckEnabled: boolean` (default `true`) to `Settings` in src/shared/ipc-contract.ts (FR-006) and to `DEFAULTS`/`validateSettings`/`mergeSettingsPatch` and the migration known-keys list in src/main/settingsFile.ts (boolean-only closed type, default on for old configs)
- [X] T004 Add `spellcheckEnabled: true` to the defaults in src/renderer/state/settings.ts
- [X] T005 [P] Write tests/main/spellcheckMenu.test.ts covering every row of the action-builder contract in contracts/spellcheck.md: empty when no misspelled word; suggestions capped at 5; add-to-dictionary always appended; empty-suggestion case still yields add-to-dictionary
- [X] T006 [P] Extend tests/main/settings.test.ts for `spellcheckEnabled`: default true, reads false, rejects non-boolean, merge applies a boolean patch, migration inherits the default

### Checkpoint: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Misspelled words are highlighted (Priority: P1) 🎯 MVP

**Goal**: The native spellchecker is on and the two editable elements opt in, so misspelled words get the red squiggly underline as the user types.

**Independent Test**: Type a misspelled word in the WYSIWYG editor; Chromium flags it (context-menu params report `misspelledWord`).

### Implementation for User Story 1

- [X] T007 [US1] Create src/main/spellcheck.ts exporting `applySpellcheckSetting(enabled)` (calls `session.defaultSession.setSpellCheckerEnabled`) and call it from src/main/index.ts in `whenReady` before `createWindow()` using `loadSettings().spellcheckEnabled` (FR-006 default-on, FR-009 startup apply)
- [X] T008 [P] [US1] Add the `spellcheckEnabled` prop to src/renderer/editor/CrepeHost.tsx and set `view.dom.spellcheck = spellcheckEnabled` at editor mount and on every prop change (research R5); pass it through src/renderer/editor/EditorPanel.tsx
- [X] T009 [P] [US1] Add the `spellcheckEnabled` prop to src/renderer/editor/SourceView.tsx and set the textarea `spellCheck={spellcheckEnabled}` (replacing the hard-coded `false`; FR-007, research R5)

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T010 [P] [US1] Add e2e spec tests/e2e/spellcheck.spec.ts (shared launch with isolated userData + `Menu.buildFromTemplate`/`context-menu` capture hooks per research R6) with a US1 scenario: open a file, type a misspelled word, right-click it, assert the captured context-menu params report the word and the `.ProseMirror` element has spellcheck enabled

**Checkpoint**: Misspelled words are flagged by the native spellchecker in the WYSIWYG editor.

---

## Phase 4: User Story 2 - Right-click correction (Priority: P1)

**Goal**: Right-clicking a flagged word shows a native menu with suggestions; clicking one replaces the word in place.

**Independent Test**: Type a misspelled word, right-click, invoke a suggestion — the word is replaced in the editor.

### Implementation for User Story 2

- [X] T011 [US2] Create src/main/spellcheckMenu.ts exporting the pure `spellcheckMenuActions(params)` (suggestions capped at 5 + "Add "<word>" to Dictionary") per contracts/spellcheck.md (research R7)
- [X] T012 [US2] Create src/main/contextMenu.ts exporting `registerSpellcheckContextMenu(window)`: on `context-menu` with a flagged word, build a native `Menu` from `spellcheckMenuActions`; suggestion clicks call `webContents.replaceMisspelling(suggestion)`, add-to-dictionary clicks call `session.defaultSession.addWordToSpellCheckerDictionary(word)` (FR-002/FR-003/FR-004); register it in src/main/index.ts `createWindow`
- [X] T013 [US2] Apply the setting in src/main/ipc/handlers/settings.ts on every `settings:update` via `applySpellcheckSetting(updated.spellcheckEnabled)` (immediate apply, US4 S1 — do this here so US2's menu also honours an off toggle)

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Add e2e scenarios in tests/e2e/spellcheck.spec.ts: (a) right-clicking a flagged word records a menu whose labels include the dictionary suggestions; (b) invoking the first suggestion's click handler replaces the word in the editor (research R2 verified `replaceMisspelling` works in ProseMirror); (c) right-clicking a correctly spelled word records no spelling menu

**Checkpoint**: Right-clicking a flagged word offers corrections that replace the word.

---

## Phase 5: User Story 3 - Add unknown words to dictionary (Priority: P2)

**Goal**: A flagged word can be taught to the persistent personal dictionary; it is never flagged again, in-session or across restarts.

**Independent Test**: Add a nonsense word to the dictionary; it is no longer flagged in the session and after an app restart.

### Tests for User Story 3 ⚠️

- [X] T015 [P] [US3] Add e2e scenarios in tests/e2e/spellcheck.spec.ts: (a) add a random nonsense word via the menu's "Add … to Dictionary" click, re-type it, assert it is no longer flagged in the same session; (b) close and relaunch with the same `AME_USER_DATA_DIR`, type the word again, assert it is still not flagged (FR-005, US3 S2/S3)

### Implementation for User Story 3

- [X] T016 [US3] No code beyond T012: verify the add-to-dictionary click path end-to-end (it is already wired; fix any bug the tests surface)

**Checkpoint**: Learned words are not flagged in-session and persist across restarts.

---

## Phase 6: User Story 4 - Toggle spellcheck on and off (Priority: P3)

**Goal**: A Settings checkbox turns spellcheck off and on; markers vanish instantly when disabled; the choice persists.

**Independent Test**: Toggle the checkbox off — session spellchecker disabled and editor attribute off; toggle back on — restored.

### Tests for User Story 4 ⚠️

- [X] T017 [P] [US4] Add e2e scenarios in tests/e2e/spellcheck.spec.ts: (a) unchecking the settings checkbox flips `session.isSpellCheckerEnabled()` to false and the `.ProseMirror` spellcheck attribute off, and a newly typed misspelled word is not flagged; (b) re-checking restores it for new words; (c) the choice is written to config.json (`settings.spellcheckEnabled`) and a relaunch with the same config honours the persisted value (FR-009, US4 S3)

### Implementation for User Story 4

- [X] T018 [P] [US4] Add `spellcheckEnabled` + `handleSpellcheckChange` to src/renderer/hooks/useSettingsState.ts (persist via `updateSettings` + `window.api.updateSettings`, mirroring the theme handlers)
- [X] T019 [US4] Add the "Spellcheck" group with a "Check spelling while typing" checkbox to src/renderer/chrome/SettingsDialog.tsx (immediate-apply, reusing the `.settings-radio` row styling; `settings.css` minor additions if needed) and wire it from src/renderer/App.tsx (also pass `spellcheckEnabled` to `EditorPanel`)
- [X] T020 [P] [US4] Extend tests/renderer/useSettingsState.test.tsx for the spellcheck handler: seeds the persisted value, updates local state + cache + IPC on change

**Checkpoint**: The settings checkbox flips spellcheck instantly and the choice persists across restarts.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full validation, spec archive, and status-table update

- [X] T021 [P] Run `npm run lint`, `npm run typecheck`, and `npm run test` — all must pass
- [X] T022 [P] Run `npm run test:e2e` (build + Playwright) — full suite must pass including the new spellcheck spec
- [X] T023 Archive the implemented spec: `git mv specs/020-editor-spellcheck specs/archive/020-editor-spellcheck`, set its **Status** to `Archived`, and update the Current implementation status table in AGENTS.md
- [X] T024 Open the phase PR against main with the changes, PR description ending with the AI usage line

---

## Phase 8: JS whole-document engine (2026-08-07, supersedes the native WYSIWYG engine)

**Purpose**: Replace the native WYSIWYG spellchecker with a JS engine (`nspell`
+ bundled en-GB/en-US dictionaries) so the whole document is checked on open and
re-checked as you type. Research R9.

- [X] T025 [P] Add `nspell` + `@types/nspell` dependencies; copy the en-gb/en-us `.aff`/`.dic` files from the `dictionaries` project into src/renderer/assets/dictionaries/ (MIT, bundled as `?raw` assets)
- [X] T026 [P] Create src/renderer/domain/spellcheck.ts — pure `findMisspellings(text, checker, customWords)` tokenizer/checker + `resolveLanguage` + `getChecker` (unit-tested)
- [X] T027 [P] Create the custom-dictionary store src/main/spellcheckDictionary.ts (a `spellcheckDictionary` array in the shared config) + src/main/ipc/handlers/spellcheck.ts (`spellcheck:getWords`/`spellcheck:addWord`) + preload methods + contract types
- [X] T028 Create src/renderer/editor/spellcheckRuntime.ts (shared enabled/language/custom-words state + change listeners) and src/renderer/editor/spellcheckPlugin.ts (whole-document decoration plugin + right-click correction menu)
- [X] T029 [P] Create src/renderer/editor/SpellingMenu.tsx (the DOM correction menu) + the `ame-spelling-error` and menu CSS in editor.css
- [X] T030 Wire the plugin into src/renderer/editor/CrepeHost.tsx (disable the native spellcheck attribute; register the plugin), thread `onSpellingMenu` through EditorPanel, and sync the runtime + render the menu from src/renderer/App.tsx
- [X] T031 [P] Write tests/renderer/spellcheck.test.ts (findMisspellings across both dictionaries, custom words, tokenization) and tests/main/spellcheckDictionary.test.ts (store load/add/dedupe/sibling-preservation)
- [X] T032 [P] Rewrite tests/e2e/spellcheck.spec.ts for the JS engine: whole-document on open, as-you-type, correction menu replace, no menu on correct words, add-to-dictionary + restart persistence, toggle clear/restore, en-GB↔en-US language switch
- [X] T033 [P] Update spec.md/plan.md/research.md/data-model.md/contracts for the JS engine (FR-007/FR-008, assumptions, R9)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — branch + test seam only
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion; run in priority order (P1 → P2 → P3)
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

- **User Story 1 (P1)**: `spellcheckEnabled` setting (Phase 2) + `applySpellcheckSetting`
- **User Story 2 (P1)**: `spellcheckMenuActions` (Phase 2) + the context-menu registration; independent of US1 (but shares the e2e spec file)
- **User Story 3 (P2)**: depends on US2's add-to-dictionary click path
- **User Story 4 (P3)**: depends on US1's enable/disable wiring + the shared e2e spec file

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Pure logic before editor wiring
- Story complete before moving to next priority

### Parallel Opportunities

- T001/T002 (Setup) in parallel
- T003/T004/T005/T006 (Foundational) — T005/T006 in parallel after T003/T004
- The shared e2e file tests/e2e/spellcheck.spec.ts grows across US1→US4, so story e2e tasks run sequentially; renderer unit tests (T018/T020) can run in parallel with their implementations
- US1→US2→US3→US4 sequential by priority (shared files, research R6)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (branch + userData seam)
2. Complete Phase 2: Foundational (setting + menu actions)
3. Complete Phase 3: User Story 1 — native highlight on
4. **STOP and VALIDATE**: run the US1 e2e scenario

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test independently (MVP)
3. Add US2 → Test independently (right-click correction)
4. Add US3 → Test independently (dictionary)
5. Add US4 → Test independently (toggle)
6. Polish → full lint/typecheck/unit/e2e gate, archive spec, PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The e2e spec depends on the real native spellchecker and an isolated
  `AME_USER_DATA_DIR` profile (research R6); it never touches the developer's
  real dictionary
