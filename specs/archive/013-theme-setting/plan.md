# Implementation Plan: Theme Setting

**Branch**: `013-theme-setting` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-theme-setting/spec.md`

## Summary

Add a **theme setting** to the application with three options — **Light**, **Dark**,
and **System default** (FR-001) — selectable from the existing settings dialog
(FR-007), applied immediately to the main-window UI chrome **and the WYSIWYG editor
content area** (FR-002/003/004/008/009/010), following the OS theme live when
System default is chosen (FR-005), persisted across restarts (FR-006).

**The defining decision**: the persisted **`themeOverride: 'light' | 'dark' | null`
field already exists** in `Settings` (spec 010) with exactly the three-mode semantics
this spec asks for — `null` already means "follow the OS". It is stored, validated,
merged, and migrated, but today the chrome *ignores* it (spec 010 plan, spec 012 plan).
This feature **applies** it. Reusing the field avoids a new setting, a schema
migration, and a change to the `known` migration key list; the UI simply labels it
"Theme".

The effective appearance is resolved from the **persisted choice** plus the
renderer's `prefers-color-scheme` media query. Main resolves the override onto
Electron's `nativeTheme.themeSource` (`'system' | 'light' | 'dark'`) for the
**native** chrome it does affect (OS-drawn window frames, scrollbars, native
menus). The renderer mirrors `prefers-color-scheme` onto a `data-theme`
attribute and lets CSS switch the chrome palette. Live OS following (FR-005) is
free: for the System choice the renderer listens for `matchMedia` change events,
which Chromium fires when the OS theme changes. (An empirical check during the
e2e round showed `nativeTheme.themeSource` does **not** propagate
`prefers-color-scheme` into the renderer in this Electron build — research R1 —
so the palette is derived from the choice + the query, not from `themeSource`.)

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: No new runtime dependencies. `nativeTheme` is part of
Electron (already present). The palette stays a set of CSS custom properties; no
theme library is added (constitution: prefer platform primitives over new deps).

**Storage**: unchanged from spec 012 — `themeOverride` already lives in
`config.json` under `.settings` (`appData/ame`), is already validated field-by-field
(`validateSettings`, `mergeSettingsPatch`), and already persists via the debounced
`saveSettings` + quit flush. No storage work is required; the setting is already a
first-class citizen of `Settings`.

**Testing**: Vitest 4 (node for `tests/main`, jsdom for `tests/renderer`); Playwright
e2e via `npm run test:e2e`. New unit tests `tests/main/theme.test.ts`
(`themeSourceForOverride`) and `tests/renderer/useEffectiveTheme.test.ts`
(`effectiveThemeMode`). New e2e suite `tests/e2e/theme.spec.ts`. `tests/e2e/settings.spec.ts`'s
radio-count assertion is scoped to the Editor Font group (the dialog now has two groups).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: Nothing on the keystroke path. A theme change is one CSS
custom-property swap; the `matchMedia` listener is passive. No polling.

**Constraints**: Renderer sandboxed (no Node, no `fs`, no Electron). No new IPC
operations (Principle I) — the existing `getSettings`/`updateSettings` already carry
`themeOverride`. The renderer never touches `nativeTheme`; it only reads the
standard `matchMedia` query. `themeOverride` remains a closed union validated in
main (light/dark/null), so no arbitrary text crosses the IPC. The WYSIWYG editor
content area and the source view follow the theme (FR-010) through Crepe's
`--crepe-color-*` tokens and the `--ame-editor-bg`/`--ame-*` tokens — no editor
logic changes, only the stylesheet surface.

**Scale/Scope**: One new dialog setting (three radio options), the 
`nativeTheme.themeSource` wiring in main, a `data-theme` attribute + palette swap
in the renderer chrome, a tokenization of the explorer tree stylesheet so the
sidebar stays readable in dark mode, the dark editing surface (Crepe
`--crepe-color-*` overrides + source view/empty state tokenization, FR-010), and
the e2e suite. Out of scope: custom or per-workspace themes, time-based auto
switching (spec Assumptions), and any change to the recent-items/config storage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | No new IPC; the existing named `getSettings`/`updateSettings` already carry `themeOverride`. `nativeTheme` lives in main; the renderer reads only the standard `matchMedia` API. No generic `invoke`, no `fs` in the renderer | **PASS** |
| II. Every Path Is Untrusted | No filesystem paths cross the IPC for this feature. `themeOverride` is validated in main as a closed `'light' \| 'dark' \| null` union — no arbitrary text, no injection | **PASS** |
| III. Never Lose The User's Words | The theme swap never touches documents or dirty state (e2e-verified). The persisted value survives because it is the existing validated setting | **PASS** |
| IV. Calm, Predictable Editing | A theme change is one CSS variable swap applied to the chrome and the editing surface; no work on the keystroke path; the editor stays fully readable in both modes (FR-010) | **PASS** |
| V. Test What Can Corrupt Or Escape | Unit test pins the `themeOverride → themeSource` mapping; e2e covers the three choices, live OS following, restart persistence, the editor following the theme (FR-010), and missing/malformed-config tolerance | **PASS** |

## Phase 1 Design decisions

**Native theme in main (`src/main/theme.ts`, NEW)** — a tiny module that owns the
Electron `nativeTheme` interaction:

- `themeSourceForOverride(override: 'light' | 'dark' | null): 'system' | 'light' | 'dark'`
  — pure mapping: `null → 'system'`, `'light' → 'light'`, `'dark' → 'dark'`. Unit-tested.
- `applyThemeOverride(override)` — `nativeTheme.themeSource = themeSourceForOverride(override)`.

Called at **two** points:
1. `app.whenReady()` in `src/main/index.ts`, after `loadSettings()` resolves the
   persisted override and **before** the window is created.
2. `settings:update` in `src/main/ipc/handlers/settings.ts`, after the merged
   settings are computed, so a change applies immediately (FR-008) without waiting
   for the 500 ms debounced disk write.

This makes the native chrome follow the choice (macOS window frames, native
scrollbars/context menus). It is **not** the renderer's source of truth: research
R1 found `themeSource` does not propagate `prefers-color-scheme` into the renderer
in this Electron build, so the palette is derived separately (next decision).

**Effective theme in the renderer (`src/renderer/hooks/useEffectiveTheme.ts`, NEW)**
— a hook that resolves the palette mode from the user's choice and the
`prefers-color-scheme` media query:

```ts
export type ThemeChoice = 'light' | 'dark' | 'system'

export function effectiveThemeMode(choice: ThemeChoice, prefersDark: boolean): ThemeMode {
  if (choice === 'light') return 'light'
  if (choice === 'dark') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

export function useEffectiveTheme(choice: ThemeChoice): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(() =>
    effectiveThemeMode(choice, window.matchMedia('(prefers-color-scheme: dark)').matches))
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const recompute = () => setMode(effectiveThemeMode(choice, media.matches))
    recompute()
    media.addEventListener('change', recompute)
    return () => media.removeEventListener('change', recompute)
  }, [choice])
  return mode
}
```

- Light/Dark are forced by the choice; System follows the query (which reflects
  the real OS theme — research R2). `choice` changes recompute immediately; the
  `change` listener re-renders on OS switches (FR-005).
- The e2e suite simulates an OS switch with Playwright's `emulateMedia`, which
  re-fires the query deterministically (research R2).
- No Electron module in the renderer (Principle I).

**Chrome palette (`src/renderer/App.css`, `src/renderer/explorer/Tree.css`)** — the
chrome is styled entirely through the `--ame-*` custom properties (spec 010, verified
R4: `App.css`, `chrome.css`, `settings.css`, `tabs.css`, `status.css`). The app
container already carries `data-editor-font`; it gains `data-theme={themeMode}`:

```css
.app-container[data-theme='dark'] {
  --ame-bg: #1b1d21;
  --ame-surface: #232529;
  --ame-surface-secondary: #1e2023;
  --ame-active-tab: #2f3237;
  --ame-text: #e6e6e6;
  --ame-text-secondary: #cfcfcf;
  --ame-muted: #9a9a9a;
  --ame-muted-secondary: #8b8b8b;
  --ame-border: #3a3d42;
  --ame-border-secondary: #33363b;
  --ame-accent: #e08a4a;
  --ame-control: #4b4e54;
  --ame-editor-bg: #26292e;
}
```

Because every chrome surface resolves these variables from `.app-container`, the
header, tab strip, hamburger dropdowns, sidebar, status footer, and settings dialog
all switch together. `Tree.css` is the one chrome stylesheet still using literal
colors (`#222`, `#666`, `rgba(0,0,0,…)`, `#fff`); its rows/context menu would become
unreadable on the dark sidebar, so those colors move onto the existing tokens
(plan decision — recorded in the complexity table).

**Editing surface (`src/renderer/App.css`, `src/renderer/editor/editor.css`, FR-010)** —
Crepe's entire theme is driven by the `--crepe-color-*` tokens on `.milkdown`
(canvas, text, toolbar, headings, code, blockquotes — verified in the installed
theme css), so the dark editing surface is a single override:

```css
.app-container[data-theme='dark'] .milkdown {
  --crepe-color-background: #26292e;      /* canvas — a step lighter than the window */
  --crepe-color-on-background: #d8dce2;   /* body text */
  --crepe-color-surface: #2b2f35;         /* toolbar / surface */
  --crepe-color-on-surface: #e2e6ec;
  --crepe-color-on-surface-variant: #b6bcc4;
  --crepe-color-outline: #7c838c;
  --crepe-color-primary: #e08840;         /* matches the dark --ame-accent */
  --crepe-color-secondary: #3d4148;
  --crepe-color-on-secondary: #f0f2f5;
  --crepe-color-inverse: #e2e6ec;
  --crepe-color-on-inverse: #20232a;
  --crepe-color-inline-code: #f2a65e;
  --crepe-color-error: #ffb4ab;
  --crepe-color-hover: #30343a;
  --crepe-color-selected: #3c4149;
  --crepe-color-inline-area: #2f343b;
}
```

A neutral grey scale aligned with the `--ame-*` chrome tokens; the canvas is
slightly lighter than the window (`--ame-bg`) so the document reads as a "page" on
a dark desk, but still dark (user decision 2026-08-06 — FR-010 amended). The
`.editor-area` behind the canvas and the source view (`.source-view`,
`.source-toolbar`, `.source-textarea`) and the empty state are tokenized onto
`--ame-editor-bg`/`--ame-*` so they follow the same palette in both modes.

**Settings dialog (`src/renderer/chrome/SettingsDialog.tsx`)** — a second fieldset,
**Theme**, with three radios — **Light**, **Dark**, **System default** — below
Editor Font. Values map to the persisted override: `light → 'light'`,
`dark → 'dark'`, `system → null`. Selecting applies immediately and persists through
`updateSettings({ themeOverride })` + `window.api.updateSettings({ themeOverride })`.
The dialog keeps its focus trap (the radios are already in the `focusables` query)
and never touches the document session.

**App wiring (`src/renderer/App.tsx`)** — theme state mirrors the editorFont
pattern: `const [themeChoice, setThemeChoice] = useState<ThemeChoice>(...)` seeded
from `getSettings().themeOverride`, synced after `loadSettingsFromMain()` resolves,
updated by the dialog, and rendered as `data-theme` alongside `data-editor-font`.

## Project Structure

### Documentation (this feature)

```text
specs/013-theme-setting/
├── spec.md              # Requirements (FR-001…FR-010, US1–US4, edge cases)
├── plan.md              # This file
├── research.md          # R1…R4 evidence (themeSource, prefers-color-scheme, field reuse, token boundary)
├── data-model.md        # Theme setting semantics + effective mode + renderer state
├── quickstart.md        # Manual per-OS verification script
├── contracts/
│   └── renderer.md      # Theme dialog aria contract + e2e contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/
└── ipc-contract.ts              # UNCHANGED — Settings.themeOverride already exists

src/main/
├── theme.ts                     # NEW: themeSourceForOverride (pure) + applyThemeOverride
├── index.ts                     # MODIFY: applyThemeOverride(loadSettings().themeOverride) before window creation
└── ipc/handlers/settings.ts     # MODIFY: applyThemeOverride(updated.themeOverride) after merge

src/preload/index.ts             # UNCHANGED (getSettings/updateSettings already exposed)

src/renderer/
├── main.tsx                     # MODIFY: preload settings before first render (no theme flash)
├── App.tsx                      # MODIFY: useSettingsState() + data-theme attr + dialog props
├── App.css                      # MODIFY: [data-theme='dark'] palette + Crepe --crepe-color-* overrides
├── hooks/useEffectiveTheme.ts   # NEW: effectiveThemeMode (pure) + matchMedia-based hook (live)
├── hooks/useSettingsState.ts    # NEW: settings-dialog state (open, font, theme, mode) — keeps App ≤300
├── chrome/SettingsDialog.tsx    # MODIFY: Theme radio group (Light/Dark/System default)
├── explorer/Tree.css            # MODIFY: tokenize literal colors → --ame-* (dark-readable)
└── editor/editor.css            # MODIFY: editor-area/source-view/empty-state → theme tokens (FR-010)
```

```text
tests/
├── main/theme.test.ts           # NEW: themeSourceForOverride mapping
├── renderer/useEffectiveTheme.test.ts # NEW: effectiveThemeMode pure resolution
└── e2e/
    ├── settings.spec.ts         # MODIFY: scope the radio count to the Editor Font group
    └── theme.spec.ts            # NEW: three choices, live OS following, persistence,
                                 #   editor-unchanged, missing/malformed config tolerance
```
**Structure decision**: theme *resolution for the native chrome* is a main-process
concern (via `nativeTheme`); theme *resolution for the palette* is a renderer
concern (choice + `prefers-color-scheme` query); theme *application* is a renderer
CSS concern (via `data-theme` and custom properties). The preload surface is
untouched because `themeOverride` already flows through `getSettings`/`updateSettings`
— this feature adds no new IPC, keeping Principle I's audit surface flat.

## Phase status

- Phase 1: Setup — green baseline on `013-theme-setting` (created from clean `main`
  per AGENTS.md)
- Phase 2: Foundational — `theme.ts` (pure mapping + `applyThemeOverride`), wired
  into startup and `settings:update`, with the unit test
- Phase 3: US1/US2/US3 — Theme radio group, `useEffectiveTheme`/`useSettingsState`
  hooks, `data-theme` attribute, dark palette, live OS following (FR-005)
- Phase 4: Polish — tokenize `Tree.css`; e2e suite (`theme.spec.ts`) + fix the
  settings.spec radio count
- Phase 5: Gate — `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run test:e2e`, `npm run check` all green; archive the spec

All phases complete (2026-08-06); the four-command gate + maintainability check
pass. The code-round re-decision (renderer derives the palette from the choice +
`prefers-color-scheme`; `themeSource` kept for the native chrome only) is recorded
in research R1/R2, the complexity table, and the decision log.

## Deferred / later features

- Custom themes, per-workspace themes, time-based auto switching (spec Assumptions:
  out of scope).
- Finer editor theme control (per-element tweaks beyond the `--crepe-color-*` set,
  a true "editor theme" feature) — the future `016-editor-theme` spec should build
  on the tokens introduced here rather than re-decide them (spec clarification).
- Animated theme transitions (the spec edge case is satisfied trivially because
  there is no transition; adding one is a polish decision for later).

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Repurposing the existing `themeOverride` field as the theme setting | It already exists with exactly the three-mode semantics (`null` = follow OS), is already validated/merged/migrated/persisted (spec 010/012). Reusing avoids a new field, a schema migration, and a change to the migration's known-key list | Adding a new `theme` field (duplicates storage and semantics, needs a migration and `known`-key churn for zero user value) |
| Deriving the palette from the persisted choice + `prefers-color-scheme`, with `nativeTheme.themeSource` kept only for the native chrome | Research R1: `themeSource` does not propagate `prefers-color-scheme` into the renderer in this Electron build (empirically verified during the e2e round), so the palette cannot depend on it. The renderer's own query reflects the real OS theme and is e2e-driveable via `emulateMedia` (R2) | Relying on `themeSource` propagation (fails on this build — the palette never switched), or adding a new IPC channel to push a resolved mode (adds preload surface for what two standard APIs already provide) |
| Tokenizing `Tree.css`'s literal colors onto the `--ame-*` palette | The explorer tree and its context menu are chrome; on the dark sidebar their hardcoded `#222`/`#666`/white text become unreadable. The tokens are the spec-010 mechanism the rest of the chrome already uses | Scoping dark overrides into `Tree.css` by hand (duplicates palette values across stylesheets instead of one token source) |
| Darking the WYSIWYG editor surface (FR-010 amended, user decision 2026-08-06) | A white page inside a dark window reads as unfinished; the standard desktop-editor pattern is a dark canvas slightly lighter than the chrome. Crepe is fully token-driven (`--crepe-color-*` on `.milkdown`), so it is one override block plus tokenizing the source view/empty state — no editor logic changes | Keeping the editor permanently light (the original FR-010; contradicts the user's decision), or importing Crepe's `crepe-dark` theme wholesale (its warm-brown palette clashes with the neutral grey chrome) |

## Decision log

### 2026-08-06

- **Reuse `themeOverride`**: the theme setting is the existing persisted
  `themeOverride: 'light' | 'dark' | null` field — no schema change, no migration.
- **Renderer derives the palette from the choice + `prefers-color-scheme`**; main
  resolves the choice onto `nativeTheme.themeSource` for the native chrome only.
  Re-decided during the e2e round when research R1's propagation assumption was
  falsified (see the 2026-08-06 code-round entry below).
- **Dark palette via token override**: `[data-theme='dark']` redefines the `--ame-*`
  custom properties on `.app-container`; every chrome surface follows.
- **Dark editing surface (FR-010 amended, user decision 2026-08-06)**: the
  WYSIWYG editor content area now follows the theme. In dark mode Crepe's
  `--crepe-color-*` tokens on `.milkdown` are overridden to a neutral grey scale
  (canvas `#26292e`, slightly lighter than the window `#1b1d21`; body text
  `#d8dce2`), and the `.editor-area`, empty state, and source view resolve
  `--ame-editor-bg`/`--ame-*`. Light mode is unchanged (the tokens keep the
  existing light values). This takes the editing-surface slice the future
  `016-editor-theme` spec would own.
- **Live following = the `change` listener**: in System mode the renderer
  re-resolves `prefers-color-scheme` on every matchMedia change event (Chromium
  fires it when the OS theme changes). e2e simulates an OS switch with Playwright's
  `emulateMedia`.
- **No transitions**: the spec's "transition completes cleanly" edge is trivially
  satisfied; adding a transition is deferred polish.
- **`settings:get` fallback literal** already carries `themeOverride`; unchanged.

### 2026-08-06 (code round)

- **R1 falsified → re-decided the renderer mechanism**: the plan originally
  resolved the effective theme entirely through `nativeTheme.themeSource`
  (research R1 cited the electron.d.ts doc that setting it makes the renderer's
  `prefers-color-scheme` match). An e2e diagnostic (Electron 43, the headless
  launch the suite uses) showed `shouldUseDarkColors` flips in main but the
  renderer's `matchMedia('(prefers-color-scheme: dark)')` never changes and no
  `change` event fires. The renderer now derives the palette from the persisted
  choice + its own `prefers-color-scheme` query (`effectiveThemeMode`, pure and
  unit-tested), and main keeps `applyThemeOverride` only for the native chrome.
  The e2e suite simulates OS switches with `page.emulateMedia({ colorScheme })`,
  which re-fires the renderer query deterministically (verified). Recorded in
  research R1/R2 and the complexity table; no user-visible behaviour changed.
- **Settings preloaded before first render** (`src/renderer/main.tsx`): the
  settings fetch moved out of the post-mount effect into the bootstrap, before
  `createRoot`. The renderer's `useState` initialisers read the preloaded cache,
  so a persisted dark theme (or font/explorer choices) apply from the first
  paint with no light flash — making the "first paint themed" promise (FR-006)
  hold independently of the (non-propagating) `themeSource`. The fetch is a few
  ms and the window shows on `ready-to-show`. The `useSettingsState` load effect
  was removed as redundant.
