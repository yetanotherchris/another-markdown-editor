import { app } from 'electron'
import * as path from 'path'
import type { Settings } from '../shared/ipc-contract'
import {
  loadSettingsFile,
  writeSettingsFile,
  migrateLegacySettingsFile,
  mergeSettingsPatch,
  DEFAULTS
} from './settingsFile'
import { recentItemsConfigPath } from './recentItemsPath'

export { DEFAULTS }

/**
 * Spec 012 FR-002: settings live in the SAME per-user configuration file as the
 * recent-items list — `appData/markdownmeister/config.json` (see recentItemsPath.ts). Both
 * `MM_CONFIG_DIR` (test seam) and the production path therefore resolve to the
 * same file the MRU list uses; the settings section is a sibling key.
 */
function settingsPath(): string {
  return recentItemsConfigPath()
}

/** The pre-012 legacy path: MM_CONFIG_DIR/settings.json in tests, otherwise
 *  userData/settings.json. */
function legacySettingsPath(): string {
  const override = process.env.MM_CONFIG_DIR
  if (override && override.length > 0) {
    return path.join(override, 'settings.json')
  }
  return path.join(app.getPath('userData'), 'settings.json')
}

/**
 * Authoritative in-memory settings, seeded from disk once. Kept because the
 * on-disk write is debounced (saveSettings): without it, a `settings:update`
 * that arrives before the previous write flushed would build its snapshot from
 * a STALE disk read and silently revert the earlier field (review #27 finding:
 * a Serif choice followed within 500 ms by a sidebar resize clobbered the font).
 * All merges go through this object, so updates are never lost to the debounce.
 */
let currentSettings: Settings | null = null

function loadFromDisk(): Settings {
  const configPath = settingsPath()
  const migrated = migrateLegacySettingsFile(configPath, legacySettingsPath())
  if (migrated) return migrated
  return loadSettingsFile(configPath)
}

export function loadSettings(): Settings {
  if (!currentSettings) currentSettings = loadFromDisk()
  return currentSettings
}

/** Validate a renderer-supplied patch field by field against the current
 *  settings (review #27: `editorFont` is a closed union — never arbitrary
 *  text). Returns the merged Settings. */
function validateAndMerge(patch: Partial<Settings>): Settings {
  return mergeSettingsPatch(loadSettings(), patch)
}

/** Merge a validated patch into the authoritative in-memory settings and
 *  schedule the (debounced) disk write. Returns the merged Settings. */
export function updateSettings(patch: Partial<Settings>): Settings {
  const updated = validateAndMerge(patch)
  currentSettings = updated
  saveSettings(updated)
  return updated
}

let writeTimer: ReturnType<typeof setTimeout> | null = null

export function saveSettings(settings: Settings): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
  }

  writeTimer = setTimeout(() => {
    try {
      writeSettingsFile(settingsPath(), settings)
      writeTimer = null
    } catch {
      // Fail silently — settings are non-critical
    }
  }, 500)
}

/** Flush any pending debounced settings write immediately (review #27: a font
 *  change followed by a fast quit must not be lost — FR-006). Called from the
 *  quit path in index.ts. */
export function flushSettings(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
    try {
      writeSettingsFile(settingsPath(), currentSettings ?? loadFromDisk())
    } catch {
      // Fail silently — settings are non-critical
    }
  }
}
