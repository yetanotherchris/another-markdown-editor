import { describe, it, expect } from 'vitest'
import { spellcheckMenuActions, MAX_SUGGESTIONS } from '../../src/main/spellcheckMenu'

/**
 * Spec 020 (contracts/spellcheck.md): the pure action-builder for the
 * spellcheck context menu. Empty when no word is flagged (no menu shown);
 * otherwise up to MAX_SUGGESTIONS suggestion actions followed by the
 * add-to-dictionary action.
 */
describe('spellcheckMenuActions (spec 020)', () => {
  it('returns no actions when no word is flagged (no menu shown)', () => {
    expect(spellcheckMenuActions({ misspelledWord: '', dictionarySuggestions: [] })).toEqual([])
  })

  it('maps each dictionary suggestion to a suggestion action', () => {
    const actions = spellcheckMenuActions({
      misspelledWord: 'recieve',
      dictionarySuggestions: ['receive', 'receives']
    })
    expect(actions).toEqual([
      { kind: 'suggestion', label: 'receive', word: 'recieve', suggestion: 'receive' },
      { kind: 'suggestion', label: 'receives', word: 'recieve', suggestion: 'receives' },
      { kind: 'add-to-dictionary', label: 'Add "recieve" to Dictionary', word: 'recieve' }
    ])
  })

  it('caps the suggestion list at MAX_SUGGESTIONS and keeps the add action', () => {
    const suggestions = Array.from({ length: 10 }, (_, i) => `s${i}`)
    const actions = spellcheckMenuActions({ misspelledWord: 'wurd', dictionarySuggestions: suggestions })
    expect(actions).toHaveLength(MAX_SUGGESTIONS + 1)
    expect(actions.slice(0, MAX_SUGGESTIONS).every((a) => a.kind === 'suggestion')).toBe(true)
    expect(actions[MAX_SUGGESTIONS]).toEqual({
      kind: 'add-to-dictionary', label: 'Add "wurd" to Dictionary', word: 'wurd'
    })
  })

  it('still offers add-to-dictionary when a flagged word has no suggestions', () => {
    const actions = spellcheckMenuActions({ misspelledWord: 'zqixkvmv', dictionarySuggestions: [] })
    expect(actions).toEqual([
      { kind: 'add-to-dictionary', label: 'Add "zqixkvmv" to Dictionary', word: 'zqixkvmv' }
    ])
  })

  it('quotes the flagged word in the add-to-dictionary label verbatim', () => {
    const actions = spellcheckMenuActions({ misspelledWord: 'teh', dictionarySuggestions: ['the'] })
    expect(actions[actions.length - 1].label).toBe('Add "teh" to Dictionary')
  })

  it('ignores empty and duplicate suggestions (defensive)', () => {
    const actions = spellcheckMenuActions({
      misspelledWord: 'wurd',
      dictionarySuggestions: ['', 'right', 'right', 'rite', '']
    })
    const suggestions = actions
      .filter((a) => a.kind === 'suggestion')
      .map((a) => a.suggestion)
    expect(suggestions).toEqual(['right', 'rite'])
  })
})
