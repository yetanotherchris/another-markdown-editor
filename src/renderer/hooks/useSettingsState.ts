import { useCallback, useState } from 'react'
import { updateSettings, getSettings } from '../state/settings'
import type { EditorFont } from '../chrome/SettingsDialog'
import {
  useEffectiveTheme,
  themeChoiceFromOverride,
  themeOverrideFromChoice
} from './useEffectiveTheme'
import type { ThemeChoice } from './useEffectiveTheme'

/**
 * Spec 012/013: the settings-dialog state the composition root owns — the open
 * flag (single instance), the editor-font choice (spec 012), the theme choice
 * (spec 013), their apply-immediately-and-persist handlers, and the effective
 * `data-theme` mode. Seeded from the settings cache, which main.tsx preloads
 * before the first render (spec 013 — so a persisted dark theme never flashes
 * light); each selection applies at once and persists through the existing
 * settings store + IPC.
 */
export function useSettingsState(): {
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  editorFont: EditorFont
  handleEditorFontChange: (font: EditorFont) => void
  themeChoice: ThemeChoice
  handleThemeChange: (choice: ThemeChoice) => void
  themeMode: 'light' | 'dark'
} {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorFont, setEditorFont] = useState<EditorFont>(getSettings().editorFont)
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() =>
    themeChoiceFromOverride(getSettings().themeOverride)
  )
  const themeMode = useEffectiveTheme(themeChoice)

  // Spec 012, US2: apply the editor font immediately and persist (FR-006).
  const handleEditorFontChange = useCallback((font: EditorFont) => {
    setEditorFont(font)
    updateSettings({ editorFont: font })
    window.api.updateSettings({ editorFont: font }).catch(() => { /* ignore */ })
  }, [])

  // Spec 013: apply the theme immediately and persist (FR-006, FR-008). The
  // visual switch flows through `themeChoice` → `useEffectiveTheme` (the
  // `data-theme` attribute); the persisted override reaches main for the native
  // chrome (src/main/theme.ts). The local state keeps the dialog's radio in sync.
  const handleThemeChange = useCallback((choice: ThemeChoice) => {
    setThemeChoice(choice)
    const override = themeOverrideFromChoice(choice)
    updateSettings({ themeOverride: override })
    window.api.updateSettings({ themeOverride: override }).catch(() => { /* ignore */ })
  }, [])

  return {
    settingsOpen, setSettingsOpen,
    editorFont, handleEditorFontChange,
    themeChoice, handleThemeChange, themeMode
  }
}
