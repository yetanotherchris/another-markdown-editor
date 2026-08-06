# Tasks: Theme Setting

**Feature**: `013-theme-setting` | **Date**: 2026-08-06

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/renderer.md](./contracts/renderer.md)

**Implementation strategy**: The persisted `themeOverride: 'light' | 'dark' | null`
setting already exists (spec 010) and maps 1:1 to the spec's three modes (null =
System default) — no schema or storage work. Phase 2 adds the tiny main-process
`theme.ts` (`themeSourceForOverride` + `applyThemeOverride`) wired into startup and
`settings:update`. Phase 3 is the user-visible core (US1–US3): the Theme radio group
in the settings dialog, the renderer `useEffectiveTheme` matchMedia hook, the
`data-theme` attribute, and the dark palette token override. Phase 4 tokenizes
`Tree.css` so the sidebar is readable in dark mode, then the e2e suite
(`tests/e2e/theme.spec.ts`) proves the three choices, live OS following, restart
persistence, editor-unchanged (FR-010), and missing/malformed-config tolerance;
the settings.spec radio-count assertion is scoped to the Editor Font group. Phase 5
runs the final four-command gate. Everything is validated with `npm run lint`,
`npm run typecheck`, `npm run test`, `npm run test:e2e` throughout.

The theme field, dialog aria contract, and e2e contract are pinned in
`contracts/renderer.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the branch baseline before any change.

- [X] T001 Establish a green baseline on the `013-theme-setting` branch (created
      from clean `main` per AGENTS.md): run `npm run lint`, `npm run typecheck`,
      `npm run test`, and confirm the e2e suite passes (`npm run test:e2e`). Record
      the results in this file. Confirm the artifacts (`spec.md`, `plan.md`,
      `research.md`, `data-model.md`, `contracts/renderer.md`, `quickstart.md`) are
      present and consistent.

**Checkpoint**: baseline green; artifacts present.

---

## Phase 2: Foundational (Blocking Prerequisite)

**Goal: the main-process theme lever every user story depends on.**

- [X] T002 Add `src/main/theme.ts`: `themeSourceForOverride(override: 'light' |
      'dark' | null): 'system' | 'light' | 'dark'` (pure mapping, `null → 'system'`)
      and `applyThemeOverride(override)` which sets `nativeTheme.themeSource`
      (research R1 — the documented three-option mechanism; `prefers-color-scheme`
      propagates to the renderer).
- [X] T003 Wire `applyThemeOverride` into `src/main/index.ts` `app.whenReady()`
      (after `loadSettings()` resolves, before `createWindow()` — first paint is
      themed, FR-006) and into the `settings:update` handler in
      `src/main/ipc/handlers/settings.ts` (after the merge — applies immediately,
      FR-008).
- [X] T004 Add `tests/main/theme.test.ts`: `themeSourceForOverride` maps
      `'light' → 'light'`, `'dark' → 'dark'`, `null → 'system'`; the mapping is
      exhaustive over the union.

**Checkpoint**: `npm run typecheck` and `npm run test` pass; `nativeTheme.themeSource`
follows the persisted override at startup and on every update.

---

## Phase 3: US1–US3 — Theme choices + effective theme (P1)

**Goal**: a user can pick Light, Dark, or System default from the settings dialog;
the chrome switches immediately; System default follows the OS live (FR-001–FR-005,
FR-007–FR-009).

**Independent Test**: contracts/renderer.md §E2e items 1–4; quickstart.md §1–§4, §7.

### Implementation

- [X] T005 Add a **Theme** radio group (`Light` / `Dark` / `System default`) to
      `src/renderer/chrome/SettingsDialog.tsx` below Editor Font. The group uses
      `ThemeChoice = 'light' | 'dark' | 'system'` (defined in
      `useEffectiveTheme.ts`), converted to the persisted override
      (`'system' → null`). Selecting applies immediately via an `onThemeChange`
      prop. The focus trap already includes radios — no trap change.
- [X] T006 Add `src/renderer/hooks/useEffectiveTheme.ts` (research R1/R2): the
      pure `effectiveThemeMode(choice, prefersDark)` resolution plus a
      `useEffectiveTheme(choice)` hook that re-reads
      `window.matchMedia('(prefers-color-scheme: dark)')` on every `change`
      event (FR-005 live following) and when `choice` changes (FR-008). No
      Electron in the renderer (Principle I). NOTE (code round): the hook was
      re-decided to derive from the choice + the query — `nativeTheme.themeSource`
      does not propagate to the renderer media query in this Electron build, so
      the palette cannot depend on it (research R1, plan decision log).
- [X] T007 Wire `App.tsx` via the focused `useSettingsState` hook
      (`src/renderer/hooks/useSettingsState.ts`), which owns the settings-dialog
      state (open flag, editor font from spec 012, theme choice, effective mode)
      — seed + sync from `getSettings()`, apply-immediately handlers, and
      `data-theme={themeMode}` on `.app-container` next to `data-editor-font`.
      This extraction also keeps `App.tsx` under the spec-017 orchestration
      limit (292 lines).
- [X] T008 Add the dark palette to `src/renderer/App.css`: `.app-container[data-theme='dark']`
      redefines the `--ame-*` custom properties (research R4 — every chrome surface
      resolves them; the editor content area and source view use literal colors and
      are untouched, FR-010).
- [X] T008b Add `tests/renderer/useEffectiveTheme.test.ts`: the pure
      `effectiveThemeMode` resolution over all six choice × prefers-dark
      combinations.

**Checkpoint**: the dialog offers Theme with three options; selecting Light/Dark
retints the chrome immediately; System default follows the OS (verified in e2e).

---

## Phase 4: Polish — sidebar readability + e2e suite

**Goal**: the explorer tree and its context menu are readable on the dark sidebar,
and the whole feature is proven end-to-end (US1–US4, FR-005, FR-007, FR-009, FR-010).

**Independent Test**: contracts/renderer.md §E2e items 1–7; quickstart.md §5–§9.

### Implementation

- [X] T009 Tokenize `src/renderer/explorer/Tree.css`: replace the literal chrome
      colors (`#222`, `#666`, `#888`, `#fff`, `rgba(0,0,0,…)`) with `--ame-*`
      tokens so the tree rows, rename input, and context menu adapt to the palette
      (plan decision; the editor content area is not affected).
- [X] T010 Update `tests/e2e/settings.spec.ts` `US1`: scope the radio-count
      assertion to the Editor Font group (`getByRole('group', { name: 'Editor Font' })`
      → 2 radios) — the dialog now has two groups.
- [X] T011 Write `tests/e2e/theme.spec.ts` (contracts/renderer.md §E2e):
      1. Light: select it, `data-theme="light"`, header computes the light surface;
      2. Dark: select it, `data-theme="dark"`, `config.json` records
         `settings.themeOverride = "dark"`;
      3. System: simulate an OS switch with `page.emulateMedia({ colorScheme })`
         (dark then light) — `data-theme` follows live (FR-005/SC-004);
      4. Persistence: Dark + restart with the same `AME_CONFIG_DIR` opens dark
         (FR-006/SC-002);
      5. FR-010: the editor content area's computed background is identical in Light
         and Dark;
      6. FR-009: a missing config opens with System default selected; a change
         writes a valid config.
- [X] T012 [US4] Add the malformed-config tolerance case to `tests/e2e/theme.spec.ts`:
      a corrupt `config.json` still opens the dialog with System default and the
      corrupt file is not rewritten by merely opening the dialog.

**Checkpoint**: `npm run test` and the theme e2e suite pass, including live OS
following and restart persistence.

---

## Phase 5: Gate

**Purpose**: verify consistency and run the full gate.

- [X] T013 Final gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e` all green; verify plan/research/data-model/contracts are
      consistent with the final code; mark this task `[X]` only then.

**Checkpoint**: the four-command gate passes.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Foundational (theme.ts + wiring) | Phase 1 | Phase 3 |
| Phase 3: US1–US3 (dialog group + hook + palette) | Phase 2 | Phase 4 |
| Phase 4: Polish (Tree.css + e2e suite) | Phase 3 | Phase 5 |
| Phase 5: Gate | Phases 2–4 | — |

### Parallel Opportunities

- Phase 2: T004 (unit test) can be written alongside T002/T003.
- Phase 4: T010 (settings.spec fix) is independent of T009/T011/T012 but small —
  run it first so the suite stays green while theme.spec is added.

### High-level guarantee

No new IPC operations (Principle I); `themeOverride` remains a closed union
validated in main; the effective theme is resolved by `nativeTheme.themeSource` in
main and mirrored in the renderer via the standard `matchMedia` API (no Electron in
the renderer); the chrome is retinted through the `--ame-*` tokens while the editor
content area and source view are untouched (FR-010); the theme choice persists
through the existing debounced settings write (FR-006).

---

## Notes

- T002/T003/T004 touch only main; T005–T008 touch only renderer — no conflicts.
- T009 changes only stylesheet colors (structural tokenization), not behaviour.
- The persisted field is unchanged, so `tests/main/settings.test.ts` needs no new
  coverage beyond `tests/main/theme.test.ts`; the renderer resolution is pinned by
  `tests/renderer/useEffectiveTheme.test.ts`.
- **Code round (2026-08-06)**: the renderer mechanism was re-decided. The plan
  originally derived the palette from `nativeTheme.themeSource` propagation; an
  e2e diagnostic showed it does not propagate to the renderer media query in the
  Electron build this runs on. The renderer now derives from the persisted choice
  + `prefers-color-scheme`, main keeps `themeSource` for the native chrome, and
  the e2e simulates OS switches with `emulateMedia` (research R1/R2, plan decision
  log). The `useSettingsState` extraction (T007) also keeps `App.tsx` under the
  spec-017 orchestration limit.
- **Scope change (2026-08-06, user decision)**: FR-010 amended — the WYSIWYG
  editor content area now follows the theme (dark canvas `#26292e` via Crepe
  `--crepe-color-*` overrides; `.editor-area`, empty state, and source view
  tokenized onto `--ame-editor-bg`/`--ame-*`). The e2e FR-010 case asserts the
  editor flips to the dark surface and stays readable; light mode is unchanged.
  See plan decision log.
- MVP = end of Phase 3 (US1–US3 with the dialog, palette, and live following);
  Phase 4 adds the sidebar polish and the e2e suite; Phase 5 gates.
