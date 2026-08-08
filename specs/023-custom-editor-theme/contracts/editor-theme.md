# Contract: Editor Theme Detection & Application

The schema + detection contract for spec 023. No IPC surface change — settings
only.

## `EditorColors` schema (`settings.editorColors`, nullable)

```ts
interface EditorColors {
  background: string  // #rrggbb → --crepe-color-background
  foreground: string  // #rrggbb → --crepe-color-on-background
  accent: string      // #rrggbb → --crepe-color-primary
  surface: string     // #rrggbb → --crepe-color-surface
  outline: string     // #rrggbb → --crepe-color-outline
  code: string        // #rrggbb → --crepe-color-inline-code
}
```

Validation (main, `settingsFile.ts`): the object, when present, MUST contain
exactly these keys, each a `#rrggbb` hex string; otherwise the whole value is
rejected and treated as `null` (FR-010/009).

## `resolveEditorTheme` (pure, renderer)

```
resolveEditorTheme({ editorTheme, editorFont, editorColors, appMode })
  → { kind: 'preset', name: EditorThemeName } | { kind: 'custom' }
```

| `editorColors` | Rule |
|----------------|------|
| `null` | → the `editorTheme` preset (SC-005) |
| set | exact colours+font match against a preset (monotone: the `appMode` variant) → that preset; else `custom`. `editorTheme` ignored |

## Application

- `data-editor-theme` = effective preset name, or `'custom'`.
- Custom: the six tokens + `--crepe-font-{default,title}` (from `editorFont`)
  are set inline on `.app-container`; Crepe consumes them on `.milkdown`.

## Settings dialog

- Editor Theme group: the five presets; when effective is custom, a checked,
  disabled **Custom** radio is shown (FR-003).
- Selecting a preset + Save: persists `editorTheme = preset`,
  `editorColors = null`, `editorFont = <preset font>` (FR-005, FR-008).
- Font stacks: sans → `'Inter', …sans-serif`; serif → `Georgia, …serif`
  (matching `themes.css`).

## Verification

- Unit (`tests/renderer/editorThemePresets.test.ts`): every preset matches
  itself; a one-value change → custom; rust colors + serif → Rustic Serif;
  scholarly colors + serif → custom; monotone matching honours `appMode`;
  `editorColors = null` returns the stored preset.
- Unit (`tests/main/settings.test.ts`): editorColors validation (valid / bad hex /
  missing key / wrong shape → null).
- e2e (`tests/e2e/editor-theme-custom.spec.ts`): a config with custom colours +
  font shows Custom in the dialog and applies the colours to the canvas; choosing
  a preset + Save clears `editorColors` and shows the preset; restart persistence.
