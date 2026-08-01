import { useCallback } from 'react'
import type { Crepe } from '@milkdown/crepe'
import type { DocumentState } from '../state/documents'
import { instancePool } from './instancePool'
import CrepeHost, { type CursorState } from './CrepeHost'

interface EditorPanelProps {
  document: DocumentState
  isActive: boolean
  onContentChange: (id: string, content: string) => void
  onBaselineCapture: (id: string, baseline: string) => void
  onCursorState: (id: string, cursorOffset: number, scrollTop: number) => void
}

export default function EditorPanel({
  document,
  isActive,
  onContentChange,
  onBaselineCapture,
  onCursorState
}: EditorPanelProps) {
  const handleMarkdownUpdated = useCallback(
    (markdown: string) => {
      onContentChange(document.id, markdown)
    },
    [document.id, onContentChange]
  )

  const handleBaselineCapture = useCallback(
    (baseline: string) => {
      onBaselineCapture(document.id, baseline)
    },
    [document.id, onBaselineCapture]
  )

  const handleCursorState = useCallback(
    (cursor: CursorState) => {
      onCursorState(document.id, cursor.cursorOffset, cursor.scrollTop)
    },
    [document.id, onCursorState]
  )

  const handleReady = useCallback(
    (crepe: Crepe) => {
      instancePool.register(document.id, crepe)
    },
    [document.id]
  )

  if (document.editorState === 'evicted') {
    // Instance destroyed to free memory; content retained in the store.
    // A fresh CrepeHost mounts when the document is reactivated.
    return <div className="editor-host" />
  }

  return (
    <div
      className="editor-host"
      style={{ visibility: isActive ? 'visible' : 'hidden' }}
    >
      <CrepeHost
        key={`${document.id}-v${document.contentVersion}`}
        defaultValue={document.content}
        active={isActive}
        restoreCursor={{ cursorOffset: document.cursorOffset, scrollTop: document.scrollTop }}
        onMarkdownUpdated={handleMarkdownUpdated}
        onReady={handleReady}
        onBaselineCapture={handleBaselineCapture}
        onCursorState={handleCursorState}
      />
    </div>
  )
}
