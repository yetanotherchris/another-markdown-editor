import { useCallback, useState } from 'react'
import { updateSettings, getSettings } from '../state/settings'
import type { EditorThemeName, SpellcheckLanguage, EditorColors } from '../../shared/ipc-contract'
import {
  useEffectiveTheme,
  themeChoiceFromOverride,
  themeOverrideFromChoice
} from './useEffectiveTheme'
import type { ThemeChoice } from './useEffectiveTheme'
import { presetFontFor } from '../editor/editorThemePresets'

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
  editorFont: 'serif' | 'sans-serif'
  editorColors: import('../../shared/ipc-contract').EditorColors | null
  spellcheckEnabled: boolean
  handleSpellcheckChange: (enabled: boolean) => void
  spellcheckLanguage: SpellcheckLanguage | null
  handleSpellcheckLanguageChange: (language: SpellcheckLanguage | null) => void
  themeChoice: ThemeChoice
  handleThemeChange: (choice: ThemeChoice) => void
  themeMode: 'light' | 'dark'
} {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorTheme, setEditorTheme] = useState<EditorThemeName>(getSettings().editorTheme)
  const [editorFont, setEditorFont] = useState<'serif' | 'sans-serif'>(getSettings().editorFont)
  const [editorColors, setEditorColors] = useState<EditorColors | null>(getSettings().editorColors)
  const [spellcheckEnabled, setSpellcheckEnabled] = useState<boolean>(getSettings().spellcheckEnabled)
  const [spellcheckLanguage, setSpellcheckLanguage] = useState<SpellcheckLanguage | null>(getSettings().spellcheckLanguage)
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() =>
    themeChoiceFromOverride(getSettings().themeOverride)
  )
  const themeMode = useEffectiveTheme(themeChoice)

  // Spec 016, FR-003/FR-004: commit the editor theme (persist + apply). Called
  // by the dialog's Save button; the visual switch flows through `editorTheme`
  // → the `data-editor-theme` attribute (editor/themes.css). The persisted
  // value reaches main for validation via updateSettings.
  // Spec 023 FR-005/FR-008: selecting a preset clears any custom colour
  // overrides and writes the preset's font into `editorFont`.
  const handleEditorThemeChange = useCallback((theme: EditorThemeName) => {
    setEditorTheme(theme)
    setEditorColors(null)
    const presetFont = presetFontFor(theme)
    setEditorFont(presetFont)
    updateSettings({ editorTheme: theme, editorColors: null, editorFont: presetFont })
    window.api.updateSettings({ editorTheme: theme, editorColors: null, editorFont: presetFont }).catch(() => { /* ignore */ })
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

  // Spec 020 FR-006/US4: apply the spellcheck choice immediately and persist.
  // The session-side switch flows through the IPC (applied in main's
  // settings:update handler); the DOM attribute switch flows through
  // `spellcheckEnabled` → the editor components' spellcheck props.
  const handleSpellcheckChange = useCallback((enabled: boolean) => {
    setSpellcheckEnabled(enabled)
    updateSettings({ spellcheckEnabled: enabled })
    window.api.updateSettings({ spellcheckEnabled: enabled }).catch(() => { /* ignore */ })
  }, [])

  // Spec 020 (2026-08-07): apply the chosen spellchecker language immediately
  // and persist it. `null` = the platform/system default (applied in main).
  const handleSpellcheckLanguageChange = useCallback((language: SpellcheckLanguage | null) => {
    setSpellcheckLanguage(language)
    updateSettings({ spellcheckLanguage: language })
    window.api.updateSettings({ spellcheckLanguage: language }).catch(() => { /* ignore */ })
  }, [])

  return {
    settingsOpen, setSettingsOpen,
    editorTheme, handleEditorThemeChange,
    editorFont, editorColors,
    spellcheckEnabled, handleSpellcheckChange,
    spellcheckLanguage, handleSpellcheckLanguageChange,
    themeChoice, handleThemeChange, themeMode
  }
}
