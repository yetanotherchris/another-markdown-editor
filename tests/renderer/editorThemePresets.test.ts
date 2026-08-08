import { describe, it, expect } from 'vitest'
import type { EditorThemeName, EditorColors } from '../../src/shared/ipc-contract'
import { resolveEditorTheme, MONOTONE_COLORS } from '../../src/renderer/editor/editorThemePresets'

const RUSTIC: EditorColors = {
  background: '#fdf6e3', foreground: '#1f1b16', accent: '#805610',
  surface: '#fdf3d9', outline: '#817567', code: '#ba1a1a'
}
const SCHOLARLY: EditorColors = {
  background: '#ffffff', foreground: '#1a1a1a', accent: '#00b0e9',
  surface: '#f7f7f7', outline: '#8a8a8a', code: '#b50000'
}

function resolve(editorTheme: EditorThemeName, editorFont: 'serif' | 'sans-serif', editorColors: EditorColors | null, appMode: 'light' | 'dark' = 'light') {
  return resolveEditorTheme({ editorTheme, editorFont, editorColors, appMode })
}

describe('resolveEditorTheme (spec 023 FR-003/004/007)', () => {
  it('returns the stored preset when there are no custom colours (SC-005)', () => {
    expect(resolve('rustic', 'sans-serif', null)).toEqual({ kind: 'preset', name: 'rustic' })
    expect(resolve('scholarly', 'sans-serif', null)).toEqual({ kind: 'preset', name: 'scholarly' })
  })

  it('matches a preset exactly by colours and font', () => {
    expect(resolve('rustic', 'sans-serif', RUSTIC)).toEqual({ kind: 'preset', name: 'rustic' })
    expect(resolve('rustic', 'serif', RUSTIC)).toEqual({ kind: 'preset', name: 'rustic-serif' })
    expect(resolve('scholarly', 'sans-serif', SCHOLARLY)).toEqual({ kind: 'preset', name: 'scholarly' })
  })

  it('treats a one-value colour difference as Custom', () => {
    const custom = { ...RUSTIC, background: '#2b2b2b' }
    expect(resolve('rustic', 'sans-serif', custom)).toEqual({ kind: 'custom' })
  })

  it('treats scholarly colours with a serif font as Custom (no such preset)', () => {
    expect(resolve('scholarly', 'serif', SCHOLARLY)).toEqual({ kind: 'custom' })
  })

  it('ignores the stored editorTheme when custom colours are present', () => {
    const custom = { ...RUSTIC, accent: '#ff0000' }
    expect(resolve('scholarly', 'sans-serif', custom)).toEqual({ kind: 'custom' })
  })

  it('matches the monotone presets against the current app-theme variant', () => {
    expect(resolve('monotone', 'sans-serif', MONOTONE_COLORS.light, 'light')).toEqual({ kind: 'preset', name: 'monotone' })
    expect(resolve('monotone', 'sans-serif', MONOTONE_COLORS.dark, 'dark')).toEqual({ kind: 'preset', name: 'monotone' })
    expect(resolve('monotone', 'serif', MONOTONE_COLORS.dark, 'dark')).toEqual({ kind: 'preset', name: 'monotone-serif' })
  })

  it('does not match a monotone light palette while the app is dark', () => {
    expect(resolve('monotone', 'sans-serif', MONOTONE_COLORS.light, 'dark')).toEqual({ kind: 'custom' })
  })
})
