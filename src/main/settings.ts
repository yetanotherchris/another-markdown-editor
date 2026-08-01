import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { Settings } from '../shared/ipc-contract'

const DEFAULTS: Settings = {
  sidebarWidth: 30,
  themeOverride: null
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : DEFAULTS.sidebarWidth,
      themeOverride: (parsed.themeOverride === 'light' || parsed.themeOverride === 'dark' || parsed.themeOverride === null)
        ? parsed.themeOverride : DEFAULTS.themeOverride
    }
  } catch {
    return { ...DEFAULTS }
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null

export function saveSettings(settings: Settings): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
  }

  writeTimer = setTimeout(() => {
    try {
      fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
    } catch {
      // Fail silently — settings are non-critical
    }
  }, 500)
}
