import * as fs from 'fs'
import type { Settings } from '../shared/ipc-contract'

/**
 * Pure, electron-free settings store (spec 010 T003/T004, spec 012 T003) —
 * mirrors the `recentItems`/`recentItemsPath` split so the load/save logic is
 * unit-testable without mocking Electron. Callers resolve the file path
 * (settings.ts) and pass it in; this module never touches `app`.
 *
 * Spec 012 FR-002: settings live in the SAME per-user configuration file as the
 * recent-items list — `config.json` at `appData/ame` (or the `AME_CONFIG_DIR`
 * test seam). The file shape is `{ recentItems?, settings? }`, and every write
 * is a read-modify-write so saving settings never clobbers the recent-items
 * list (and vice versa).
 *
 * Tolerance (FR-009, spec edges): a missing, unreadable, or malformed settings
 * file yields the defaults (never an exception). Each field is validated
 * individually so a partially-corrupt file keeps every recoverable value.
 */
export const DEFAULTS: Settings = {
  sidebarWidth: 30,
  themeOverride: null,
  explorerVisible: true,
  editorFont: 'sans-serif'
}

/** Read the whole shared config file, tolerantly: `{}` when missing or invalid.
 *  `settings` extracts only the `.settings` section. */
export function readConfigFile(filePath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function validateSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  const parsed = raw as Record<string, unknown>
  return {
    sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : DEFAULTS.sidebarWidth,
    themeOverride: (parsed.themeOverride === 'light' || parsed.themeOverride === 'dark' || parsed.themeOverride === null)
      ? parsed.themeOverride : DEFAULTS.themeOverride,
    explorerVisible: typeof parsed.explorerVisible === 'boolean' ? parsed.explorerVisible : DEFAULTS.explorerVisible,
    editorFont: (parsed.editorFont === 'sans-serif' || parsed.editorFont === 'serif')
      ? parsed.editorFont : DEFAULTS.editorFont
  }
}

export function loadSettingsFile(filePath: string): Settings {
  return validateSettings(readConfigFile(filePath).settings)
}

/** True when the config file has a `.settings` key — lets the caller decide
 *  whether a legacy migration applies (settings.ts). */
export function hasSettingsKey(filePath: string): boolean {
  return 'settings' in readConfigFile(filePath)
}

/**
 * One-time migration (spec 012, plan decision), electron-free: when `configPath`
 * has no `.settings` key yet and `legacyPath` holds a pre-012 flat Settings
 * object, import its values into `configPath`. Returns the migrated Settings, or
 * `null` when no migration applies. Best-effort — a read/write failure returns
 * `null` and the caller falls through to the defaults (FR-009). The caller
 * resolves both paths (settings.ts); this module never touches `app`.
 */
export function migrateLegacySettingsFile(configPath: string, legacyPath: string): Settings | null {
  if (hasSettingsKey(configPath) || configPath === legacyPath) return null
  const legacy = readConfigFile(legacyPath)
  if (!legacy || typeof legacy !== 'object' || !('sidebarWidth' in legacy)) return null
  const migrated = validateSettings(legacy)
  try {
    writeSettingsFile(configPath, migrated)
  } catch {
    return null
  }
  return migrated
}

/**
 * Read-modify-write: load the current config (tolerant → `{}`), merge the
 * `settings` section, and write the whole file back so `recentItems` survives.
 */
export function writeSettingsFile(filePath: string, settings: Settings): void {
  const current = readConfigFile(filePath)
  const updated = { ...current, settings }
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
}
