# Tasks: Editor Theme

**Feature**: `016-editor-theme` | **Date**: 2026-08-07

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/renderer.md](./contracts/renderer.md)

**Implementation strategy**: The feature rides entirely on existing
infrastructure. Phase 2 adds the `editorTheme: EditorThemeName` field to
`Settings` with closed-union validation and migration (five names, default
`'rustic'`), flowing through the existing `getSettings`/`updateSettings` IPC — no
new channels (Principle I). Phase 3 is the user-visible core: the per-theme CSS
blocks (`src/renderer/editor/themes.css`), the shared `EDITOR_THEMES` constant,
the `data-editor-theme` attribute in `App.tsx`/`useSettingsState`, and the
settings dialog's staged Editor Theme group + Save button (FR-003/US1 S4). The
spec-012 Editor Font group is removed (user decision: the theme owns the
typeface); `editorFont` stays persisted but inert. Phase 4 tokenizes the tests:
the new e2e suite (`tests/e2e/editor-theme.spec.ts`) proves all five themes,
Save-gating, restart persistence, Monotone live OS following, and the
document-invariant (FR-014); the archived `settings.spec.ts` (Editor Font → Editor
Theme) and `theme.spec.ts` FR-010 (canvas no longer darkens in dark mode) are
updated. Phase 5 runs the final five-command gate (`npm run lint`, `npm run
typecheck`, `npm run test`, `npm run test:e2e`, `npm run check`).

The `editorTheme` field, dialog aria contract, and e2e contract are pinned in
`contracts/renderer.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the branch baseline before any change.

- [X] T001 Establish a green baseline on the `phase-016-editor-theme` branch
      (created from clean `main` per AGENTS.md): run `npm run lint`, `npm run
      typecheck`, `npm run test`, and confirm the e2e suite passes
      (`npm run test:e2e`). Record the results in this file. Confirm the artifacts
      (`spec.md`, `plan.md`, `research.md`, `data-model.md`,
      `contracts/renderer.md`, `quickstart.md`) are present and consistent.
      **Baseline (2026-08-07)**: lint 0, typecheck 0, 442 unit tests pass, 161 e2e
      tests pass.

**Checkpoint**: baseline green; artifacts present.

---

## Phase 2: Foundational (Blocking Prerequisite)

**Goal: the persisted, validated editor-theme setting every user story depends on.**

- [X] T002 Add `export type EditorThemeName = 'rustic' | 'rustic-serif' |
      'monotone' | 'monotone-serif' | 'scholarly'` and `editorTheme:
      EditorThemeName` to `Settings` in `src/shared/ipc-contract.ts`. Keep
      `editorFont` in the type (persisted, inert — user decision).
- [X] T003 Extend `src/main/settingsFile.ts`: `DEFAULTS.editorTheme = 'rustic'`;
      validate the field in `validateSettings` and `mergeSettingsPatch` as the
      closed five-name union (FR-006); add `editorTheme` to the migration `known`
      key list.
- [X] T004 Add `editorTheme: 'rustic'` to the `settings:get` fallback literal in
      `src/main/ipc/handlers/settings.ts` and to the renderer defaults in
      `src/renderer/state/settings.ts`.
- [X] T005 Update `tests/main/settings.test.ts`: `editorTheme` defaults to
      `'rustic'` when missing/invalid; each of the five names loads and merges;
      an unknown name is rejected (keeps current); legacy migration imports the
      default. Adjust existing literals that compare full `Settings` objects to
      include `editorTheme`.

**Checkpoint**: `npm run typecheck` and `npm run test` pass; the field persists
and validates end-to-end through `settings:get`/`settings:update`.

---

## Phase 3: User Stories (US1–US6)

**Goal: the five themes on the formatted canvas, chosen and saved from settings.**

- [X] T006 Create `src/renderer/editor/editorThemes.ts` with the shared
      `EDITOR_THEMES: { value: EditorThemeName; label: string }[]` constant
      listing the five themes in order: Rustic, Rustic Serif, Monotone, Monotone
      Serif, Scholarly (FR-001).
- [X] T007 Create `src/renderer/editor/themes.css` with one
      `.app-container[data-editor-theme='X'] .milkdown` block per theme
      redefining Crepe's `--crepe-color-*`/`--crepe-font-*` tokens (research
      R1/R2). Rustic = `#fffdfb` warm canvas + Inter sans + monospace code
      (FR-007, US3). Rustic Serif = same palette, Georgia serif body/headings
      (FR-008, US4). Scholarly = white canvas, `#00B0E9` headings, Arial/
      'Helvetica Neue' body, same monospace code (FR-012, US6). Monotone +
      Monotone Serif = two blocks each scoped under
      `[data-theme='light'|'dark']` (FR-009/FR-010/FR-011, US5): white/black in
      light, black/white in dark.
- [X] T008 In `src/renderer/App.css`: remove the spec-012 `[data-editor-font='serif']`
      rules and the spec-013 dark `.milkdown` canvas override (the theme owns the
      canvas — research R5). Keep the base `.milkdown` Inter default and the
      `--ame-*` chrome palette.
- [X] T009 Rewrite `src/renderer/hooks/useSettingsState.ts`: drop
      `editorFont`/`handleEditorFontChange`; expose `editorTheme` (seeded from the
      settings cache) and `handleEditorThemeChange(name)` persisting via
      `updateSettings({ editorTheme })` + `window.api.updateSettings(...)`.
- [X] T010 Update `src/renderer/App.tsx`: render `data-editor-theme={editorTheme}`
      on `.app-container`, remove `data-editor-font`, pass
      `editorTheme`/`onEditorThemeSave` to `SettingsDialog`. Keep `data-theme`.
- [X] T011 Rework `src/renderer/chrome/SettingsDialog.tsx`: remove the Editor Font
      fieldset, its `EDITOR_FONT_OPTIONS`, and the `EditorFont` type. Add the
      **Editor Theme** fieldset (five staged radios from `EDITOR_THEMES`,
      initialized from the committed `editorTheme` prop) and a footer **Save**
      button committing the staged value via `onEditorThemeSave` then closing.
      Close / X / Escape / backdrop discard the draft (US1 S4). Keep the app
      Theme group apply-immediately (spec 013). Extend the focus trap to the new
      group + buttons.
- [X] T012 Add `tests/renderer/editorThemes.test.ts` pinning `EDITOR_THEMES` to
      exactly the five names and their labels (FR-001).
- [X] T013 Add `tests/renderer/` coverage that `useSettingsState` exposes
      `editorTheme` and `handleEditorThemeChange` (follow the existing
      `useSettingsState`/`useEffectiveTheme` test patterns; keep it to the pure
      seams — the hook's IPC calls are stubbed via `window.api`).

**Checkpoint**: `npm run typecheck` + `npm run test` pass; selecting a theme and
pressing Save re-themes the canvas; closing without Save leaves it unchanged.

---

## Phase 4: E2e Suites

**Goal: prove every acceptance scenario against the built app.**

- [X] T014 Write `tests/e2e/editor-theme.spec.ts` per the contract in
      `contracts/renderer.md`: all five themes listed (US1); Scholarly selected +
      Save re-themes the canvas and persists to `config.json` (US1 S2/S3); close
      without Save leaves the canvas unchanged (US1 S4); restart persistence
      (US2); Rustic default canvas (US3); Rustic Serif typeface (US4); Monotone
      follows Light/Dark and flips live on `emulateMedia` in system mode, with
      the no-preference light fallback (US5/FR-010); Scholarly values (US6);
      FR-014 document invariant.
- [X] T015 Rewrite `tests/e2e/settings.spec.ts` to scope radio counts per group
      (Theme = 3, Editor Theme = 5), test the Editor Theme group's Save-gating and
      persistence, and keep the general dialog tests (keyboard access, config
      tolerance, dirty-doc non-interference).
- [X] T016 Update `tests/e2e/theme.spec.ts` FR-010: the default Rustic canvas stays
      `#fffdfb` in dark mode; the Monotone theme follows the app theme (research
      R5). Keep the chrome/app-theme assertions unchanged.
- [X] T016b Addendum (user request, spec addendum 2026-08-07): four CSS-only
      canvas polish fixes in `src/renderer/editor/editor.css` — tight list-item
      spacing (`li p { margin: 0 }`), blockquote indent halved (40px → 20px),
      numbered-list marker aligned to the 24px line box, and HTML comments hidden
      on the canvas (atom stays, round-trips to disk). Add the e2e coverage in
      `tests/e2e/editor-theme.spec.ts` and record the changes in the spec's
      Addendum section.

**Checkpoint**: `npm run test:e2e` passes in full; all five themes render their
specified values and the Save/close semantics hold.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: final gate and documentation.

- [X] T017 Run the full gate: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e`, `npm run check` (maintainability). Fix any violations.
      **Final gate (2026-08-07)**: lint 0, typecheck 0, 456 unit tests pass, 177
      e2e tests pass (two consecutive full runs), `npm run check` reports only a
      pre-existing `documents.ts` size advisory (present on main).
- [ ] T018 Archive the spec: `git mv specs/016-editor-theme specs/archive/016-editor-theme`,
      set its `**Status**` to `Archived`, and update the Current implementation
      status table in `AGENTS.md`. Create the phase PR against `main`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — baseline first.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories.
- **User Stories (Phase 3)**: depend on Phase 2. T006/T007 are independent of each
  other; T008–T011 depend on T006/T007 conceptually but touch different files and
  can proceed once the theme names exist.
- **E2e (Phase 4)**: depends on Phase 3 completion.
- **Polish (Phase 5)**: depends on all phases.

### Within Each Phase

- Tests are written/updated alongside their implementation (T005 with T002–T004,
  T012 with T006, T013 with T009–T011, T014–T016 with Phase 4).
- The Settings field (T002–T004) before the renderer consumes it (T009–T011).
- The theme CSS (T007) before the dialog/Renderer wiring (T009–T011) proves it.

### Parallel Opportunities

- T002–T004 (field plumbing) can run together.
- T006 (constants) and T007 (CSS) are independent files.
- T014–T016 (e2e) are three separate spec files.

---

## Notes

- The `editorFont` field is KEPT persisted but inert (user decision) — do not
  remove it from `Settings`, validation, or migration.
- Every theme change is a CSS attribute swap; document content, dirty state, and
  undo history must never be touched (FR-014).
- Monotone themes reuse the existing `data-theme` attribute — do not introduce a
  second light/dark resolution mechanism (research R3).
