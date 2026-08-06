# Data Model: Theme Setting

Types and state affected by `013-theme-setting`.

## Theme setting (persisted)

`src/shared/ipc-contract.ts` — `Settings` is **unchanged**; the theme setting is the
existing field:

```ts
export interface Settings {
  sidebarWidth: number                  // existing (30)
  themeOverride: 'light' | 'dark' | null // the theme setting (spec 013) — null = system default
  explorerVisible: boolean              // existing (true)
  editorFont: 'sans-serif' | 'serif'    // existing (spec 012)
}
```

- Values map 1:1 to the three spec modes: `'light'` → Light, `'dark'` → Dark,
  `null` → System default.
- Already validated field-by-field in `src/main/settingsFile.ts`
  (`validateSettings`, `mergeSettingsPatch`), persisted in `config.json` under
  `.settings`, and included in the legacy migration. **No schema change.**

## Effective theme mode (derived, not persisted)

The **Theme Mode** (spec Key Entities) is the resolved appearance the chrome
renders — `'light'` or `'dark'`.

- **Main** (`src/main/theme.ts`): `themeSourceForOverride(override)` maps
  `'light' → 'light'`, `'dark' → 'dark'`, `null → 'system'`; `applyThemeOverride`
  sets `nativeTheme.themeSource` for the native chrome (macOS window frames,
  native scrollbars/menus). Research R1: this does **not** propagate
  `prefers-color-scheme` into the renderer in this Electron build, so the palette
  is not derived from it.
- **Renderer** (`src/renderer/hooks/useEffectiveTheme.ts`): `effectiveThemeMode`
  resolves the palette from the choice + `prefers-color-scheme`; the hook re-reads
  the query on every `matchMedia` change (FR-005 live following).

| Choice (persisted) | themeSource (main, native chrome) | data-theme (renderer palette) |
|--------------------|-----------------------------------|-------------------------------|
| `'light'`          | `light`                           | `light` (forced)              |
| `'dark'`           | `dark`                            | `dark` (forced)               |
| `null` (system)    | `system`                          | follows `prefers-color-scheme`, live |

## Config file (unchanged shape)

`config.json` at `appData/ame` (test seam `AME_CONFIG_DIR` → `<dir>/config.json`)
already holds the setting; no write-path change:

```json
{
  "recentItems": [],
  "settings": {
    "sidebarWidth": 30,
    "themeOverride": null,
    "explorerVisible": true,
    "editorFont": "sans-serif"
  }
}
```

## Renderer state

`App.tsx`:

```ts
type ThemeChoice = 'light' | 'dark' | 'system'   // dialog-local
const [themeChoice, setThemeChoice] = useState<ThemeChoice>(themeChoiceFromOverride(getSettings().themeOverride))
```

- Synced after `loadSettingsFromMain()` resolves (alongside `editorFont`).
- Updated by the SettingsDialog on selection: `updateSettings({ themeOverride })` +
  `window.api.updateSettings({ themeOverride })` + `setThemeChoice(choice)`.
- Effective mode rendered as `data-theme={themeMode}` on `.app-container` (from
  `useEffectiveTheme`); CSS retints the chrome under
  `.app-container[data-theme='dark']`.

## Chrome palette tokens (spec 010, extended)

`:root` defines the light `--ame-*` block; `.app-container[data-theme='dark']`
overrides it with the dark palette. Every chrome surface resolves these tokens
(header, tabs, hamburger menus, sidebar, status footer, settings dialog). The dark
block also carries `--ame-editor-bg` (the editing-surface background), and a
`.app-container[data-theme='dark'] .milkdown` rule overrides Crepe's `--crepe-color-*`
tokens — so the WYSIWYG editor canvas, toolbar, code, and blockquotes follow the
theme (FR-010). The `.editor-area`, empty state, and source view resolve
`--ame-editor-bg`/`--ame-*`. Light mode is unchanged.

## Settings dialog aria contract (e2e anchors)

| Control | Element | Accessible name / role |
|---------|---------|------------------------|
| Theme group | `fieldset` | legend "Theme" |
| Theme option | `input[type="radio"]` | `Light` / `Dark` / `System default` |
| Editor Font group | `fieldset` (unchanged) | legend "Editor Font" |
| Dialog | `div[role="dialog"]` (unchanged) | `aria-labelledby` = "Settings" |

## Main-process theme application points

| Call site | When |
|-----------|------|
| `src/main/index.ts` `app.whenReady()` | after `loadSettings()` resolves, before the window is created — first paint is correct |
| `src/main/ipc/handlers/settings.ts` `settings:update` | after the merged settings — a change applies immediately (FR-008) |
