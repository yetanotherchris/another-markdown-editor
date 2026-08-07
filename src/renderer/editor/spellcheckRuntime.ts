import type NSpell from 'nspell'
import type { SpellcheckLanguage } from '../../shared/ipc-contract'
import { getChecker } from '../domain/spellcheck'

/**
 * Spec 020 (2026-08-07): the shared, editor-independent spellcheck state that
 * the ProseMirror plugin reads on every (re)check. Kept outside React because
 * the plugin runs on keystroke/idle timers and must see the latest settings and
 * custom words without a re-render. `version` is bumped on every change so
 * editors can tell whether to re-run their pass.
 */
export interface SpellcheckRuntime {
  enabled: boolean
  language: SpellcheckLanguage | null
  customWords: Set<string>
  version: number
  checker: NSpell
}

export const spellcheckRuntime: SpellcheckRuntime = {
  enabled: true,
  language: null,
  customWords: new Set(),
  version: 0,
  checker: getChecker(null)
}

/** Listeners notified whenever the runtime changes (settings toggles, custom
 *  words, language) so editors can re-run their pass without a doc change. */
const listeners = new Set<() => void>()

/** Subscribe to runtime changes; returns an unsubscribe function. */
export function onSpellcheckRuntimeChange(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Apply a settings/custom-word change and notify every editor to re-check. */
export function updateSpellcheckRuntime(
  patch: Partial<Pick<SpellcheckRuntime, 'enabled' | 'language' | 'customWords'>>
): void {
  if (patch.enabled !== undefined) spellcheckRuntime.enabled = patch.enabled
  if (patch.language !== undefined) {
    spellcheckRuntime.language = patch.language
    spellcheckRuntime.checker = getChecker(patch.language)
  }
  if (patch.customWords !== undefined) spellcheckRuntime.customWords = patch.customWords
  spellcheckRuntime.version += 1
  for (const callback of listeners) callback()
}
