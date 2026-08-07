/**
 * Pure, Electron-free menu-action builder for the spellcheck context menu
 * (spec 020, research R7). Mirrors the renderer's `menuModel.ts` pattern so the
 * mapping from a Chromium `context-menu` event's spelling params to menu items
 * is unit-testable without mocking Electron.
 */

export type SpellcheckMenuAction =
  | {
      kind: 'suggestion'
      /** The menu label: the suggestion text. */
      label: string
      /** The flagged word (from the context-menu params). */
      word: string
      /** The correction to apply. */
      suggestion: string
    }
  | {
      kind: 'add-to-dictionary'
      /** The menu label: `Add "<word>" to Dictionary`. */
      label: string
      /** The flagged word (from the context-menu params). */
      word: string
    }

/** Cap on suggestion items shown at once (FR-002: "one or more"). */
export const MAX_SUGGESTIONS = 5

/**
 * Build the correction-menu actions for a `context-menu` event. Returns `[]`
 * when no word is flagged — the caller then shows no menu (FR-008 forbids
 * suppressing the native menu, not omitting it when there is nothing to show).
 * An empty suggestion list still yields the add-to-dictionary action so a
 * flagged word can always be silenced (FR-004).
 */
export function spellcheckMenuActions(params: {
  misspelledWord: string
  dictionarySuggestions: string[]
}): SpellcheckMenuAction[] {
  const { misspelledWord, dictionarySuggestions } = params
  if (!misspelledWord) return []

  // Defensive: Chromium never reports empty/duplicate suggestions, but a stray
  // empty string would otherwise build a no-op `replaceMisspelling('')` item.
  const suggestions = [...new Set(dictionarySuggestions)].filter((s) => s.length > 0)

  const actions: SpellcheckMenuAction[] = suggestions
    .slice(0, MAX_SUGGESTIONS)
    .map((suggestion) => ({
      kind: 'suggestion' as const,
      label: suggestion,
      word: misspelledWord,
      suggestion
    }))

  actions.push({
    kind: 'add-to-dictionary',
    label: `Add "${misspelledWord}" to Dictionary`,
    word: misspelledWord
  })

  return actions
}
