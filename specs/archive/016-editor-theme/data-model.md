# Data Model: Editor Theme

**Feature**: 016-editor-theme | **Date**: 2026-08-07

## Entities

### Editor Theme (spec: Key Entities)

One of the five named visual styles for the formatted WYSIWYG canvas. The theme's
concrete values (colors, typefaces, sizes) live in the application CSS
(`src/renderer/editor/themes.css`), never in the configuration file (FR-005).

| Name | Value | Canvas background | Body text | Headings | Typeface |
|------|-------|-------------------|-----------|----------|----------|
| Rustic | `'rustic'` | `#fffdfb` | `#1f1b16` | same as body | Inter (sans-serif) |
| Rustic Serif | `'rustic-serif'` | `#fffdfb` | `#1f1b16` | same | Georgia stack (serif) |
| Monotone | `'monotone'` | white/black per app theme | black/white per app theme | same | Inter (sans-serif) |
| Monotone Serif | `'monotone-serif'` | as Monotone | as Monotone | same | Georgia stack (serif) |
| Scholarly | `'scholarly'` | `#ffffff` | dark text | `#00B0E9` | Arial/'Helvetica Neue' (Helvetica-like sans) |

### Editor Theme Setting (spec: Key Entities)

The persisted configuration value that stores the name of the selected editor
theme. A single field on `Settings`:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `editorTheme` | `EditorThemeName` | `'rustic'` | A closed union of the five names. Validated in main on load and on every merge (FR-006). |

```ts
export type EditorThemeName =
  | 'rustic' | 'rustic-serif' | 'monotone' | 'monotone-serif' | 'scholarly'
```

Stored under `.settings.editorTheme` in the shared per-user `config.json`
(FR-004, FR-005; same file as specs 004/010/012/013). Written through the existing
debounced `saveSettings` + quit flush. `editorTheme` joins the migration `known`
key list so pre-016 configs import the default and recover cleanly.

### Resolved App Theme (spec: Key Entities)

The effective light/dark appearance derived from the application theme setting
and, when set to system, the operating system's current mode (spec 013). Surfaced
in the renderer as the `data-theme` attribute on `.app-container`. **Only the
Monotone and Monotone Serif themes render against this value** (FR-009/FR-010);
the other three themes are fixed palettes independent of it.

## State transitions

| Transition | Action | Effect |
|-----------|--------|--------|
| Select theme + Save in settings | `handleEditorThemeChange(name)` | Persist `editorTheme` via `updateSettings` + `window.api.updateSettings`; `data-editor-theme` re-renders all mounted canvases immediately (FR-003, no restart). |
| Close dialog without Save | dialog close / X / Escape / backdrop | The staged draft is discarded; `editorTheme` and the canvas are unchanged (US1 S4). |
| App restart | main `loadSettings` → `settings:get` → renderer cache | The persisted `editorTheme` seeds the renderer state; `data-editor-theme` applies it from the first paint (FR-004). |
| OS theme switch, system mode, Monotone active | `useEffectiveTheme` matchMedia `change` → `data-theme` flips | The Monotone canvas re-renders to the matching two-tone scheme live (FR-010). |
| OS reports no preference, system mode, Monotone active | `prefers-color-scheme` false → `effectiveThemeMode` returns `light` | Canvas falls back to black on white (FR-010 scenario 4). |

## Invariants

- `editorTheme` is always one of the five names — never arbitrary text, never
  missing (default `'rustic'`) — so a missing/malformed/unknown value in the
  config falls back to Rustic without breaking the app (FR-006).
- Changing `editorTheme` never alters document content, dirty state, or undo
  history (FR-014) — the change is a pure attribute/CSS swap.
- The editor theme applies to the formatted `.milkdown` canvas only; the source
  view keeps its existing app-theme styling (FR-013).
