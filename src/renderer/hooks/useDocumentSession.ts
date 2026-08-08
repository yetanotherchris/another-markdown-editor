import { useCallback, useRef } from 'react'
import type { DocumentsAction, EditingSession, DocumentState } from '../state/documents'
import { planClose } from '../state/documents'
import type { OpenedFile } from '../../shared/ipc-contract'
import { instancePool } from '../editor/instancePool'
import {
  getLiveContent as domainGetLiveContent,
  isDirtyLive as domainIsDirtyLive,
  getContentToSave as domainGetContentToSave,
  shouldFlushLive as domainShouldFlushLive
} from '../domain/dirty'
import { dirtyDocumentsToSave, shouldRePromptForFailedSave } from '../domain/quit'
import type { DialogQueue } from './useDialogQueue'

export type SaveResult = 'saved' | 'cancelled' | 'failed'

export interface DocumentSessionApi {
  saveDocument: (doc: DocumentState, forceDialog?: boolean) => Promise<SaveResult>
  doClose: (id: string) => void
  handleCloseRequest: (id: string) => Promise<void>
  reloadDocument: (doc: DocumentState, force?: boolean) => Promise<void>
  handleQuitRequest: () => Promise<void>
  flushLiveContent: () => void
  handleContentChange: (id: string, content: string) => void
  handleBaselineCapture: (id: string, baseline: string) => void
  handleCursorState: (id: string, cursorOffset: number, scrollTop: number) => void
  handleActivate: (id: string) => void
  handleNew: () => void
  /** Spec 024: open a file read from disk, replacing the active tab's content
   *  when it is live-clean and no explicit-new-tab action was used; otherwise
   *  create a new tab. Existing-tab activation is preserved (FR-001-005).
   *  An optional `view` (spec 002) is applied by the reducer. */
  openFileFromTree: (
    file: OpenedFile & { view?: 'formatted' | 'source' },
    explicitNew?: boolean
  ) => void
  getLiveContent: (doc: DocumentState) => string | null
  isDirtyLive: (doc: DocumentState) => boolean
}

/**
 * Document lifecycle (US1/FR-002): open/close/save/reload, dirty & live-content
 * checks, baseline, content-to-save, and the quit/close confirmation flows.
 * Binds the pure `domain/dirty.ts` functions to the instance-pool markdown
 * accessor so the decision rules stay electron-free and unit-tested while the
 * orchestration (IPC, prompts, dispatches) lives here.
 */
export function useDocumentSession(opts: {
  dispatch: React.Dispatch<DocumentsAction>
  sessionRef: React.MutableRefObject<EditingSession>
  dialog: DialogQueue
  enforcePoolCap: (activeId: string | null) => void
}): DocumentSessionApi {
  const { dispatch, sessionRef, dialog, enforcePoolCap } = opts
  const { dialogInFlightRef, releaseDialogSurface } = dialog
  const saveQueuesRef = useRef(new Map<string, Promise<SaveResult>>())

  const getMarkdown = useCallback((id: string) => instancePool.getMarkdown(id), [])

  const getLiveContent = useCallback(
    (doc: DocumentState): string | null => domainGetLiveContent(doc, getMarkdown),
    [getMarkdown]
  )

  const isDirtyLive = useCallback(
    (doc: DocumentState): boolean => domainIsDirtyLive(doc, getMarkdown),
    [getMarkdown]
  )

  const getContentToSave = useCallback(
    (doc: DocumentState): string => domainGetContentToSave(doc, getMarkdown),
    [getMarkdown]
  )

  const flushLiveContent = useCallback(() => {
    for (const doc of sessionRef.current.documents) {
      // A source-view document's text lives in the store (raw bytes); its
      // mounted editor serializes the stale pre-source-edit content, so
      // flushing it would clobber the edits the user made in source.
      if (!domainShouldFlushLive(doc, getMarkdown)) continue
      const live = getMarkdown(doc.id)
      if (live !== null) {
        dispatch({ type: 'UPDATE_CONTENT', payload: { id: doc.id, content: live } })
      }
    }
  }, [dispatch, getMarkdown, sessionRef])

  const saveDocumentNow = useCallback(
    async (doc: DocumentState, forceDialog = false): Promise<SaveResult> => {
      const content = getContentToSave(doc)
      const revision = doc.revision ?? 0
      if (doc.path && !forceDialog) {
        const pathAtStart = doc.path
        const result = await window.api.writeFile(pathAtStart, content)
        if (result.ok) {
          // A rename/move may have rerouted this document while the write was
          // in flight (REROUTE_PATHS, FR-028). The write hit the pre-reroute
          // path; re-apply it to the current path so the content does not fork
          // into two divergent files and the tab does not silently point back
          // at the old location.
          const current = sessionRef.current.documents.find((d) => d.id === doc.id)
          const currentPath = current?.path ?? pathAtStart
          if (currentPath !== pathAtStart) {
            const rerouted = await window.api.writeFile(currentPath, content)
            if (!rerouted.ok) {
              dispatch({ type: 'SAVE_FAILED', payload: { id: doc.id } })
              return 'failed'
            }
          }
          dispatch({
            type: 'SAVE_SUCCESS',
            payload: { id: doc.id, path: currentPath, content, revision }
          })
          return 'saved'
        }
        dispatch({ type: 'SAVE_FAILED', payload: { id: doc.id } })
        return 'failed'
      }
      const result = await window.api.saveFileDialog(doc.title, content)
      if (result.ok && result.value) {
        dispatch({
          type: 'SAVE_SUCCESS',
          payload: {
            id: doc.id,
            path: result.value.path ?? '',
            content: result.value.content,
            revision
          }
        })
        return 'saved'
      }
      return 'cancelled'
    },
    [dispatch, getContentToSave, sessionRef]
  )

  const saveDocument = useCallback(
    async (doc: DocumentState, forceDialog = false): Promise<SaveResult> => {
      const previous = saveQueuesRef.current.get(doc.id) ?? Promise.resolve<SaveResult>('saved')
      const next = previous
        .catch(() => 'failed' as const)
        .then(() => saveDocumentNow(doc, forceDialog))
      saveQueuesRef.current.set(doc.id, next)
      try {
        return await next
      } finally {
        if (saveQueuesRef.current.get(doc.id) === next) saveQueuesRef.current.delete(doc.id)
      }
    },
    [saveDocumentNow]
  )

  const doClose = useCallback(
    (id: string) => {
      dispatch({ type: 'CLOSE', payload: { id } })
      instancePool.remove(id)
    },
    [dispatch]
  )

  const handleCloseRequest = useCallback(
    async (id: string) => {
      const doc = sessionRef.current.documents.find((d) => d.id === id)
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
    },
    [
      dialogInFlightRef,
      doClose,
      flushLiveContent,
      isDirtyLive,
      releaseDialogSurface,
      saveDocument,
      sessionRef
    ]
  )

  const reloadDocument = useCallback(
    async (doc: DocumentState, force = false) => {
      if (!doc.path) return
      const result = await window.api.readFile(doc.path)
      if (!result.ok) return
      if (!force) {
        // Auto-reload path only: a keystroke landing while the read was in
        // flight must not be silently discarded by the reload.
        const fresh = sessionRef.current.documents.find((d) => d.id === doc.id)
        if (!fresh || fresh.dirty || isDirtyLive(fresh)) return
      }
      instancePool.remove(doc.id)
      dispatch({ type: 'RELOAD', payload: { id: doc.id, content: result.value.content } })
    },
    [dispatch, isDirtyLive, sessionRef]
  )

  // The quit flow decomposed into named sub-steps (FR-004): flush → dirty-check
  // → confirm → discard-all/save-all → quit. A second trigger while any prompt
  // is open is ignored (one prompt at a time) — checked BEFORE the no-dirty
  // fast path, because quitting while a sheet is up (e.g. an external-removed
  // rescue for a clean document) must not close the window and abandon the
  // in-memory content it was offering (review 2026-08-04).
  const handleQuitRequest = useCallback(async () => {
    if (dialogInFlightRef.current) return
    const current = sessionRef.current
    flushLiveContent()
    const dirtyDocs = dirtyDocumentsToSave(current.documents, isDirtyLive)

    // ---- dirty-check: nothing unsaved → quit immediately ----
    if (dirtyDocs.length === 0) {
      window.api.confirmQuit('quit')
      return
    }

    // ---- confirm + save-or-discard (holds the single-prompt guard) ----
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
          documentTitles: remaining.map((d) => d.title),
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
          // A failed save re-prompts with the failure explained (US2 scenario
          // 4); a cancelled Save-As re-prompts with the tab staying open.
          allSaved = !shouldRePromptForFailedSave(saved)
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
  }, [
    dialogInFlightRef,
    flushLiveContent,
    isDirtyLive,
    releaseDialogSurface,
    saveDocument,
    sessionRef
  ])

  const handleContentChange = useCallback(
    (id: string, content: string) => {
      dispatch({ type: 'UPDATE_CONTENT', payload: { id, content } })
    },
    [dispatch]
  )

  // The editor's serialization right after it parses content is the reference
  // for the live-dirty check (see isDirtyLive). It lives in the store's
  // `editorBaseline` field; content/baseline stay the raw disk bytes
  // (raw-bytes policy, spec 002).
  const handleBaselineCapture = useCallback(
    (id: string, baseline: string) => {
      dispatch({ type: 'CAPTURE_BASELINE', payload: { id, baseline } })
    },
    [dispatch]
  )

  const handleCursorState = useCallback(
    (id: string, cursorOffset: number, scrollTop: number) => {
      dispatch({ type: 'CAPTURE_EDITOR_STATE', payload: { id, cursorOffset, scrollTop } })
    },
    [dispatch]
  )

  const handleActivate = useCallback(
    (id: string) => {
      const current = sessionRef.current
      const doc = current.documents.find((d) => d.id === id)
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
    },
    [dispatch, enforcePoolCap, sessionRef]
  )

  const handleNew = useCallback(() => {
    dispatch({ type: 'OPEN_NEW' })
    // The new untitled document is not in the pool yet; skip the currently
    // visible document so its editor is not evicted mid-render.
    enforcePoolCap(sessionRef.current.activeId)
  }, [dispatch, enforcePoolCap, sessionRef])

  // Spec 024 (FR-001/002/005, research R1): decide whether a file open replaces
  // the active tab. The gate is the LIVE dirty check (pool), never the debounced
  // store flag — a keystroke inside the 200 ms debounce must not be silently
  // discarded (Principle III). Existing-tab activation happens in the reducer.
  const openFileFromTree = useCallback(
    (file: OpenedFile & { view?: 'formatted' | 'source' }, explicitNew = false) => {
      const current = sessionRef.current
      const active = current.documents.find((d) => d.id === current.activeId) ?? null
      const alreadyOpen = file.path !== null && current.documents.some((d) => d.path === file.path)
      const replaceActive = !explicitNew && !alreadyOpen && active !== null && !isDirtyLive(active)
      dispatch({
        type: 'OPEN_EXISTING',
        payload: { value: file, mode: replaceActive ? 'replace' : 'new' }
      })
      if (replaceActive && active) {
        // Spec 024 (Assumptions): a replaced tab's editor instance is handled the
        // same way as a closed tab's — drop it from the pool explicitly instead
        // of leaving it to linger until LRU eviction.
        instancePool.remove(active.id)
      }
      enforcePoolCap(sessionRef.current.activeId)
    },
    [dispatch, enforcePoolCap, isDirtyLive, sessionRef]
  )

  return {
    saveDocument,
    doClose,
    handleCloseRequest,
    reloadDocument,
    handleQuitRequest,
    flushLiveContent,
    handleContentChange,
    handleBaselineCapture,
    handleCursorState,
    handleActivate,
    handleNew,
    openFileFromTree,
    getLiveContent,
    isDirtyLive
  }
}
