# Implementation Plan: Editor Theme

**Branch**: `phase-016-editor-theme` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-editor-theme/spec.md`

## Summary

Add an **editor theme** setting — the visual style of the formatted WYSIWYG
canvas — with five named themes: **Rustic**, **Rustic Serif**, **Monotone**,
**Monotone Serif**, and **Scholarly** (FR-001). The theme is chosen in the
settings dialog and committed with the dialog's **Save** button (FR-003, US1 S2/S4:
closing without Save leaves the canvas unchanged). The choice is stored in the
same per-user `config.json` settings section used by specs 004/010/012/013
(FR-004, FR-005); the theme's visual values live in application CSS, never in the
config file (FR-005).

**The defining decisions** (user decisions 2026-08-07, recorded below):

1. **The editor theme owns the canvas.** The formatted canvas's palette and
   typeface come entirely from the selected editor theme — NOT from the app
   light/dark mode (spec 013). Rustic's warm off-white `#fdf6e3` canvas stays warm
   even when the app chrome is dark; only the **Monotone** themes follow the
   resolved app light/dark, live in system mode (FR-009/FR-010). This supersedes
   the spec-013 behavior where dark mode darkened the canvas; the archived
   `theme.spec.ts` FR-010 assertion is updated accordingly.
2. **The editor theme owns the typeface.** Rustic = sans-serif body + headings,
   Rustic Serif / Monotone Serif = serif, Scholarly = a distinct Helvetica-like
   sans. The now-redundant **Editor Font** radio group (spec 012) is **removed**
   from the dialog; serif/sans is expressed through theme choice (Rustic vs Rustic
   Serif / Monotone vs Monotone Serif). The persisted `editorFont` field stays in
   the Settings type for clean config migration but is no longer applied to the
   canvas. The archived `settings.spec.ts` (spec 012) e2e suite is updated to test
   the new Editor Theme group.

Monotone themes depend on the **resolved app theme** (spec 013's
`data-theme` attribute on `.app-container`, derived from `themeOverride` + the
renderer's `prefers-color-scheme` query). Because `data-theme` already updates
live in system mode via `useEffectiveTheme`'s matchMedia listener, Monotone's
light/dark variants (scoped under `[data-theme='light'|'dark']`) follow the OS
live with no new mechanism (FR-010). The fallback to light when the OS reports no
preference is also free: `effectiveThemeMode` returns `light` when the query is
false (FR-010 scenario 4).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: No new runtime dependencies. The themes are CSS custom
property overrides on Crepe's token-driven `--crepe-color-*`/`--crepe-font-*`
surface (verified in `node_modules/@milkdown/crepe/lib/theme/crepe/style.css`,
R1). Fonts are existing freely-distributable system stacks: Inter (already bundled
via `@fontsource/inter`), Georgia (serif themes), Arial/'Helvetica Neue'
(Scholarly's Helvetica-like sans, R2).

**Storage**: `config.json` under `.settings`, unchanged mechanism. One new field:
`editorTheme: EditorThemeName` (closed union of the five names), validated
field-by-field in `validateSettings`/`mergeSettingsPatch`, defaulting to
`'rustic'`. Added to the migration's `known` key list so legacy files import it.

**Testing**: Vitest 4 (node for `tests/main`, jsdom for `tests/renderer`);
Playwright e2e via `npm run test:e2e`. New unit assertions in
`tests/main/settings.test.ts` (closed-union validation, default, migration) and a
new `tests/renderer/editorThemes.test.ts` pinning the five-name closed union and
labels. New e2e suite `tests/e2e/editor-theme.spec.ts` covering all five themes,
Save-gating, persistence, Monotone live OS following, and the document-invariant
(FR-014). Updated `tests/e2e/settings.spec.ts` (Editor Theme group replaces the
font group) and `tests/e2e/theme.spec.ts` (FR-010: dark mode no longer darkens the
Rustic canvas; Monotone follows).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: Nothing on the keystroke path. A theme change is a CSS
custom-property swap driven by a `data-editor-theme` attribute; the existing
`data-theme` mechanism already handles live OS following. No polling.

**Constraints**: Renderer sandboxed (no Node, no `fs`, no Electron). No new IPC
operations (Principle I) — the existing `getSettings`/`updateSettings` carry the
new `editorTheme` field. The field is a closed union validated in main (five
names), so no arbitrary text crosses the IPC. The editor theme applies to the
formatted WYSIWYG canvas only (`.milkdown`); the source view keeps its existing
app-theme styling (FR-013). Changing the theme never touches document content,
dirty state, or undo history (FR-014).

**Scale/Scope**: One new dialog control (five radios + a Save button), a
`data-editor-theme` attribute + per-theme CSS blocks, one new validated Settings
field, and the removal of the spec-012 Editor Font group (user decision). The
Monotone live-following rides on the existing `data-theme` mechanism. Out of
scope: per-document themes, custom theme editing, font-size/line-height controls
(spec Assumptions), and any change to the app light/dark theme mechanism itself
(spec 013, unchanged).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | No new IPC; the existing named `getSettings`/`updateSettings` carry the new `editorTheme` field. All theme values are CSS in the renderer; main only validates the closed union. No generic `invoke`, no `fs` in the renderer | **PASS** |
| II. Every Path Is Untrusted | No filesystem paths cross the IPC for this feature. `editorTheme` is validated in main as a closed five-name union — no arbitrary text, no injection | **PASS** |
| III. Never Lose The User's Words | The theme swap never touches documents, dirty state, or undo history (e2e-verified, FR-014). The persisted value survives because it is the existing validated settings store | **PASS** |
| IV. Calm, Predictable Editing | A theme change is a CSS variable swap on the canvas; nothing on the keystroke path; the canvas stays readable in every theme (FR-005/SC-005) | **PASS** |
| V. Test What Can Corrupt Or Escape | Unit tests pin the closed union + defaults + migration; e2e covers all five themes, Save-gating, restart persistence, Monotone live following, and the document-invariant | **PASS** |

## Phase 1 Design decisions

**Settings field (`src/shared/ipc-contract.ts`, `src/main/settingsFile.ts`)** —
one new field on `Settings`:

```ts
export type EditorThemeName =
  | 'rustic' | 'rustic-serif' | 'monotone' | 'monotone-serif' | 'scholarly'

export interface Settings {
  sidebarWidth: number
  themeOverride: 'light' | 'dark' | null
  explorerVisible: boolean
  editorFont: 'sans-serif' | 'serif'   // KEPT for config migration, no longer applied
  editorTheme: EditorThemeName         // NEW
}
```

- `DEFAULTS.editorTheme = 'rustic'` (FR-002).
- `validateSettings`/`mergeSettingsPatch`: accept exactly the five names, else the
  default/current value (FR-006 closed-union tolerance).
- `migrateLegacySettingsFile`: `editorTheme` joins the `known` key list.
- The `settings:get` fallback literal in `src/main/ipc/handlers/settings.ts`
  gains `editorTheme: 'rustic'`.

**Editor theme list (`src/renderer/editor/editorThemes.ts`, NEW)** — the source
of truth for the dialog options, a pure constant so the dialog and unit test share
one definition:

```ts
export const EDITOR_THEMES: { value: EditorThemeName; label: string }[] = [
  { value: 'rustic', label: 'Rustic' },
  { value: 'rustic-serif', label: 'Rustic Serif' },
  { value: 'monotone', label: 'Monotone' },
  { value: 'monotone-serif', label: 'Monotone Serif' },
  { value: 'scholarly', label: 'Scholarly' }
]
```

**Renderer wiring (`src/renderer/App.tsx`, `useSettingsState.ts`)** — mirror the
`themeChoice` pattern:

- `useSettingsState` drops `editorFont`/`handleEditorFontChange` and exposes
  `editorTheme` (seeded from the settings cache) + `handleEditorThemeChange(name)`
  which persists via `updateSettings({ editorTheme })` + `window.api.updateSettings(...)`.
- `App.tsx` renders `data-editor-theme={editorTheme}` on `.app-container`
  alongside `data-theme`; `data-editor-font` is removed.

**Theme CSS (`src/renderer/editor/themes.css`, NEW)** — every theme is a block
scoping Crepe's tokens under `.app-container[data-editor-theme='X'] .milkdown`.
The base `.milkdown` rules in `App.css` keep the Inter default; each theme block
overrides with its own values (specificity wins). The Monotone themes get two
blocks each, scoped additionally by `[data-theme='light']`/`[data-theme='dark']`:

| Theme | Background | Body text | Headings | Body/heading typeface | Inline code |
|-------|-----------|-----------|----------|----------------------|-------------|
| Rustic | `#fdf6e3` | `#1f1b16` (current) | same as body | Inter (sans) | monospace (unchanged) |
| Rustic Serif | `#fdf6e3` | `#1f1b16` | same | Georgia/'Times New Roman'/serif | monospace |
| Monotone (light) | `#ffffff` | `#000000` | `#000000` | Inter (sans) | monospace |
| Monotone (dark) | `#000000` | `#ffffff` | `#ffffff` | Inter (sans) | monospace |
| Monotone Serif (light/dark) | as Monotone | | | Georgia stack | monospace |
| Scholarly | `#ffffff` | dark text | `#00B0E9` | Arial/'Helvetica Neue'/sans (Helvetica-like) | monospace |

Rustic derives from the current canvas (R2: Crepe classic warm base + the Inter
`--crepe-font-*` override in `App.css`), with the canvas background warmed from
`#fffdfb` to the cream `#fdf6e3` (user decision 2026-08-07) — it is the safe
default (US3). The dark-mode canvas overrides and the
`[data-theme='dark'] .milkdown` block in `App.css` are **removed** (theme owns the
canvas; only Monotone follows the app theme). The `.source-view` keeps resolving
`--ame-editor-bg`/`--ame-text` (FR-013).

**Settings dialog (`src/renderer/chrome/SettingsDialog.tsx`)** — the Editor Font
fieldset, its `EDITOR_FONT_OPTIONS`, and the `EditorFont` type are removed. Two
changes:

- **Editor Theme** fieldset (below the app **Theme** group): five radios from
  `EDITOR_THEMES`. The selection is **staged** in local dialog state
  (`draftEditorTheme`), initialized from the committed `editorTheme` prop — it is
  NOT applied on click (FR-003 / US1 S4: the canvas only changes on Save).
- **Footer Save button**: committing the staged theme via
  `onEditorThemeSave(draftEditorTheme)`, then closing. Close / X / Escape /
  backdrop discard the draft and close without changing the canvas. The app Theme
  group (spec 013) keeps its apply-immediately behavior unchanged (its archived
  e2e tests assert it). The focus trap now covers three radio groups plus the
  Save/Close buttons.

**Source view / empty state** — untouched. The source view retains its existing
app-theme styling (FR-013). The `.editor-area` behind the canvas keeps resolving
`--ame-editor-bg`; the canvas itself is themed by the editor theme.

## Project Structure

### Documentation (this feature)

```text
specs/016-editor-theme/
├── spec.md              # Requirements (FR-001…FR-014, US1–US6, edge cases)
├── plan.md              # This file
├── research.md          # R1…R3 evidence (Crepe tokens, font stacks, data-theme reuse)
├── data-model.md        # Editor theme setting + resolved canvas rules
├── quickstart.md        # Manual per-OS verification script
├── contracts/
│   └── renderer.md      # Editor Theme dialog aria contract + e2e contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/
└── ipc-contract.ts              # MODIFY: EditorThemeName type + Settings.editorTheme

src/main/
├── settingsFile.ts              # MODIFY: DEFAULTS + validateSettings + mergeSettingsPatch + known
└── ipc/handlers/settings.ts     # MODIFY: settings:get fallback literal gains editorTheme

src/preload/index.ts             # UNCHANGED (getSettings/updateSettings already expose Settings)

src/renderer/
├── App.tsx                      # MODIFY: data-editor-theme attr; drop data-editor-font; dialog props
├── App.css                      # MODIFY: remove data-editor-font rules + dark canvas block
├── state/settings.ts            # MODIFY: defaults gain editorTheme
├── hooks/useSettingsState.ts    # MODIFY: editorTheme replaces editorFont
├── editor/editorThemes.ts       # NEW: EDITOR_THEMES constant (names + labels)
├── editor/themes.css            # NEW: the five per-theme Crepe token blocks
└── chrome/SettingsDialog.tsx    # MODIFY: Editor Theme group (staged) + Save button; drop Font group
```

```text
tests/
├── main/settings.test.ts        # MODIFY: editorTheme closed-union/default/migration
├── renderer/editorThemes.test.ts# NEW: five-name closed union + labels
└── e2e/
    ├── settings.spec.ts         # MODIFY: Editor Theme group replaces the font group
    ├── theme.spec.ts            # MODIFY: FR-010 — canvas no longer darkens; Monotone follows
    └── editor-theme.spec.ts     # NEW: all five themes, Save-gating, persistence, live follow, FR-014
```

**Structure decision**: theme *values* are renderer CSS (spec FR-005: values live
in code); theme *choice* is a validated main-process setting (closed union,
stored in the shared config); theme *application* is a renderer attribute + CSS
swap. The preload surface is untouched because `editorTheme` flows through the
existing `getSettings`/`updateSettings` — no new IPC (Principle I).

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Adding a fifth field to `Settings` after spec 012 deliberately stopped at four | The editor theme is a first-class persisted setting with its own name; reusing an existing field would mislabel it | Mapping the five themes onto `editorFont`'s serif/sans union (loses three themes) |
| Keeping the now-inert persisted `editorFont` field | User decision: removing it would orphan existing configs and require a schema-breaking migration with no user value; it is validated/ignored but never applied | Deleting the field (breaks migration of existing `config.json` files) |
| Removing the spec-012 Editor Font group (behavior change to an archived spec) | User decision 2026-08-07: the editor theme owns the typeface; serif/sans is expressed through theme choice. Keeping both created contradictory canvas states | Keeping the group (two controls fight over the same `--crepe-font-*` variables) |
| Editor theme owns the canvas palette, superseding spec-013 dark-canvas behavior | User decision 2026-08-07: themes are the canvas's source of truth; only Monotone follows the app light/dark. This is the spec's FR-009/FR-010 intent | Keeping dark mode darken every canvas (Rustic could never be `#fdf6e3` in dark chrome, contradicting FR-007) |

## Decision log

### 2026-08-07

- **Theme owns the canvas** (user decision): the formatted canvas's palette comes
  from the editor theme, not the app light/dark mode. The spec-013 dark-canvas
  `.milkdown` override is removed; `theme.spec.ts` FR-010 is updated to assert
  Rustic stays warm-white in dark chrome and Monotone follows.
- **Theme owns the typeface** (user decision): the spec-012 Editor Font group is
  removed from the dialog; `editorFont` persists but is inert (migration only).
  Serif/sans is chosen via Rustic vs Rustic Serif / Monotone vs Monotone Serif.
  `settings.spec.ts` is rewritten around the Editor Theme group.
- **Save-gated editor theme**: the theme selection is staged in the dialog and
  committed by the dialog's new Save button (FR-003, US1 S4). The app Theme group
  (spec 013) keeps its immediate-apply behavior and e2e tests.
- **Monotone reuses `data-theme`**: Monotone/Monotone Serif render against the
  existing `data-theme` attribute (resolved from `themeOverride` + the renderer's
  `prefers-color-scheme` query), so live OS following and the no-preference light
  fallback are inherited, not re-implemented.
- **Font stacks**: serif themes reuse the spec-012 Georgia stack
  (`Georgia, 'Times New Roman', 'Noto Serif', serif`); Scholarly's Helvetica-like
  sans is `Arial, 'Helvetica Neue', Helvetica, sans-serif` (freely distributable,
  distinct from Inter, research R2).
- **Canvas-only scope**: the source view and empty state are untouched (FR-013);
  the `.editor-area` chrome behind the canvas keeps the app-theme token.

### 2026-08-07 (implementation round)

- **Canvas polish folded in (user request, spec addendum)**: four small,
  CSS-only visual corrections to the formatted canvas were requested during
  implementation and included: tight list-item spacing (`li p { margin: 0 }`),
  blockquote indent halved (40px → 20px), numbered-list marker aligned to the
  24px text line box, and HTML comments hidden on the canvas (atom stays in the
  document, round-trips to disk). All in `src/renderer/editor/editor.css`,
  documented in the spec's Addendum, covered by an e2e test.
- **Rustic canvas warmed to `#fdf6e3` (user decision 2026-08-07)**: the Rustic
  and Rustic Serif canvas background is the warm cream `#fdf6e3` (RGB
  253,246,227), warmed from Crepe's near-white `#fffdfb`. Recorded in the spec
  Clarifications; all e2e assertions and artifact docs updated.
- **Pre-existing flaky test hardened (archived spec 002)**: the US5 task-backspace
  e2e test could fail intermittently — after pressing Enter, it clicked the
  "Task list" toolbar control before the new empty block was ingested, so the
  toggle landed on the previous paragraph and no list item appeared. Confirmed
  pre-existing on a clean `main` build (reproduced on baseline). Fixed by waiting
  for the new paragraph (`toHaveCount(blockCount + 1)`) and explicitly clicking
  the new block to seat the caret before the toggle. No product behavior changed.
- **Pre-existing flake observed, not fixed (archived spec 004)**: the
  recent.deleted US3 test intermittently fails under full-suite load (machine
  contention; reproduced on a clean `main` build too). Passes reliably in
  isolation and in repeated full runs. Left untouched — out of scope for this
  feature.

## Phase status

- Phase 1: Setup — green baseline established on `phase-016-editor-theme`; artifacts present.
- Phase 2: Foundational — `editorTheme` field, validation, migration, defaults.
- Phase 3: US1–US6 — theme CSS, dialog group + Save, renderer wiring.
- Phase 4: Polish — unit + e2e suites; archived-spec test updates.
- Phase 5: Gate — `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`, `npm run check`.

## Deferred / later features

- Per-document themes, custom theme editing, time-based auto switching (spec
  Assumptions: out of scope).
- Font size / line height / other typography controls (spec Assumptions: only the
  theme-provided values change).
- Animated theme transitions (the spec's transition edge is trivially satisfied —
  there is no transition).
