import { useCallback } from 'react'
import type { EditingSession, DocumentState } from '../state/documents'
import type { DialogQueue } from './useDialogQueue'
import type { DocumentSessionApi } from './useDocumentSession'

export interface ExternalFileEventsApi {
  handleExternalChange: (doc: DocumentState, kind: 'changed' | 'removed') => boolean
  handleExternalPrompt: (prompt: { id: string; kind: 'changed' | 'removed' }) => Promise<void>
}

/**
 * External file-change handling (US1/FR-002): routing a filesystem
 * changed/removed notice to auto-reload (clean document) or the native prompt
 * (dirty document), including the external-removed Save-As rescue flow. Registers
 * `handleExternalChangeRef` so the dialog queue can drain a deferred notice.
 */
export function useExternalFileEvents(opts: {
  sessionRef: React.MutableRefObject<EditingSession>
  dialog: DialogQueue
  session: Pick<DocumentSessionApi, 'reloadDocument' | 'saveDocument' | 'flushLiveContent' | 'isDirtyLive'>
}): ExternalFileEventsApi {
  const { sessionRef, dialog, session } = opts
  const { dialogInFlightRef, releaseDialogSurface, handleExternalChangeRef } = dialog

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
          await session.reloadDocument(doc, true)
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
        const saved = await session.saveDocument(doc, true)
        if (saved === 'failed') {
          error = `Could not save ${doc.title}.`
          continue
        }
        return
      }
    } finally {
      releaseDialogSurface()
    }
  }, [dialogInFlightRef, releaseDialogSurface, sessionRef, session])

  // Route an external changed/removed event to its handling. Returns true when a
  // confirmation prompt is opened — used by releaseDialogSurface so a deferred
  // notice that instead resolves via auto-reload (a clean document) still lets a
  // queued operation error show.
  const handleExternalChange = useCallback((doc: DocumentState, kind: 'changed' | 'removed'): boolean => {
    if (kind === 'changed' && !doc.dirty && !session.isDirtyLive(doc)) {
      session.reloadDocument(doc)
      return false
    }
    session.flushLiveContent()
    void handleExternalPrompt({ id: doc.id, kind })
    return true
  }, [handleExternalPrompt, session])

  handleExternalChangeRef.current = handleExternalChange

  return { handleExternalChange, handleExternalPrompt }
}
