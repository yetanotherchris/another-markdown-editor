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
  onCancel: () => void
}

export default function ConfirmDialog({ title, children, buttons, error, onCancel }: ConfirmDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    primaryRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="dialog-overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          {buttons.map((button, index) => (
            <button
              key={button.label}
              ref={index === buttons.length - 1 ? primaryRef : undefined}
              type="button"
              className={`dialog-button ${button.kind ?? 'default'}`}
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
