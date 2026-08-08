import nspell from 'nspell'
import type NSpell from 'nspell'
import type { SpellcheckLanguage } from '../../shared/ipc-contract'
import enGbAff from '../assets/dictionaries/en-gb.aff?raw'
import enGbDic from '../assets/dictionaries/en-gb.dic?raw'
import enUsAff from '../assets/dictionaries/en-us.aff?raw'
import enUsDic from '../assets/dictionaries/en-us.dic?raw'
import supplementalWordsRaw from '../assets/dictionaries/supplemental-words.txt?raw'

/**
 * Spec 020 (2026-08-07) + spec 025 (2026-08-08): the JS whole-document
 * spellchecker. Bundled Hunspell dictionaries (SCOWL/ESDB size-70, permissive
 * license) compiled to plain JavaScript by `nspell`, checked in under
 * src/renderer/assets/dictionaries/ so the sandboxed renderer never touches
 * the filesystem. The supplemental word list (spec 025) adds domain/technical
 * terms the dictionaries do not contain.
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

/**
 * Spec 025 (2026-08-08): the app-curated list of domain, technical, and
 * proper-noun-derived terms that no general English dictionary contains (e.g.
 * "JSON", "Lacanian", "hominem"). Stored lowercased, one word per line, and
 * treated as valid in both en-GB and en-US — the terms are dialect-neutral.
 */
export const SUPPLEMENTAL_WORDS: ReadonlySet<string> = new Set(
  supplementalWordsRaw
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((word) => word.length > 0)
)

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

/**
 * Word token: letters (any script) and apostrophes (don't, it's). Hyphens are
 * NOT part of a token — compounds like "well-known" are checked part-by-part
 * (so the parts are never falsely flagged) and a standalone "-" between spaces
 * is ignored entirely.
 */
const WORD_RE = /[\p{L}'’]+/gu

/**
 * Check `text` word by word and return every misspelling as an offset range.
 * Words in `customWords` (the user dictionary, stored lowercased) and words in
 * the bundled supplemental list (spec 025, stored lowercased) are skipped, as
 * are ordinal suffixes like "th" in "4th" (a digit directly precedes them).
 */
export function findMisspellings(
  text: string,
  checker: NSpell,
  customWords: ReadonlySet<string>
): Misspelling[] {
  const result: Misspelling[] = []
  for (const match of text.matchAll(WORD_RE)) {
    const word = match[0]
    const start = match.index as number
    // Ordinal suffix heuristic: "4th"/"2nd" tokenize as "th"/"nd" because a
    // digit is not a word character — skip tokens that directly follow a digit.
    if (start > 0 && /\d/.test(text[start - 1])) continue
    const lower = word.toLowerCase()
    if (customWords.has(lower) || SUPPLEMENTAL_WORDS.has(lower)) continue
    if (checker.correct(word)) continue
    result.push({ start, end: start + word.length, word })
  }
  return result
}
