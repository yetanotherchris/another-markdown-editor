import { useCallback, useState } from 'react'
import { updateSettings, getSettings } from '../state/settings'
import type { EditorThemeName } from '../../shared/ipc-contract'
import {
  useEffectiveTheme,
  themeChoiceFromOverride,
  themeOverrideFromChoice
} from './useEffectiveTheme'
import type { ThemeChoice } from './useEffectiveTheme'

/**
 * Spec 012/013/016: the settings-dialog state the composition root owns — the
 * open flag (single instance), the editor theme (spec 016), the app theme
 * choice (spec 013), their apply-and-persist handlers, and the effective
 * `data-theme` mode. Seeded from the settings cache, which main.tsx preloads
 * before the first render (spec 013 — so a persisted dark theme never flashes
 * light); each selection persists through the existing settings store + IPC.
 *
 * Spec 016 (FR-003/US1 S4): the editor theme is applied ONLY when the dialog's
 * Save button commits it (the dialog stages the selection locally); the app
 * theme keeps its apply-immediately behavior (spec 013).
 */
export function useSettingsState(): {
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  editorTheme: EditorThemeName
  handleEditorThemeChange: (theme: EditorThemeName) => void
  themeChoice: ThemeChoice
  handleThemeChange: (choice: ThemeChoice) => void
  themeMode: 'light' | 'dark'
} {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorTheme, setEditorTheme] = useState<EditorThemeName>(getSettings().editorTheme)
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() =>
    themeChoiceFromOverride(getSettings().themeOverride)
  )
  const themeMode = useEffectiveTheme(themeChoice)

  // Spec 016, FR-003/FR-004: commit the editor theme (persist + apply). Called
  // by the dialog's Save button; the visual switch flows through `editorTheme`
  // → the `data-editor-theme` attribute (editor/themes.css). The persisted
  // value reaches main for validation via updateSettings.
  const handleEditorThemeChange = useCallback((theme: EditorThemeName) => {
    setEditorTheme(theme)
    updateSettings({ editorTheme: theme })
    window.api.updateSettings({ editorTheme: theme }).catch(() => { /* ignore */ })
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
    editorTheme, handleEditorThemeChange,
    themeChoice, handleThemeChange, themeMode
  }
}
