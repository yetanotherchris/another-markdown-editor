# Tasks: Custom Editor Theme

**Feature**: `023-custom-editor-theme` | **Date**: 2026-08-08

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/editor-theme.md](./contracts/editor-theme.md), [quickstart.md](./quickstart.md)

**Implementation strategy**: contract + validation first, then the pure preset
table + detection (unit-tested), then the application + dialog wiring, then e2e.

---

## Phase 1: Foundational (Contract + Detection)

- [X] T001 Add the `EditorColors` type and `editorColors: EditorColors | null` to
      `Settings` in `src/shared/ipc-contract.ts` (contract schema; FR-001).
- [X] T002 Add `editorColors` validation in `src/main/settingsFile.ts`:
      `null` allowed; otherwise a closed six-key record of `#rrggbb` hex strings —
      any deviation rejects the whole value to `null` (FR-009/010), and update
      `tests/main/settings.test.ts` with the validation matrix.
- [X] T003 Create `src/renderer/editor/editorThemePresets.ts` with the five
      presets' six colours + font (monotone light/dark variants), `resolveEditorTheme`,
      and `fontStackFor` (sans/serif stacks matching `themes.css`) (FR-003/004/007).
- [X] T004 Add `tests/renderer/editorThemePresets.test.ts` covering the detection
      matrix: each preset matches itself, a one-value change → custom, rust
      colours + serif → Rustic Serif, scholarly colours + serif → custom, monotone
      honours `appMode`, and `editorColors = null` returns the stored preset.

**Checkpoint**: detection is pure, validated, and unit-tested.

---

## Phase 2: User Stories 1 + 4 - Application

- [X] T005 [US1] In `src/renderer/App.tsx`, compute the effective theme via
      `resolveEditorTheme` and set `data-editor-theme` to the preset name or
      `'custom'`; when custom, apply the six `--crepe-color-*` tokens and the
      `--crepe-font-{default,title}` stack inline on `.app-container` (R3;
      FR-001/008).

**Checkpoint**: a config with custom colours renders them on the canvas.

---

## Phase 3: User Stories 2 + 3 - Settings Dialog

- [X] T006 [US2] In `src/renderer/chrome/SettingsDialog.tsx`, render a checked,
      disabled **Custom** radio when the effective theme is custom (FR-003), and
      keep the five preset radios (display-only Custom, Assumptions).
- [X] T007 [US2] In `src/renderer/hooks/useSettingsState.ts` + `App.tsx`, plumb
      `editorColors`/`editorFont` and the effective theme; when a preset is saved
      (`handleEditorThemeChange`), persist `editorTheme`, clear `editorColors`,
      and set `editorFont` to the preset's font (FR-005/008).

**Checkpoint**: preset save clears overrides; the dialog reflects preset vs Custom.

---

## Phase 4: Verification

- [X] T008 [US3] Add `tests/e2e/editor-theme-custom.spec.ts` (isolated
      `MM_CONFIG_DIR`): a config with custom colours + font shows Custom in the
      dialog and applies the colours to the canvas; choosing a preset + Save
      clears `editorColors`, shows the preset, and persists across restart
      (US1-3 acceptance scenarios).
- [X] T009 [US3] Run `npx playwright test tests/e2e/editor-theme-custom.spec.ts`
      and confirm green.

## Phase 5: Polish

- [X] T010 Run the gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e` (existing editor-theme suite must still pass — no
      custom colours → presets unchanged, SC-005).
- [X] T011 Archive the feature (`git mv specs/023-custom-editor-theme
      specs/archive/023-custom-editor-theme`), set the spec's **Status** to
      `Archived`, mark all tasks `[X]`, and update the
      `023-custom-editor-theme` row in `AGENTS.md` to `Archived` / `Complete`.

---

## Dependencies & Execution Order

- T001 → T002 → T003 → T004 (contract → validation → presets → tests).
- T005 after T003; T006/T007 after T005; T008/T009 after T005-T007.
- T010 after all; T011 last.

## Implementation Strategy

1. Contract + validation + pure detection (unit-tested).
2. Canvas application.
3. Dialog + preset-save override.
4. e2e; gates; archive.
