import nspell from 'nspell'
import type NSpell from 'nspell'
import type { SpellcheckLanguage } from '../../shared/ipc-contract'
import enGbAff from '../assets/dictionaries/en-gb.aff?raw'
import enGbDic from '../assets/dictionaries/en-gb.dic?raw'
import enUsAff from '../assets/dictionaries/en-us.aff?raw'
import enUsDic from '../assets/dictionaries/en-us.dic?raw'

/**
 * Spec 020 (2026-08-07): the JS whole-document spellchecker. Bundled Hunspell
 * dictionaries (from the `dictionaries` project, MIT) compiled to plain
 * JavaScript by `nspell`, checked in under src/renderer/assets/dictionaries/
 * so the sandboxed renderer never touches the filesystem.
 */

export interface Misspelling {
  /** Start offset in the checked text (0-based). */
  start: number
  /** End offset (exclusive). */
  end: number
  /** The word as it appears in the text. */
  word: string
}

const DICTIONARIES: Record<SpellcheckLanguage, NSpell> = {
  'en-GB': nspell(enGbAff, enGbDic),
  'en-US': nspell(enUsAff, enUsDic)
}

/** Map the persisted setting (`null` = system default) to a concrete language. */
export function resolveLanguage(language: SpellcheckLanguage | null): SpellcheckLanguage {
  if (language) return language
  const nav = typeof navigator !== 'undefined' ? navigator.language : ''
  return nav.toLowerCase().startsWith('en-us') ? 'en-US' : 'en-GB'
}

/** The compiled checker for the effective language. */
export function getChecker(language: SpellcheckLanguage | null): NSpell {
  return DICTIONARIES[resolveLanguage(language)]
}

/** Word token: letters (any script), apostrophes and hyphens, apostrophes kept
 *  inside words (don't, well-known). Pure digits and punctuation never match. */
const WORD_RE = /[\p{L}'’-]+/gu

/**
 * Check `text` word by word and return every misspelling as an offset range.
 * Words in `customWords` (the user dictionary, case-insensitive) are skipped.
 */
export function findMisspellings(
  text: string,
  checker: NSpell,
  customWords: ReadonlySet<string>
): Misspelling[] {
  const result: Misspelling[] = []
  for (const match of text.matchAll(WORD_RE)) {
    const word = match[0]
    if (customWords.has(word.toLowerCase())) continue
    if (checker.correct(word)) continue
    result.push({ start: match.index as number, end: (match.index as number) + word.length, word })
  }
  return result
}
