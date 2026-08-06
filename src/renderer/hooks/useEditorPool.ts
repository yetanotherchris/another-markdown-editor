import { useCallback } from 'react'
import type { DocumentsAction, EditingSession, DocumentState } from '../state/documents'
import { instancePool } from '../editor/instancePool'

export interface EditorPoolApi {
  enforcePoolCap: (activeId: string | null) => void
}

/**
 * Editor-instance pool management (US1/FR-002): the LRU cap enforcement that
 * drives `instancePool` eviction. The pool itself (cap 8, clean-only eviction,
 * never the active document) lives in `editor/instancePool.ts`; this hook owns
 * the orchestration — when the pool is full, evict the oldest *clean* live
 * instance and drop its entry so the next activate remounts from stored bytes.
 */
export function useEditorPool(opts: {
  dispatch: React.Dispatch<DocumentsAction>
  sessionRef: React.MutableRefObject<EditingSession>
  isDirtyLive: (doc: DocumentState) => boolean
}): EditorPoolApi {
  const { dispatch, sessionRef, isDirtyLive } = opts

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
  }, [dispatch, sessionRef, isDirtyLive])

  return { enforcePoolCap }
}
