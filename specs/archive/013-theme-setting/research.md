# Research: Theme Setting

Evidence for the `013-theme-setting` plan. All claims verified against the
installed Electron type definitions (`node_modules/electron/electron.d.ts`) and the
repository source.

## R1 — `nativeTheme.themeSource` is the canonical three-option theme mechanism, but does NOT propagate to the renderer in this build

`electron.d.ts` (`NativeTheme.themeSource`, lines 10052–10088) documents:

> A `string` property that can be `system`, `light` or `dark`. It is used to
> override and supersede the value that Chromium has chosen to use internally.
> Setting this property to `dark` will have the following effects: … The
> `prefers-color-scheme` CSS query will match `dark` mode … The `updated` event
> will be emitted. … the user has three options: Follow OS → `themeSource =
> 'system'`; Dark Mode → `themeSource = 'dark'`; Light Mode → `themeSource =
> 'light'`.

This is exactly the spec's three modes. **However**, an empirical check against
the real app (Electron 43, headless launch used by the e2e suite) shows that
setting `nativeTheme.themeSource = 'dark'` in main updates
`nativeTheme.shouldUseDarkColors` to `true` but does **not** change the
renderer's `window.matchMedia('(prefers-color-scheme: dark)')` value, and no
`change` event fires. The documented propagation does not hold in this build, so
the palette **must not** depend on it.

Decision: main still resolves the override onto `themeSource` for the native
chrome it does affect (OS-drawn window frames on macOS, native scrollbars/context
menus), but the renderer derives the palette mode from the persisted choice +
the renderer's own `prefers-color-scheme` query (R2). This was re-decided in the
plan's decision log (2026-08-06) after the e2e round surfaced the gap.

## R2 — the renderer's `prefers-color-scheme` query reflects the real OS theme and is fully driveable in tests

The renderer's `prefers-color-scheme` media query reflects the **real OS theme**
(Chromium keeps it up to date as the OS switches, giving FR-005 live following in
production), and it is independent of `themeSource`. For a forced Light/Dark
choice the persisted override wins; for System the query decides. Playwright's
`page.emulateMedia({ colorScheme })` re-fires the query deterministically — the
e2e suite uses it to simulate an OS switch (verified: matches flips and the
change listener fires). So the effective mode is computed in the renderer with
one standard API (no Electron module, Principle I), and the e2e suite can prove
live following without touching the host OS.

## R3 — the persisted setting already exists with the exact semantics

`Settings.themeOverride: 'light' | 'dark' | null` (`src/shared/ipc-contract.ts`) was
added in spec 010 and is fully wired through spec 012's storage:
- validated field-by-field in `src/main/settingsFile.ts` (`validateSettings`,
  `mergeSettingsPatch`);
- persisted in `config.json` under `.settings` with the debounced `saveSettings`
  and quit `flushSettings`;
- included in the legacy `settings.json` migration's known-key list;
- part of the `settings:get` fallback literal in `src/main/ipc/handlers/settings.ts`.

`null` already means "follow the OS". The chrome simply never read it (spec 010
plan). Reusing it for spec 013 needs no schema or migration work.

## R4 — chrome uses `--ame-*` tokens; the editor content area does not

Grep of `src/renderer/**/*.css` for `--ame-`:
- **Uses tokens**: `App.css` (app container, sidebar, resize handle),
  `chrome/chrome.css` (header bar, icon buttons, hamburger menus),
  `chrome/settings.css` (settings dialog), `tabs/tabs.css` (tab strip),
  `status/status.css` (status footer).
- **Uses literal colors only**: `explorer/Tree.css` (tree rows, context menu,
  rename input) and `editor/editor.css` (source view, empty state). Crepe's own
  styles are its imported light `classic.css`.

So overriding the `--ame-*` block under `.app-container[data-theme='dark']` retints
every chrome surface in one place, and the FR-010 boundary (editor content area,
source view) is naturally preserved because those stylesheets never reference the
tokens. `Tree.css` is the one chrome stylesheet that must be tokenized so the
sidebar stays readable in dark mode.
