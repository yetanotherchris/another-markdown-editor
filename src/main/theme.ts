import { nativeTheme } from 'electron'
import type { Settings } from '../shared/ipc-contract'

/**
 * Spec 013 theme resolution (research R1). The persisted theme setting
 * (`themeOverride`, spec 010) maps 1:1 onto Electron's documented three-option
 * dark-mode state machine: `nativeTheme.themeSource` is `'system' | 'light' |
 * 'dark'`, and "Follow OS / Dark / Light" correspond to `system` / `dark` /
 * `light` respectively. Setting it makes `prefers-color-scheme` match in every
 * sandboxed renderer window and, while `themeSource` is `'system'`, re-fires it
 * when the OS theme changes — so live OS following (FR-005) needs no IPC.
 */

/** Pure mapping (unit-tested): `null` (system default) → `'system'`. */
export function themeSourceForOverride(override: Settings['themeOverride']): 'system' | 'light' | 'dark' {
  return override === null ? 'system' : override
}

/** Apply the persisted override to Chromium's native theme (main only). */
export function applyThemeOverride(override: Settings['themeOverride']): void {
  nativeTheme.themeSource = themeSourceForOverride(override)
}
