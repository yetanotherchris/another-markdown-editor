import { describe, it, expect } from 'vitest'
import { EDITOR_THEMES } from '../../src/renderer/editor/editorThemes'
import type { EditorThemeName } from '../../src/shared/ipc-contract'

/**
 * Spec 016 (FR-001): the settings dialog MUST list exactly five editor themes:
 * Rustic, Rustic Serif, Monotone, Monotone Serif, and Scholarly. The shared
 * `EDITOR_THEMES` constant is the dialog's single source of truth, so pinning
 * it here pins the dialog's options (the renderer wiring is covered by e2e).
 */
describe('EDITOR_THEMES', () => {
  it('lists exactly the five spec themes in dialog order', () => {
    expect(EDITOR_THEMES.map((t) => t.label)).toEqual([
      'Rustic', 'Rustic Serif', 'Monotone', 'Monotone Serif', 'Scholarly'
    ])
    expect(EDITOR_THEMES.map((t) => t.value)).toEqual([
      'rustic', 'rustic-serif', 'monotone', 'monotone-serif', 'scholarly'
    ])
  })

  it('every value is a valid EditorThemeName', () => {
    const valid = new Set<EditorThemeName>(['rustic', 'rustic-serif', 'monotone', 'monotone-serif', 'scholarly'])
    for (const entry of EDITOR_THEMES) {
      expect(valid.has(entry.value)).toBe(true)
    }
  })

  it('the default theme is Rustic and it is first', () => {
    expect(EDITOR_THEMES[0].value).toBe('rustic')
    expect(EDITOR_THEMES[0].label).toBe('Rustic')
  })
})
