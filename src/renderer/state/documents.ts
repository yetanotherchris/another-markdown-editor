import { isWithinOrEqual } from './workspace'

/**
 * Trailing-newline / EOL-tolerant equality for comparing text that came from
 * disk (raw bytes) with text serialized by Crepe. The editor always appends a
 * single trailing newline (verified 2026-07-02 probe), so two documents that
 * differ only by that newline (or CRLF vs LF) are the same content. Used where
 * the app must not treat Crepe's normalization as a user edit (spec 002: files
 * without a trailing newline must round-trip without gratuitous changes).
 */
export function markdownSame(a: string, b: string): boolean {
  const normalize = (s: string) => s.replace(/\r\n/g, '\n')
  const A = normalize(a)
  const B = normalize(b)
  return A === B || A === `${B}\n` || B === `${A}\n`
}

/**
 * Editor-vs-store equality for the return-to-formatted remount decision (spec
 * 002, data-model.md R3). Crepe's serialization always appends exactly one
 * trailing newline, so a live serialization equal to the stored content or that
 * content plus ONE trailing newline is "unchanged" (no remount — undo, cursor
 * and scroll survive). Unlike `markdownSame`, this is directional and strict:
 * a stored content that ends in an EXTRA blank line (`...\n\n`) is NOT equal to
 * a live `...\n`, so a blank line added at EOF in source view is neither
 * dropped nor mistaken for pure editor normalization.
 */
export function editorMatchesContent(live: string, content: string): boolean {
  const L = live.replace(/\r\n/g, '\n')
  const C = content.replace(/\r\n/g, '\n')
  return L === C || L === `${C}\n`
}

export interface DocumentState {
  id: string
  path: string | null
  title: string
  baseline: string
  /** The editor's serialization of the content it last parsed, captured right
   *  after a (re)mount (CAPTURE_BASELINE) and after a save. Unlike `baseline`
   *  it is NOT the on-disk bytes: Crepe normalizes markdown, so for a pristine
   *  file the editor baseline differs from the raw text (autolinks, loose
   *  pipes, entities). It is the reference for the live-dirty check
   *  (isDirtyLive): the editor has uncommitted drift only when its current
   *  serialization differs from this baseline, never merely because it
   *  normalized a pristine document. */
  editorBaseline: string
  content: string
  dirty: boolean
  diskBytes: string | null
  editorState: 'live' | 'evicted'
  cursorOffset: number
  scrollTop: number
  lastActiveAt: number
  externalState: 'clean' | 'changedOnDisk' | 'deletedOnDisk'
  contentVersion: number
  /** The editing presentation active in this tab (spec 002, data-model.md). */
  view: 'formatted' | 'source'
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
    editorBaseline: '',
    content: '',
    dirty: false,
    diskBytes: null,
    editorState: 'live',
    cursorOffset: 0,
    scrollTop: 0,
    lastActiveAt: Date.now(),
    externalState: 'clean',
    contentVersion: 0,
    view: 'formatted'
  }
}

export function openFile(opened: {
  path: string | null
  name: string
  content: string
  mtimeMs: number
  size: number
  view?: 'formatted' | 'source'
}): DocumentState {
  const path = opened.path
  const id = path || `file-${Date.now()}`
  return {
    id,
    path,
    title: opened.name,
    baseline: opened.content,
    editorBaseline: opened.content,
    content: opened.content,
    dirty: false,
    diskBytes: null,
    editorState: 'live',
    cursorOffset: 0,
    scrollTop: 0,
    lastActiveAt: Date.now(),
    externalState: 'clean',
    contentVersion: 0,
    view: opened.view ?? 'formatted'
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
    | 'CAPTURE_EDITOR_STATE'
    | 'RELOAD'
    | 'UPDATE_PATH'
    | 'REROUTE_PATHS'
    | 'EXTERNAL_CHANGE'
    | 'SET_VIEW'
    | 'REFRESH_FROM_SOURCE'
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
      const p = action.payload as {
        path: string | null
        name: string
        content: string
        mtimeMs: number
        size: number
        view?: 'formatted' | 'source'
      }
      const existing = state.documents.find(d => d.path === p.path && p.path !== null)
      if (existing) {
        // Reopening an evicted document must bring its editor back — the
        // active tab would otherwise render the empty evicted container.
        // FR-06: View source from the explorer reactivates the existing tab
        // without duplicating it; the requested view (if given) is applied.
        if (p.view && existing.view !== p.view) {
          return {
            ...state,
            activeId: existing.id,
            documents: state.documents.map(d =>
              d.id === existing.id
                ? { ...d, view: p.view!, editorState: d.editorState === 'evicted' ? 'live' : d.editorState }
                : d
            )
          }
        }
        return {
          ...state,
          activeId: existing.id,
          documents: state.documents.map(d =>
            d.id === existing.id && d.editorState === 'evicted'
              ? { ...d, editorState: 'live' }
              : d
          )
        }
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
      // Raw-bytes policy (spec 002): content/baseline remain the on-disk bytes
      // read by the main process (openFile, RELOAD) or the last saved bytes
      // (SAVE_SUCCESS) — Crepe's serialization must NOT rewrite the raw content
      // of a pristine document (a file without a trailing newline would gain
      // one). The payload is stored in the separate `editorBaseline` field, the
      // reference the live-dirty check uses to tell "the editor normalized the
      // document" (clean) from "the user typed" (dirty).
      const { id, baseline } = action.payload as { id: string; baseline: string }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id ? { ...d, editorBaseline: baseline } : d
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
                editorBaseline: content,
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

    case 'CAPTURE_EDITOR_STATE': {
      const { id, cursorOffset, scrollTop } = action.payload as {
        id: string
        cursorOffset: number
        scrollTop: number
      }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id
            ? { ...d, cursorOffset, scrollTop, lastActiveAt: Date.now() }
            : d
        )
      }
    }

    case 'RELOAD': {
      const { id, content } = action.payload as { id: string; content: string }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id
            ? {
                ...d,
                content,
                baseline: content,
                editorBaseline: content,
                dirty: false,
                externalState: 'clean',
                cursorOffset: 0,
                scrollTop: 0,
                contentVersion: d.contentVersion + 1
              }
            : d
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

    case 'REROUTE_PATHS': {
      // FR-028: a file or folder was renamed/moved within the app. Every open
      // document whose path sits at or under the old location follows it. The
      // document id is retained so tabs do not close and reopen.
      const { fromPath, toPath } = action.payload as { fromPath: string; toPath: string }
      return {
        ...state,
        documents: state.documents.map(d => {
          if (!d.path) return d
          if (!isWithinOrEqual(d.path, fromPath)) return d
          const suffix = d.path.slice(fromPath.length)
          const newPath = toPath + suffix
          return { ...d, path: newPath, title: newPath.split('/').pop() || d.title }
        })
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

    case 'SET_VIEW': {
      // Spec 002: switch this document's editing presentation without touching
      // content or dirty state. Only a real flip re-renders the tab.
      const { id, view } = action.payload as { id: string; view: 'formatted' | 'source' }
      const target = state.documents.find(d => d.id === id)
      if (!target || target.view === view) return state
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id ? { ...d, view } : d
        )
      }
    }

    case 'REFRESH_FROM_SOURCE': {
      // Spec 002, data-model.md: source→formatted return when the raw text
      // differs from the live editor. The new text takes the content slot and
      // bumps contentVersion so the CrepeHost remounts with the source bytes;
      // baseline/dirty are untouched so the document stays unsaved.
      const { id, content } = action.payload as { id: string; content: string }
      return {
        ...state,
        documents: state.documents.map(d =>
          d.id === id
            ? {
                ...d,
                content,
                editorBaseline: content,
                cursorOffset: 0,
                scrollTop: 0,
                contentVersion: d.contentVersion + 1
              }
            : d
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

export type CloseDecision = 'prompt' | 'close'

/** FR-023: closing a clean document needs no confirmation; a dirty one does. */
export function planClose(state: EditingSession, id: string): CloseDecision {
  const doc = state.documents.find(d => d.id === id)
  if (!doc) return 'close'
  return doc.dirty ? 'prompt' : 'close'
}

export type QuitDecision = 'prompt' | 'quit'

/** FR-023: quitting with any dirty document prompts, naming the affected ones. */
export function planQuit(state: EditingSession): QuitDecision {
  return hasDirtyDocuments(state) ? 'prompt' : 'quit'
}
