import { readConfigFile } from './settingsFile'
import { updateSettings } from './settings'
import { recentItemsConfigPath } from './recentItemsPath'
import { ctx } from './ipc/handlers/context'

/**
 * Spec 011 FR-013: "When no folder is currently open, the file explorer panel
 * MUST be closed, and this closed state MUST be persisted to the configuration."
 *
 * The app has no close-folder action, so the only reachable "no folder open"
 * state is a fresh launch (a folder is only ever replaced by opening another —
 * see plan.md / spec Clarifications, FR-016 gap). At startup main runs before
 * the renderer loads; if the persisted settings still claim the explorer is
 * visible while no workspace is open, write `explorerVisible: false` so the
 * stored state is honest. Opening a folder later still reveals the explorer and
 * persists `true` (spec 010 reveal-on-open, unchanged).
 *
 * Guarded to act only on a VALID config that explicitly records
 * `explorerVisible: true`: a malformed config is left untouched (spec 012
 * FR-009 invariant — the settings dialog e2e proves it) and a missing config is
 * not created just to say "closed" (fresh installs start with defaults).
 *
 * Runs in `app.whenReady()` before `createWindow`; best-effort like every other
 * config write (a failure is swallowed — FR-009).
 */
export function reconcileExplorerClosedWithoutWorkspace(): void {
  if (ctx.workspaceRoot !== null) return
  try {
    const config = readConfigFile(recentItemsConfigPath())
    const settings = config.settings
    if (settings && typeof settings === 'object' && (settings as Record<string, unknown>).explorerVisible === true) {
      updateSettings({ explorerVisible: false })
    }
  } catch {
    // Best-effort: never block startup.
  }
}
