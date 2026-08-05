import { app } from 'electron'
import * as path from 'path'
import type { Settings } from '../shared/ipc-contract'
import { loadSettingsFile, writeSettingsFile, DEFAULTS } from './settingsFile'

export { DEFAULTS }

function settingsPath(): string {
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
