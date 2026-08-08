import { app } from 'electron'
import * as path from 'path'

/**
 * Resolve the spec-004 recent-items config location (research R1).
 *
 * FR-004: on `~/.config` platforms the file MUST be at `~/.config/markdownmeister/config.json`.
 * `app.getPath('appData')` returns `$XDG_CONFIG_HOME`/`~/.config` on Linux,
 * `~/Library/Application Support` on macOS, and `%APPDATA%` on Windows, so
 * `appData/markdownmeister/config.json` is the conventional per-user config location on
 * every platform.
 *
 * Resolved lazily (never cached at module load) so tests can relocate it with
 * `app.setPath('appData', …)` before the first record.
 *
 * `MM_CONFIG_DIR` is a test/CI seam: when set it names the directory that
 * holds `config.json` directly, so the e2e suite can point the app at an
 * isolated per-test config from launch (before the startup menu is built)
 * without touching the developer's real `~/.config/markdownmeister`. Production never sets
 * it, so the default path above is unchanged.
 */
export function recentItemsConfigPath(): string {
  const override = process.env.MM_CONFIG_DIR
  if (override && override.length > 0) {
    return path.join(override, 'config.json')
  }
  return path.join(app.getPath('appData'), 'ame', 'config.json')
}
