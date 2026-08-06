import { useEffect, useState } from 'react'
import type { Settings } from '../../shared/ipc-contract'

/** The two effective appearances the chrome can render (spec 013). */
export type ThemeMode = 'light' | 'dark'

/** The three theme choices the settings dialog offers (spec 013 FR-001).
 *  `'system'` follows the operating system. */
export type ThemeChoice = 'light' | 'dark' | 'system'

/** Map the persisted override to the dialog choice: `null` (the default) is the
 *  "System default" option. */
export function themeChoiceFromOverride(override: Settings['themeOverride']): ThemeChoice {
  return override === null ? 'system' : override
}

/** Map the dialog choice back to the persisted override. */
export function themeOverrideFromChoice(choice: ThemeChoice): Settings['themeOverride'] {
  return choice === 'system' ? null : choice
}

/** Pure resolution of the effective appearance from the user's choice and the
 *  current OS colour-scheme query. Light/Dark are forced; System follows the
 *  query (which reflects the real OS theme in the renderer). */
export function effectiveThemeMode(choice: ThemeChoice, prefersDark: boolean): ThemeMode {
  if (choice === 'light') return 'light'
  if (choice === 'dark') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

/**
 * Spec 013: resolve the effective light/dark mode the chrome must render.
 *
 * The persisted choice (`'light' | 'dark' | 'system'`) is the source of truth
 * for Light/Dark. For System, the renderer's `prefers-color-scheme` media query
 * reflects the real OS theme — re-read on every matchMedia change event, which
 * Chromium fires when the OS theme switches (FR-005 live following). Main also
 * resolves the choice onto `nativeTheme.themeSource` for the native chrome
 * (scrollbars, window frames) — see src/main/theme.ts — but this hook never
 * touches `nativeTheme` (Principle I), so the palette follows the query
 * independently (research R1/R2: themeSource does not propagate to the renderer
 * media query in the Electron build this runs on).
 *
 * `choice` changes (the user picks a theme) recompute the mode immediately.
 */
export function useEffectiveTheme(choice: ThemeChoice): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(() =>
    effectiveThemeMode(choice, window.matchMedia('(prefers-color-scheme: dark)').matches)
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const recompute = () => setMode(effectiveThemeMode(choice, media.matches))
    recompute()
    media.addEventListener('change', recompute)
    return () => media.removeEventListener('change', recompute)
  }, [choice])

  return mode
}
