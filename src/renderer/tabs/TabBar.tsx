import type { DocumentState } from '../state/documents'

interface TabBarProps {
  documents: DocumentState[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

export default function TabBar({ documents, activeId, onActivate, onClose }: TabBarProps) {
  if (documents.length === 0) return null

  return (
    <div className="tab-bar" role="tablist" aria-label="Open documents">
      {documents.map((doc) => (
        <div
          key={doc.id}
          role="tab"
          aria-selected={doc.id === activeId}
          className={doc.id === activeId ? 'tab active' : 'tab'}
          title={doc.path ?? doc.title}
          onClick={() => onActivate(doc.id)}
        >
          <span className="tab-title">{doc.title}</span>
          {doc.externalState === 'deletedOnDisk' && (
            <span
              className="tab-warning"
              aria-label="deleted on disk"
              title="The file was deleted or renamed on disk"
            >
              !
            </span>
          )}
          {doc.dirty && (
            <span className="tab-dirty" aria-label="unsaved changes" title="Unsaved changes">
              •
            </span>
          )}
          <button
            type="button"
            className="tab-close"
            aria-label={`Close ${doc.title}`}
            onClick={(e) => {
              e.stopPropagation()
              onClose(doc.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
