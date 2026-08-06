# Data Model: Settings Dialog

Types and state affected by `012-settings-dialog`.

## Settings (persisted)

`src/shared/ipc-contract.ts` — `Settings` gains one field:

```ts
export interface Settings {
  sidebarWidth: number          // existing (30)
  themeOverride: 'light' | 'dark' | null   // existing — still ignored by the chrome
  explorerVisible: boolean      // existing (true)
  editorFont: 'sans-serif' | 'serif'  // NEW — default 'sans-serif'
}
```

- Main (`src/main/settingsFile.ts`): `DEFAULTS.editorFont = 'sans-serif'`;
  `loadSettingsFile` validates `parsed.editorFont === 'sans-serif' ||
  'serif'` (fallback to the default). `writeSettingsFile` writes the whole
  object.
- `settings:update` handler (`src/main/ipc/handlers.ts`): merge branch
  `editorFont: p.editorFont === 'sans-serif' || p.editorFont === 'serif'
  ? p.editorFont : current.editorFont` — the existing pattern. The `settings:get`
  fallback literal gains `editorFont: 'sans-serif'`.
- Renderer (`src/renderer/state/settings.ts`): `editorFont: 'sans-serif'` added
  to `defaults`; the `settings:get` merge already spreads main's value over the
  defaults.

## Config file (shared with Recent Items — FR-002)

`config.json` at `app.getPath('appData')/ame` (test seam `AME_CONFIG_DIR` →
`<dir>/config.json`) now holds both stores:

```json
{
  "recentItems": [ { "path": "...", "kind": "file|folder", "name": "...", "lastOpenedAt": 123 } ],
  "settings": {
    "sidebarWidth": 30,
    "themeOverride": null,
    "explorerVisible": true,
    "editorFont": "sans-serif"
  }
}
```

Read/write contract:

- `loadSettingsFile(filePath)`: read `.settings`, validate each field
  individually (missing/malformed → defaults; partial corrupt → keep recoverable
  values). Returns a complete `Settings`.
- `writeSettingsFile(filePath, settings)`: read-modify-write — load the current
  config (tolerant → `{}`), merge `.settings`, write. Never clobbers
  `recentItems`.
- `saveRecentItems(filePath, items)`: read-modify-write — preserve `.settings`.
- `loadRecentItems(filePath)`: unchanged (reads `.recentItems` via
  `normalizeRecentItems`).

### Migration (one-time)

On `loadSettings()` in `src/main/settings.ts`: if `config.json` has no
`.settings` key and the legacy `userData/settings.json` (or
`AME_CONFIG_DIR/settings.json`) exists with a valid Settings object, import its
values into `config.json`. Best-effort — failure falls through to defaults.

## Editor font state (renderer)

`App.tsx`:

```ts
const [editorFont, setEditorFont] = useState<'sans-serif' | 'serif'>(getSettings().editorFont)
```

- Synced after `loadSettingsFromMain()` resolves.
- Updated by the SettingsDialog on selection: `updateSettings({ editorFont })` +
  `window.api.updateSettings({ editorFont })` + `setEditorFont(font)`.
- Applied as `data-editor-font={editorFont}` on `.app-container`; CSS overrides
  Crepe's `--crepe-font-*` variables on `.milkdown` for `[data-editor-font='serif']`.

## Settings dialog state (renderer, component-local)

`App.tsx`:

```ts
const [settingsOpen, setSettingsOpen] = useState(false)
```

- Opened by the hamburger `Settings…` action (`onOpenSettings` prop), closed by
  the dialog's Close button or Escape.
- Single instance: opening while open is a no-op.

## Hamburger command model (modified)

`HamburgerAction` (`src/renderer/chrome/menuModel.ts`) gains an action:

```ts
| { kind: 'action'; label: string; action: 'clear-recent' | 'toggle-devtools' | 'settings' | 'quit' }
```

Order: `new-file`, `open-file`, `open-folder`, `recent-items`, separator,
`save`, `save-as`, `close-tab`, separator, `toggle-devtools`, separator,
`settings` (**Settings…**), separator, `quit`.

`HamburgerMenu` gains `onOpenSettings: () => void`; the `settings` action calls
it and closes the dropdown.

## Aria contract (e2e anchors)

| Control | Element | Accessible name / role |
|---------|---------|------------------------|
| Settings dialog | `div[role="dialog"]` | `aria-modal="true"`, `aria-labelledby` = "Settings" heading |
| Editor Font group | `fieldset` | `aria-label="Editor Font"` / legend "Editor Font" |
| Font option | `input[type="radio"]` | `Sans-serif` / `Serif` (visible labels) |
| Close | `button` | `Close settings` |
| Hamburger Settings item | `button[role="menuitem"]` | `Settings…` |
