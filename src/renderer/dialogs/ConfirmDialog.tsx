import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export interface DialogButton {
  label: string
  onClick: () => void
  kind?: 'primary' | 'danger' | 'default'
}

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  buttons: DialogButton[]
  error?: string | null
  /** A destructive action is in flight: buttons are disabled, Escape is ignored. */
  busy?: boolean
  onCancel: () => void
}

export default function ConfirmDialog({ title, children, buttons, error, busy = false, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Focus the dialog element itself, not a button: screen readers announce
    // the title and content first (WCAG 4.1.2), and a reflexive Enter can
    // never activate a button the moment the dialog opens — the keyup of the
    // very keypress that opened it would otherwise confirm/cancel instantly.
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div className="dialog-overlay">
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <h2 className="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          {buttons.map((button) => (
            <button
              key={button.label}
              type="button"
              className={`dialog-button ${button.kind ?? 'default'}`}
              disabled={busy}
              onClick={button.onClick}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
