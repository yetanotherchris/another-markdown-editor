# Research: Editor Spellcheck

**Feature**: 020-editor-spellcheck | **Date**: 2026-08-07

Decisions are recorded R1…Rn in the order they were made. Each entry follows
Decision / Rationale / Alternatives. Every decision here was **verified
empirically** against the built app before the plan was written (AGENTS.md:
verify before asserting), by launching Electron in headless mode, enabling the
native spellchecker, typing misspelled words in the ProseMirror-based WYSIWYG
editor, and inspecting the `context-menu` event params, the built menu, and the
editor DOM.

## R1 — Use Electron's native spellchecker end to end (no new dependencies)

**Decision**: Spellchecking, highlighting, the correction context menu, and the
personal dictionary all come from Electron's built-in spellchecker. The renderer
never performs its own spelling analysis.

- Highlighting: Chromium draws the red squiggly underline automatically on
  editable elements (`contenteditable`, `textarea`) with spellcheck enabled.
- Context menu: the main process listens to
  `webContents.on('context-menu', (e, params) => …)`; `params.misspelledWord`
  and `params.dictionarySuggestions` carry the flagged word and its suggestions.
- Correction: a menu item's click calls `webContents.replaceMisspelling(suggestion)`
  — Electron's native "replace the spelling marker under the cursor" command.
- Dictionary: a menu item's click calls
  `session.defaultSession.addWordToSpellCheckerDictionary(word)`.
- Enable/disable: `session.defaultSession.setSpellCheckerEnabled(bool)`.

**Rationale**: The spec's assumptions name the platform native spellchecker and
native context menu explicitly. This adds zero dependencies (constitution:
"prefer the platform"), keeps all spellcheck logic in the main process (no new
renderer attack surface, Principle I), and matches the behaviour users expect
from every other Electron desktop editor.

**Alternatives considered**:
- A JS spellchecking library (e.g. `nspell` + hunspell dictionaries) in the
  renderer. Rejected: adds a heavyweight dependency and a new failure domain
  (dictionary data, parse cost on the keystroke path), and duplicates what the
  platform provides natively.
- A renderer-side context menu rendered in React. Rejected: the spec requires
  the platform-native context menu, and a custom React menu would need to track
  mouse positions and re-implement native menu semantics.

## R2 — Verified: the native spellchecker works headless and drives ProseMirror

**Decision**: Keep `replaceMisspelling` as the correction mechanism (no
renderer-side word replacement). Verified empirically (2026-08-07, headless
Electron 43 on Windows):

- A fresh profile initialises with `getSpellCheckerLanguages() === ['en-GB']`
  and flags "teh" → `misspelledWord: 'teh'`, `dictionarySuggestions: ['the']`
  immediately — no visible dictionary download or network wait.
- `webContents.replaceMisspelling('the')` replaces the marked word inside the
  ProseMirror contenteditable (`teh ` → `the `). ProseMirror observes and
  reconciles the native DOM mutation into its document.

**Rationale**: `replaceMisspelling` knows the exact spelling-marker range, so it
works identically in the WYSIWYG editor and the source-view `<textarea>` with
no position-tracking code in the renderer. A renderer-side replacement would
have to locate the misspelled word under the cursor from `context-menu` params
(which carry no DOM position), a fragile and ProseMirror-specific problem.

**Alternatives considered**: send the suggestion over IPC and replace in the
renderer (ProseMirror transaction / textarea string surgery). Rejected: no
reliable way to find the word under a right-click without coordinate maths, and
it duplicates a one-line native call.

## R3 — Verified: the personal dictionary persists across restarts

**Decision**: `addWordToSpellCheckerDictionary(word)` is the whole
"add to dictionary" feature. Verified empirically: a word added in one app
launch is no longer flagged in a later launch. Electron writes the custom
dictionary to the Chromium profile (`<userData>/Shared Dictionary`, a LevelDB)
and on Windows/macOS also the OS custom dictionary (electron.d.ts). No app-level
persistence, file, or IPC is needed; the dictionary survives restarts natively
(FR-005).

**Rationale**: Persistence is Chromium's job, already done and already shared
with the OS. Re-implementing a per-app dictionary file would fork a second
source of truth and add a save path (Principle III surface) for no benefit.

## R4 — Verified: toggle semantics, and the accepted re-enable limitation

**Decision**: The setting is applied by
`session.defaultSession.setSpellCheckerEnabled(enabled)` in the main process at
startup and again on every `settings:update`. Verified empirically:

- Disable → already-rendered markers disappear immediately and new words are
  not flagged (US4 S1).
- Re-enable → new words are flagged again (US4 S2).

**Native limitation (accepted by user decision 2026-08-07, recorded as a spec
clarification)**: words already rendered on screen when spellcheck is disabled
are NOT re-flagged when it is re-enabled, until the user edits them. Verified:
neither re-enabling the session nor toggling the element's `spellcheck`
attribute nor blur/focus re-marks existing text. Forcing an immediate re-check
would require remounting the editor (losing undo history and scroll, violating
Principle IV), so the native behaviour stands.

**Rationale**: The disable path must be immediate (US4 S1 — markers vanish the
instant the setting changes); that is native and free. The re-enable path's
"existing words re-mark on next edit" is a small, well-understood platform
behaviour that matches Chromium everywhere.

## R5 — The `spellcheck` attribute must be set explicitly in the renderer

**Decision**: The renderer reflects the setting onto the editable elements:

- `CrepeHost` sets `view.dom.spellcheck = enabled` on the ProseMirror element
  (its `spellcheck` attribute is absent by default — verified), at mount and on
  every setting change.
- `SourceView` sets `spellCheck={enabled}` on the `<textarea>`, replacing the
  hard-coded `spellCheck={false}` (the current source view disables it — verified).

**Rationale**: The session-level switch alone controls whether Chromium
performs spellchecking, but the per-element attribute is what the DOM reflects
and what makes the toggle observable and testable in the DOM. Setting both keeps
the two layers consistent so the toggle takes effect instantly in both views.

## R6 — Test isolation: a `userData` seam and real, deterministic spellcheck e2e

**Decision**: Two test seams, both `AME_*` env vars read in the main process
(mirroring the existing `AME_CONFIG_DIR`):

- `AME_USER_DATA_DIR`, applied at module load in `src/main/index.ts` via
  `app.setPath('userData', …)`. Isolates the Chromium profile (and therefore the
  spellcheck dictionary) per test, so the e2e suite never writes test words into
  the developer's real custom dictionary and the US3 restart test is
  deterministic.
- The e2e spec installs its own capture hooks in main via
  `electronApp.evaluate` — it registers a second `context-menu` listener that
  records `{ misspelledWord, dictionarySuggestions }`, and wraps
  `Menu.buildFromTemplate` to record the last template the app built (labels +
  click handlers). This drives the REAL app code path (type → native flag →
  app's context-menu handler → menu template) without any production seam, and
  lets a test invoke a menu item's `click` handler directly (native menus are
  not clickable from Playwright).

**Verified**: with an isolated `userData` dir, a fresh profile still flags
`teh` → `the` (no download wait), so the real-behaviour scenarios are
deterministic in CI on this stack. If the platform ever lacks a dictionary, the
spellchecker silently does nothing (spec edge case) and only the dictionary-
dependent assertions would fail — the setting/attribute/persistence assertions
do not depend on a dictionary at all.

**Known test side effect (found during implementation)**: `addWordToSpellCheckerDictionary`
also writes the OS custom dictionary on Windows/macOS, which the isolated
profile cannot contain. The US3 scenarios therefore use unique random letter
words (a fixed word would become permanently learned at the OS level after the
first run, and words containing digits are never flagged by Chromium), and the
spellcheck e2e helper re-types a fresh render until the word is flagged — a
word right-clicked before Chromium marks it stays unmarked, so re-right-clicking
alone can never flag it.

**Alternatives considered**:
- Reuse the shared `userData` and avoid the seam. Rejected: running the US3
  "add to dictionary" test would permanently pollute the developer's real
  OS/Chromium dictionary with test words, and restart-persistence assertions
  would be order-dependent.
- Stub the whole spellchecker in main. Rejected: the native behaviour is the
  feature; stubbing it would test nothing real. The actual menus and markers are
  exercised for real.

## R7 — Main-process module layout

**Decision**: Three small modules, matching the existing `src/main` split
(settings.ts is Electron-coupled, settingsFile.ts is pure):

- `src/main/spellcheck.ts` — `applySpellcheckSetting(enabled)` (the single
  session call). Electron-coupled.
- `src/main/spellcheckMenu.ts` — pure `spellcheckMenuActions(params)` returning
  a declarative action list (suggestions capped at 5 + "Add … to Dictionary"),
  unit-testable without Electron (mirrors `menuModel.ts` in the renderer).
- `src/main/contextMenu.ts` — `registerSpellcheckContextMenu(window)`: wires
  the `context-menu` event to `spellcheckMenuActions`, builds the native `Menu`,
  and binds click handlers to `replaceMisspelling` / `addWordToSpellCheckerDictionary`.

**Rationale**: The IPC surface is unchanged (Principle I) — the renderer sends
the setting through the existing `settings:update` channel and the correction
flow is entirely main↔Chromium, so there is no preload change and no new
channel to secure. The pure action-builder is the only unit-testable seam.

## R8 — Spellcheck language setting (added 2026-08-07)

**Decision**: A persisted `spellcheckLanguage: SpellcheckLanguage | null` setting
(`null` = system default) is applied in main via
`session.defaultSession.setSpellCheckerLanguages(language ? [language] : <system>)`.
The first apply captures the platform's own language list so "System default"
can restore it after a user has chosen an explicit language.

**Rationale**: A British-English writer whose OS dictionary is en-US gets every
correct British spelling (e.g. "behaviour", "colour") flagged as an error — the
observed complaint behind this change. The app previously used the platform
default unconditionally. The union is closed and validated (en-GB, en-US);
more languages are a one-line extension of the same mechanism.

**Verified**: `setSpellCheckerLanguages(['en-US'])` reflects in
`getSpellCheckerLanguages()` immediately (the getter is deterministic even
before a dictionary for that language finishes downloading; an unavailable
dictionary is the documented no-op case). Ordering gotcha: calling
`setSpellCheckerLanguages` after `setSpellCheckerEnabled(false)` implicitly
RE-ENABLES the spellchecker, so the enable flag must be written last (found and
fixed during the e2e run).

## R9 — The JS whole-document spellchecker (replaces the native WYSIWYG engine, 2026-08-07)

**Decision**: The WYSIWYG editor's spellchecking is now a JS engine in the
renderer: `nspell` (Hunspell core in plain JS) with the en-GB and en-US
dictionaries from the `dictionaries` project (MIT) checked in under
`src/renderer/assets/dictionaries/` and imported as Vite `?raw` assets. A
ProseMirror plugin (`spellcheckPlugin.ts`) walks the document, checks every
word (skipping code blocks/math), and applies `ame-spelling-error` inline
decorations (wavy-red underline). The right-click correction menu is the app's
own DOM menu (`SpellingMenu.tsx`); the custom dictionary persists in the shared
config via `spellcheck:getWords`/`spellcheck:addWord` IPC.

**Rationale**: The user requires true whole-document checking — misspellings
already in a file must be flagged when it opens, which the platform native
spellchecker cannot do (R2/R4: Chromium only scans text modified through user
input). A JS engine bundled into the app also makes spellchecking offline and
deterministic (no dictionary downloads), and makes the language setting fully
effective (the en-US dictionary is always present). This is the "bigger change"
the spec previously deferred; it supersedes the native as-you-type scope.

**Verified against the built app**: on open, existing misspellings are flagged;
typing flags new ones (debounced ~120 ms); toggling off clears all underlines
immediately and on restores them (a whole-document re-pass, unlike the native
engine); switching en-GB ↔ en-US immediately re-flags the British/American
words respectively; the correction menu replaces words and add-to-dictionary
persists across restarts.

**Source view stays native**: the plain-textarea source view keeps Chromium's
native spellchecker (language applied via the session), where it works well;
only the WYSIWYG editor is JS-checked.

## R-Process — two named IPC channels for the custom dictionary

**Decision**: The WYSIWYG spellchecker is fully renderer-owned (JS engine + DOM
menu), so the correction flow never crosses the boundary. The ONLY new IPC is a
fixed pair of named operations for the persisted custom dictionary:
`spellcheck:getWords` and `spellcheck:addWord` (no generic `invoke` escape
hatch, no path arguments — `addWord` validates a closed word charset in main).
The renderer's settings surface grows by `spellcheckEnabled` and
`spellcheckLanguage` on the existing `Settings` type.

**Rationale**: Principle I is preserved — nothing beyond two named dictionary
operations enters the renderer, and the renderer still has no Node/fs access
(the dictionaries are bundled assets).
