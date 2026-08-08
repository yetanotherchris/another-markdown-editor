import { isWithinOrEqual } from './workspace'
import { splitFrontmatter, joinFrontmatter } from '../domain/frontmatter'
import type { OpenedFile } from '../../shared/ipc-contract'

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
  /** The editor's serialization of the content it last parsed, captured after a
   *  (re)mount and after a save. Unlike `baseline` it is NOT the on-disk bytes
   *  (Crepe normalizes markdown). It is the reference for the live-dirty check
   *  and for UPDATE_CONTENT's dirty flag — an edit undone back to the original
   *  content is not dirty (raw-bytes policy, spec 002). */
  editorBaseline: string
  content: string
  /** The raw frontmatter block at the top of the file, including its `---`
   *  delimiters, or `''` when the file has none (spec 021 FR-004). Stored
   *  separately from `content` (the body) so the visual editor never sees it
   *  while the source view and save path can recombine it verbatim. */
  frontmatter: string
  dirty: boolean
  diskBytes: string | null
  editorState: 'live' | 'evicted'
  cursorOffset: number
  scrollTop: number
  lastActiveAt: number
  externalState: 'clean' | 'changedOnDisk' | 'deletedOnDisk'
  contentVersion: number
  /** Monotonic user-edit revision used to reject stale save completions. */
  revision?: number
  /** The editing presentation active in this tab (spec 002, data-model.md). */
  view: 'formatted' | 'source'
}

export interface EditingSession {
  documents: DocumentState[]
  activeId: string | null
  untitledCounter: number
}

/** Create a new untitled document. Pure: the caller (the OPEN_NEW reducer
 *  case) supplies the sequence number from `EditingSession.untitledCounter`.
 *  Never increment a module-level counter here — the reducer must stay pure
 *  (React StrictMode double-invokes reducers in dev; a side effect would burn
 *  a number per invocation and produce Untitled-2, -4, -6). */
export function createEmpty(counter: number): DocumentState {
  const id = `untitled-${counter}`
  return {
    id,
    path: null,
    title: `Untitled-${counter}`,
    baseline: '',
    editorBaseline: '',
    content: '',
    frontmatter: '',
    dirty: false,
    diskBytes: null,
    editorState: 'live',
    cursorOffset: 0,
    scrollTop: 0,
    lastActiveAt: Date.now(),
    externalState: 'clean',
    contentVersion: 0,
    revision: 0,
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
  // Spec 021: split the raw file bytes into the frontmatter block and the body
  // at the load boundary (research R3). `content`/`editorBaseline` hold the
  // body; `baseline` keeps the raw full-file bytes read from disk so the
  // source-view byte check and the no-edit round trip stay exact.
  const { frontmatter, body } = splitFrontmatter(opened.content)
  return {
    id,
    path,
    title: opened.name,
    baseline: opened.content,
    editorBaseline: body,
    content: body,
    frontmatter,
    dirty: false,
    diskBytes: null,
    editorState: 'live',
    cursorOffset: 0,
    scrollTop: 0,
    lastActiveAt: Date.now(),
    externalState: 'clean',
    contentVersion: 0,
    revision: 0,
    view: opened.view ?? 'formatted'
  }
}

/** Spec 024: `mode: 'replace'` swaps the active tab's slot for the opened file
 *  (only when the dispatcher proved the active tab is live-clean); absent or
 *  `'new'` opens a new tab. Existing-tab activation takes priority over both.
 *  `view` is the optional requested view (spec 002: View source). */
interface OpenExistingPayload {
  value: OpenedFile & { view?: 'formatted' | 'source' }
  mode?: 'replace' | 'new'
}

export type DocumentsAction =
  | {
      type: 'OPEN_NEW'
    }
  | { type: 'OPEN_EXISTING'; payload: OpenExistingPayload }
  | { type: 'ACTIVATE'; payload: { id: string } }
  | { type: 'UPDATE_CONTENT'; payload: { id: string; content: string } }
  | { type: 'CAPTURE_BASELINE'; payload: { id: string; baseline: string } }
  | {
      type: 'SAVE_SUCCESS'
      payload: { id: string; path: string; content: string; revision?: number }
    }
  | { type: 'SAVE_FAILED'; payload: { id: string } }
  | { type: 'CLOSE'; payload: { id: string } }
  | { type: 'EVICT'; payload: { id: string } }
  | { type: 'REACTIVATE'; payload: { id: string; cursorOffset: number; scrollTop: number } }
  | {
      type: 'CAPTURE_EDITOR_STATE'
      payload: { id: string; cursorOffset: number; scrollTop: number }
    }
  | { type: 'RELOAD'; payload: { id: string; content: string } }
  | { type: 'UPDATE_PATH'; payload: { id: string; path: string } }
  | { type: 'REROUTE_PATHS'; payload: { fromPath: string; toPath: string } }
  | { type: 'EXTERNAL_CHANGE'; payload: { path: string; kind: 'changed' | 'removed' } }
  | { type: 'SET_VIEW'; payload: { id: string; view: 'formatted' | 'source' } }
  | { type: 'REFRESH_FROM_SOURCE'; payload: { id: string; content: string } }

// ---- Per-action-case helpers (FR-019): each case body is a named, exported,
// pure function so it is short and independently testable. The reducer switch
// below only dispatches to them; the state-transition logic lives here. ----

export function handleOpenNew(state: EditingSession): EditingSession {
  const counter = state.untitledCounter + 1
  const doc = createEmpty(counter)
  return {
    ...state,
    untitledCounter: counter,
    documents: [...state.documents, doc],
    activeId: doc.id
  }
}

export function handleOpenExisting(state: EditingSession, p: OpenExistingPayload): EditingSession {
  const value = p.value
  const existing = state.documents.find((d) => d.path === value.path && value.path !== null)
  if (existing) {
    // Reopening an evicted document must bring its editor back — the
    // active tab would otherwise render the empty evicted container.
    // FR-06: View source from the explorer reactivates the existing tab
    // without duplicating it; the requested view (if given) is applied.
    if (value.view && existing.view !== value.view) {
      return {
        ...state,
        activeId: existing.id,
        documents: state.documents.map((d) =>
          d.id === existing.id
            ? {
                ...d,
                view: value.view!,
                editorState: d.editorState === 'evicted' ? 'live' : d.editorState
              }
            : d
        )
      }
    }
    return {
      ...state,
      activeId: existing.id,
      documents: state.documents.map((d) =>
        d.id === existing.id && d.editorState === 'evicted' ? { ...d, editorState: 'live' } : d
      )
    }
  }
  const doc = openFile(value)
  // Spec 024 (FR-001/009): when the dispatcher proved the active tab is clean,
  // swap its slot for the new document — fresh id, clear dirty, fresh undo
  // (FR-006/007) — instead of creating a new tab.
  if (p.mode === 'replace') {
    const active = state.documents.find((d) => d.id === state.activeId)
    if (active && !active.dirty) {
      return {
        ...state,
        documents: state.documents.map((d) => (d.id === active.id ? doc : d)),
        activeId: doc.id
      }
    }
  }
  return {
    ...state,
    documents: [...state.documents, doc],
    activeId: doc.id
  }
}

export function handleActivateDoc(state: EditingSession, id: string): EditingSession {
  const target = state.documents.find((d) => d.id === id)
  if (target) {
    return {
      ...state,
      activeId: id,
      documents: state.documents.map((d) => (d.id === id ? { ...d, lastActiveAt: Date.now() } : d))
    }
  }
  return state
}

export function handleUpdateContent(
  state: EditingSession,
  payload: { id: string; content: string }
): EditingSession {
  const { id, content } = payload
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.id === id
        ? d.view === 'source'
          ? // Spec 021 FR-007: the source textarea holds the FULL file, so every
            // edit re-extracts the frontmatter and stores the body separately.
            // Dirty compares the full recombined text against the raw on-disk
            // bytes in `baseline` (raw-bytes policy, spec 002).
            (() => {
              const { frontmatter, body } = splitFrontmatter(content)
              return {
                ...d,
                frontmatter,
                content: body,
                dirty: joinFrontmatter(frontmatter, body) !== d.baseline,
                revision: (d.revision ?? 0) + 1,
                lastActiveAt: Date.now()
              }
            })()
          : {
              ...d,
              content,
              // A formatted document's dirty flag compares against the editor's
              // OWN baseline serialization (which absorbed every normalization),
              // not the raw disk bytes — so edit → undo back to the original
              // clears dirty. Source-view content is raw text, so the exact byte
              // comparison stays correct there (raw-bytes policy, spec 002).
              dirty: !markdownSame(content, d.editorBaseline),
              revision: (d.revision ?? 0) + 1,
              lastActiveAt: Date.now()
            }
        : d
    )
  }
}

export function handleCaptureBaseline(
  state: EditingSession,
  payload: { id: string; baseline: string }
): EditingSession {
  // Raw-bytes policy (spec 002): content/baseline remain the on-disk bytes
  // read by the main process (openFile, RELOAD) or the last saved bytes
  // (SAVE_SUCCESS) — Crepe's serialization must NOT rewrite the raw content
  // of a pristine document (a file without a trailing newline would gain
  // one). The payload is stored in the separate `editorBaseline` field, the
  // reference the live-dirty check uses to tell "the editor normalized the
  // document" (clean) from "the user typed" (dirty).
  const { id, baseline } = payload
  return {
    ...state,
    documents: state.documents.map((d) => (d.id === id ? { ...d, editorBaseline: baseline } : d))
  }
}

export function handleSaveSuccess(
  state: EditingSession,
  payload: { id: string; path: string; content: string }
): EditingSession {
  const { id, path, content } = payload
  // Spec 021: the written full text was built by `joinFrontmatter` from the
  // stored parts, so the store's partition is already correct and must NOT be
  // re-derived from the written bytes — a `---` block the user pasted into the
  // visual editor is body content and must stay body (spec edge case). The
  // frontmatter is the written text's prefix; the written body is the suffix.
  // `baseline` keeps the full written bytes for the source-view byte check and
  // the no-edit round trip (research R3); `dirty` compares the pre-update full
  // text against the written text (the original `d.content !== content` guard,
  // level-corrected for the split model — a keystroke during the async write
  // leaves the document dirty).
  const frontmatter = state.documents.find((d) => d.id === id)?.frontmatter ?? ''
  const body = content.startsWith(frontmatter) ? content.slice(frontmatter.length) : content
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.id === id
        ? {
            ...d,
            path: path || d.path,
            title: path ? path.split('/').pop() || d.title : d.title,
            baseline: content,
            editorBaseline: body,
            dirty: joinFrontmatter(d.frontmatter, d.content) !== content,
            externalState: 'clean'
          }
        : d
    )
  }
}

export function handleSaveFailed(state: EditingSession): EditingSession {
  return state
}

export function handleCloseDoc(state: EditingSession, id: string): EditingSession {
  const filtered = state.documents.filter((d) => d.id !== id)
  let activeId = state.activeId
  if (state.activeId === id) {
    const idx = state.documents.findIndex((d) => d.id === id)
    if (filtered.length > 0) {
      activeId = filtered[Math.min(idx, filtered.length - 1)].id
    } else {
      activeId = null
    }
  }
  return { ...state, documents: filtered, activeId }
}

export function handleEvict(state: EditingSession, id: string): EditingSession {
  return {
    ...state,
    documents: state.documents.map((d) => (d.id === id ? { ...d, editorState: 'evicted' } : d))
  }
}

export function handleReactivate(
  state: EditingSession,
  payload: { id: string; cursorOffset: number; scrollTop: number }
): EditingSession {
  const { id, cursorOffset, scrollTop } = payload
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.id === id ? { ...d, editorState: 'live', cursorOffset, scrollTop } : d
    )
  }
}

export function handleCaptureEditorState(
  state: EditingSession,
  payload: { id: string; cursorOffset: number; scrollTop: number }
): EditingSession {
  const { id, cursorOffset, scrollTop } = payload
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.id === id ? { ...d, cursorOffset, scrollTop, lastActiveAt: Date.now() } : d
    )
  }
}

export function handleReload(
  state: EditingSession,
  payload: { id: string; content: string }
): EditingSession {
  const { id, content } = payload
  // Spec 021: re-split the re-read full file (frontmatter + body) so content
  // stays the body and the frontmatter field tracks the disk bytes (R3).
  const { frontmatter, body } = splitFrontmatter(content)
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.id === id
        ? {
            ...d,
            frontmatter,
            content: body,
            baseline: content,
            editorBaseline: body,
            dirty: false,
            externalState: 'clean',
            cursorOffset: 0,
            scrollTop: 0,
            contentVersion: d.contentVersion + 1,
            revision: (d.revision ?? 0) + 1
          }
        : d
    )
  }
}

export function handleUpdatePath(
  state: EditingSession,
  payload: { id: string; path: string }
): EditingSession {
  const { id, path } = payload
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.id === id ? { ...d, path, title: path.split('/').pop() || d.title } : d
    )
  }
}

export function handleReroutePaths(
  state: EditingSession,
  payload: { fromPath: string; toPath: string }
): EditingSession {
  // FR-028: a file or folder was renamed/moved within the app. Every open
  // document whose path sits at or under the old location follows it. The
  // document id is retained so tabs do not close and reopen.
  const { fromPath, toPath } = payload
  return {
    ...state,
    documents: state.documents.map((d) => {
      if (!d.path) return d
      if (!isWithinOrEqual(d.path, fromPath)) return d
      const suffix = d.path.slice(fromPath.length)
      const newPath = toPath + suffix
      return { ...d, path: newPath, title: newPath.split('/').pop() || d.title }
    })
  }
}

export function handleExternalChange(
  state: EditingSession,
  payload: { path: string; kind: 'changed' | 'removed' }
): EditingSession {
  const { path, kind } = payload
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.path === path
        ? {
            ...d,
            externalState: kind === 'removed' ? 'deletedOnDisk' : 'changedOnDisk'
          }
        : d
    )
  }
}

export function handleSetView(
  state: EditingSession,
  payload: { id: string; view: 'formatted' | 'source' }
): EditingSession {
  // Spec 002: switch this document's editing presentation without touching
  // content or dirty state. Only a real flip re-renders the tab.
  const { id, view } = payload
  const target = state.documents.find((d) => d.id === id)
  if (!target || target.view === view) return state
  return {
    ...state,
    documents: state.documents.map((d) => (d.id === id ? { ...d, view } : d))
  }
}

export function handleRefreshFromSource(
  state: EditingSession,
  payload: { id: string; content: string }
): EditingSession {
  // Spec 002, data-model.md: source→formatted return when the raw text
  // differs from the live editor. The new text takes the content slot and
  // bumps contentVersion so the CrepeHost remounts with the source bytes;
  // baseline/dirty are untouched so the document stays unsaved.
  // Spec 021: the payload is the full recombined text, re-split so any
  // frontmatter edits made in source survive the remount (research R3).
  const { id, content } = payload
  const { frontmatter, body } = splitFrontmatter(content)
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.id === id
        ? {
            ...d,
            frontmatter,
            content: body,
            editorBaseline: body,
            cursorOffset: 0,
            scrollTop: 0,
            contentVersion: d.contentVersion + 1
          }
        : d
    )
  }
}

export function documentsReducer(state: EditingSession, action: DocumentsAction): EditingSession {
  switch (action.type) {
    case 'OPEN_NEW':
      return handleOpenNew(state)
    case 'OPEN_EXISTING':
      return handleOpenExisting(state, action.payload)
    case 'ACTIVATE':
      return handleActivateDoc(state, action.payload.id)
    case 'UPDATE_CONTENT':
      return handleUpdateContent(state, action.payload)
    case 'CAPTURE_BASELINE':
      return handleCaptureBaseline(state, action.payload)
    case 'SAVE_SUCCESS':
      if (action.payload.revision !== undefined) {
        const document = state.documents.find((d) => d.id === action.payload.id)
        if (document && document.revision !== action.payload.revision) return state
      }
      return handleSaveSuccess(state, action.payload)
    case 'SAVE_FAILED':
      return handleSaveFailed(state)
    case 'CLOSE':
      return handleCloseDoc(state, action.payload.id)
    case 'EVICT':
      return handleEvict(state, action.payload.id)
    case 'REACTIVATE':
      return handleReactivate(state, action.payload)
    case 'CAPTURE_EDITOR_STATE':
      return handleCaptureEditorState(state, action.payload)
    case 'RELOAD':
      return handleReload(state, action.payload)
    case 'UPDATE_PATH':
      return handleUpdatePath(state, action.payload)
    case 'REROUTE_PATHS':
      return handleReroutePaths(state, action.payload)
    case 'EXTERNAL_CHANGE':
      return handleExternalChange(state, action.payload)
    case 'SET_VIEW':
      return handleSetView(state, action.payload)
    case 'REFRESH_FROM_SOURCE':
      return handleRefreshFromSource(state, action.payload)
    default:
      return state
  }
}

export function getActiveDocument(state: EditingSession): DocumentState | null {
  return state.documents.find((d) => d.id === state.activeId) || null
}

export function hasDirtyDocuments(state: EditingSession): boolean {
  return state.documents.some((d) => d.dirty)
}

export function getDirtyDocuments(state: EditingSession): DocumentState[] {
  return state.documents.filter((d) => d.dirty)
}

export type CloseDecision = 'prompt' | 'close'

/** FR-023: closing a clean document needs no confirmation; a dirty one does. */
export function planClose(state: EditingSession, id: string): CloseDecision {
  const doc = state.documents.find((d) => d.id === id)
  if (!doc) return 'close'
  return doc.dirty ? 'prompt' : 'close'
}

export type QuitDecision = 'prompt' | 'quit'

/** FR-023: quitting with any dirty document prompts, naming the affected ones. */
export function planQuit(state: EditingSession): QuitDecision {
  return hasDirtyDocuments(state) ? 'prompt' : 'quit'
}
