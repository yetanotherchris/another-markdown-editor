export interface DocumentState {
  id: string
  path: string | null
  title: string
  baseline: string
  content: string
  dirty: boolean
  diskBytes: string | null
  editorState: 'live' | 'evicted'
  cursorOffset: number
  scrollTop: number
  lastActiveAt: number
  externalState: 'clean' | 'changedOnDisk' | 'deletedOnDisk'
}

export interface EditingSession {
  documents: DocumentState[]
  activeId: string | null
  untitledCounter: number
}

let untitledCounter = 0

export function createEmpty(): DocumentState {
  untitledCounter++
  const id = `untitled-${untitledCounter}`
  return {
    id,
    path: null,
    title: `Untitled-${untitledCounter}`,
    baseline: '',
    content: '',
    dirty: false,
    diskBytes: null,
    editorState: 'live',
    cursorOffset: 0,
    scrollTop: 0,
    lastActiveAt: Date.now(),
    externalState: 'clean'
  }
}

export function openFile(opened: {
  path: string | null
  name: string
  content: string
  mtimeMs: number
  size: number
}): DocumentState {
  const path = opened.path
  const id = path || `file-${Date.now()}`
  return {
    id,
    path,
    title: opened.name,
    baseline: opened.content,
    content: opened.content,
    dirty: false,
    diskBytes: null,
    editorState: 'live',
    cursorOffset: 0,
    scrollTop: 0,
    lastActiveAt: Date.now(),
    externalState: 'clean'
  }
}

export interface DocumentsAction {
  type:
    | 'OPEN_EXISTING'
    | 'OPEN_NEW'
    | 'ACTIVATE'
    | 'UPDATE_CONTENT'
    | 'CAPTURE_BASELINE'
    | 'SAVE_SUCCESS'
    | 'SAVE_FAILED'
    | 'CLOSE'
    | 'EVICT'
    | 'REACTIVATE'
    | 'UPDATE_PATH'
    | 'EXTERNAL_CHANGE'
    | 'SET_DIRTY'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any
}

export function documentsReducer(state: EditingSession, action: DocumentsAction): EditingSession {
  switch (action.type) {
    case 'OPEN_NEW': {
      const doc = createEmpty()
      return {
        ...state,
        documents: [...state.documents, doc],
        activeId: doc.id
      }
    }

    case 'OPEN_EXISTING': {
      const p = action.payload as { path: string | null; name: string; content: string; mtimeMs: number; size: number }
      const existing = state.documents.find(d => d.path === p.path && p.path !== null)
      if (existing) {
        return { ...state, activeId: existing.id }
      }
      const doc = openFile(p)
      return {
        ...state,
        documents: [...state.documents, doc],
        activeId: doc.id
      }
    }

    case 'ACTIVATE': {
      const id = action.payload?.id as string
      const target = state.documents.find(d => d.id === id)
      if (target) {
        return {
          ...state,
          activeId: id,
          documents: state.documents.map(d =>
            d.id === id ? { ...d, lastActiveAt: Date.now() } : d
          )
        }
      }
      return state
    }

    case 'UPDATE_CONTENT': {
      const { id, content } = action.payload as { id: string; content: string }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id
            ? { ...d, content, dirty: content !== d.baseline, lastActiveAt: Date.now() }
            : d
        )
      }
    }

    case 'CAPTURE_BASELINE': {
      const { id, baseline } = action.payload as { id: string; baseline: string }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id
            ? { ...d, baseline, dirty: d.content !== baseline }
            : d
        )
      }
    }

    case 'SAVE_SUCCESS': {
      const { id, path, content } = action.payload as { id: string; path: string; content: string }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id
            ? {
                ...d,
                path: path || d.path,
                title: path ? path.split('/').pop() || d.title : d.title,
                baseline: content,
                dirty: d.content !== content,
                externalState: 'clean'
              }
            : d
        )
      }
    }

    case 'SAVE_FAILED': {
      return state
    }

    case 'CLOSE': {
      const id = action.payload?.id as string
      const filtered = state.documents.filter(d => d.id !== id)
      let activeId = state.activeId
      if (state.activeId === id) {
        const idx = state.documents.findIndex(d => d.id === id)
        if (filtered.length > 0) {
          activeId = filtered[Math.min(idx, filtered.length - 1)].id
        } else {
          activeId = null
        }
      }
      return { ...state, documents: filtered, activeId }
    }

    case 'EVICT': {
      const id = action.payload?.id as string
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id ? { ...d, editorState: 'evicted' } : d
        )
      }
    }

    case 'REACTIVATE': {
      const { id, cursorOffset, scrollTop } = action.payload as {
        id: string
        cursorOffset: number
        scrollTop: number
      }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id ? { ...d, editorState: 'live', cursorOffset, scrollTop } : d
        )
      }
    }

    case 'UPDATE_PATH': {
      const { id, path } = action.payload as { id: string; path: string }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id
            ? { ...d, path, title: path.split('/').pop() || d.title }
            : d
        )
      }
    }

    case 'EXTERNAL_CHANGE': {
      const { path, kind } = action.payload as { path: string; kind: 'changed' | 'removed' }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.path === path
            ? {
                ...d,
                externalState: kind === 'removed' ? 'deletedOnDisk' : 'changedOnDisk'
              }
            : d
        )
      }
    }

    case 'SET_DIRTY': {
      const { id, dirty } = action.payload as { id: string; dirty: boolean }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id ? { ...d, dirty } : d
        )
      }
    }

    default:
      return state
  }
}

export function getActiveDocument(state: EditingSession): DocumentState | null {
  return state.documents.find(d => d.id === state.activeId) || null
}

export function hasDirtyDocuments(state: EditingSession): boolean {
  return state.documents.some(d => d.dirty)
}

export function getDirtyDocuments(state: EditingSession): DocumentState[] {
  return state.documents.filter(d => d.dirty)
}
