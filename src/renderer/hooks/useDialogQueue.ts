import { useCallback, useRef } from 'react'
import type { EditingSession, DocumentState } from '../state/documents'

export interface ExternalChangeHandler {
  (doc: DocumentState, kind: 'changed' | 'removed'): boolean
}

export interface DialogQueue {
  dialogInFlightRef: React.MutableRefObject<boolean>
  pendingErrorRef: React.MutableRefObject<string | null>
  pendingExternalPromptRef: React.MutableRefObject<
    Array<{ path: string; kind: 'changed' | 'removed' }>
  >
  /** Registered by useExternalFileEvents so a deferred notice can be drained
   *  synchronously by releaseDialogSurface. */
  handleExternalChangeRef: React.MutableRefObject<ExternalChangeHandler | null>
  showOperationErrorRef: React.MutableRefObject<((message: string) => Promise<void>) | null>
  releaseDialogSurface: () => void
  showOperationError: (message: string) => Promise<void>
}

/**
 * Spec 008: the single-prompt guard and its pending queues (US1/FR-002 dialog
 * coordination). One native confirmation at a time; a second trigger while one
 * is open is ignored, and a deferred external notice / queued operation error
 * is re-surfaced once the guard releases — never dropped.
 *
 * The session and external-change hooks write `handleExternalChangeRef` and
 * `showOperationErrorRef` on every render, exactly as the monolithic App.tsx
 * did, so `releaseDialogSurface` always drains with the latest closures.
 */
export function useDialogQueue(sessionRef: React.MutableRefObject<EditingSession>): DialogQueue {
  // Spec 008: native confirmation boxes are modal and the renderer awaits the
  // decision over IPC. Only ONE confirmation prompt may be in flight at a time
  // (spec edge case), so every prompt entry point guards on this ref — a second
  // trigger while a dialog is open is ignored rather than stacked.
  const dialogInFlightRef = useRef(false)
  // An operation-failed prompt queued while another prompt is up.
  const pendingErrorRef = useRef<string | null>(null)
  // An external changed/removed notice queued while another prompt is up. A
  // single slot, like the error queue: a notice arriving while a dialog is open
  // is DEFERRED (never dropped) and re-surfaced once the guard releases.
  const pendingExternalPromptRef = useRef<Array<{ path: string; kind: 'changed' | 'removed' }>>([])
  const handleExternalChangeRef = useRef<ExternalChangeHandler | null>(null)
  const showOperationErrorRef = useRef<((message: string) => Promise<void>) | null>(null)

  // The single place the single-prompt guard is released. Also drains what was
  // queued while the guard was held, so nothing is silently dropped: a deferred
  // external changed/removed notice first (it is a real decision the user must
  // make), then a queued operation error (e.g. a failed trash after "Delete", or
  // a failed folder commit). Each drained item re-acquires the guard
  // synchronously and its own release drains the next.
  const releaseDialogSurface = useCallback(() => {
    dialogInFlightRef.current = false
    const queuedPrompt = pendingExternalPromptRef.current.shift()
    const queuedError = pendingErrorRef.current
    if (queuedPrompt) {
      const doc = sessionRef.current.documents.find((d) => d.path === queuedPrompt.path)
      // handleExternalChange returns true when it opens a confirmation prompt;
      // its own release then drains the queued error. If the document is gone or
      // the notice resolved via auto-reload (no prompt), fall through to the error.
      if (doc && handleExternalChangeRef.current?.(doc, queuedPrompt.kind)) {
        pendingErrorRef.current = queuedError
        return
      }
      if (pendingExternalPromptRef.current.length > 0) {
        pendingErrorRef.current = queuedError
        releaseDialogSurface()
        return
      }
    }
    pendingErrorRef.current = null
    if (queuedError) void showOperationErrorRef.current?.(queuedError)
  }, [sessionRef])

  // Spec 008 US4: surface a failed operation through the native error box. If
  // another prompt is already up, the error is queued and shown once the guard
  // releases (one prompt at a time, spec edge case).
  const showOperationError = useCallback(
    async (message: string) => {
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
    },
    [releaseDialogSurface]
  )

  showOperationErrorRef.current = showOperationError

  return {
    dialogInFlightRef,
    pendingErrorRef,
    pendingExternalPromptRef,
    handleExternalChangeRef,
    showOperationErrorRef,
    releaseDialogSurface,
    showOperationError
  }
}
