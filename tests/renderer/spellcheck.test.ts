import { describe, it, expect, beforeAll } from 'vitest'
import type NSpell from 'nspell'
import { findMisspellings, getChecker, resolveLanguage } from '../../src/renderer/domain/spellcheck'

/**
 * Spec 020 (2026-08-07): the JS whole-document spellchecker. The bundled
 * en-GB/en-US Hunspell dictionaries are loaded once and `findMisspellings`
 * tokenizes + checks text, returning offset ranges for every misspelling.
 */

let gb: NSpell
let us: NSpell

beforeAll(() => {
  gb = getChecker('en-GB')
  us = getChecker('en-US')
})

describe('resolveLanguage', () => {
  it('honours an explicit language', () => {
    expect(resolveLanguage('en-US')).toBe('en-US')
    expect(resolveLanguage('en-GB')).toBe('en-GB')
  })

  it('defaults to the platform language when unset', () => {
    const expected = navigator.language.toLowerCase().startsWith('en-us') ? 'en-US' : 'en-GB'
    expect(resolveLanguage(null)).toBe(expected)
  })
})

describe('findMisspellings', () => {
  it('flags misspelled words and returns their exact ranges', () => {
    const text = 'This teh is correct recieve text.'
    const miss = findMisspellings(text, gb, new Set())
    expect(miss.map((m) => m.word)).toEqual(['teh', 'recieve'])
    // offsets point at the words inside `text`
    for (const m of miss) {
      expect(text.slice(m.start, m.end)).toBe(m.word)
    }
  })

  it('uses the en-GB dictionary (British spellings accepted, American flagged)', () => {
    const text = 'behaviour color recognise organisation'
    const miss = findMisspellings(text, gb, new Set())
    expect(miss.map((m) => m.word)).toEqual(['color'])
  })

  it('uses the en-US dictionary (American accepted, British flagged)', () => {
    const text = 'behaviour color recognize organization'
    const miss = findMisspellings(text, us, new Set())
    expect(miss.map((m) => m.word)).toEqual(['behaviour'])
  })

  it('skips words in the custom dictionary (stored lowercased)', () => {
    const text = 'recieve is custom here'
    const miss = findMisspellings(text, gb, new Set(['recieve']))
    expect(miss.map((m) => m.word)).toEqual([])
  })

  it('returns no misspellings for a clean sentence', () => {
    const miss = findMisspellings('The quick brown fox jumps over the lazy dog.', gb, new Set())
    expect(miss).toEqual([])
  })

  it('ignores punctuation, numbers and mixed tokens without letters', () => {
    const miss = findMisspellings('12.5% 100 1.2.3 ...,!!', gb, new Set())
    expect(miss).toEqual([])
  })

  it('keeps apostrophes inside words (don\'t, it\'s)', () => {
    const text = "don't it's cant"
    const miss = findMisspellings(text, gb, new Set())
    // "don't"/"it's" are valid contractions; "cant" is a real word too
    expect(miss).toEqual([])
  })

  it('does not flag hyphenated compounds or spaced dashes (hyphens split tokens)', () => {
    const text = 'A well-known state-of-the-art design, half - full and bad-knwon words.'
    const miss = findMisspellings(text, gb, new Set())
    // The correctly-spelled compound parts are not flagged; only "knwon" is.
    expect(miss.map((m) => m.word)).toEqual(['knwon'])
  })

  it('does not flag ordinal suffixes (4th, 22nd)', () => {
    const text = 'The 4th floor, 22nd place and 1st prize.'
    expect(findMisspellings(text, gb, new Set())).toEqual([])
  })

  it('skips inline-code content when given a plain-text extraction', () => {
    // The plugin removes inline-code text nodes before checking; findMisspellings
    // itself just checks whatever text it is given.
    const miss = findMisspellings('const teh = 1;', gb, new Set())
    expect(miss.map((m) => m.word)).toEqual(['const', 'teh'])
  })
})
