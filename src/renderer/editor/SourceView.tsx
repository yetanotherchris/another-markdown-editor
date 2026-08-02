import { useCallback } from 'react'
import type { ChangeEvent } from 'react'

interface SourceViewProps {
  value: string
  onChange: (value: string) => void
  onReturnToFormatted: () => void
}

/**
 * Plain-text markdown editor (spec 002, FR-007). The textarea's changes flow
 * through the same UPDATE_CONTENT path as formatted edits, so dirty state and
 * saving behave identically (FR-013). A compact top toolbar mirroring the Crepe
 * top bar's height hosts the labeled return control (FR-008).
 */
export default function SourceView({ value, onChange, onReturnToFormatted }: SourceViewProps) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value)
    },
    [onChange]
  )

  return (
    <div className="source-view" data-testid="source-view">
      <div className="source-toolbar">
        <button
          type="button"
          className="source-return"
          title="Back to visual editing"
          aria-label="Back to visual editing"
          onClick={onReturnToFormatted}
        >
          ← Format
        </button>
      </div>
      <textarea
        className="source-textarea"
        data-testid="source-textarea"
        value={value}
        onChange={handleChange}
        spellCheck={false}
        aria-label="Markdown source"
      />
    </div>
  )
}