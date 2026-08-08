import { app } from 'electron'
import * as path from 'path'
import * as os from 'os'
import { universalConfigPath } from './configPath'

/**
 * Resolve the shared per-user config location (spec 022, FR-001/009/010/011).
 *
 * The config lives at `~/.config/markdownmeister/config.json` on EVERY platform
 * (Linux honours `$XDG_CONFIG_HOME`); this single resolver redirects recent
 * items, settings, window state, and the spellcheck dictionary together.
 *
 * `MM_CONFIG_DIR` is a test/CI seam: when set it names the directory that
 * holds `config.json` directly, so the e2e suite can point the app at an
 * isolated per-test config from launch (before the startup menu is built)
 * without touching the developer's real `~/.config/markdownmeister`. Production
 * never sets it, so the default path above is unchanged.
 *
 * FR-011: if the home directory cannot be determined, fall back to the
 * platform-specific `appData` location (current behavior).
 *
 * Resolved lazily (never cached at module load) so tests can relocate it with
 * `app.setPath('appData', …)` or `MM_CONFIG_DIR` before the first record.
 */
export function recentItemsConfigPath(): string {
  const override = process.env.MM_CONFIG_DIR
  if (override && override.length > 0) {
    return path.join(override, 'config.json')
  }
  const homeDir = os.homedir()
  if (!homeDir) {
    return path.join(app.getPath('appData'), 'markdownmeister', 'config.json')
  }
  return universalConfigPath({
    homeDir,
    platform: process.platform,
    xdgConfigHome: process.env.XDG_CONFIG_HOME
  })
}
