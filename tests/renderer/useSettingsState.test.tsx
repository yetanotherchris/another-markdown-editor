import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useSettingsState } from '../../src/renderer/hooks/useSettingsState'
import { getSettings, updateSettings } from '../../src/renderer/state/settings'
import type { EditorThemeName, SpellcheckLanguage } from '../../src/shared/ipc-contract'
import type { ThemeChoice } from '../../src/renderer/hooks/useEffectiveTheme'

/**
 * Spec 016: `useSettingsState` seeds `editorTheme` from the persisted cache and
 * `handleEditorThemeChange` persists + applies a committed theme (the dialog
 * stages locally and calls this on Save). The hook's IPC calls are stubbed via
 * `window.api` (the preload surface is out of scope for unit tests — the e2e
 * suite covers the real IPC).
 */

// Minimal stub of the two DesktopApi calls the hook makes. The preload surface
// types `window.api` globally (src/renderer/types.d.ts); tests replace it.
function stubApi(): void {
  const calls: Array<{ editorTheme?: EditorThemeName; spellcheckEnabled?: boolean; spellcheckLanguage?: SpellcheckLanguage | null }> = []
  ;(globalThis as unknown as { __apiCalls: Array<{ editorTheme?: EditorThemeName; spellcheckEnabled?: boolean; spellcheckLanguage?: SpellcheckLanguage | null }> }).__apiCalls = calls
  window.api = {
    updateSettings: (patch: { editorTheme?: EditorThemeName; spellcheckEnabled?: boolean; spellcheckLanguage?: SpellcheckLanguage | null }) => {
      calls.push(patch)
      return Promise.resolve({ ok: true, value: getSettings() as never })
    }
  } as unknown as typeof window.api
}

// jsdom has no matchMedia; `useEffectiveTheme` reads it (spec 013). A no-op
// stub returning `matches: false` (light) is enough for the hook tests.
window.matchMedia = window.matchMedia ?? (() => ({
  matches: false,
  media: '(prefers-color-scheme: dark)',
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false
})) as unknown as typeof window.matchMedia

let root: Root | null = null

function renderHook(): { read: () => ReturnType<typeof useSettingsState> } {
  let current: ReturnType<typeof useSettingsState> | null = null
  function Harness() {
    current = useSettingsState()
    return null
  }
  root = createRoot(document.createElement('div'))
  act(() => {
    root!.render(<Harness />)
  })
  return {
    read: () => {
      if (!current) throw new Error('hook did not render')
      return current
    }
  }
}

beforeEach(() => {
  updateSettings({ editorTheme: 'rustic' })
  stubApi()
})

describe('useSettingsState (spec 016)', () => {
  it('exposes the persisted editorTheme as the committed value', () => {
    updateSettings({ editorTheme: 'monotone-serif' })
    const { read } = renderHook()
    expect(read().editorTheme).toBe('monotone-serif')
  })

  it('handleEditorThemeChange updates local state, the cache, and the IPC', () => {
    const { read } = renderHook()
    act(() => {
      read().handleEditorThemeChange('scholarly')
    })
    expect(read().editorTheme).toBe('scholarly')
    expect(getSettings().editorTheme).toBe('scholarly')
    // Spec 023 FR-005: selecting a preset clears custom colours and writes the
    // preset's font into editorFont.
    expect(getSettings().editorColors).toBeNull()
    expect(getSettings().editorFont).toBe('sans-serif')
    const calls = (globalThis as unknown as { __apiCalls: { editorTheme?: EditorThemeName }[] }).__apiCalls
    expect(calls).toEqual([{ editorTheme: 'scholarly', editorColors: null, editorFont: 'sans-serif' }])
  })

  it('exposes the persisted spellcheckEnabled as the committed value', () => {
    updateSettings({ spellcheckEnabled: false })
    const { read } = renderHook()
    expect(read().spellcheckEnabled).toBe(false)
  })

  it('handleSpellcheckChange updates local state, the cache, and the IPC', () => {
    const { read } = renderHook()
    act(() => {
      read().handleSpellcheckChange(false)
    })
    expect(read().spellcheckEnabled).toBe(false)
    expect(getSettings().spellcheckEnabled).toBe(false)
    const calls = (globalThis as unknown as { __apiCalls: { spellcheckEnabled?: boolean }[] }).__apiCalls
    expect(calls).toEqual([{ spellcheckEnabled: false }])
  })

  it('seeds the spellcheck default from a fresh cache', () => {
    updateSettings({ spellcheckEnabled: true })
    const { read } = renderHook()
    expect(read().spellcheckEnabled).toBe(true)
  })

  it('exposes the persisted spellcheckLanguage (null = system default)', () => {
    updateSettings({ spellcheckLanguage: 'en-GB' })
    const { read } = renderHook()
    expect(read().spellcheckLanguage).toBe('en-GB')
  })

  it('handleSpellcheckLanguageChange updates local state, the cache, and the IPC', () => {
    const { read } = renderHook()
    act(() => {
      read().handleSpellcheckLanguageChange('en-US')
    })
    expect(read().spellcheckLanguage).toBe('en-US')
    expect(getSettings().spellcheckLanguage).toBe('en-US')
    const calls = (globalThis as unknown as { __apiCalls: { spellcheckLanguage?: SpellcheckLanguage | null }[] }).__apiCalls
    expect(calls).toEqual([{ spellcheckLanguage: 'en-US' }])
  })

  it('still exposes the app-theme choice plumbing (spec 013)', () => {
    updateSettings({ themeOverride: 'dark' })
    const { read } = renderHook()
    expect(read().themeChoice).toBe('dark')
    act(() => {
      read().handleThemeChange('light')
    })
    expect(read().themeChoice).toBe('light')
    expect(read().themeMode).toBe('light')
  })

  it('seeds the editor theme default from a fresh cache', () => {
    updateSettings({ editorTheme: 'rustic' as EditorThemeName })
    const { read } = renderHook()
    expect(read().editorTheme).toBe('rustic')
  })
})

// Type-only reference so the ThemeChoice import is not flagged unused.
export type { ThemeChoice }
