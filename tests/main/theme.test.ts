import { describe, it, expect } from 'vitest'
import { themeSourceForOverride } from '../../src/main/theme'
import type { Settings } from '../../src/shared/ipc-contract'

/**
 * Spec 013 (research R1): the persisted theme override maps 1:1 onto
 * `nativeTheme.themeSource` — the documented three-option dark-mode state
 * machine. `null` (system default) resolves to `'system'` so the renderer's
 * `prefers-color-scheme` follows the OS live (FR-004/FR-005).
 */
describe('themeSourceForOverride', () => {
  it('maps light to light', () => {
    expect(themeSourceForOverride('light')).toBe('light')
  })

  it('maps dark to dark', () => {
    expect(themeSourceForOverride('dark')).toBe('dark')
  })

  it('maps the system default (null) to system', () => {
    expect(themeSourceForOverride(null)).toBe('system')
  })

  it('is exhaustive over the override union', () => {
    const overrides: Settings['themeOverride'][] = ['light', 'dark', null]
    const sources = overrides.map(themeSourceForOverride)
    expect(new Set(sources)).toEqual(new Set(['light', 'dark', 'system']))
  })
})
