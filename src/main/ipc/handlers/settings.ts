import { ipcMain } from 'electron'
import { loadSettings, updateSettings } from '../../settings'
import { applyThemeOverride } from '../../theme'
import { applySpellcheckSetting } from '../../spellcheck'
import type { Result, Settings } from '../../../shared/ipc-contract'
import { ctx, ok, err, sanitizeError, isAuthorizedRenderer } from './context'

/**
 * Settings channels (US1/FR-005): `settings:get`/`settings:update`, both
 * routing through the authoritative in-memory settings store (review #27).
 */
export function registerSettingsHandlers(window: Electron.BrowserWindow, _ctx: typeof ctx): void {
  ipcMain.handle('settings:get', (event): Result<Settings> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    try {
      return ok(loadSettings())
    } catch {
      return ok({ sidebarWidth: 30, themeOverride: null, explorerVisible: true, editorFont: 'sans-serif', editorTheme: 'rustic', editorColors: null, spellcheckEnabled: true, spellcheckLanguage: null })
    }
  })

  ipcMain.handle('settings:update', (event, patch: unknown): Result<Settings> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    try {
      if (!patch || typeof patch !== 'object') {
        return err('IO', 'Settings must be an object')
      }
      // Merge in MAIN against the authoritative in-memory settings (not a stale
      // disk read), so two updates inside the 500 ms debounce window do not
      // clobber each other (review #27). Only the known fields are read.
      const updated = updateSettings(patch as Partial<Settings>)
      // Spec 013: a theme change applies immediately (FR-008) — the merged
      // override resolves onto nativeTheme so the renderer re-renders now,
      // without waiting for the debounced disk write.
      applyThemeOverride(updated.themeOverride)
      // Spec 020 FR-006/US4 S1: a spellcheck toggle applies immediately — the
      // session spellchecker flips now, so markers vanish/return without
      // waiting for the debounced disk write. The language is applied too.
      applySpellcheckSetting(updated.spellcheckEnabled, updated.spellcheckLanguage)
      return ok(updated)
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, null))
    }
  })
}
