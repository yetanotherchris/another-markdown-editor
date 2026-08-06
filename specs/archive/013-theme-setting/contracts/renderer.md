# Contracts: Theme Setting — renderer

The theme field, dialog aria contract, and e2e contract for `013-theme-setting`.
No new IPC operations — the existing named `getSettings` / `updateSettings` on
`DesktopApi` carry `themeOverride` unchanged (Principle I).

## Theme setting

The theme setting is the existing `Settings.themeOverride: 'light' | 'dark' | null`
(`src/shared/ipc-contract.ts`). `null` = System default. `updateSettings({ themeOverride })`
returns `Result<Settings>` with the merged value; main validates the union
(`'light'`, `'dark'`, or `null`, else keeps the current value). The dialog converts
between the UI choice (`'light' | 'dark' | 'system'`) and the persisted value.

## Theme resolution

`src/main/theme.ts`:

- `themeSourceForOverride(override)` — pure mapping: `'light' → 'light'`,
  `'dark' → 'dark'`, `null → 'system'`.
- `applyThemeOverride(override)` — `nativeTheme.themeSource = themeSourceForOverride(override)`.

Applied on startup (`app.whenReady`, before the window is created) and after every
`settings:update` merge, so a change applies immediately (FR-008). This drives the
**native** chrome only (macOS window frames, native scrollbars/context menus);
research R1 showed it does not propagate `prefers-color-scheme` into the renderer
in this Electron build.

## Effective theme (renderer)

`src/renderer/hooks/useEffectiveTheme.ts`:

- `effectiveThemeMode(choice, prefersDark)` (pure) — Light/Dark are forced by the
  choice; System returns `prefersDark ? 'dark' : 'light'`.
- `useEffectiveTheme(choice)` — re-reads `window.matchMedia('(prefers-color-scheme:
  dark)')` on mount and on every `change` event (FR-005 live following), and
  re-computes when `choice` changes (FR-008 apply-immediately). The renderer never
  touches `nativeTheme`.

`.app-container` carries `data-theme={themeMode}`. CSS retints the chrome under
`.app-container[data-theme='dark']` by redefining the `--ame-*` custom properties.
The WYSIWYG editor content area follows the theme (FR-010): a
`.app-container[data-theme='dark'] .milkdown` rule overrides Crepe's
`--crepe-color-*` tokens (dark canvas `#26292e`, light body text `#d8dce2`, etc.),
and the `.editor-area`, empty state, and source view resolve
`--ame-editor-bg`/`--ame-*`. Light mode keeps the existing light styling.

## Settings dialog

Renderer React modal (`src/renderer/chrome/SettingsDialog.tsx`), unchanged
structure, one new fieldset:

- **Theme** — a radio group of three options: `Light`, `Dark`, `System default`
  (below the existing **Editor Font** group). Arrow-key navigable.
- Selecting an option applies it immediately and persists via
  `window.api.updateSettings({ themeOverride })`.
- The focus trap covers both radio groups; Close button / Escape still close and
  focus returns to the hamburger trigger.
- The dialog MUST NOT touch the document session (unchanged, FR-008).

## E2e contract (`tests/e2e/theme.spec.ts`)

1. **US1** — choose **Light** in the dialog: `.app-container` gets
   `data-theme="light"`; the header bar computes the light `--ame-surface`
   (`#f9f9fb`).
2. **US2** — choose **Dark**: `.app-container` gets `data-theme="dark"`; the header
   bar computes the dark surface and `config.json` records
   `settings.themeOverride = "dark"`.
3. **US3** — choose **System default**, then simulate an OS switch with
   Playwright's `page.emulateMedia({ colorScheme: 'dark' })` (then `'light'`):
   `data-theme` flips live without a restart (FR-005, SC-004).
4. **US4** — choose **Dark**, restart with the same `AME_CONFIG_DIR`: the app opens
   with `data-theme="dark"` (FR-006, SC-002).
5. **FR-010** — with the theme Dark, the WYSIWYG editor content area follows the
   theme: the `.milkdown` canvas resolves `#26292e` and its text resolves
   `#d8dce2`, the canvas is lighter than the window chrome, and both are dark.
6. **FR-009** — a missing or malformed config opens with System default selected
   (the `themeOverride` default is `null`) and a change writes a valid config.
7. **FR-007** — the dialog's Theme group is keyboard-reachable (reuses the
   settings.spec keyboard flow).

## E2e helper contract (`tests/e2e/launch.ts`)

- `openSettingsDialog(window)` is reused unchanged.
- `tests/e2e/settings.spec.ts` `US1` scopes its radio-count assertion to the
  Editor Font group (the dialog now has two radio groups):
  `dialog.getByRole('group', { name: 'Editor Font' }).getByRole('radio')`.
