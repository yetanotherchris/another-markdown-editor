import { app } from 'electron'
import * as path from 'path'
import type { Settings } from '../shared/ipc-contract'
import { loadSettingsFile, writeSettingsFile, migrateLegacySettingsFile, DEFAULTS } from './settingsFile'
import { recentItemsConfigPath } from './recentItemsPath'

export { DEFAULTS }

/**
 * Spec 012 FR-002: settings live in the SAME per-user configuration file as the
 * recent-items list — `appData/ame/config.json` (see recentItemsPath.ts). Both
 * `AME_CONFIG_DIR` (test seam) and the production path therefore resolve to the
 * same file the MRU list uses; the settings section is a sibling key.
 */
function settingsPath(): string {
  return recentItemsConfigPath()
}

/** The pre-012 legacy path: AME_CONFIG_DIR/settings.json in tests, otherwise
 *  userData/settings.json. */
function legacySettingsPath(): string {
  const override = process.env.AME_CONFIG_DIR
  if (override && override.length > 0) {
    return path.join(override, 'settings.json')
  }
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  const configPath = settingsPath()
  const migrated = migrateLegacySettingsFile(configPath, legacySettingsPath())
  if (migrated) return migrated
  return loadSettingsFile(configPath)
}

let writeTimer: ReturnType<typeof setTimeout> | null = null

export function saveSettings(settings: Settings): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
  }

  writeTimer = setTimeout(() => {
    try {
      writeSettingsFile(settingsPath(), settings)
    } catch {
      // Fail silently — settings are non-critical
    }
  }, 500)
}
