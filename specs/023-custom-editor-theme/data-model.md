# Data Model: Custom Editor Theme

## Entities

### Editor Theme Preset (spec "Key Entities")

A named combination of six colours + a font type. Fixed at five (Assumptions).

| Preset | Colors (background/foreground/accent/surface/outline/code) | Font |
|--------|-----------------------------------------------------------|------|
| Rustic | `#fdf6e3` / `#1f1b16` / `#805610` / `#fdf3d9` / `#817567` / `#ba1a1a` | sans-serif |
| Rustic Serif | same as Rustic | serif |
| Scholarly | `#ffffff` / `#1a1a1a` / `#00b0e9` / `#f7f7f7` / `#8a8a8a` / `#b50000` | sans-serif |
| Monotone (light) | `#ffffff` / `#000000` / `#000000` / `#ffffff` / `#808080` / `#000000` | sans-serif |
| Monotone (dark) | `#000000` / `#ffffff` / `#ffffff` / `#000000` / `#808080` / `#ffffff` | sans-serif |
| Monotone Serif | same as Monotone (light/dark) | serif |

### Editor Colors (spec "Key Entities")

`EditorColors` — a closed record of six hex values stored under
`settings.editorColors` (nullable):

| Key | CSS token |
|-----|-----------|
| `background` | `--crepe-color-background` |
| `foreground` | `--crepe-color-on-background` |
| `accent` | `--crepe-color-primary` |
| `surface` | `--crepe-color-surface` |
| `outline` | `--crepe-color-outline` |
| `code` | `--crepe-color-inline-code` |

Validation: every value MUST be a `#rrggbb` hex string; unknown keys are
rejected (FR-010). `null` = no custom colours.

### Custom Theme (spec "Key Entities")

The effective state when `editorColors` is set and does not exactly match any
preset (with the current app-theme variant for monotone) together with the
`editorFont` typeface. Display-only label in the dialog (not selectable).

## Effective theme resolution (`resolveEditorTheme`)

| `editorColors` | Match | Result |
|----------------|-------|--------|
| `null` | — | `{ kind: 'preset', name: editorTheme }` (backward compat, SC-005) |
| set | colours + font match a preset | `{ kind: 'preset', name: <preset> }` |
| set | no exact match | `{ kind: 'custom' }` |

`editorTheme` is ignored when custom colours are present (Edge Case: colours win).

## State transitions

- **Select preset + Save** (FR-005): `editorTheme = preset`, `editorColors = null`,
  `editorFont = preset font`.
- **Custom colours present** (via config edit): detection decides the displayed
  theme; invalid values fall back to Rustic and are not persisted (FR-009/010).
