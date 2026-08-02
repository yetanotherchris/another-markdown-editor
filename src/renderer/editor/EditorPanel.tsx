import { useCallback } from 'react'
import type { Crepe } from '@milkdown/crepe'
import type { DocumentState } from '../state/documents'
import { instancePool } from './instancePool'
import CrepeHost, { type CursorState } from './CrepeHost'
import SourceView from './SourceView'

interface EditorPanelProps {
  document: DocumentState
  isActive: boolean
  onContentChange: (id: string, content: string) => void
  onBaselineCapture: (id: string, baseline: string) => void
  onCursorState: (id: string, cursorOffset: number, scrollTop: number) => void
  onRequestViewSource: (id: string) => void
  onReturnToFormatted: (id: string) => void
}

export default function EditorPanel({
  document,
  isActive,
  onContentChange,
  onBaselineCapture,
  onCursorState,
  onRequestViewSource,
  onReturnToFormatted
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
    // A fresh CrepeHost mounts when the document is reactivated. The
    // placeholder must not swallow pointer events meant for the visible
    // editor below it. If the tab was in source view it stays in source
    // view once remounted.
    return <div className="editor-host evicted" />
  }

  const sourceView = document.view === 'source' && (
    <SourceView
      value={document.content}
      onChange={(content) => onContentChange(document.id, content)}
      onReturnToFormatted={() => onReturnToFormatted(document.id)}
    />
  )

  return (
    <div
      className={sourceView ? 'editor-host has-source' : 'editor-host'}
      style={{ visibility: isActive ? 'visible' : 'hidden' }}
    >
      <CrepeHost
        key={`${document.id}-v${document.contentVersion}`}
        defaultValue={document.content}
        active={isActive && !sourceView}
        restoreCursor={{ cursorOffset: document.cursorOffset, scrollTop: document.scrollTop }}
        onMarkdownUpdated={handleMarkdownUpdated}
        onReady={handleReady}
        onBaselineCapture={handleBaselineCapture}
        onCursorState={handleCursorState}
        onRequestViewSource={() => onRequestViewSource(document.id)}
      />
      {sourceView}
    </div>
  )
}
