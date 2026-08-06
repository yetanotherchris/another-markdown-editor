import type { DocumentState } from '../state/documents'

/** The documents that still need saving before a quit/close/folder-open can
 *  proceed — the live-dirty set, computed fresh (a re-prompt must list only the
 *  documents that are actually still unsaved, not a stale pre-save snapshot). */
export function dirtyDocumentsToSave(
  documents: DocumentState[],
  isDirty: (doc: DocumentState) => boolean
): DocumentState[] {
  return documents.filter((d) => isDirty(d))
}

/** Whether a failed save in a save loop must re-prompt. A `failed` save keeps
 *  the document dirty and re-prompts with the failure explained; a `cancelled`
 *  Save-As re-prompts with the tab staying open; a `saved` outcome ends the
 *  loop. */
export function shouldRePromptForFailedSave(saved: 'saved' | 'cancelled' | 'failed'): boolean {
  return saved !== 'saved'
}
