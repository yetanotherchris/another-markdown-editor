# Implementation Plan: Settings Dialog

**Branch**: `012-settings-dialog` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-settings-dialog/spec.md`

## Summary

Add a **settings dialog** to the application, reachable from the hamburger
(which replaced the native menu in spec 010 and IS the "main menu" of this app).
Its first — and, for this feature, only — setting is the **editor font-family**
choice between **sans-serif** and **serif** (FR-003/FR-004), applied to the
document editing surface (FR-005) and persisted across restarts (FR-006).

The dialog is a renderer React modal (consistent with spec 010's hamburger
decision — a React UI, not an OS-native window), keyboard-accessible
(FR-007), and non-destructive (FR-008 — it never touches the document session).

**The defining decision**: FR-002 requires settings to be stored in the **same
per-user configuration file** as the recent-items (MRU) list — `config.json` at
`app.getPath('appData')/ame` (the Recent Items location from spec 004; on Linux
`~/.config/ame/config.json`). Today settings live in a **separate**
`userData/settings.json` (spec 010). This feature **consolidates** settings into
`config.json` alongside `recentItems`, with a **one-time migration** of any
existing values from the legacy `settings.json`, so no user preference is lost.

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: No new runtime dependencies. Sans-serif = **Inter**
(already bundled via `@fontsource/inter`); serif = a **system serif stack**
(`Georgia, 'Times New Roman', 'Noto Serif', serif`) — freely distributable,
already available, no font to bundle (constitution: prefer platform fonts over
new dependencies). The React modal uses only existing `@heroicons/react` icons
(already a dependency).

**Storage**: `config.json` at `app.getPath('appData')/ame/config.json` — the
exact file the MRU list uses (`recentItemsConfigPath`). Shape becomes
`{ recentItems?: RecentItem[], settings?: Settings }`. Both stores
read-modify-write so neither clobbers the other. `AME_CONFIG_DIR` remains the
test seam and now points BOTH settings and recent items at the same
`<dir>/config.json`.

**Testing**: Vitest 4 (node for `tests/main`, jsdom for `tests/renderer`);
Playwright e2e via `npm run test:e2e`. New unit tests: settings editorFont
default/validation, the shared-file read-modify-write (settings + recentItems
coexist), and the legacy migration. New e2e suite `tests/e2e/settings.spec.ts`.
`tests/e2e/chrome.spec.ts` assertions that read `settings.json` directly are
updated to read `config.json` → `.settings`.

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: Nothing on the keystroke path. The dialog opens on click;
the font change is one CSS re-render; settings persist through the existing
500 ms debounced `saveSettings`.

**Constraints**: Renderer sandboxed (no Node); all disk I/O in main. The preload
API is unchanged — `getSettings`/`updateSettings` already exist. `editorFont`
is validated in main as a closed `'sans-serif' | 'serif'` union (never
arbitrary text, so no CSS injection). No save/close/quit decision changes
(Principle III): the dialog never touches document state, so dirty flags and
open documents are untouched (FR-008).

**Scale/Scope**: One new setting, one settings dialog, one storage-consolidation
refactor of the existing `settingsFile`/`settings` modules, a one-time migration,
and a hamburger entry. Out of scope: additional settings, custom font upload,
font size/line-height (spec Assumptions), and the source view's monospace face
(decision, below).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | The dialog is renderer React; settings I/O stays in main via the existing named `getSettings`/`updateSettings` operations. No new IPC channel, no generic `invoke`, no `fs` in the renderer | **PASS** |
| II. Every Path Is Untrusted | `editorFont` is validated in main as a closed union before save; settings load tolerates malformed JSON per-field; no path crosses the IPC for this feature | **PASS** |
| III. Never Lose The User's Words | The dialog never touches documents or dirty state (FR-008, e2e-verified). Settings consolidation migrates legacy `settings.json` values so preferences are not silently discarded | **PASS** |
| IV. Calm, Predictable Editing | The font applies instantly via CSS variables; no work on the keystroke path; the modal opens on click and closes on Escape/Close without stealing editor focus when dismissed | **PASS** |
| V. Test What Can Corrupt Or Escape | Unit tests pin the shared-file round-trip (settings and recentItems survive each other's writes), the malformed-config tolerance, the editorFont validation, and the migration; e2e covers the dialog, persistence across restart, and the dirty-doc non-interference | **PASS** |

## Phase 1 Design decisions

**Storage consolidation (`src/main/settingsFile.ts`, `src/main/settings.ts`,
`src/main/recentItems.ts`)** — settings move into the MRU config file:

- `config.json` shape: `{ recentItems?: RecentItem[], settings?: Settings }`.
- `loadSettingsFile(filePath)` reads the file, extracts `.settings`, and
  validates **each field individually** (missing/malformed config → defaults,
  FR-009; a partially-corrupt file keeps every recoverable value — the existing
  field-by-field pattern). Returns a complete `Settings`.
- `writeSettingsFile(filePath, settings)` **read-modify-write**: loads the
  current config (tolerant → `{}`), merges `.settings`, writes back — so saving
  settings never clobbers `recentItems`.
- `saveRecentItems(filePath, items)` is updated to **read-modify-write**
  likewise (preserves `.settings`). `loadRecentItems` already reads `.recentItems`
  via `normalizeRecentItems`, so it needs no change.
- `settingsPath()` in `src/main/settings.ts` now returns the **same path as
  `recentItemsConfigPath()`** (`appData/ame/config.json`, honoring
  `AME_CONFIG_DIR`), instead of `userData/settings.json`.
- **One-time migration**: on `loadSettings()`, if `config.json` has no
  `.settings` key and the legacy `userData/settings.json` (or
  `AME_CONFIG_DIR/settings.json`) exists with a valid Settings object, import
  its values into `config.json` and stop reading the legacy file. Best-effort —
  a failure falls through to defaults (FR-009). Recorded as a plan decision
  (legacy data is not user documents, but silently dropping persisted
  theme/explorer preferences would be a regression).

**Settings model (`src/shared/ipc-contract.ts`)** — `Settings` gains
`editorFont: 'sans-serif' | 'serif'` (default `'sans-serif'`). Updated in
`src/main/settingsFile.ts` (DEFAULTS + validation), `src/main/ipc/handlers.ts`
(`settings:get` fallback literal and the `settings:update` merge), and
`src/renderer/state/settings.ts` (renderer defaults).

**Font application (`src/renderer/App.tsx`, `src/renderer/App.css`)** — the app
container gets `data-editor-font={editorFont}`. CSS overrides Crepe's font CSS
variables on `.milkdown`:

```css
[data-editor-font='serif'] .milkdown {
  --crepe-font-default: Georgia, 'Times New Roman', 'Noto Serif', serif;
  --crepe-font-title:  Georgia, 'Times New Roman', 'Noto Serif', serif;
}
```

The default (sans-serif) keeps the existing Inter stack (unchanged). App state:
`const [editorFont, setEditorFont] = useState(getSettings().editorFont)`, synced
after `loadSettingsFromMain()` resolves, and updated by the dialog. The source
view keeps its deliberate monospace face (decision below) — it is a raw-text
inspection surface, not the WYSIWYG editing surface.

**Settings dialog (`src/renderer/chrome/SettingsDialog.tsx`)** — a React modal:
`role="dialog"`, `aria-modal="true"`, `aria-labelledby`; focus moves into the
dialog on open, Tab cycles within it, **Escape** and the **Close** button close
it, and focus returns to the hamburger trigger. The first (only) setting is
**Editor Font** with two radio options — Sans-serif and Serif — navigable with
arrow keys (native radios). Selecting an option applies it **immediately**
(spec edge: apply-immediately model) and persists through
`updateSettings({ editorFont })` + `window.api.updateSettings(...)`. A second
open while it is open is a no-op (single instance, spec edge — the hamburger
closes on select, so the modal is the only instance).

**Hamburger entry (`src/renderer/chrome/menuModel.ts`,
`src/renderer/chrome/HamburgerMenu.tsx`)** — the hamburger menu gains a
`Settings…` action item (FR-001: reachable from the "main menu"). `HamburgerAction`
gains `'settings'`; `HamburgerMenu` gains an `onOpenSettings` callback prop.
Placement: after `Toggle Developer Tools`, before `Quit`.

## Project Structure

### Documentation (this feature)

```text
specs/012-settings-dialog/
├── spec.md              # Requirements (FR-001…FR-009, US1–US4, edge cases)
├── plan.md              # This file
├── research.md          # R1…R3 evidence (config location, font choice, modal a11y)
├── data-model.md        # Settings + config.json shape + dialog state
├── quickstart.md        # Manual per-OS verification script
├── contracts/
│   └── renderer.md      # Settings field, config shape, dialog aria contract, e2e helpers
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/
└── ipc-contract.ts              # MODIFY: Settings.editorFont (default 'sans-serif')

src/main/
├── settingsFile.ts              # MODIFY: read `.settings` key, field-by-field validation
│                                #   (+ editorFont), read-modify-write preserving recentItems
├── settings.ts                  # MODIFY: settingsPath() = recentItemsConfigPath();
│                                #   one-time migration from legacy settings.json
└── recentItems.ts               # MODIFY: saveRecentItems read-modify-write (preserve .settings)
└── ipc/handlers.ts              # MODIFY: settings:get fallback + settings:update merge include editorFont

src/preload/index.ts             # UNCHANGED (getSettings/updateSettings already exposed)

src/renderer/
├── App.tsx                      # MODIFY: editorFont state + data-editor-font attr + dialog mount
├── App.css                      # MODIFY: serif CSS variable override for .milkdown; dialog styles
├── chrome/menuModel.ts          # MODIFY: Settings… action item
├── chrome/HamburgerMenu.tsx     # MODIFY: onOpenSettings prop + action dispatch
└── chrome/SettingsDialog.tsx    # NEW: keyboard-accessible modal (radio group + Close)
```

```text
tests/
├── main/settings.test.ts        # MODIFY: editorFont default/validation; shared-file round-trip;
│                                #   legacy migration; recentItems/settings coexistence
├── renderer/menuModel.test.ts   # MODIFY: Settings… item present and dispatched
└── e2e/
    ├── launch.ts                # MODIFY (if needed): settings helpers
    ├── chrome.spec.ts           # MODIFY: settings.json reads → config.json → .settings
    └── settings.spec.ts         # NEW: dialog open, font change applied, restart persistence,
                                 #   keyboard access, dirty-doc non-interference, malformed config
```

**Structure decision**: settings persistence is a main-process concern (the
shared `config.json`); the dialog and font rendering are renderer concerns.
The preload surface is untouched because `getSettings`/`updateSettings` already
exist — this feature adds no new IPC, which keeps Principle I's audit surface
flat.

## Phase status

- Phase 1: Setup — green baseline on `012-settings-dialog` (created from clean
  `main` per AGENTS.md)
- Phase 2: Foundational — `Settings.editorFont` (contract + main + renderer);
  storage consolidation (shared-file read-modify-write) + legacy migration +
  unit tests
- Phase 3: US1 — hamburger `Settings…` item + the SettingsDialog modal
  (keyboard-accessible radio group)
- Phase 4: US2 — editorFont applied to the editing surface via CSS variables;
  apply-immediately persistence
- Phase 5: US3 — restart persistence verified in e2e
- Phase 6: US4 — dirty-doc non-interference + malformed/missing-config tolerance
  e2e
- Phase 7: Polish — update `chrome.spec.ts` config reads, quickstart manual
  pass, final four-command gate

## Deferred / later features

- Additional settings (the dialog is structured to hold more than one).
- Custom font upload, font size, line height (spec Assumptions: out of scope).
- Applying the font to the source view's monospace face — the spec Assumptions
  say the font applies to "the WYSIWYG editor and source view, *if applicable*";
  the source view is a deliberate monospace raw-text surface, so the serif/sans
  choice does not change it (decision, complexity table).
- The `themeOverride` setting stays stored but is still not applied by the chrome
  (spec 013, out of scope here).

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Consolidating settings into the MRU `config.json` (touches spec-010 settings code and spec-004 recentItems save) | FR-002 is explicit: settings MUST live in the same per-user configuration file as the recent-items list. The existing `settings.json` is a separate file at a different path | Keeping settings in `userData/settings.json` (violates FR-002's explicit shared-file requirement) or a second file in the same directory (still not "the same configuration file") |
| One-time migration from the legacy `settings.json` | Existing installs (spec 010) persist `sidebarWidth`/`themeOverride`/`explorerVisible` there; moving storage without a migration silently discards those preferences | Starting from defaults on upgrade (drops persisted user preferences; cheap to migrate, so no reason not to) |
| Source view keeps its monospace face | The spec Assumptions apply the font to "the WYSIWYG editor and source view, *if applicable*"; raw markdown source is conventionally monospace and is a separate inspection surface | Changing the source textarea to the selected serif/sans face (visually noisy for raw text; the spec's "if applicable" grants the latitude) |
| The Crepe top bar keeps the sans-serif Inter face | The toolbar is editor **chrome**, not the editing surface; the spec's Assumptions scope the font change to "the document editing surface … not the surrounding UI chrome" (user decision 2026-08-06) | Letting the serif override leak into the toolbar via Crepe's `--crepe-font-default` (the heading selector re-applies it — verified in `top-bar.css`) |

*(Superseded by the code-review round below: settings writes were originally
recorded as intentionally non-atomic. Review #27 M1/M2 showed the settings
writer now shares the file holding the MRU list, so a plain `writeFileSync`
could truncate it on a crash or create it world-readable; `writeSettingsFile`
now routes through `atomicWrite(…, 0o600)` with `mkdirSync` first.)*

## Decision log

### 2026-08-06

- **Shared config file**: settings move into `config.json` (the MRU file).
  `config.json` becomes `{ recentItems?, settings? }`; both stores
  read-modify-write. `AME_CONFIG_DIR` now points both at
  `<dir>/config.json`. Legacy `settings.json` values are migrated once.
- **Font faces**: sans-serif = bundled Inter (unchanged); serif = system stack
  (`Georgia, 'Times New Roman', 'Noto Serif', serif`). No new dependency;
  freely distributable and already available on all target platforms.
- **Dialog interaction model**: apply-immediately on radio selection (spec edge
  allows this; no Save/Cancel pair needed for a single setting).
- **Dialog is a React modal**, matching spec 010's React-UI precedent for the
  hamburger; it is not an OS-native window.
- **The toolbar stays sans-serif** (user decision 2026-08-06): the font choice
  applies to the editing surface only. Crepe's top-bar heading selector
  re-applies `--crepe-font-default` (verified in `top-bar.css`), so the
  `--crepe-font-default`/`font-family` pair is re-declared to the Inter stack
  within the `.milkdown-top-bar` scope when the editor font is serif. The e2e
  suite asserts the toolbar's resolved font stays Inter while the document is
  serif.
- **`settings:get` fallback literal** in handlers.ts is updated to include
  `editorFont` so a settings-read failure still returns a complete `Settings`.

### 2026-08-06 (code-review round)

- **Authoritative in-memory settings + `updateSettings` merge** (review #27
  HIGH): `settings:update` used to rebuild its snapshot from a disk read, so
  two updates inside the 500 ms debounce window clobbered each other (e.g. a
  Serif choice followed within 500 ms by a sidebar resize reverted the font).
  `src/main/settings.ts` now keeps an in-memory `currentSettings` seeded once
  from disk; every merge goes through `mergeSettingsPatch` (pure,
  electron-free, unit-tested in settingsFile.ts) and the debounced write always
  persists the merged snapshot. The handler no longer duplicates the merge.
- **`writeSettingsFile` is atomic + `0o600` + mkdir** (review #27 M1/M2, #2):
  settings share the file holding the MRU list of absolute paths, so the
  settings writer must not be able to truncate it on a crash or leave it
  world-readable when it creates the `ame` directory on a fresh profile.
  Routed through `atomicWrite(…, 0o600)` with `mkdirSync` first.
- **Quit flush** (review #27 L1/#5): `flushSettings()` drains the debounced
  write in `window-all-closed` so a font change survives a fast quit (FR-006).
- **Focus return + focus-trap gap** (review #27 #3/#8): the dialog remembers
  the previously-focused element and restores focus on unmount; Tab now also
  pulls focus back in when it has strayed outside the dialog.
- **Migration gate widened** (review #27 #7): a legacy file with any known
  Settings key is imported (not just ones carrying `sidebarWidth`).
- **Malformed-config e2e made non-vacuous** (review #27 #4): the old test
  opened a folder first, whose recent-item write repaired the malformed file
  before the dialog read it; it now opens the dialog directly and asserts the
  malformed file is untouched.
