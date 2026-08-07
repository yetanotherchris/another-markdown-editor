# Contract: Editor Spellcheck

**Feature**: 020-editor-spellcheck | **Date**: 2026-08-07

## Scope

The IPC surface is **unchanged** except for one new boolean on the existing
`Settings` type. No new channels, no preload additions, no `OpenedFile`/
`writeFile` changes (research R-Process).

## Settings contract — `src/shared/ipc-contract.ts`

```ts
export type SpellcheckLanguage = 'en-GB' | 'en-US'

export interface Settings {
  // …existing fields…
  /** Spec 020 FR-006/FR-009: whether the native spellchecker is enabled.
   *  Defaults to true. Persisted via the existing settings store. */
  spellcheckEnabled: boolean
  /** Spec 020 (2026-08-07): the explicit spellchecker language, or `null`
   *  for the platform/system default. A closed union. */
  spellcheckLanguage: SpellcheckLanguage | null
}
```

`settingsFile.ts` validation/merge/migration contract (spec 012 precedent):
- Default `true` (FR-006).
- A non-boolean value loads/merges as the current default (`true`) — never
  arbitrary text.
- `spellcheckLanguage` defaults to `null` (system default); only `en-GB`,
  `en-US`, or `null` load/merge — never arbitrary text.
- Legacy migration: a pre-020 config without the fields inherits the defaults
  (`true`, `null`).

## Pure main contract — `src/main/spellcheckMenu.ts`

```ts
export interface SpellcheckMenuAction {
  kind: 'suggestion' | 'add-to-dictionary'
  /** The menu label: the suggestion text, or `Add "<word>" to Dictionary`. */
  label: string
  /** The flagged word (from context-menu params). */
  word: string
  /** Present only when kind === 'suggestion': the correction to apply. */
  suggestion?: string
}

/** Build the correction-menu actions for a context-menu event. Empty when no
 *  word is flagged (no menu is shown — FR-008 is about not *suppressing*). */
export function spellcheckMenuActions(params: {
  misspelledWord: string
  dictionarySuggestions: string[]
}): SpellcheckMenuAction[]
```

Behaviour contract:
- `params.misspelledWord` empty → `[]` (no menu).
- Otherwise: up to **5** `suggestion` actions (one per dictionary suggestion, in
  suggestion order), followed by one `add-to-dictionary` action. An empty
  suggestion list still yields the add-to-dictionary action.

## Main wiring contract — `src/main/spellcheck.ts`, `src/main/contextMenu.ts`

```ts
export function applySpellcheckSetting(enabled: boolean): void
// session.defaultSession.setSpellCheckerEnabled(enabled) — the whole toggle.

export function registerSpellcheckContextMenu(window: BrowserWindow): void
```

- `registerSpellcheckContextMenu` listens on `window.webContents` for
  `context-menu`; for non-empty `spellcheckMenuActions(params)` it builds a
  native `Menu` and pops it up (FR-002/FR-008). No menu is built or shown
  otherwise.
- A `suggestion` item's click calls
  `window.webContents.replaceMisspelling(suggestion)` (FR-003). Verified to work
  in the ProseMirror editor and the source textarea (research R2).
- The `add-to-dictionary` item's click calls
  `session.defaultSession.addWordToSpellCheckerDictionary(word)` (FR-004).
  Persists natively across restarts (FR-005, research R3).

## Renderer contract

- `useSettingsState` exposes `spellcheckEnabled: boolean` and
  `handleSpellcheckChange(enabled: boolean)`, which persists through
  `updateSettings` + `window.api.updateSettings` (FR-009).
- `SettingsDialog` renders a "Spellcheck" group with a checkbox, applied
  immediately on change (US4 S1: markers vanish the moment the setting flips).
- `CrepeHost` sets `view.dom.spellcheck = spellcheckEnabled` at mount and on
  change; `SourceView` passes `spellCheck={spellcheckEnabled}` to its textarea
  (FR-007, research R5).

## Acceptance contract

The acceptance scenarios in `spec.md` US1–US4 are verified in
`tests/e2e/spellcheck.spec.ts` against the built app with the real native
spellchecker and an isolated Chromium profile (`AME_USER_DATA_DIR`):

- US1 — a misspelled word is flagged (context-menu params carry
  `misspelledWord`) and the `.ProseMirror` element has spellcheck enabled.
- US2 — the app's context-menu template lists the dictionary suggestions; invoking
  a suggestion's click handler replaces the word in the editor.
- US3 — "Add … to Dictionary" teaches the word; it is no longer flagged in the
  same session and survives an app restart.
- US4 — the settings checkbox flips `session.isSpellCheckerEnabled()` and the
  editor attributes immediately, persists in `config.json`, and a relaunch
  honours the persisted value.

The native re-enable limitation (already-rendered words are not re-flagged until
edited) is accepted and recorded in `spec.md` (clarification 2026-08-07);
US4 S2 is asserted on *new* typed words only.
