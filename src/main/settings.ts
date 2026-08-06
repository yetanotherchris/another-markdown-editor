import { app } from 'electron'
import * as path from 'path'
import type { Settings } from '../shared/ipc-contract'
import { loadSettingsFile, writeSettingsFile, DEFAULTS } from './settingsFile'

export { DEFAULTS }

function settingsPath(): string {
  // AME_CONFIG_DIR is the same test/CI seam as recentItemsConfigPath: when set
  // it names the directory holding settings.json directly, so the e2e suite can
  // isolate per-test settings (including the persisted explorerVisible used by
  // spec 010's restart scenario) without touching the developer's real
  // userData. Production never sets it, so the default path is unchanged.
  const override = process.env.AME_CONFIG_DIR
  if (override && override.length > 0) {
    return path.join(override, 'settings.json')
  }
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  return loadSettingsFile(settingsPath())
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
