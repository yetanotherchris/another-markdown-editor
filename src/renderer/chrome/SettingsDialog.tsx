import { useEffect, useRef } from 'react'
import type { ThemeChoice } from '../hooks/useEffectiveTheme'
import './settings.css'

export type EditorFont = 'sans-serif' | 'serif'

export const EDITOR_FONT_OPTIONS: { value: EditorFont; label: string }[] = [
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' }
]

/** Spec 013: the theme choices; `'system'` maps to the persisted override
 *  `null` (the setting's default and "follow the OS"). */
export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System default' }
]

interface SettingsDialogProps {
  /** The currently selected editor font (from persisted settings). */
  editorFont: EditorFont
  /** Spec 012: the apply-immediately model — a selection persists at once. */
  onEditorFontChange: (font: EditorFont) => void
  /** The currently selected theme (from persisted settings). */
  theme: ThemeChoice
  /** Spec 013: the apply-immediately model — a selection persists at once. */
  onThemeChange: (theme: ThemeChoice) => void
  onClose: () => void
}

/**
 * Spec 012/013 settings dialog (contracts/renderer.md). A keyboard-accessible
 * React modal: `role="dialog"` + `aria-modal="true"`, focus trapped on open,
 * closed by Escape or the Close button with focus returning to the hamburger
 * trigger (FR-007). Its settings are the editor font-family choice between
 * sans-serif and serif (spec 012 FR-003/FR-004) and the theme choice between
 * Light, Dark, and System default (spec 013 FR-001), both applied immediately
 * on selection. Never touches the document session (FR-008).
 */
export default function SettingsDialog({ editorFont, onEditorFontChange, theme, onThemeChange, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const fontGroupRef = useRef<HTMLFieldSetElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // The element that had focus when the dialog opened; focus returns to it on
  // close (review #27 — the hamburger trigger, per the plan's FR-007 contract).
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // Focus moves into the dialog on open (the first radio), remembering what to
  // restore on close.
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    fontGroupRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus()
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
        // Clicking the backdrop closes the dialog (outside-click).
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
          <fieldset ref={fontGroupRef} className="settings-fieldset">
            <legend className="settings-legend">Editor Font</legend>
            {EDITOR_FONT_OPTIONS.map((option) => (
              <label key={option.value} className="settings-radio">
                <input
                  type="radio"
                  name="editor-font"
                  value={option.value}
                  checked={editorFont === option.value}
                  onChange={() => onEditorFontChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
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
        </div>
        <div className="settings-dialog-footer">
          <button type="button" className="settings-dialog-done" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
