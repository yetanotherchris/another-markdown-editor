import * as fs from 'fs'
import type { Settings } from '../shared/ipc-contract'

/**
 * Pure, electron-free settings store (spec 010 T003/T004) — mirrors the
 * `recentItems`/`recentItemsPath` split so the load/save logic is unit-testable
 * without mocking Electron. Callers resolve the file path (settings.ts) and
 * pass it in; this module never touches `app`.
 *
 * Tolerance: a missing, unreadable, or malformed settings file yields the
 * defaults (never an exception). Each field is validated individually so a
 * partially-corrupt file keeps every recoverable value.
 */
export const DEFAULTS: Settings = {
  sidebarWidth: 30,
  themeOverride: null,
  explorerVisible: true
}

export function loadSettingsFile(filePath: string): Settings {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : DEFAULTS.sidebarWidth,
      themeOverride: (parsed.themeOverride === 'light' || parsed.themeOverride === 'dark' || parsed.themeOverride === null)
        ? parsed.themeOverride : DEFAULTS.themeOverride,
      explorerVisible: typeof parsed.explorerVisible === 'boolean' ? parsed.explorerVisible : DEFAULTS.explorerVisible
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeSettingsFile(filePath: string, settings: Settings): void {
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}
