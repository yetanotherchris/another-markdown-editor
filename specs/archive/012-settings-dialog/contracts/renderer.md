# Contracts: Settings Dialog — renderer

The settings field, config-file shape, dialog aria contract, and e2e contract
for `012-settings-dialog`. No new IPC operations — the existing named
`getSettings` / `updateSettings` on `DesktopApi` are unchanged (Principle I).

## Settings

`Settings` gains `editorFont: 'sans-serif' | 'serif'` (default `'sans-serif'`).
`updateSettings({ editorFont })` returns `Result<Settings>` with the merged
value; main validates the union (`'sans-serif'` or `'serif'`, else keeps the
current value) — never arbitrary text (no CSS injection).

## Config file (shared with Recent Items, FR-002)

- Both settings and the recent-items list live in `config.json` at
  `app.getPath('appData')/ame` (test seam `AME_CONFIG_DIR` → `<dir>/config.json`).
- Shape: `{ recentItems?: RecentItem[], settings?: Settings }`.
- Each store read-modify-writes so saving one preserves the other.
- Missing/malformed config → defaults (`editorFont: 'sans-serif'`); a change
  writes a valid config (FR-009).
- Legacy `userData/settings.json` values are migrated once into `config.json`.

## Settings dialog

Renderer React modal (`src/renderer/chrome/SettingsDialog.tsx`):

- `role="dialog"`, `aria-modal="true"`, heading `aria-labelledby` = "Settings".
- Opened from the hamburger `Settings…` item; single instance (opening while
  open is a no-op).
- First (and, for this feature, only) setting: **Editor Font** — a radio group
  of two options, `Sans-serif` and `Serif`, navigable with arrow keys.
- Selecting an option applies it immediately and persists via
  `window.api.updateSettings({ editorFont })`.
- Close: Close button or Escape; focus returns to the hamburger trigger.
- The dialog MUST NOT touch the document session (dirty flags, open tabs,
  content) — opening/closing it leaves documents untouched (FR-008).

## Editor font rendering

`.app-container` carries `data-editor-font={editorFont}`. For
`data-editor-font='serif'`, CSS overrides Crepe's `--crepe-font-default` and
`--crepe-font-title` on `.milkdown` to a system serif stack
(`Georgia, 'Times New Roman', 'Noto Serif', serif`). Sans-serif keeps the
existing Inter stack. The source view keeps its monospace face (plan decision).

## Hamburger item model (modified)

`hamburgerMenuStructure(platform)` now includes, in order:
… `Toggle Developer Tools` · separator · `Settings…` · separator · `Quit`.
`Settings…` is a `{ kind: 'action', action: 'settings' }` item; the hamburger
calls `onOpenSettings()` and closes.

## E2e contract (`tests/e2e/settings.spec.ts`)

1. **US1** — open the hamburger, click `Settings…`; a `role="dialog"` labelled
   "Settings" appears; the first setting is Editor Font with `Sans-serif` and
   `Serif` radio options.
2. **US2** — select `Serif`; the WYSIWYG editor's computed font-family resolves
   to a serif stack; `config.json` (under `AME_CONFIG_DIR`) records
   `settings.editorFont = "serif"`.
3. **US2/FR-007** — reopen the dialog: the `Serif` radio is checked (current
   choice shown).
4. **US3** — select `Serif`, restart the app with the same `AME_CONFIG_DIR`;
   the editor still renders serif.
5. **US4/FR-008** — open a document, type (dirty), open the settings dialog,
   change the font, close it; the document content and dirty state are unchanged.
6. **FR-007** — the dialog is keyboard-accessible: hamburger focus + Enter
   opens it, Tab reaches the radios, arrow keys change selection, Escape closes.
7. **FR-009** — with a missing config, the dialog opens with Sans-serif
   selected; selecting Serif writes a valid config.
8. **FR-009** — with a malformed config, the dialog still opens with defaults.

## E2e helper contract (`tests/e2e/launch.ts`)

- `openSettingsDialog(window)`: open the hamburger and click `Settings…`,
  returning the dialog locator.
- Config reads in existing suites that touched `settings.json` are updated to
  `config.json` → `.settings` (e.g. chrome.spec.ts explorerVisible persistence).
