# Implementation Plan: Editor Spellcheck

**Branch**: `phase-020-editor-spellcheck` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-editor-spellcheck/spec.md`

## Summary

The WYSIWYG editor gets the platform's native spellchecker. Misspelled words
are underlined automatically as the user types (FR-001); right-clicking a
flagged word shows a native context menu with correction suggestions that
replace the word in place (FR-002/FR-003); a "Add … to Dictionary" item teaches
the persistent custom dictionary so the word is never flagged again
(FR-004/FR-005); and a Settings toggle turns the whole feature on and off,
persisting across restarts with a default of on (FR-006/FR-009). The source view
participates through the same native engine (FR-007). No rendering of menus or
squiggles is implemented by the app — Chromium and Electron provide them.

This is a main-process feature with a thin renderer bridge. All spellcheck
logic lives in `src/main` (enable/disable, context menu, replace, dictionary);
the renderer only persists the setting and reflects it onto the two editable
elements. No new IPC channel or preload method is added (research R-Process).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: Electron 43 (unchanged) — `session.setSpellCheckerEnabled`,
`webContents.replaceMisspelling`, `session.addWordToSpellCheckerDictionary`,
the `webContents` `context-menu` event, and `Menu`. No new runtime dependencies.

**Storage**: unchanged — settings in `appData/ame/config.json` (new
`spellcheckEnabled` boolean); the personal dictionary is Chromium's own
(`<userData>/Shared Dictionary`), persisted natively.

**Testing**: Vitest 4 (node project for `tests/main`, jsdom for
`tests/renderer`); Playwright via `npm run test:e2e` (build + launch), with a
new isolated-`userData` launch seam so dictionary state never leaks.

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: FR-010 / SC-005 — spellchecking runs entirely inside
Chromium off the JS thread; the renderer does no spelling work on the keystroke
path, so no typing-latency budget is consumed.

**Constraints**: Renderer sandboxed (no Node); the correction and dictionary
flows stay in main; the renderer never sees or sends path data for spellcheck;
the native context menu is never suppressed (FR-008).

**Scale/Scope**: Single window, ~10 open documents; one spelling engine, the
platform's default language (spec assumption).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | No new IPC channel, no preload change, no renderer access to the spellcheck surface; the renderer's only addition is a boolean `Settings` field through the existing `settings:update` channel | **PASS** — research R-Process |
| II. Every Path Is Untrusted | No paths are touched by this feature; spellcheck operates on focused-element content and the OS dictionary only | **PASS** |
| III. Never Lose The User's Words | Correction is a native word-for-word replace; a failed `replaceMisspelling` changes nothing. No save/dirty path is altered | **PASS** |
| IV. Calm, Predictable Editing | Nothing runs on the keystroke path in the app; Chromium's native spellchecker does the work off-thread. The accepted re-enable limitation avoids remounting the editor (undo/scroll preserved) | **PASS** — research R4 |
| V. Test What Can Corrupt Or Escape | Menu-template building is unit-tested; the full highlight/replace/dictionary/toggle flows get an e2e suite against the real native spellchecker, with isolated userData so tests never corrupt the developer's real dictionary | **PASS** — research R6 |

**Post-design re-check**: no principle is violated.

## Phase 1 Design decisions

**Native spellcheck end to end.** Highlighting, suggestions, replace, and the
personal dictionary all come from Electron/Chromium (R1). The main process
enables the spellchecker at startup and on setting changes (`spellcheck.ts`),
and owns the right-click correction menu (`contextMenu.ts` + the pure
`spellcheckMenu.ts`). The renderer never performs spelling analysis.

**Settings: one new persisted boolean.** `Settings.spellcheckEnabled` defaults
to `true` (FR-006). It flows through the existing validated store
(`settingsFile.ts` DEFAULTS/validate/merge/migrate + `state/settings.ts`),
the existing `settings:get`/`settings:update` channels, and a new immediate-apply
checkbox in the Settings dialog (US4 — markers vanish instantly on change,
S1). The `settings:update` handler applies the new value to the session before
returning, exactly like `applyThemeOverride` (spec 013 precedent).

**Editor wiring.** `useSettingsState` exposes `spellcheckEnabled` +
`handleSpellcheckChange`. `App` passes it to `SettingsDialog` and `EditorPanel`;
`EditorPanel` passes it to `CrepeHost` (sets `view.dom.spellcheck`, R5) and
`SourceView` (textarea `spellCheck`, replacing the hard-coded `false`, R5).

**Correction menu.** On `context-menu`, if `params.misspelledWord` is set, build
a native menu: up to 5 suggestion items (click → `webContents.replaceMisspelling`)
then a separator and "Add "<word>" to Dictionary" (click →
`session.defaultSession.addWordToSpellCheckerDictionary`). Otherwise show no
menu (FR-008: nothing is suppressed; the app simply has no other edit menu).
Verified: `replaceMisspelling` works inside ProseMirror and the textarea (R2).

**Test isolation.** `src/main/index.ts` applies `app.setPath('userData', …)`
from `AME_USER_DATA_DIR` at module load (R6), so the e2e suite uses an isolated
Chromium profile per test. The spellcheck e2e spec installs capture hooks via
`electronApp.evaluate` — a second `context-menu` listener and a
`Menu.buildFromTemplate` wrapper — to observe the real native flow and invoke
menu clicks deterministically (R6, R7).

## Project Structure

### Documentation (this feature)

```text
specs/020-editor-spellcheck/
├── spec.md              # Requirements (with 2026-08-07 clarification)
├── plan.md              # This file
├── research.md          # R1…R-Process decisions (all empirically verified)
├── data-model.md        # Settings.spellcheckEnabled + Personal Dictionary
├── quickstart.md        # Manual verification script
├── contracts/
│   └── spellcheck.md    # Behaviour contract + unchanged-IPC note
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/
└── ipc-contract.ts            # Settings.spellcheckEnabled: boolean (default true)

src/main/
├── spellcheck.ts              # NEW: applySpellcheckSetting(enabled)
├── spellcheckMenu.ts          # NEW: pure spellcheckMenuActions(params)
├── contextMenu.ts             # NEW: registerSpellcheckContextMenu(window)
├── settingsFile.ts            # + spellcheckEnabled in DEFAULTS/validate/merge/migrate
├── ipc/handlers/settings.ts   # apply the setting on every settings:update
└── index.ts                   # AME_USER_DATA_DIR seam + startup apply + register handler

src/renderer/
├── state/settings.ts          # + spellcheckEnabled default
├── hooks/useSettingsState.ts  # + spellcheckEnabled + handleSpellcheckChange
├── chrome/SettingsDialog.tsx  # + "Check spelling while typing" checkbox
├── chrome/settings.css        # checkbox rows (reuse .settings-radio pattern)
├── App.tsx                    # wire the new state through to dialog + editor
├── editor/EditorPanel.tsx     # + spellcheckEnabled prop → CrepeHost / SourceView
├── editor/CrepeHost.tsx       # + spellcheckEnabled → view.dom.spellcheck
└── editor/SourceView.tsx      # + spellcheckEnabled → textarea spellCheck

tests/
├── main/
│   ├── spellcheckMenu.test.ts # NEW: pure action-builder unit tests
│   └── settings.test.ts       # + spellcheckEnabled load/merge/migrate cases
├── renderer/
│   └── useSettingsState.test.tsx  # + spellcheck handler cases
└── e2e/
    ├── launch.ts              # launchApp(..., userDataDir) via AME_USER_DATA_DIR
    └── spellcheck.spec.ts     # NEW: US1–US4 acceptance scenarios
```

**Structure decision**: the spellcheck surface mirrors the app's existing
main/settings split (settings.ts Electron-coupled, settingsFile.ts pure) and
the renderer menuModel pattern. The pure action-builder lives beside the main
modules it feeds and is unit-tested without Electron.

## Phase status

- Phase 1: Setup — branch, launch seam, test fixtures
- Phase 2: Foundational — settings field + spellcheckMenu pure module + unit tests
- Phase 3: US1 — native highlight (enable spellchecker + spellcheck attribute)
- Phase 4: US2 — native correction context menu (suggestions + replace)
- Phase 5: US3 — add to dictionary (persistent, native)
- Phase 6: US4 — settings toggle (immediate apply + persistence)
- Phase 7: Polish — lint, typecheck, unit + e2e, spec archive, PR

## Deferred / later features

- Multi-language selection (spec assumption: platform default only)
- A dedicated "learned words" management UI (native OS dictionary is opaque)
- A non-spelling right-click edit menu (Cut/Copy/Paste) — out of scope; the app
  currently has no context menu, and FR-008 only forbids *suppressing* one

## Complexity tracking

No constitution violations. The one deliberate trade is the accepted native
re-enable limitation (R4, spec clarification 2026-08-07) — the simpler
alternative (remount the editor to force an immediate re-check) was rejected
because it resets undo history and scroll, contradicting Principle IV.
