import { ipcMain } from 'electron'
import { loadSpellcheckWords, addSpellcheckWord } from '../../spellcheckDictionary'
import { recentItemsConfigPath } from '../../recentItemsPath'
import type { Result } from '../../../shared/ipc-contract'
import { ctx, ok, err, sanitizeError, isAuthorizedRenderer } from './context'

/** A custom-dictionary word: letters, apostrophes, hyphens; 1–64 chars. */
const WORD_RE = /^[\p{L}'’-]+$/u
const WORD_MAX = 64

/**
 * Spec 020 custom-dictionary channels: `spellcheck:getWords` and
 * `spellcheck:addWord`. The dictionary is renderer-owned (the JS spellchecker
 * lives in the renderer) but persists through main, like every other store.
 */
export function registerSpellcheckHandlers(window: Electron.BrowserWindow, _ctx: typeof ctx): void {
  ipcMain.handle('spellcheck:getWords', (event): Result<string[]> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    try {
      return ok(loadSpellcheckWords(recentItemsConfigPath()))
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, null))
    }
  })

  ipcMain.handle('spellcheck:addWord', (event, args: unknown): Result<string[]> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    try {
      const word = (args as { word?: unknown } | null)?.word
      if (typeof word !== 'string' || word.length === 0 || word.length > WORD_MAX || !WORD_RE.test(word)) {
        return err('IO', 'Word must be a single word of letters, apostrophes or hyphens')
      }
      return ok(addSpellcheckWord(recentItemsConfigPath(), word))
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, null))
    }
  })
}
