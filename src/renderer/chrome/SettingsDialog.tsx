import { useEffect, useRef, useState } from 'react'
import type { EditorThemeName, SpellcheckLanguage } from '../../shared/ipc-contract'
import type { ThemeChoice } from '../hooks/useEffectiveTheme'
import { EDITOR_THEMES } from '../editor/editorThemes'
import './settings.css'

/** Spec 013: the theme choices; `'system'` maps to the persisted override
 *  `null` (the setting's default and "follow the OS"). */
export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System default' }
]

/** Spec 020 (2026-08-07): the explicit spellchecker languages offered, with
 *  `''` mapping to the persisted `null` ("follow the system"). A closed list —
 *  more languages can be added here later. */
export const SPELLCHECK_LANGUAGE_CHOICES: { value: SpellcheckLanguage; label: string }[] = [
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-US', label: 'English (United States)' }
]

interface SettingsDialogProps {
  /** The effective editor theme — a preset name, or `'custom'` when the stored
   *  colours + font match no preset (spec 023 FR-003/004). */
  editorTheme: EditorThemeName | 'custom'
  /** Spec 016, FR-003/US1 S4: called by the Save button with the staged
   *  selection, then the dialog closes. Closing without Save leaves the canvas
   *  at the committed value. Spec 023 FR-005: committing a preset clears any
   *  custom colour overrides. */
  onEditorThemeSave: (theme: EditorThemeName) => void
  /** The currently selected app theme (from persisted settings). */
  theme: ThemeChoice
  /** Spec 013: the apply-immediately model — a selection persists at once. */
  onThemeChange: (theme: ThemeChoice) => void
  /** Spec 020 FR-006/US4: whether native spellcheck is on. Applied immediately
   *  on change (S1: markers vanish the moment the box is unchecked). */
  spellcheckEnabled: boolean
  onSpellcheckChange: (enabled: boolean) => void
  /** Spec 020 (2026-08-07): the explicit spellchecker language, or `null` for
   *  the system default. Applied immediately. */
  spellcheckLanguage: SpellcheckLanguage | null
  onSpellcheckLanguageChange: (language: SpellcheckLanguage | null) => void
  onClose: () => void
}

/**
 * Spec 012/013/016 settings dialog (contracts/renderer.md). A keyboard-accessible
 * React modal: `role="dialog"` + `aria-modal="true"`, focus trapped on open,
 * closed by Escape or the Close button with focus returning to the hamburger
 * trigger (FR-007). Its settings are the app theme between Light, Dark, and
 * System default (spec 013 FR-001, applied immediately) and the editor theme —
 * one of five named canvas styles (spec 016 FR-001) — which is STAGED and only
 * applied when the user presses **Save** (FR-003/US1 S4). Never touches the
 * document session (FR-008/FR-014).
 */
export default function SettingsDialog({ editorTheme, onEditorThemeSave, theme, onThemeChange, spellcheckEnabled, onSpellcheckChange, spellcheckLanguage, onSpellcheckLanguageChange, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Spec 016: the staged editor-theme selection, seeded from the last committed
  // preset. Not applied on click — only the Save button commits it (US1 S4).
  // Spec 023: while the effective theme is Custom (a preset is not staged),
  // the draft is `null` and the display-only Custom radio is shown.
  const [draftEditorTheme, setDraftEditorTheme] = useState<EditorThemeName | null>(
    editorTheme === 'custom' ? null : editorTheme
  )
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // The element that had focus when the dialog opened; focus returns to it on
  // close (review #27 — the hamburger trigger, per the plan's FR-007 contract).
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // Focus moves into the dialog on open (the first radio), remembering what to
  // restore on close.
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus()
    return () => {
      returnFocusRef.current?.focus()
    }
  }, [])

  // Focus trap: Tab and Shift+Tab cycle within the dialog (FR-007).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('input[type="radio"], button')
      ).filter((el) => !el.hasAttribute('disabled'))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      // Tab wraps forward from the last element, and also pulls focus back in
      // when it has strayed outside the dialog (review #27, focus-trap gap).
      if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      className="settings-dialog-overlay"
      onPointerDown={(e) => {
        // Clicking the backdrop closes the dialog (outside-click) — discarding
        // any staged editor-theme selection (US1 S4).
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        data-testid="settings-dialog"
      >
        <div className="settings-dialog-header">
          <h2 id="settings-dialog-title" className="settings-dialog-title">Settings</h2>
          <button
            type="button"
            className="settings-dialog-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="settings-dialog-body">
          <fieldset className="settings-fieldset">
            <legend className="settings-legend">Theme</legend>
            {THEME_CHOICES.map((option) => (
              <label key={option.value} className="settings-radio">
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => onThemeChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="settings-fieldset">
            <legend className="settings-legend">Editor Theme</legend>
            {EDITOR_THEMES.map((option) => (
              <label key={option.value} className="settings-radio">
                <input
                  type="radio"
                  name="editor-theme"
                  value={option.value}
                  checked={draftEditorTheme === option.value}
                  onChange={() => setDraftEditorTheme(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
            {/* Spec 023 FR-003: a display-only Custom option when the stored
                colours + font match no preset. Not selectable (Assumptions); a
                separate radio-group name so the disabled checked member never
                blocks the preset radios' selection. Unchecks once a preset is
                staged. */}
            {editorTheme === 'custom' && (
              <label className="settings-radio">
                <input
                  type="radio"
                  name="editor-theme-custom"
                  value="custom"
                  checked={draftEditorTheme === null}
                  disabled
                />
                <span>Custom</span>
              </label>
            )}
          </fieldset>
          <fieldset className="settings-fieldset">
            <legend className="settings-legend">Spellcheck</legend>
            <label className="settings-radio">
              <input
                type="checkbox"
                name="spellcheck"
                checked={spellcheckEnabled}
                onChange={(e) => onSpellcheckChange(e.target.checked)}
              />
              <span>Check spelling while typing</span>
            </label>
            <label className="settings-select-label" htmlFor="spellcheck-language">
              <span>Language</span>
              <select
                id="spellcheck-language"
                data-testid="spellcheck-language"
                value={spellcheckLanguage ?? ''}
                disabled={!spellcheckEnabled}
                onChange={(e) => onSpellcheckLanguageChange(e.target.value === '' ? null : e.target.value as SpellcheckLanguage)}
              >
                <option value="">System default</option>
                {SPELLCHECK_LANGUAGE_CHOICES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </fieldset>
        </div>
        <div className="settings-dialog-footer">
          <button type="button" className="settings-dialog-close-btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="settings-dialog-save"
            onClick={() => {
              // Spec 023: with a Custom theme no preset is staged — Save just
              // closes (the app-theme choices apply immediately).
              if (draftEditorTheme !== null) onEditorThemeSave(draftEditorTheme)
              onClose()
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
