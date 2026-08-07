# Contracts: Editor Theme — renderer

The editor-theme field, dialog aria contract, and e2e contract for
`016-editor-theme`. No new IPC operations — the existing named `getSettings` /
`updateSettings` on `DesktopApi` carry `editorTheme` unchanged (Principle I).

## Editor theme setting

The editor theme is `Settings.editorTheme: EditorThemeName` where:

```ts
export type EditorThemeName =
  | 'rustic' | 'rustic-serif' | 'monotone' | 'monotone-serif' | 'scholarly'
```

Default `'rustic'` (FR-002). `updateSettings({ editorTheme })` returns
`Result<Settings>` with the merged value; main validates the closed union (five
names, else keeps the current value — FR-006). The dialog converts between the UI
labels (Rustic, Rustic Serif, Monotone, Monotone Serif, Scholarly) and the
persisted name via the shared `EDITOR_THEMES` constant
(`src/renderer/editor/editorThemes.ts`).

The spec-012 `editorFont` field persists in `Settings` for config migration but is
no longer applied to the canvas; the Editor Font group is removed from the dialog
(user decision 2026-08-07).

## Canvas application

`.app-container` carries `data-editor-theme={editorTheme}` alongside the existing
`data-theme`. The per-theme CSS in `src/renderer/editor/themes.css` scopes Crepe's
`--crepe-color-*`/`--crepe-font-*` tokens under
`.app-container[data-editor-theme='X'] .milkdown`. Monotone themes add a
`[data-theme='light'|'dark']` qualifier so they follow the resolved app theme,
live in system mode (FR-010). Rustic derives from the current canvas with a
warmed cream `#fdf6e3` background (R1/R2, user decision 2026-08-07).

The canvas-only scope (FR-013): the source view keeps resolving
`--ame-editor-bg`/`--ame-text` and is not re-themed by this feature. The dark-mode
canvas override in `App.css` is removed (theme owns the canvas).

## Settings dialog

Renderer React modal (`src/renderer/chrome/SettingsDialog.tsx`), with these groups
in order:

1. **Theme** (spec 013) — Light / Dark / System default, apply-immediately
   (unchanged, archived behavior).
2. **Editor Theme** — five radios from `EDITOR_THEMES`, arrow-key navigable.
   Selection is **staged** in local dialog state — it does NOT apply on click.
3. **Footer** — **Save** button commits the staged editor theme via
   `onEditorThemeSave(name)` and closes; **Close** / X / Escape / backdrop discard
   the draft and close without changing the canvas (US1 S4).

The focus trap covers all three radio groups plus the Save/Close buttons. The
dialog MUST NOT touch the document session (unchanged, FR-014).

## E2e contract (`tests/e2e/editor-theme.spec.ts`)

1. **US1** — the Editor Theme group lists all five themes: Rustic, Rustic Serif,
   Monotone, Monotone Serif, Scholarly.
2. **US1 S2/S3** — select a non-default theme (e.g. Scholarly), press **Save**:
   `data-editor-theme` changes, the `.milkdown` canvas resolves the theme's values
   (white background, `#00B0E9` headings) within 5 s, and `config.json` records
   `settings.editorTheme`.
3. **US1 S4** — select a theme then close the dialog **without Save**: the canvas
   and `data-editor-theme` are unchanged.
4. **US2** — save Scholarly, restart with the same `AME_CONFIG_DIR`: the canvas
   reopens in Scholarly (FR-004).
5. **US3** — default canvas is Rustic: `.milkdown` background `#fdf6e3`, body text
   in a sans-serif face (Inter), inline code monospace.
6. **US4** — switch Rustic → Rustic Serif: same `#fdf6e3` canvas, body + headings
   now a serif face.
7. **US5** — Monotone: with app theme Light, `.milkdown` is white bg / black text;
   with app theme Dark, black bg / white text. In system mode, `emulateMedia`
   light→dark flips the canvas live (FR-010); `emulateMedia('no-preference')`
   falls back to light (FR-010 scenario 4).
8. **US6** — Scholarly: white background, `#00B0E9` headings, Helvetica-like body
   face distinct from Inter, same monospace inline code.
9. **FR-014** — switching themes leaves the open document's content, dirty marker,
   and undo history unchanged.

## E2e helper contract (`tests/e2e/launch.ts`)

- `openSettingsDialog(window)` is reused unchanged.
- `tests/e2e/settings.spec.ts` (rewritten for 016) scopes radio counts per group:
  Theme group = 3 radios, Editor Theme group = 5 radios.
- `tests/e2e/theme.spec.ts` FR-010 is updated: the default (Rustic) canvas no
  longer darkens in dark mode; only the Monotone theme follows the app theme.
