import { ipcMain } from 'electron'
import { loadSettings, updateSettings } from '../../settings'
import { applyThemeOverride } from '../../theme'
import type { Result, Settings } from '../../../shared/ipc-contract'
import { ctx, ok, err, sanitizeError } from './context'

/**
 * Settings channels (US1/FR-005): `settings:get`/`settings:update`, both
 * routing through the authoritative in-memory settings store (review #27).
 */
export function registerSettingsHandlers(_window: Electron.BrowserWindow, _ctx: typeof ctx): void {
  ipcMain.handle('settings:get', (): Result<Settings> => {
    try {
      return ok(loadSettings())
    } catch {
      return ok({ sidebarWidth: 30, themeOverride: null, explorerVisible: true, editorFont: 'sans-serif' })
    }
  })

  ipcMain.handle('settings:update', (_e, patch: unknown): Result<Settings> => {
    try {
      if (!patch || typeof patch !== 'object') {
        return err('IO', 'Settings must be an object')
      }
      // Merge in MAIN against the authoritative in-memory settings (not a stale
      // disk read), so two updates inside the 500 ms debounce window do not
      // clobber each other (review #27). Only the four known fields are read.
      const updated = updateSettings(patch as Partial<Settings>)
      // Spec 013: a theme change applies immediately (FR-008) — the merged
      // override resolves onto nativeTheme so the renderer re-renders now,
      // without waiting for the debounced disk write.
      applyThemeOverride(updated.themeOverride)
      return ok(updated)
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, null))
    }
  })
}
