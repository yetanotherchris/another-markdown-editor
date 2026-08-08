import { useCallback } from 'react'
import type { DocumentsAction, EditingSession } from '../state/documents'
import { editorMatchesContent } from '../state/documents'
import { joinFrontmatter } from '../domain/frontmatter'
import type { DocumentSessionApi } from './useDocumentSession'

export interface SourceViewToggleApi {
  handleShowSource: (id: string) => void
  handleReturnToFormatted: (id: string) => void
  openPathInSource: (path: string) => Promise<string | null>
  handleViewSource: (path: string) => void
  openPathInFormatted: (path: string) => Promise<void>
  handleOpen: (path: string) => void
}

/**
 * Spec 002 source↔formatted transitions (US1/FR-002): the toolbar/explorer
 * view-source and open flows, and the return-to-formatted content migration.
 * Delegates to the session hook's flush/live/pool primitives; owns the
 * `editorMatchesContent` no-op round-trip decision.
 */
export function useSourceViewToggle(opts: {
  dispatch: React.Dispatch<DocumentsAction>
  sessionRef: React.MutableRefObject<EditingSession>
  session: Pick<DocumentSessionApi, 'flushLiveContent' | 'getLiveContent' | 'isDirtyLive' | 'handleActivate' | 'handleNew' | 'openFileFromTree'>
  enforcePoolCap: (activeId: string | null) => void
}): SourceViewToggleApi {
  const { dispatch, sessionRef, session, enforcePoolCap } = opts
  const { flushLiveContent, getLiveContent, openFileFromTree } = session

  // Spec 002, US1: the formatted→source transition syncs the live editor text
  // into the store first so the raw source reflects every keystroke, then
  // flips the tab. The source textarea reads `document.content`.
  const handleShowSource = useCallback(
    (id: string) => {
      flushLiveContent()
      dispatch({ type: 'SET_VIEW', payload: { id, view: 'source' } })
    },
    [dispatch, flushLiveContent]
  )

  // Spec 002, US3: returning to formatted editing. When the raw source text
  // equals what Crepe already parsed, the editor can stay mounted and
  // undo/scroll/cursor survive (research.md R3, no-edit round trip). When the
  // source text changed (or the editor was evicted so nothing is live), the
  // new text must become the editor's content — REFRESH_FROM_SOURCE bumps
  // contentVersion so CrepeHost remounts with the source bytes. Spec 021: the
  // source textarea holds the FULL file, so the remount payload is the
  // recombined text and the reducer re-splits any frontmatter edits (R3).
  const handleReturnToFormatted = useCallback(
    (id: string) => {
      const doc = sessionRef.current.documents.find(d => d.id === id)
      if (!doc) return
      const live = getLiveContent(doc)
      // editorMatchesContent (not markdownSame) decides the no-op round trip:
      // only the editor's single appended trailing newline is "unchanged", so a
      // blank line typed at EOF in source is not silently dropped, while a
      // pristine file that Crepe merely normalized still skips the remount.
      // The comparison is against the BODY (`content`) — frontmatter changes
      // alone leave the body untouched, so they do not force a remount.
      if (live === null || !editorMatchesContent(live, doc.content)) {
        dispatch({
          type: 'REFRESH_FROM_SOURCE',
          payload: { id, content: joinFrontmatter(doc.frontmatter, doc.content) }
        })
      }
      dispatch({ type: 'SET_VIEW', payload: { id, view: 'formatted' } })
    },
    [dispatch, getLiveContent, sessionRef]
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
        session.handleActivate(existing.id)
        if (existing.view !== 'source') {
          flushLiveContent()
          dispatch({ type: 'SET_VIEW', payload: { id: existing.id, view: 'source' } })
        }
        enforcePoolCap(existing.id)
        return existing.id
      }
      const read = await window.api.readFile(path)
      if (!read.ok) return null
      // Spec 024: View source is not a browsing open (FR-008 scope) — it keeps
      // the current behaviour (activate existing / new tab), so no mode.
      dispatch({ type: 'OPEN_EXISTING', payload: { value: { ...read.value, view: 'source' } } })
      // The freshly opened tab's editor registers on mount, so it is the newest
      // LRU entry and cannot be evicted here. sessionRef.current.activeId is
      // still the pre-dispatch document — passing it only protects the tab that
      // is visible right now, which is the intent.
      enforcePoolCap(sessionRef.current.activeId)
      return read.value.path ?? read.value.name
    },
    [dispatch, enforcePoolCap, flushLiveContent, sessionRef, session]
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
        session.handleActivate(existing.id)
        if (existing.view === 'source') {
          handleReturnToFormatted(existing.id)
        }
        enforcePoolCap(existing.id)
        return
      }
      const read = await window.api.readFile(path)
      if (!read.ok) return
      // Spec 024 (FR-008): context-menu "Open" routes through the session gate
      // so a clean active tab is replaced. view:'formatted' also flips a
      // reopened evicted tab that had been in source view back to visual
      // editing (OPEN_EXISTING applies the view).
      session.openFileFromTree(read.value)
    },
    [openFileFromTree, sessionRef, session]
  )

  const handleOpen = useCallback(
    (path: string) => {
      void openPathInFormatted(path)
    },
    [openPathInFormatted]
  )

  return {
    handleShowSource,
    handleReturnToFormatted,
    openPathInSource,
    handleViewSource,
    openPathInFormatted,
    handleOpen
  }
}
