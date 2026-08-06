# Research: Settings Dialog

Evidence behind the design decisions in `plan.md` for `012-settings-dialog`.

## R1 — Where the MRU config file lives (FR-002)

The Recent Items feature (spec 004) stores its list in
`config.json` at `app.getPath('appData')/ame` — on Linux `~/.config/ame/config.json`
(FR-004), on macOS `~/Library/Application Support/ame/config.json`, on Windows
`%APPDATA%\ame\config.json` (`src/main/recentItemsPath.ts`). The file shape is
`{ recentItems: RecentItem[] }`, written atomically (temp + rename) by
`saveRecentItems`.

Settings (spec 010) currently live in a **different** file: `settings.json` at
`app.getPath('userData')` (`src/main/settings.ts`). On Windows `userData` is
`%APPDATA%\<appName>`, distinct from `%APPDATA%\ame`. So today settings and
recent items are in different files.

FR-002 requires the settings dialog to store its settings in the **same
per-user configuration file** as the recent-items list. Decision: consolidate —
`config.json` becomes `{ recentItems?, settings? }`. Both stores read-modify-
write so saving one never clobbers the other. This is recorded as a complexity
item in plan.md (it touches spec-010 settings code and spec-004 recentItems
save) because FR-002 is explicit.

**Migration**: existing installs have `userData/settings.json` with
`sidebarWidth`/`themeOverride`/`explorerVisible`. On first `loadSettings()`,
if `config.json` has no `.settings` key and a legacy file exists, its values are
imported into `config.json` once. Best-effort; a failure falls through to
defaults (FR-009).

## R2 — Font faces: sans-serif and serif (FR-004, spec Assumption)

The spec Assumption says the concrete faces "will be selected during planning
from freely distributable fonts already available to the application."

- **Sans-serif**: the editor already renders in `Inter`, bundled locally via
  `@fontsource/inter` (OFL-1.1) and referenced through Crepe's CSS variables
  `--crepe-font-default` / `--crepe-font-title` in `src/renderer/App.css`.
  Keep Inter.
- **Serif**: no serif is bundled. Rather than add a new `@fontsource` package,
  use a **system serif stack** — `Georgia, 'Times New Roman', 'Noto Serif',
  serif` — which is freely distributable, already present on all target OSes,
  and requires no new dependency (constitution: prefer platform fonts). If the
  user later wants a bundled serif (e.g. `@fontsource/lora`), it is a one-line
  change to the same CSS variable.

Both faces are applied by overriding Crepe's font CSS variables on `.milkdown`
keyed off a `data-editor-font` attribute on the app container. This is the
mechanism Crepe already uses for its default Inter, so it is a CSS-only change
— no editor API surface is touched (Plan IV, no keystroke-path work).

## R3 — Keyboard accessibility of the dialog (FR-007)

The dialog must be openable, navigable, and closable via keyboard. It follows
the pattern established by the spec-010 hamburger (React UI, real buttons,
visible focus rings):

- **Openable**: the hamburger `Settings…` item is a real
  `<button role="menuitem">` (already Enter/Space-activatable, FR-009 of spec
  010), wired through the shared command-bus pattern to open the dialog.
- **Navigable**: native `<input type="radio">` elements inside a `<fieldset>`
  give arrow-key selection for free (WCAG radio-group semantics) and are
  focusable/Tab-reachable.
- **Closable**: Escape and a Close button both close it; focus returns to the
  hamburger trigger. A focus trap keeps Tab cycling inside the modal.

Modal semantics: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
heading. Single instance: opening while open is a no-op (spec edge case).

## Rejected alternatives

| Alternative | Rejected because |
|-------------|------------------|
| Keep settings in `userData/settings.json` | Violates FR-002 (settings must share the recent-items config file) |
| A second settings file in the same directory as `config.json` | Still not "the same configuration file"; FR-002 names the file the MRU list uses |
| Bundle a serif font (`@fontsource/lora` etc.) | Unnecessary dependency; system serif stack is freely distributable and already available |
| OS-native settings window (`dialog.showMessageBox` / `BrowserWindow`) | Contradicts the spec-010 precedent (renderer React UI for app chrome) and adds IPC surface |
