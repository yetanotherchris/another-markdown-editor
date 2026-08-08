import * as path from 'path'
import * as fs from 'fs'

/**
 * Spec 022 (FR-001/002/005): pure, electron-free path resolution and the
 * one-time config-location migration. Path inputs are injected so the module is
 * unit-testable without Electron or a real home directory (research R2).
 */

export interface ConfigPathParts {
  /** `os.homedir()` — the user's home directory. */
  homeDir: string
  /** `process.platform`. */
  platform: NodeJS.Platform
  /** `process.env.XDG_CONFIG_HOME` (Linux only; ignored elsewhere). */
  xdgConfigHome?: string
  /** `app.getPath('appData')` — the legacy per-platform config parent. */
  appDataDir?: string
}

/** The universal config directory: `~/.config/markdownmeister`, or
 *  `$XDG_CONFIG_HOME/markdownmeister` on Linux when set (FR-001/002). */
export function universalConfigDir(parts: ConfigPathParts): string {
  if (parts.platform === 'linux' && parts.xdgConfigHome && parts.xdgConfigHome.length > 0) {
    return path.join(parts.xdgConfigHome, 'markdownmeister')
  }
  return path.join(parts.homeDir, '.config', 'markdownmeister')
}

/** The universal config file: `<universalConfigDir>/config.json` (FR-001). */
export function universalConfigPath(parts: ConfigPathParts): string {
  return path.join(universalConfigDir(parts), 'config.json')
}

/** The legacy platform-specific config location (FR-005). On Linux the legacy
 *  and universal locations coincide, so there is nothing to migrate. */
export function legacyConfigPath(parts: ConfigPathParts): string {
  if (parts.platform === 'linux') {
    return path.join(parts.homeDir, '.config', 'markdownmeister', 'config.json')
  }
  const appDataDir = parts.appDataDir && parts.appDataDir.length > 0 ? parts.appDataDir : parts.homeDir
  return path.join(appDataDir, 'markdownmeister', 'config.json')
}

export type MigrationResult = 'nothing' | 'migrated' | 'new-wins' | 'failed'

/** One-time migration: rename `legacy` to `universal` when the new location is
 *  empty and the old one holds a config. The new config always wins (FR-007);
 *  any failure leaves the old file in place and reports `failed` so the caller
 *  can log and continue with defaults (FR-008). */
export function migrateConfigFile(legacy: string, universal: string): MigrationResult {
  try {
    const universalExists = fs.existsSync(universal)
    if (universalExists) return 'new-wins'
    if (!fs.existsSync(legacy)) return 'nothing'
    fs.mkdirSync(path.dirname(universal), { recursive: true })
    fs.renameSync(legacy, universal)
    return 'migrated'
  } catch {
    return 'failed'
  }
}
