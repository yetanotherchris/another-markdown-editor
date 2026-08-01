import { useCallback } from 'react'
import type { DocumentState } from '../state/documents'
import { instancePool } from './instancePool'
import CrepeHost from './CrepeHost'

interface EditorPanelProps {
  document: DocumentState
  isActive: boolean
  onContentChange: (id: string, content: string) => void
  onBaselineCapture: (id: string, baseline: string) => void
}

export default function EditorPanel({
  document,
  isActive,
  onContentChange,
  onBaselineCapture
}: EditorPanelProps) {
  const handleMarkdownUpdated = useCallback(
    (markdown: string) => {
      onContentChange(document.id, markdown)
    },
    [document.id, onContentChange]
  )

  const handleReady = useCallback(
    (_crepe: unknown) => {
      instancePool.register(document.id, _crepe as never)
    },
    [document.id]
  )

  if (!isActive && instancePool.has(document.id)) {
    return (
      <div style={{ visibility: 'hidden', position: 'absolute', width: '100%', height: '100%' }}>
        <CrepeHost
          defaultValue={document.content}
          onMarkdownUpdated={handleMarkdownUpdated}
          onReady={handleReady}
        />
      </div>
    )
  }

  if (document.editorState === 'evicted') {
    return (
      <div style={{ visibility: isActive ? 'visible' : 'hidden', position: 'absolute', width: '100%', height: '100%' }}>
        <CrepeHost
          defaultValue={document.content}
          onMarkdownUpdated={handleMarkdownUpdated}
          onReady={handleReady}
        />
      </div>
    )
  }

  return (
    <div style={{ visibility: isActive ? 'visible' : 'hidden', position: 'absolute', width: '100%', height: '100%' }}>
      <CrepeHost
        defaultValue={document.content}
        onMarkdownUpdated={handleMarkdownUpdated}
        onReady={handleReady}
      />
    </div>
  )
}
