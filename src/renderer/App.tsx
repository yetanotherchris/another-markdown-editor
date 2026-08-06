import { useReducer, useEffect, useCallback, useRef, useState } from 'react'
import { Panel, Group, Separator, usePanelRef } from 'react-resizable-panels'
import type { TreeApi } from 'react-arborist'
import { Squares2X2Icon } from '@heroicons/react/24/outline'
import type { MenuCommand, EntryKind, WorkspaceInfo } from '@shared/ipc-contract'
import {
  EditingSession,
  documentsReducer,
  getActiveDocument,
  planClose,
  DocumentState,
  markdownSame,
  editorMatchesContent,
} from './state/documents'
import {
  initialWorkspaceState,
  workspaceReducer,
  findNodeById,
  TreeNode
} from './state/workspace'
import { loadSettingsFromMain, updateSettings, getSettings } from './state/settings'
import { instancePool } from './editor/instancePool'
import EditorPanel from './editor/EditorPanel'
import Tree from './explorer/Tree'
import TabBar from './tabs/TabBar'
import StatusFooter from './status/StatusFooter'
import HamburgerMenu from './chrome/HamburgerMenu'
import SettingsDialog from './chrome/SettingsDialog'
import type { EditorFont } from './chrome/SettingsDialog'
import {
  renameTargetPath,
  moveTargetPath,
  validateEntryName,
  entryName,
  planDelete,
  deleteDescription,
  DeletePlan,
} from './explorer/operations'
import './App.css'

const initialSession: EditingSession = {
  documents: [],
  activeId: null,
  untitledCounter: 0
}

/** True when `path` is a workspace-relative path. Absolute paths come from the
 *  OS file dialog (e.g. `C:\...` or `/...`) and are not under the workspace. */
function isWorkspaceRelative(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\')) return false
  return !/^[a-zA-Z]:[\\/]/.test(path)
}

type SaveResult = 'saved' | 'cancelled' | 'failed'

export default function App() {
  const [session, dispatch] = useReducer(documentsReducer, initialSession)
  const [workspace, dispatchWorkspace] = useReducer(workspaceReducer, initialWorkspaceState)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [footerNote, setFooterNote] = useState<string | null>(null)
  // Spec 010, US2: the persisted explorer visibility drives the initial
  // collapsed state; handleSidebarResize keeps it in sync while the panel is
  // mounted (FR-007).
  const [explorerCollapsed, setExplorerCollapsed] = useState(false)
  // Spec 012: whether the settings dialog is open. Single instance — opening
  // while open is a no-op (spec edge case), so only a boolean is needed.
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Spec 012, US2: the editor font, applied as `data-editor-font` on the app
  // container and persisted via updateSettings (FR-005/FR-006).
  const [editorFont, setEditorFont] = useState<EditorFont>(getSettings().editorFont)
  const sidebarPanelRef = usePanelRef()
  // Spec 010, US2 (FR-007): set once the initial restore has run. Before that,
  // resize events are the panel settling into its layout (or the restore
  // collapsing it) and must not be persisted as the user's visibility choice.
  const explorerRestoreDoneRef = useRef(false)
  const pendingCreateRef = useRef(new Set<string>())
  const createCounterRef = useRef(0)
  const treeApiRef = useRef<TreeApi<TreeNode> | null>(null)
  const activeDoc = getActiveDocument(session)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  // Spec 008: native confirmation boxes are modal and the renderer awaits the
  // decision over IPC. Only ONE confirmation prompt may be in flight at a time
  // (spec edge case), so every prompt entry point guards on this ref — a second
  // trigger while a dialog is open is ignored rather than stacked.
  const dialogInFlightRef = useRef(false)
  // The prepared-but-unconfirmed folder open (spec 004 FR-009/FR-010); a ref so
  // overlapping open flows cannot clobber the pending slot.
  const pendingFolderOpenRef = useRef<WorkspaceInfo | null>(null)
  // An operation-failed prompt queued while another prompt is up.
  const pendingErrorRef = useRef<string | null>(null)
  // An external changed/removed notice queued while another prompt is up. A
  // single slot, like the error queue: a notice arriving while a dialog is open
  // is DEFERRED (never dropped) and re-surfaced once the guard releases (review
  // 2026-08-04: the old ConfirmDialog-era code deferred these too).
  const pendingExternalPromptRef = useRef<{ path: string; kind: 'changed' | 'removed' } | null>(null)

  // The single place the single-prompt guard is released. Also drains what was
  // queued while the guard was held, so nothing is silently dropped: a deferred
  // external changed/removed notice first (it is a real decision the user must
  // make), then a queued operation error (e.g. a failed trash after "Delete", or
  // a failed folder commit). Each drained item re-acquires the guard
  // synchronously and its own release drains the next.
  const releaseDialogSurface = useCallback(() => {
    dialogInFlightRef.current = false
    const queuedPrompt = pendingExternalPromptRef.current
    const queuedError = pendingErrorRef.current
    pendingExternalPromptRef.current = null
    pendingErrorRef.current = null
    if (queuedPrompt) {
      const doc = sessionRef.current.documents.find(d => d.path === queuedPrompt.path)
      // handleExternalChange returns true when it opens a confirmation prompt;
      // its own release then drains the queued error. If the document is gone or
      // the notice resolved via auto-reload (no prompt), fall through to the error.
      if (doc && handleExternalChangeRef.current(doc, queuedPrompt.kind)) return
    }
    if (queuedError) showOperationErrorRef.current(queuedError)
  }, [])

  // Spec 008 US4: surface a failed operation through the native error box. If
  // another prompt is already up, the error is queued and shown once the guard
  // releases (one prompt at a time, spec edge case).
  const showOperationError = useCallback(async (message: string) => {
    if (dialogInFlightRef.current) {
      pendingErrorRef.current = message
      return
    }
    dialogInFlightRef.current = true
    try {
      await window.api.showConfirmation({ kind: 'operation-failed', message })
    } finally {
      releaseDialogSurface()
    }
  }, [releaseDialogSurface])

  const showOperationErrorRef = useRef(showOperationError)
  showOperationErrorRef.current = showOperationError

  useEffect(() => {
    void loadSettingsFromMain().then(() => {
      // Spec 012: apply the persisted editor font once main's settings resolve.
      setEditorFont(getSettings().editorFont)
    })
  }, [])

  // Spec 012, US2: apply immediately and persist. The renderer cache and main's
  // store are both updated so the choice survives restarts (FR-006).
  const handleEditorFontChange = useCallback((font: EditorFont) => {
    setEditorFont(font)
    updateSettings({ editorFont: font })
    window.api.updateSettings({ editorFont: font }).catch(() => { /* ignore */ })
  }, [])

  const handleContentChange = useCallback((id: string, content: string) => {
    dispatch({ type: 'UPDATE_CONTENT', payload: { id, content } })
  }, [])

  // The editor's serialization right after it parses content is the reference
  // for the live-dirty check (see isDirtyLive). It lives in the store's
  // `editorBaseline` field; content/baseline stay the raw disk bytes
  // (raw-bytes policy, spec 002).
  const handleBaselineCapture = useCallback((id: string, baseline: string) => {
    dispatch({ type: 'CAPTURE_BASELINE', payload: { id, baseline } })
  }, [])

  const handleCursorState = useCallback((id: string, cursorOffset: number, scrollTop: number) => {
    dispatch({ type: 'CAPTURE_EDITOR_STATE', payload: { id, cursorOffset, scrollTop } })
  }, [])

  // The listener plugin's markdownUpdated is debounced by 200 ms, so the
  // reducer's dirty flag lags the keystrokes. The close and quit guards must
  // read the live editor content or the last keystrokes could be discarded
  // without a prompt (research.md R4, Phase 5 deviation).
  const getLiveContent = useCallback((doc: DocumentState): string | null => {
    if (doc.editorState !== 'live') return null
    return instancePool.getMarkdown(doc.id)
  }, [])

  const isDirtyLive = useCallback((doc: DocumentState): boolean => {
    if (doc.dirty) return true
    // A source-view document's text lives in the store (each keystroke
    // dispatches UPDATE_CONTENT synchronously), and its mounted editor
    // serializes the stale pre-source-edit content, so the editor comparison
    // below would be meaningless. doc.dirty is the complete signal.
    if (doc.view === 'source') return false
    const live = getLiveContent(doc)
    if (live === null) return false
    // Raw-bytes policy (spec 002): compare against the editor's OWN baseline —
    // its serialization of the content it last parsed — not the raw disk
    // bytes. Crepe normalizes markdown (autolinks, loose pipes, entities), so
    // a pristine normalizing file must not count as having unsaved changes;
    // only drift from that baseline means the user typed.
    return !markdownSame(live, doc.editorBaseline)
  }, [getLiveContent])

  // Spec 002, save model (data-model.md): the source view writes the raw bytes
  // the user sees (document.content) so saving never re-adds normalization
  // (e.g. a trailing newline) to an untouched file. A formatted document that
  // is clean in the live-dirty sense is written from the stored raw bytes too
  // (a no-edit open/save stays byte-identical, SC-006); only a document with
  // real drift writes the Crepe serialization so the edits are kept.
  const getContentToSave = useCallback((doc: DocumentState): string => {
    if (doc.view === 'source') return doc.content
    if (isDirtyLive(doc)) return instancePool.getMarkdown(doc.id) ?? doc.content
    return doc.content
  }, [isDirtyLive])

  const flushLiveContent = useCallback(() => {
    for (const doc of sessionRef.current.documents) {
      // A source-view document's text lives in the store (raw bytes); its
      // mounted editor serializes the stale pre-source-edit content, so
      // flushing it would clobber the edits the user made in source.
      if (doc.view === 'source') continue
      const live = getLiveContent(doc)
      if (live === null || markdownSame(live, doc.content)) continue
      // Raw-bytes policy (spec 002): the serialization of a PRISTINE document
      // must never replace the stored disk bytes — Crepe's output can differ
      // from raw text beyond the tolerated trailing newline (loose pipes,
      // entities, autolinks) and would mark an unedited file dirty. Only adopt
      // the live text when the reducer already knows the document was edited
      // (the debounced emission set `dirty`; a sub-200 ms keystroke window is
      // rare enough to leave to the next change).
      if (!doc.dirty) continue
      dispatch({ type: 'UPDATE_CONTENT', payload: { id: doc.id, content: live } })
    }
  }, [getLiveContent])

  const enforcePoolCap = useCallback((activeId: string | null) => {
    if (instancePool.hasSpace()) return
    const current = sessionRef.current
    const evictId = instancePool.evictLRU(
      current.documents.filter(d => isDirtyLive(d)),
      activeId
    )
    if (evictId) {
      // evictLRU only returns clean documents, so the store already holds the
      // authoritative content — nothing to capture. Drop the entry and mark the
      // document evicted; the next activate remounts from the stored bytes.
      instancePool.remove(evictId)
      dispatch({ type: 'EVICT', payload: { id: evictId } })
    }
  }, [getLiveContent, isDirtyLive])

  const saveDocument = useCallback(async (doc: DocumentState, forceDialog = false): Promise<SaveResult> => {
    const content = getContentToSave(doc)
    if (doc.path && !forceDialog) {
      const pathAtStart = doc.path
      const result = await window.api.writeFile(pathAtStart, content)
      if (result.ok) {
        // A rename/move may have rerouted this document while the write was
        // in flight (REROUTE_PATHS, FR-028). The write hit the pre-reroute
        // path; re-apply it to the current path so the content does not fork
        // into two divergent files and the tab does not silently point back
        // at the old location.
        const current = sessionRef.current.documents.find(d => d.id === doc.id)
        const currentPath = current?.path ?? pathAtStart
        if (currentPath !== pathAtStart) {
          const rerouted = await window.api.writeFile(currentPath, content)
          if (!rerouted.ok) {
            dispatch({ type: 'SAVE_FAILED', payload: { id: doc.id } })
            return 'failed'
          }
        }
        dispatch({ type: 'SAVE_SUCCESS', payload: { id: doc.id, path: currentPath, content } })
        return 'saved'
      }
      dispatch({ type: 'SAVE_FAILED', payload: { id: doc.id } })
      return 'failed'
    }
    const result = await window.api.saveFileDialog(doc.title, content)
    if (result.ok && result.value) {
      dispatch({ type: 'SAVE_SUCCESS', payload: { id: doc.id, path: result.value.path, content: result.value.content } })
      return 'saved'
    }
    return 'cancelled'
  }, [getContentToSave])

  const doClose = useCallback((id: string) => {
    dispatch({ type: 'CLOSE', payload: { id } })
    instancePool.remove(id)
  }, [])

  const handleCloseRequest = useCallback(async (id: string) => {
    const doc = sessionRef.current.documents.find(d => d.id === id)
    if (!doc) return
    if (planClose(sessionRef.current, id) === 'close' && !isDirtyLive(doc)) {
      doClose(id)
      return
    }
    // Spec 008: show the native unsaved-changes box. Only one prompt at a time
    // at a time (spec edge case); a second trigger while one is open is ignored.
    if (dialogInFlightRef.current) return
    dialogInFlightRef.current = true
    flushLiveContent()
    try {
      let error: string | undefined
      for (;;) {
        const result = await window.api.showConfirmation({
          kind: 'unsaved-close',
          documentTitle: doc.title,
          ...(error ? { error } : {})
        })
        if (!result.ok) return
        const decision = result.value
        if (decision === 'cancel') return
        if (decision === 'discard') {
          doClose(doc.id)
          return
        }
        // save
        const saved = await saveDocument(doc)
        if (saved === 'saved') {
          doClose(doc.id)
          return
        }
        if (saved === 'failed') {
          // Research R5: a failed save re-prompts with the failure explained and
          // the document stays open and dirty (US2 scenario 4).
          error = `Could not save ${doc.title}. The document stays open.`
          continue
        }
        // Save-As dialog cancelled → re-prompt; the tab stays open.
        continue
      }
    } finally {
      releaseDialogSurface()
    }
  }, [doClose, flushLiveContent, isDirtyLive, releaseDialogSurface, saveDocument])

  const reloadDocument = useCallback(async (doc: DocumentState, force = false) => {
    if (!doc.path) return
    const result = await window.api.readFile(doc.path)
    if (!result.ok) return
    if (!force) {
      // Auto-reload path only: a keystroke landing while the read was in
      // flight must not be silently discarded by the reload.
      const fresh = sessionRef.current.documents.find(d => d.id === doc.id)
      if (!fresh || fresh.dirty || isDirtyLive(fresh)) return
    }
    instancePool.remove(doc.id)
    dispatch({ type: 'RELOAD', payload: { id: doc.id, content: result.value.content } })
  }, [isDirtyLive])

  const handleQuitRequest = useCallback(async () => {
    // A second trigger while any prompt is open is ignored (one prompt at a
    // time). Checked BEFORE the no-dirty fast path: quitting while
    // a sheet is up (e.g. an external-removed rescue for a clean document) must
    // not close the window and abandon the in-memory content it was offering
    // (review 2026-08-04).
    if (dialogInFlightRef.current) return
    const current = sessionRef.current
    flushLiveContent()
    const dirtyDocs = current.documents.filter(d => isDirtyLive(d))
    if (dirtyDocs.length === 0) {
      window.api.confirmQuit('quit')
      return
    }
    dialogInFlightRef.current = true
    try {
      let error: string | undefined
      // The still-unsaved set shrinks as saves succeed, so a re-prompt lists
      // (and a second Save All re-saves) only the documents that are actually
      // still unsaved — not a stale pre-save snapshot (review 2026-08-04).
      const remaining = [...dirtyDocs]
      for (;;) {
        const result = await window.api.showConfirmation({
          kind: 'unsaved-quit',
          documentTitles: remaining.map(d => d.title),
          ...(error ? { error } : {})
        })
        if (!result.ok) return
        const decision = result.value
        if (decision === 'cancel') return
        if (decision === 'discard-all') {
          window.api.confirmQuit('quit')
          return
        }
        // save-all
        let allSaved = true
        for (const doc of [...remaining]) {
          const saved = await saveDocument(doc)
          if (saved === 'saved') {
            remaining.splice(remaining.indexOf(doc), 1)
            continue
          }
          if (saved === 'failed') {
            error = `Could not save ${doc.title}. The application stays open.`
          }
          allSaved = false
          break
        }
        if (allSaved) {
          window.api.confirmQuit('quit')
          return
        }
        // A save failed or was cancelled — re-prompt with the failure explained
        // (US2 scenario 4); the application stays open.
      }
    } finally {
      releaseDialogSurface()
    }
  }, [flushLiveContent, isDirtyLive, releaseDialogSurface, saveDocument])

  const handleExternalPrompt = useCallback(async (prompt: { id: string; kind: 'changed' | 'removed' }) => {
    const doc = sessionRef.current.documents.find(d => d.id === prompt.id)
    if (!doc) return
    if (dialogInFlightRef.current) return
    dialogInFlightRef.current = true
    try {
      if (prompt.kind === 'changed') {
        const result = await window.api.showConfirmation({
          kind: 'external-changed',
          documentTitle: doc.title
        })
        if (result.ok && result.value === 'reload') {
          // The user explicitly chose to replace their version with the disk
          // version, so the pre-existing dirty state must not block the reload.
          await reloadDocument(doc, true)
        }
        return
      }
      // removed — the content is still open in memory; OK keeps it, Save As
      // writes it to a new location. A failed save re-prompts (research R5).
      let error: string | undefined
      for (;;) {
        const result = await window.api.showConfirmation({
          kind: 'external-removed',
          documentTitle: doc.title,
          ...(error ? { error } : {})
        })
        if (!result.ok) return
        if (result.value === 'ok') return
        const saved = await saveDocument(doc, true)
        if (saved === 'failed') {
          error = `Could not save ${doc.title}.`
          continue
        }
        return
      }
    } finally {
      releaseDialogSurface()
    }
  }, [reloadDocument, releaseDialogSurface, saveDocument])

  // Route an external changed/removed event to its handling. Returns true when a
  // confirmation prompt is opened — used by releaseDialogSurface so a deferred
  // notice that instead resolves via auto-reload (a clean document) still lets a
  // queued operation error show.
  const handleExternalChange = useCallback((doc: DocumentState, kind: 'changed' | 'removed'): boolean => {
    if (kind === 'changed' && !doc.dirty && !isDirtyLive(doc)) {
      reloadDocument(doc)
      return false
    }
    flushLiveContent()
    void handleExternalPrompt({ id: doc.id, kind })
    return true
  }, [flushLiveContent, handleExternalPrompt, isDirtyLive, reloadDocument])

  const handleExternalChangeRef = useRef(handleExternalChange)
  handleExternalChangeRef.current = handleExternalChange

  const handleActivate = useCallback((id: string) => {
    const current = sessionRef.current
    const doc = current.documents.find(d => d.id === id)
    if (!doc) return
    if (doc.editorState === 'evicted') {
      dispatch({
        type: 'REACTIVATE',
        payload: { id, cursorOffset: doc.cursorOffset, scrollTop: doc.scrollTop }
      })
    }
    dispatch({ type: 'ACTIVATE', payload: { id } })
    // Pass the target id explicitly: sessionRef.current.activeId is still the
    // pre-batch value, so reading it here could evict the tab just clicked.
    enforcePoolCap(id)
  }, [enforcePoolCap])

  // Spec 002, US1: the formatted→source transition syncs the live editor text
  // into the store first so the raw source reflects every keystroke, then
  // flips the tab. The source textarea reads `document.content`.
  const handleShowSource = useCallback(
    (id: string) => {
      flushLiveContent()
      dispatch({ type: 'SET_VIEW', payload: { id, view: 'source' } })
    },
    [flushLiveContent]
  )

  // Spec 002, US3: returning to formatted editing. When the raw source text
  // equals what Crepe already parsed, the editor can stay mounted and
  // undo/scroll/cursor survive (research.md R3, no-edit round trip). When the
  // source text changed (or the editor was evicted so nothing is live), the
  // new text must become the editor's content — REFRESH_FROM_SOURCE bumps
  // contentVersion so CrepeHost remounts with the source bytes.
  const handleReturnToFormatted = useCallback(
    (id: string) => {
      const doc = sessionRef.current.documents.find(d => d.id === id)
      if (!doc) return
      const live = getLiveContent(doc)
      // editorMatchesContent (not markdownSame) decides the no-op round trip:
      // only the editor's single appended trailing newline is "unchanged", so a
      // blank line typed at EOF in source is not silently dropped, while a
      // pristine file that Crepe merely normalized still skips the remount.
      if (live === null || !editorMatchesContent(live, doc.content)) {
        dispatch({ type: 'REFRESH_FROM_SOURCE', payload: { id, content: doc.content } })
      }
      dispatch({ type: 'SET_VIEW', payload: { id, view: 'formatted' } })
    },
    [getLiveContent]
  )

  // Spec 002, US2: an explorer "View source" request routes to the open-tab
  // fast path or reads the file into a new source-view tab. Called with the
  // workspace path of the node (Tree passes node.id).
  const openPathInSource = useCallback(
    async (path: string): Promise<string | null> => {
      const existing = sessionRef.current.documents.find(
        d => d.path === path && d.editorState !== 'evicted'
      )
      if (existing) {
        dispatch({ type: 'ACTIVATE', payload: { id: existing.id } })
        if (existing.view !== 'source') {
          flushLiveContent()
          dispatch({ type: 'SET_VIEW', payload: { id: existing.id, view: 'source' } })
        }
        enforcePoolCap(existing.id)
        return existing.id
      }
      const read = await window.api.readFile(path)
      if (!read.ok) return null
      dispatch({ type: 'OPEN_EXISTING', payload: { ...read.value, view: 'source' } })
      // The freshly opened tab's editor registers on mount, so it is the newest
      // LRU entry and cannot be evicted here. sessionRef.current.activeId is
      // still the pre-dispatch document — passing it only protects the tab that
      // is visible right now, which is the intent.
      enforcePoolCap(sessionRef.current.activeId)
      return read.value.path ?? read.value.name
    },
    [enforcePoolCap, flushLiveContent]
  )

  const handleViewSource = useCallback(
    (path: string) => {
      void openPathInSource(path)
    },
    [openPathInSource]
  )

  // Spec 002, US7: an explorer "Open" request is the visual counterpart of
  // "View source". It activates an already-open tab without duplicating it;
  // a tab stuck in source view returns to formatted editing via the same
  // content-migration path as the source toolbar's return control. An unopened
  // file is read into a new formatted tab.
  const openPathInFormatted = useCallback(
    async (path: string): Promise<void> => {
      const existing = sessionRef.current.documents.find(
        d => d.path === path && d.editorState !== 'evicted'
      )
      if (existing) {
        dispatch({ type: 'ACTIVATE', payload: { id: existing.id } })
        if (existing.view === 'source') {
          handleReturnToFormatted(existing.id)
        }
        enforcePoolCap(existing.id)
        return
      }
      const read = await window.api.readFile(path)
      if (!read.ok) return
      // view:'formatted' also flips a reopened evicted tab that had been in
      // source view back to visual editing (OPEN_EXISTING applies the view).
      dispatch({ type: 'OPEN_EXISTING', payload: { ...read.value, view: 'formatted' } })
      enforcePoolCap(sessionRef.current.activeId)
    },
    [enforcePoolCap, handleReturnToFormatted]
  )

  const handleOpen = useCallback(
    (path: string) => {
      void openPathInFormatted(path)
    },
    [openPathInFormatted]
  )

  const handleNew = useCallback(() => {
    dispatch({ type: 'OPEN_NEW' })
    // The new untitled document is not in the pool yet; skip the currently
    // visible document so its editor is not evicted mid-render.
    enforcePoolCap(sessionRef.current.activeId)
  }, [enforcePoolCap])

  const handleTreeSelect = useCallback(async (id: string | null) => {
    dispatchWorkspace({ type: 'SELECT', payload: { id } })
    if (!id) return
    const node = findNodeById(workspace.nodes, id)
    if (!node || node.kind !== 'file') return
    const result = await window.api.readFile(id)
    if (result.ok) {
      dispatch({ type: 'OPEN_EXISTING', payload: result.value })
      // Keep the previously visible document safe; the newly opened one is
      // the newest pool entry and will not be the eviction candidate.
      enforcePoolCap(sessionRef.current.activeId)
    }
  }, [workspace.nodes, enforcePoolCap])

  const handleTreeActivate = useCallback(async (id: string) => {
    const node = findNodeById(workspace.nodes, id)
    if (!node || node.kind !== 'file') return

    const result = await window.api.readFile(id)
    if (result.ok) {
      dispatch({ type: 'OPEN_EXISTING', payload: result.value })
      enforcePoolCap(sessionRef.current.activeId)
    }
  }, [workspace.nodes, enforcePoolCap])

  const handleTreeToggle = useCallback(async (id: string, isLoaded: boolean) => {
    if (isLoaded) {
      // arborist opened or closed a folder whose children we already have
      // (user toggle, or an internal openParents/scrollTo during inline edit
      // or keyboard navigation). Visibility is arborist's own state; the data
      // stays put so a later open costs no refetch. Collapsing must NOT wipe
      // the children here: arborist fires this for auto-opens too, and doing
      // so would erase the node being edited right after it was created.
      return
    }

    dispatchWorkspace({ type: 'EXPAND_START', payload: { id } })
    const result = await window.api.readDir(id)
    if (result.ok) {
      dispatchWorkspace({ type: 'EXPAND_SUCCESS', payload: { id, entries: result.value } })
    } else {
      dispatchWorkspace({ type: 'EXPAND_ERROR', payload: { id, error: result.message } })
    }
  }, [])

  const applyMove = useCallback(async (fromPath: string, toPath: string) => {
    const result = await window.api.moveEntry(fromPath, toPath)
    if (!result.ok) {
      void showOperationError(result.message)
      return false
    }
    // The watcher event for this mutation is suppressed in main (FR-037), so
    // the renderer applies the result to its own tree and document state.
    dispatchWorkspace({ type: 'MOVE_ENTRY', payload: { fromPath, toPath, entry: result.value } })
    dispatchWorkspace({ type: 'SELECT', payload: { id: toPath } })
    dispatch({ type: 'REROUTE_PATHS', payload: { fromPath, toPath } })
    return true
  }, [])

  // T058: inline rename commit from the tree (also used to name new entries).
  const handleRename = useCallback(async (node: TreeNode, newName: string): Promise<boolean> => {
    const error = validateEntryName(node.kind, node.name, newName)
    if (error) {
      void showOperationError(error)
      return false
    }
    const fromPath = node.id
    const toPath = renameTargetPath(fromPath, newName.trim())
    // The placeholder state ends at the first committed rename attempt. The
    // 2026-08-02 clarification limits unconfirmed trash to *empty placeholders*;
    // keeping the id in pendingCreateRef past this point would let a later
    // Escape-cancel silently trash a file that may now hold real content.
    pendingCreateRef.current.delete(fromPath)
    setPendingEditId(null)
    if (toPath === fromPath) return true
    return applyMove(fromPath, toPath)
  }, [applyMove])

  const handleEditingCancelled = useCallback((id: string) => {
    // A new entry the user declined to name: remove the placeholder.
    if (!pendingCreateRef.current.has(id)) return
    pendingCreateRef.current.delete(id)
    setPendingEditId(null)
    window.api.trashEntry(id).then((result) => {
      if (result.ok) {
        dispatchWorkspace({ type: 'REMOVE_ENTRY', payload: { id } })
        return
      }
      // The placeholder is still on disk under its generated name. The tree
      // still shows it, so the user can retry via the context menu's Delete
      // (which confirms), or remove it manually — but a silent failure would
      // break the clarification's promise that cancelling removes the file.
      const name = entryName(id)
      void showOperationError(`Could not remove "${name}". It is still on disk — right-click and delete it, or remove it manually.`)
    })
  }, [])

  // T057: create a file or folder from the tree context menu, ready to be named.
  const handleCreate = useCallback(async (parent: TreeNode | null, kind: EntryKind) => {
    const parentNode = parent ? findNodeById(workspaceRef.current.nodes, parent.id) : null
    if (parentNode && parentNode.kind === 'directory' && parentNode.loadState !== 'loaded') {
      // The target folder is collapsed: expand it first so the new entry is
      // visible and can be named inline.
      dispatchWorkspace({ type: 'EXPAND_START', payload: { id: parentNode.id } })
      const read = await window.api.readDir(parentNode.id)
      if (!read.ok) {
        dispatchWorkspace({ type: 'EXPAND_ERROR', payload: { id: parentNode.id, error: read.message } })
        return
      }
      dispatchWorkspace({ type: 'EXPAND_SUCCESS', payload: { id: parentNode.id, entries: read.value } })
    }

    // createCounterRef resets on app restart, so a leftover placeholder from a
    // previous session can make the first name collide (CONFLICT). Retry with
    // the next number instead of failing the operation.
    let result: Awaited<ReturnType<typeof window.api.createEntry>> | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      createCounterRef.current++
      const placeholder = kind === 'file'
        ? `new-file-${createCounterRef.current}.md`
        : `new-folder-${createCounterRef.current}`
      const attemptResult = await window.api.createEntry(parent ? parent.id : '.', placeholder, kind)
      if (attemptResult.ok || attemptResult.code !== 'CONFLICT') {
        result = attemptResult
        break
      }
    }
    if (!result || !result.ok) {
      void showOperationError(result?.message ?? 'Could not create the new entry')
      return
    }
    const entry = result.value
    pendingCreateRef.current.add(entry.path)
    dispatchWorkspace({
      type: 'INSERT_ENTRY',
      payload: { parentPath: parent ? parent.id : '', entry }
    })
    dispatchWorkspace({ type: 'SELECT', payload: { id: entry.path } })
    setPendingEditId(entry.path)
  }, [])

  const cleanupAfterDelete = useCallback((node: TreeNode, plan: DeletePlan) => {
    for (const doc of plan.cleanToClose) {
      // FR-012: the native box is gone once "Delete" is clicked, so the async
      // trash window is input-open. A document that was clean at confirm time
      // may have received a keystroke while the trash ran — closing it now
      // would discard that edit without a prompt (Principle III, review
      // 2026-08-04). Re-check and leave any document that became dirty open.
      const fresh = sessionRef.current.documents.find(d => d.id === doc.id)
      if (fresh && isDirtyLive(fresh)) continue
      doClose(doc.id)
    }
    dispatchWorkspace({ type: 'REMOVE_ENTRY', payload: { id: node.id } })
    const selected = workspaceRef.current.selectedId
    // A descendant may have been selected (e.g. a file inside a deleted
    // folder); it is gone too, so clear the selection as well.
    if (selected === node.id || (selected !== null && selected.startsWith(node.id + '/'))) {
      dispatchWorkspace({ type: 'SELECT', payload: { id: null } })
    }
  }, [doClose, isDirtyLive])

  // Spec 008 delete flow, driven by the native message boxes: describe → plan →
  // (delete-blocked | delete-to-trash) → trash; on TRASH_UNAVAILABLE → an
  // explicit permanent-delete confirmation. The whole flow — including the
  // async describe — holds the single-prompt guard (FR-012): no
  // second prompt can open and no cancellation is offered while the trash
  // operation runs.
  const runDeleteConfirmation = useCallback(async (node: TreeNode) => {
    if (dialogInFlightRef.current) return
    dialogInFlightRef.current = true
    try {
      const result = await window.api.describeEntry(node.id)
      if (!result.ok) {
        // The guard is held, so the error is queued and shown once the flow
        // releases it (showOperationError's single-surface queue).
        void showOperationError(result.message)
        return
      }
      const info = result.value
      const plan = planDelete(sessionRef.current.documents, node.id, isDirtyLive)
      if (plan.dirtyBlockers.length > 0) {
        const blocked = await window.api.showConfirmation({
          kind: 'delete-blocked',
          targetName: node.name,
          blockerTitles: plan.dirtyBlockers.map(d => d.title)
        })
        // An IPC failure here is invisible otherwise; surface it like the other
        // flows (queued, then shown once the guard releases).
        if (!blocked.ok) void showOperationError(blocked.message)
        return
      }
      const deleteDecision = await window.api.showConfirmation({
        kind: 'delete-to-trash',
        targetName: node.name,
        detail: deleteDescription(info),
        cleanToCloseTitles: plan.cleanToClose.map(d => d.title)
      })
      if (!deleteDecision.ok || deleteDecision.value !== 'delete') return
      const trashed = await window.api.trashEntry(node.id)
      if (trashed.ok) {
        cleanupAfterDelete(node, plan)
        return
      }
      if (trashed.code === 'TRASH_UNAVAILABLE') {
        // FR-029a: trash is not available — offer permanent deletion only as an
        // explicit second confirmation.
        const permanent = await window.api.showConfirmation({
          kind: 'permanent-delete',
          targetName: node.name,
          detail: deleteDescription(info),
          cleanToCloseTitles: plan.cleanToClose.map(d => d.title)
        })
        if (!permanent.ok || permanent.value !== 'delete-permanent') return
        const deleted = await window.api.trashEntry(node.id, true)
        if (deleted.ok) {
          cleanupAfterDelete(node, plan)
          return
        }
        void showOperationError(deleted.message)
        return
      }
      void showOperationError(trashed.message)
    } finally {
      releaseDialogSurface()
    }
  }, [cleanupAfterDelete, isDirtyLive, releaseDialogSurface])

  // T059: drag-and-drop move between folders.
  const handleTreeMove = useCallback((id: string, targetParentId: string) => {
    const target = moveTargetPath(id, targetParentId)
    if (!target) return
    applyMove(id, target)
  }, [applyMove])

  const handleSidebarResize = useCallback((size: { asPercentage: number; inPixels: number }) => {
    const collapsed = size.asPercentage <= 0
    setExplorerCollapsed(collapsed)
    // Never persist a collapsed (0) width. Writing 0 would change the Panel's
    // `defaultSize` prop, which re-runs its registration effect and replaces
    // the panel object — wiping the library's `expandToSize` so a toggle-expand
    // snaps to minSize instead of the previous width (spec 010 US2 scenario 2,
    // verified 2026-08-05). The collapsed visibility is persisted separately.
    if (collapsed) {
      if (explorerRestoreDoneRef.current) {
        updateSettings({ explorerVisible: false })
        window.api.updateSettings({ explorerVisible: false }).catch(() => { /* ignore */ })
      }
      return
    }
    updateSettings({ sidebarWidth: size.asPercentage })
    window.api.updateSettings({ sidebarWidth: size.asPercentage }).catch(() => { /* ignore */ })
    // A non-collapsed panel IS visible, so persist true unconditionally. Main's
    // settings merge reads the CURRENT state from disk, so two updates inside
    // the 500 ms debounce window clobber each other (the sidebarWidth-only
    // write above would otherwise resurrect a stale persisted "hidden" choice —
    // the exact race that broke the reveal-on-open restart e2e, review
    // 2026-08-06). The launch-time restore was removed the same day; the mount
    // guard above still suppresses the transient size-0 from persisting a fake
    // collapse.
    updateSettings({ explorerVisible: true })
    window.api.updateSettings({ explorerVisible: true }).catch(() => { /* ignore */ })
  }, [])

  // Spec 010, US2: the explorer toggle collapses/expands the sidebar panel
  // (FR-005). The panel only exists while a workspace is open; the button is
  // disabled otherwise (spec edge case). The choice is persisted explicitly so
  // it does not depend on a resize event firing (FR-007).
  const handleToggleExplorer = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    explorerRestoreDoneRef.current = true
    // isCollapsed() is true when the panel IS collapsed: expand then, else
    // collapse, and persist the resulting state.
    const currentlyCollapsed = panel.isCollapsed()
    if (currentlyCollapsed) panel.expand()
    else panel.collapse()
    updateSettings({ explorerVisible: !currentlyCollapsed })
    window.api.updateSettings({ explorerVisible: !currentlyCollapsed }).catch(() => { /* ignore */ })
  }, [])

  // Spec 004, FR-010: a folder switch rebinds the workspace-relative paths of
  // open documents to the new root. Before committing a folder open (which
  // swaps main's workspace), confirm when those documents have unsaved changes.
  const dirtyWorkspaceRelativeDocs = useCallback(
    () => sessionRef.current.documents.filter(
      d => isDirtyLive(d) && !!d.path && isWorkspaceRelative(d.path)
    ),
    [isDirtyLive]
  )

  // Spec 010 (clarification 2026-08-05): opening a folder reveals the explorer
  // even if it was previously hidden — an explicit open overrides the persisted
  // hidden choice so the newly opened workspace is always browsable. Runs on
  // every successful folder commit (both Open Folder and a recent-folder open
  // route through commitFolderOpen). The restore flag is deliberately NOT set
  // here (review 2026-08-06): the panel has not mounted yet, and arming it
  // would defeat the mount guard that suppresses the transient size-0 resize.
  // Persistence is explicit on this path, so nothing is lost.
  const revealExplorer = useCallback(() => {
    updateSettings({ explorerVisible: true })
    window.api.updateSettings({ explorerVisible: true }).catch(() => { /* ignore */ })
    const panel = sidebarPanelRef.current
    if (panel && panel.isCollapsed()) panel.expand()
  }, [])

  const commitFolderOpen = useCallback(async () => {
    const result = await window.api.commitFolderOpen()
    if (!result.ok) {
      void showOperationError(result.message)
      return
    }
    dispatchWorkspace({
      type: 'REPLACE',
      payload: {
        name: result.value.name,
        root: result.value.path,
        entries: result.value.entries
      }
    })
    revealExplorer()
  }, [revealExplorer])

  // Both entry points (File > Open Folder and a recent-folder open, FR-007)
  // route through the same prepare → (confirm) → commit flow. A second folder
  // open while the confirmation is up is ignored here (main also rejects new
  // prepares while one is pending) so the in-flight flow cannot be clobbered.
  const runFolderOpenFlow = useCallback(async (requestPath?: string) => {
    if (pendingFolderOpenRef.current) return
    const prepared = requestPath === undefined
      ? await window.api.prepareFolderOpen()
      : await window.api.prepareFolderOpen(requestPath)
    if (!prepared.ok) {
      void showOperationError(prepared.message)
      return
    }
    if (!prepared.value) return // dialog cancelled — nothing pending
    if (dirtyWorkspaceRelativeDocs().length === 0) {
      await commitFolderOpen()
      return
    }
    if (dialogInFlightRef.current) {
      await window.api.cancelFolderOpen()
      return
    }
    dialogInFlightRef.current = true
    pendingFolderOpenRef.current = prepared.value
    try {
      let error: string | undefined
      for (;;) {
        const result = await window.api.showConfirmation({
          kind: 'folder-open',
          documentTitles: dirtyWorkspaceRelativeDocs().map(d => d.title),
          ...(error ? { error } : {})
        })
        if (!result.ok) {
          await window.api.cancelFolderOpen()
          return
        }
        const decision = result.value
        if (decision === 'cancel') {
          // FR-010: cancel keeps the session and the recent entry unchanged.
          await window.api.cancelFolderOpen()
          return
        }
        if (decision === 'discard-all') {
          // FR-010 "Discard": the user chose to throw the unsaved changes away, so
          // the dirty workspace-relative documents are CLOSED (their edits
          // dropped). They must not stay open: after the workspace swap their
          // relative paths rebind to the new root, and a later Ctrl+S would write
          // old-root content over whatever file shares the path there.
          for (const doc of dirtyWorkspaceRelativeDocs()) {
            doClose(doc.id)
          }
          await commitFolderOpen()
          return
        }
        // save-all
        let allSaved = true
        for (const doc of dirtyWorkspaceRelativeDocs()) {
          const saved = await saveDocument(doc)
          if (saved !== 'saved') {
            if (saved === 'failed') {
              error = `Could not save ${doc.title}.`
            }
            allSaved = false
            break
          }
        }
        if (allSaved) {
          await commitFolderOpen()
          return
        }
        // A save failed or was cancelled — keep the confirmation open (the
        // prepared folder was not committed) and re-prompt.
      }
    } finally {
      pendingFolderOpenRef.current = null
      releaseDialogSurface()
    }
  }, [commitFolderOpen, dirtyWorkspaceRelativeDocs, doClose, releaseDialogSurface, saveDocument])

  // Spec 010: the single command bus for menu-driven actions — shared by the
  // native-menu IPC listener, the renderer hamburger, and the keyboard
  // shortcuts (which send the same `menu:command`). Every action the old File
  // menu could send resolves here, so the hamburger exposes the same set
  // (FR-001/FR-002).
  const handleMenuCommand = useCallback((command: MenuCommand) => {
    const active = getActiveDocument(sessionRef.current)
    if (typeof command === 'object') {
      // Spec 004: File > Recent Items. Route through the exact same dispatch
      // paths as File > Open File / Open Folder (FR-007). A failed open
      // surfaces in-context and leaves the session untouched (FR-009).
      if (command.type === 'open-recent') {
        if (command.kind === 'file') {
          window.api.openRecentFile(command.path).then((result) => {
            if (result.ok) {
              dispatch({ type: 'OPEN_EXISTING', payload: result.value })
              enforcePoolCap(sessionRef.current.activeId)
            } else {
              void showOperationError(result.message)
            }
          })
        } else {
          // Recent-folder open shares the prepare → (confirm) → commit flow
          // with File > Open Folder (FR-007/FR-010).
          void runFolderOpenFlow(command.path)
        }
      }
      return
    }
    switch (command) {
      case 'open-file': {
        window.api.openFileDialog().then((result) => {
          if (result.ok && result.value) {
            dispatch({ type: 'OPEN_EXISTING', payload: result.value })
            enforcePoolCap(sessionRef.current.activeId)
          } else if (!result.ok) {
            void showOperationError(result.message)
          }
        })
        break
      }
      case 'open-folder': {
        void runFolderOpenFlow()
        break
      }
      case 'save': {
        if (active) saveDocument(active)
        break
      }
      case 'save-as': {
        if (active) saveDocument(active, true)
        break
      }
      case 'close-tab': {
        if (active) handleCloseRequest(active.id)
        break
      }
      case 'new-file': {
        handleNew()
        break
      }
      default:
        break
    }
  }, [enforcePoolCap, handleCloseRequest, handleNew, runFolderOpenFlow, saveDocument, showOperationError])

  useEffect(() => {
    const unsubMenu = window.api.onMenuCommand(handleMenuCommand)

    const unsubDocument = window.api.onDocumentChanged((e) => {
      const doc = sessionRef.current.documents.find(d => d.path === e.path)
      if (!doc) return
      dispatch({ type: 'EXTERNAL_CHANGE', payload: { path: e.path, kind: e.kind } })
      // One prompt at a time: never prompt over a dialog that is up.
      // DEFER, don't drop — the notice is re-surfaced once the guard releases
      // (releaseDialogSurface drains it, matching the operation-error queue).
      if (dialogInFlightRef.current) {
        pendingExternalPromptRef.current = { path: e.path, kind: e.kind }
        return
      }
      handleExternalChange(doc, e.kind)
    })

    const unsubWorkspace = window.api.onWorkspaceChanged((e) => {
      dispatchWorkspace({ type: 'APPLY_WATCH_EVENT', payload: e })
    })

    const unsubQuit = window.api.onQuitRequested(() => {
      void handleQuitRequest()
    })

    // Spec 004, FR-011: a persistence failure is non-fatal to the open it
    // followed, but is reported quietly in the footer for actionability. A
    // later successful persistence write clears the note so it does not linger
    // after the cause has resolved.
    const unsubRecentWarning = window.api.onRecentItemsWarning((w) => {
      setFooterNote(w.message)
    })
    const unsubRecentOk = window.api.onRecentItemsOk(() => {
      setFooterNote(null)
    })

    return () => {
      unsubMenu()
      unsubDocument()
      unsubWorkspace()
      unsubRecentWarning()
      unsubRecentOk()
      unsubQuit()
    }
  }, [handleExternalChange, handleMenuCommand, handleQuitRequest])

  useEffect(() => {
    return () => {
      instancePool.destroyAll()
    }
  }, [])

  // Spec 002, US004: the explorer follows the active tab. When the active
  // document maps to a workspace file, open its parent folders, reveal it, and
  // select it; a document without a workspace path (untitled) or an absolute
  // path (opened outside the workspace) clears the highlight so the explorer
  // never shows a stale selection (FR-021).
  const workspaceActiveId = session.activeId
  useEffect(() => {
    if (!workspace.name) return
    const active = sessionRef.current.documents.find(d => d.id === workspaceActiveId)
    const path = active?.path
    if (!path || !isWorkspaceRelative(path)) {
      dispatchWorkspace({ type: 'SELECT', payload: { id: null } })
      return
    }
    // The reveal may target a file inside a folder that has never been
    // expanded. openParents lazily loads each ancestor through the existing
    // onToggle; the effect re-runs when those loaded nodes land, completing the
    // reveal (US6 acceptance 2, research R-Explorer).
    dispatchWorkspace({ type: 'SELECT', payload: { id: path } })
    const api = treeApiRef.current
    if (api) {
      api.openParents(path)
      api.scrollTo(path)
    }
  }, [workspaceActiveId, workspace.name, workspace.nodes])

  const sidebarWidth = getSettings().sidebarWidth
  const hasWorkspace = workspace.name !== null

  return (
    <div className="app-container" data-editor-font={editorFont}>
      {/* Spec 010 (clarification 2026-08-05): one header row holds the chrome
          buttons and the tabs — `[hamburger] [toggle] [tabs… +]`. */}
      <div className="header-bar">
        <div className="chrome-bar">
          <HamburgerMenu onCommand={handleMenuCommand} onOpenSettings={() => setSettingsOpen(true)} />
          <button
            type="button"
            className="chrome-icon-button"
            aria-label="Toggle file explorer"
            title="Toggle file explorer"
            onClick={handleToggleExplorer}
            disabled={!hasWorkspace}
          >
            <Squares2X2Icon className="chrome-icon" aria-hidden="true" />
          </button>
        </div>
        <TabBar
          documents={session.documents}
          activeId={session.activeId}
          onActivate={handleActivate}
          onClose={handleCloseRequest}
          onNew={handleNew}
        />
      </div>
      <div className="main-area">
        <Group orientation="horizontal" className="panel-group">
          {hasWorkspace && (
            <>
              <Panel
                defaultSize={String(sidebarWidth)}
                minSize="15"
                maxSize="50"
                className="sidebar-panel"
                collapsible
                collapsedSize={0}
                panelRef={sidebarPanelRef}
                onResize={handleSidebarResize}
              >
                <div className="sidebar">
                  <Tree
                    data={workspace.nodes}
                    selectedId={workspace.selectedId}
                    onSelect={handleTreeSelect}
                    onActivate={handleTreeActivate}
                    onToggle={handleTreeToggle}
                    pendingEditId={pendingEditId}
                    onRename={handleRename}
                    onEditingCancelled={handleEditingCancelled}
                    onDeleteRequest={runDeleteConfirmation}
                    onCreateRequest={handleCreate}
                    onMove={handleTreeMove}
                    onOpen={handleOpen}
                    onViewSource={handleViewSource}
                  />
                </div>
              </Panel>
              <Separator
                className="resize-handle"
                style={explorerCollapsed ? { visibility: 'hidden' } : undefined}
              />
            </>
          )}
          <Panel className="editor-panel">
            <div className="editor-area">
              {session.documents.length === 0 ? (
                <div className="empty-state">
                  <p>Open a file or create a new document to get started.</p>
                </div>
              ) : (
                session.documents.map((doc) => (
                  <EditorPanel
                    key={doc.id}
                    document={doc}
                    isActive={doc.id === session.activeId}
                    onContentChange={handleContentChange}
                    onBaselineCapture={handleBaselineCapture}
                    onCursorState={handleCursorState}
                    onRequestViewSource={handleShowSource}
                    onReturnToFormatted={handleReturnToFormatted}
                  />
                ))
              )}
            </div>
          </Panel>
        </Group>
      </div>

      <StatusFooter
        activeDoc={activeDoc}
        workspaceRoot={workspace.root}
        note={footerNote}
      />

      {settingsOpen && (
        <SettingsDialog
          editorFont={editorFont}
          onEditorFontChange={handleEditorFontChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
