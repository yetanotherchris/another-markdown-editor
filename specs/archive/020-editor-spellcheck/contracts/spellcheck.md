# Contract: Editor Spellcheck

**Feature**: 020-editor-spellcheck | **Date**: 2026-08-07

## Scope

The IPC surface gains two named channels for the persisted custom dictionary
(`spellcheck:getWords`, `spellcheck:addWord`); the settings field set grows by
`spellcheckLanguage`. The WYSIWYG spellchecker is a JS engine in the renderer
(research R9); the native session spellchecker is retained for the source view
only.

## Pure renderer contract — `src/renderer/domain/spellcheck.ts`

```ts
import type NSpell from 'nspell'
import type { SpellcheckLanguage } from '../../shared/ipc-contract'

export interface Misspelling { start: number; end: number; word: string }

export function resolveLanguage(language: SpellcheckLanguage | null): SpellcheckLanguage
export function getChecker(language: SpellcheckLanguage | null): NSpell
export function findMisspellings(text: string, checker: NSpell, customWords: ReadonlySet<string>): Misspelling[]
```

- Words are letters (any script), apostrophes and hyphens; pure numbers and
  punctuation never match.
- `customWords` holds lowercased user words; matches are skipped.
- `resolveLanguage(null)` picks en-US only when the platform language is
  en-US, otherwise en-GB.

## Spellcheck plugin contract — `src/renderer/editor/spellcheckPlugin.ts`

```ts
export function spellcheckPlugin(onMenu: (menu: SpellingMenuState | null) => void): Plugin
export function computeSpellcheckDecorations(view: EditorView): DecorationSet
```

- Marks every misspelled range with an `ame-spelling-error` inline decoration;
  code blocks and math are skipped. Re-checks the whole document on mount and
  (debounced 250 ms) after each edit and every runtime change.
- Right-clicking a marked word opens `SpellingMenuState` (word, up to 5 nspell
  suggestions, `apply(replacement)` → `insertText` transaction, `addToDictionary` →
  custom-words + `spellcheck:addWord`).

## Settings contract — `src/shared/ipc-contract.ts`

```ts
export type SpellcheckLanguage = 'en-GB' | 'en-US'
export interface Settings {
  // …
  spellcheckEnabled: boolean
  spellcheckLanguage: SpellcheckLanguage | null
}
```

`settingsFile.ts` validation/merge/migration contract: `spellcheckEnabled`
defaults `true` (boolean-only); `spellcheckLanguage` defaults `null` and only
accepts `en-GB`, `en-US`, or `null`. Legacy configs inherit both defaults.

## Custom dictionary IPC (main)

- `spellcheck:getWords` → `Result<string[]>`: the stored lowercased words.
- `spellcheck:addWord { word }` → `Result<string[]>`: validates the word
  (letters/apostrophes/hyphens, 1–64 chars), adds it, persists atomically to
  the shared config, returns the updated list.

## Source view (unchanged native surface)

`applySpellcheckSetting(enabled, language)` keeps the session spellchecker and
its language in sync for the source-view textarea; the native `context-menu`
handler still offers suggestions there.

## Acceptance contract

The acceptance scenarios in `spec.md` US1–US4 are verified in
`tests/e2e/spellcheck.spec.ts` against the built app, driving the real DOM
(`.ame-spelling-error` marks and the `[data-testid="spelling-menu"]`) with an
isolated config + Chromium profile:

- US1 — existing misspellings are flagged on open (whole-document) and a word
  typed into the editor is flagged as you type.
- US2 — right-clicking a marked word shows the correction menu; invoking a
  suggestion replaces the word; a correctly spelled word shows no menu.
- US3 — "Add to dictionary" unmarks the word immediately, persists in the
  config, and survives an app restart.
- US4 — the settings checkbox clears/restores every underline immediately;
  the language setting switches the en-GB ↔ en-US dictionaries and re-flags the
  British/American words accordingly.

