import * as fs from 'fs'
import * as path from 'path'
import { atomicWrite } from './fs/atomicWrite'

/**
 * Pure, electron-free store for the spec 020 custom spellcheck dictionary — the
 * words the user has taught the JS spellchecker so they are never flagged.
 *
 * Lives as a top-level `spellcheckDictionary` array in the SAME per-user config
 * file as recent-items/settings (`appData/ame/config.json`), read-modify-write
 * so saving it never clobbers the siblings (spec 012 FR-002 pattern). Callers
 * resolve the file path (recentItemsPath); this module never touches `app`.
 *
 * Tolerance: a missing/unreadable/malformed config yields `[]`; only
 * non-empty string entries are kept; words are stored lowercased.
 */
export function loadSpellcheckWords(filePath: string): string[] {
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
  if (!raw || typeof raw !== 'object') return []
  const arr = (raw as { spellcheckDictionary?: unknown }).spellcheckDictionary
  if (!Array.isArray(arr)) return []
  return arr.filter((w): w is string => typeof w === 'string' && w.length > 0)
}

/**
 * Add a word (lowercased, deduped) to the stored dictionary and return the
 * updated list. Atomic read-modify-write preserving every sibling key.
 */
export function addSpellcheckWord(filePath: string, word: string): string[] {
  const normalized = word.trim().toLowerCase()
  let existing: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (parsed && typeof parsed === 'object') existing = parsed as Record<string, unknown>
  } catch {
    // Missing or corrupt config — start fresh.
  }
  const current = Array.isArray(existing.spellcheckDictionary) ? existing.spellcheckDictionary : []
  const next = normalized && !current.includes(normalized) ? [...current, normalized] : current
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  atomicWrite(filePath, JSON.stringify({ ...existing, spellcheckDictionary: next }, null, 2), 0o600)
  return next
}
