import { session } from 'electron'
import type { SpellcheckLanguage } from '../shared/ipc-contract'

/**
 * The language list the OS/Electron chose before the app overrode it. Captured
 * lazily on the first apply so the "System default" setting can restore it
 * after a user has picked an explicit language.
 */
let systemLanguages: string[] | null = null

/**
 * Spec 020 FR-006/FR-009: the native spellcheck switch. Electron's built-in
 * spellchecker (Chromium) highlights misspelled words, feeds the right-click
 * suggestions, and owns the personal dictionary — all keyed off the enabled
 * flag and the configured language list. Idempotent.
 *
 * `language` `null` means "system default": the first apply records whatever
 * the platform had, and any later switch back to `null` restores it.
 *
 * Applied at startup (before the window loads, so the first paint honours the
 * persisted choice) and again on every `settings:update` so the toggle takes
 * effect immediately (US4 S1).
 */
export function applySpellcheckSetting(enabled: boolean, language: SpellcheckLanguage | null): void {
  const sess = session.defaultSession
  if (systemLanguages === null) {
    systemLanguages = sess.getSpellCheckerLanguages()
  }
  // Apply the language BEFORE the enable flag: Electron's
  // `setSpellCheckerLanguages` can implicitly re-enable the spellchecker, so
  // the flag must be the last write to be authoritative (US4 S1).
  sess.setSpellCheckerLanguages(language ? [language] : systemLanguages)
  sess.setSpellCheckerEnabled(enabled)
}
