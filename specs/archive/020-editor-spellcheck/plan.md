# Implementation Plan: Editor Spellcheck

**Branch**: `phase-020-editor-spellcheck` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-editor-spellcheck/spec.md`

## Summary

The WYSIWYG editor gets a **JS whole-document spellchecker** (2026-08-07): a
renderer-side `nspell` engine with bundled en-GB/en-US Hunspell dictionaries
checks the entire document on open and re-checks (debounced) as the user types.
Misspelled words get a wavy-red underline (`ame-spelling-error` decoration,
FR-001/FR-007); right-clicking one opens the app's own correction menu with
suggestions that replace the word in place (FR-002/FR-003); an "Add to
dictionary" item teaches a persistent personal dictionary so the word is never
flagged again (FR-004/FR-005); and a Settings toggle + language selector turn
the feature on/off and pick the dictionary, persisting across restarts with a
default of on (FR-006/FR-009).

The source view keeps the platform's native spellchecker (a plain textarea
where it works well), with its language driven by the same setting. The
WYSIWYG is fully JS — offline, deterministic, and able to flag existing errors
on open, which the native engine could not (research R9 supersedes R1–R4 for
the WYSIWYG).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: `nspell` (Hunspell core in JS) + the en-GB/en-US
Hunspell dictionaries from the `dictionaries` project (MIT), bundled as assets.
Electron's session spellchecker is retained for the source view only.

**Storage**: unchanged — settings in `appData/ame/config.json` (new
`spellcheckEnabled` boolean, `spellcheckLanguage`); the personal dictionary is
a `spellcheckDictionary` array in the same config file, read/written by main
and loaded into the renderer's checker via two new IPC channels.

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

**JS whole-document engine (Phase 8, 2026-08-07, supersedes the native WYSIWYG
design below).** The WYSIWYG editor is spellchecked by `nspell` in the renderer
with the en-GB/en-US dictionaries bundled as assets. A ProseMirror plugin
(`spellcheckPlugin.ts`) marks misspelled ranges with `ame-spelling-error`
decorations, re-checking the whole document on open and (debounced 250 ms) after
each edit; the shared runtime (`spellcheckRuntime.ts`) holds enabled/language/
custom-words and notifies editors to re-run on any change. Right-clicking a
marked word opens the app's own DOM correction menu (`SpellingMenu.tsx`); the
custom dictionary persists via two new named IPC channels
(`spellcheck:getWords`/`spellcheck:addWord`) into a `spellcheckDictionary`
array in the shared config. The source view keeps the native spellchecker.
(Native-engine decisions R1–R4 remain true for the source view only.)

**Settings: one new persisted boolean + language.** `Settings.spellcheckEnabled`
defaults to `true` (FR-006); `spellcheckLanguage` (`en-GB`/`en-US`/`null`)
selects the bundled dictionary. Both flow through the existing validated store
(`settingsFile.ts`), the existing settings channels, and immediate-apply
controls in the Settings dialog (US4 S1). The `settings:update` handler keeps
the session spellchecker in sync for the source view.

**Editor wiring.** `useSettingsState` exposes the spellcheck settings; `App`
syncs them into the shared runtime, loads the custom dictionary on startup,
renders the correction menu, and passes `onSpellingMenu` through `EditorPanel`
to `CrepeHost`, which registers the spellcheck plugin and disables the native
spellcheck attribute on the contenteditable (to avoid double underlines).

**Test isolation.** `src/main/index.ts` applies `app.setPath('userData', …)`
from `AME_USER_DATA_DIR` at module load (R6), so the e2e suite uses an isolated
Chromium profile per test. The JS-engine e2e drives the real DOM directly
(`.ame-spelling-error` marks + the `[data-testid="spelling-menu"]`), so no
main-process capture hooks are needed.

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
└── ipc-contract.ts            # spellcheckEnabled + spellcheckLanguage + spellcheck IPC methods

src/main/
├── spellcheck.ts              # applySpellcheckSetting(enabled, language) — session (source view)
├── contextMenu.ts             # native correction menu for the source view textarea
├── spellcheckDictionary.ts    # NEW: custom-dictionary store in the shared config
├── ipc/handlers/spellcheck.ts # NEW: spellcheck:getWords / spellcheck:addWord
├── settingsFile.ts            # + spellcheckEnabled/spellcheckLanguage in DEFAULTS/validate/merge/migrate
├── ipc/handlers/settings.ts   # apply the setting on every settings:update
└── index.ts                   # AME_USER_DATA_DIR seam + startup apply + register handler

src/renderer/
├── assets/dictionaries/       # NEW: en-gb/en-us .aff/.dic (nspell, `?raw` imported)
├── domain/spellcheck.ts       # NEW: pure nspell wrapper — tokenizer + findMisspellings
├── editor/spellcheckRuntime.ts# NEW: shared runtime (enabled/language/custom words) + change listeners
├── editor/spellcheckPlugin.ts # NEW: ProseMirror plugin — decorations + correction menu
├── editor/SpellingMenu.tsx    # NEW: the DOM correction menu
├── state/settings.ts          # + spellcheckEnabled/spellcheckLanguage defaults
├── hooks/useSettingsState.ts  # + spellcheck settings + handlers
├── chrome/SettingsDialog.tsx  # + "Check spelling while typing" checkbox + language select
├── chrome/settings.css        # checkbox + select rows
├── App.tsx                    # runtime sync, custom-dictionary load, correction menu
├── editor/EditorPanel.tsx     # + onSpellingMenu → CrepeHost; spellcheckEnabled → SourceView
├── editor/CrepeHost.tsx       # registers the spellcheck plugin; disables native markers
└── editor/SourceView.tsx      # textarea spellCheck (native, source view)

tests/
├── main/
│   ├── spellcheckDictionary.test.ts  # NEW: store unit tests
│   └── settings.test.ts       # + spellcheckEnabled/spellcheckLanguage load/merge/migrate cases
├── renderer/
│   ├── spellcheck.test.ts     # NEW: findMisspellings unit tests (both dictionaries)
│   └── useSettingsState.test.tsx  # + spellcheck handler cases
└── e2e/
    ├── launch.ts              # launchApp(..., userDataDir) via AME_USER_DATA_DIR
    └── spellcheck.spec.ts     # NEW: whole-document + corrections + dictionary + toggle + language
```

**Structure decision**: the JS spellchecker is renderer-owned (pure domain
module + ProseMirror plugin + DOM menu), with only the persisted custom
dictionary crossing to main through two named IPC channels. The main native
spellcheck code remains solely for the source view.

## Phase status

- Phase 1: Setup — branch, launch seam, test fixtures
- Phase 2: Foundational — settings field + spellcheckMenu pure module + unit tests
- Phase 3: US1 — native highlight (enable spellchecker + spellcheck attribute)
- Phase 4: US2 — native correction context menu (suggestions + replace)
- Phase 5: US3 — add to dictionary (persistent, native)
- Phase 6: US4 — settings toggle (immediate apply + persistence)
- Phase 7: Polish — lint, typecheck, unit + e2e, spec archive, PR
- Phase 8 (2026-08-07): JS whole-document engine — replaces the native WYSIWYG
  spellchecker with nspell + bundled dictionaries, the decoration plugin, the
  custom correction menu, and the persisted custom dictionary (research R9);
  the source view keeps native spellchecking.

## Deferred / later features

- Additional spellcheck languages beyond English (UK/US) — the mechanism
  (bundled dictionary + closed union) is in place; extending it is a
  copy-the-assets + one-line change (2026-08-07)
- A dedicated "learned words" management UI (currently the custom dictionary
  only grows via the correction menu)
- A non-spelling right-click edit menu (Cut/Copy/Paste) — out of scope; the app
  currently has no such menu

## Complexity tracking

No constitution violations. The WYSIWYG now runs a full-document check in the
renderer; it is debounced (250 ms after typing stops) and the dictionaries are
bundled assets, so nothing runs on the keystroke path and the app stays
offline/deterministic.
