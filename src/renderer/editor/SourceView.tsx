import { useCallback, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'

interface SourceViewProps {
  value: string
  onChange: (value: string) => void
  onReturnToFormatted: () => void
  /** Focus the textarea only when this tab is actually visible (FR-021). */
  isActive: boolean
  /** Spec 020 FR-007: whether the native spellchecker is enabled. Reflected
   *  onto the textarea so Chromium draws the squiggly underline here too. */
  spellcheckEnabled: boolean
}

/**
 * Plain-text markdown editor (spec 002, FR-007). The textarea's changes flow
 * through the same UPDATE_CONTENT path as formatted edits, so dirty state and
 * saving behave identically (FR-013). A compact top toolbar mirroring the Crepe
 * top bar's height hosts the labeled return control (FR-008).
 */
export default function SourceView({ value, onChange, onReturnToFormatted, isActive, spellcheckEnabled }: SourceViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value)
    },
    [onChange]
  )

  // Focus management (US1/US3): entering source view or activating a tab that
  // is already in source view puts the caret straight into the raw text.
  useEffect(() => {
    if (isActive) textareaRef.current?.focus()
  }, [isActive])

  return (
    <div className="source-view" data-testid="source-view" role="region" aria-label="Markdown source">
      <div className="source-toolbar">
        <button
          type="button"
          className="source-return"
          title="Back to visual editing"
          aria-label="Back to visual editing"
          onClick={onReturnToFormatted}
        >
          ← Visual Editing
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="source-textarea"
        data-testid="source-textarea"
        value={value}
        onChange={handleChange}
        spellCheck={spellcheckEnabled}
        aria-label="Markdown source"
      />
    </div>
  )
}