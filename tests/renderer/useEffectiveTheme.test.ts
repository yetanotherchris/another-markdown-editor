import { describe, it, expect } from 'vitest'
import { effectiveThemeMode } from '../../src/renderer/hooks/useEffectiveTheme'
import type { ThemeChoice, ThemeMode } from '../../src/renderer/hooks/useEffectiveTheme'

/**
 * Spec 013: the pure resolution of the effective appearance. Light/Dark are
 * forced by the choice; System follows the OS colour-scheme query. (The hook
 * itself wraps this in matchMedia listening — covered by the e2e suite.)
 */
describe('effectiveThemeMode', () => {
  const cases: { choice: ThemeChoice; prefersDark: boolean; expected: ThemeMode }[] = [
    { choice: 'light', prefersDark: false, expected: 'light' },
    { choice: 'light', prefersDark: true, expected: 'light' },
    { choice: 'dark', prefersDark: false, expected: 'dark' },
    { choice: 'dark', prefersDark: true, expected: 'dark' },
    { choice: 'system', prefersDark: false, expected: 'light' },
    { choice: 'system', prefersDark: true, expected: 'dark' }
  ]

  for (const c of cases) {
    it(`${c.choice} + prefers-dark=${c.prefersDark} → ${c.expected}`, () => {
      expect(effectiveThemeMode(c.choice, c.prefersDark)).toBe(c.expected)
    })
  }
})
