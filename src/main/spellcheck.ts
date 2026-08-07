import { session } from 'electron'

/**
 * Spec 020 FR-006/FR-009: the single native spellcheck switch. Electron's
 * built-in spellchecker (Chromium) highlights misspelled words, feeds the
 * right-click suggestions, and owns the personal dictionary — all keyed off
 * this one call. Safe to call repeatedly; idempotent.
 *
 * Applied at startup (before the window loads, so the first paint honours the
 * persisted choice) and again on every `settings:update` so the toggle takes
 * effect immediately (US4 S1).
 */
export function applySpellcheckSetting(enabled: boolean): void {
  session.defaultSession.setSpellCheckerEnabled(enabled)
}
