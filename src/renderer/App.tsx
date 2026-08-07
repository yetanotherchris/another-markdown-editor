import { useReducer, useEffect, useCallback, useRef, useState } from 'react'
import { Panel, Group, Separator, usePanelRef } from 'react-resizable-panels'
import type { TreeApi } from 'react-arborist'
import { Squares2X2Icon } from '@heroicons/react/24/outline'
import { EditingSession, documentsReducer, getActiveDocument, DocumentState } from './state/documents'
import { initialWorkspaceState, workspaceReducer, TreeNode } from './state/workspace'
import { getSettings } from './state/settings'
import { instancePool } from './editor/instancePool'
import { isDirtyLive as domainIsDirtyLive } from './domain/dirty'
import { useDialogQueue } from './hooks/useDialogQueue'
import { useEditorPool } from './hooks/useEditorPool'
import { useDocumentSession } from './hooks/useDocumentSession'
import { useSourceViewToggle } from './hooks/useSourceViewToggle'
import { useWorkspaceTree } from './hooks/useWorkspaceTree'
import { useExternalFileEvents } from './hooks/useExternalFileEvents'
import { useMenuCommands } from './hooks/useMenuCommands'
import { useWorkspaceFolder } from './hooks/useWorkspaceFolder'
import { useSidebarLayout } from './hooks/useSidebarLayout'
import { useSettingsState } from './hooks/useSettingsState'
import EditorPanel from './editor/EditorPanel'
import Tree from './explorer/Tree'
import TabBar from './tabs/TabBar'
import StatusFooter from './status/StatusFooter'
import HamburgerMenu from './chrome/HamburgerMenu'
import SettingsDialog from './chrome/SettingsDialog'
import { isWorkspaceRelative } from './explorer/operations'
import './App.css'
import './chrome/chrome.css'
import './editor/editor.css'
import './editor/themes.css'

const initialSession: EditingSession = {
  documents: [],
  activeId: null,
  untitledCounter: 0
}

/** Thin composition root (US1/FR-001): owns the reducers, shared refs, and view
 *  state; wires the focused hooks in dependency order. No business rules here. */
export default function App() {
  const [session, dispatch] = useReducer(documentsReducer, initialSession)
  const [workspace, dispatchWorkspace] = useReducer(workspaceReducer, initialWorkspaceState)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [footerNote, setFooterNote] = useState<string | null>(null)
  // Spec 010, US2 (FR-007): persisted explorer visibility drives the collapsed
  // state; handleSidebarResize keeps it in sync while the panel is mounted.
  const [explorerCollapsed, setExplorerCollapsed] = useState(false)
  // Spec 012/013/016: the settings-dialog state — open flag, editor theme, app
  // theme choice, and the effective data-theme mode (useSettingsState owns them).
  const {
    settingsOpen, setSettingsOpen,
    editorTheme, handleEditorThemeChange,
    spellcheckEnabled, handleSpellcheckChange,
    themeChoice, handleThemeChange, themeMode
  } = useSettingsState()
  const sidebarPanelRef = usePanelRef()
  // Spec 010, US2 (FR-007): set once the initial restore has run, so resize
  // events while the panel settles are not persisted as the user's choice.
  const explorerRestoreDoneRef = useRef(false)
  const pendingCreateRef = useRef(new Set<string>())
  const createCounterRef = useRef(0)
  const treeApiRef = useRef<TreeApi<TreeNode> | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const activeDoc = getActiveDocument(session)

  // The live-dirty decision is bound once here (pure rule + pool accessor) so
  // both the pool eviction and the session checks share it.
  const getMarkdown = useCallback((id: string) => instancePool.getMarkdown(id), [])
  const isDirtyLive = useCallback(
    (doc: DocumentState) => domainIsDirtyLive(doc, getMarkdown),
    [getMarkdown]
  )
  const dialog = useDialogQueue(sessionRef)
  const pool = useEditorPool({ dispatch, sessionRef, isDirtyLive })
  const sessionApi = useDocumentSession({ dispatch, sessionRef, dialog, enforcePoolCap: pool.enforcePoolCap })
  const source = useSourceViewToggle({
    dispatch,
    sessionRef,
    session: sessionApi,
    enforcePoolCap: pool.enforcePoolCap
  })
  const tree = useWorkspaceTree({
    dispatch,
    dispatchWorkspace,
    sessionRef,
    workspaceRef,
    dialog,
    session: sessionApi,
    treeApiRef,
    pendingCreateRef,
    createCounterRef,
    enforcePoolCap: pool.enforcePoolCap,
    setPendingEditId
  })
  const external = useExternalFileEvents({ sessionRef, dialog, session: sessionApi })
  const folder = useWorkspaceFolder({
    dispatchWorkspace,
    sessionRef,
    dialog,
    session: sessionApi,
    sidebarPanelRef
  })
  const sidebar = useSidebarLayout({ sidebarPanelRef, explorerRestoreDoneRef, setExplorerCollapsed })
  const menu = useMenuCommands({
    sessionRef,
    dialog,
    session: sessionApi,
    folder,
    dispatch,
    enforcePoolCap: pool.enforcePoolCap
  })

  const { handleMenuCommand } = menu
  const { handleQuitRequest } = sessionApi
  const { handleExternalChange } = external

  useEffect(() => {
    const unsubMenu = window.api.onMenuCommand(handleMenuCommand)

    const unsubDocument = window.api.onDocumentChanged((e) => {
      const doc = sessionRef.current.documents.find(d => d.path === e.path)
      if (!doc) return
      dispatch({ type: 'EXTERNAL_CHANGE', payload: { path: e.path, kind: e.kind } })
      // One prompt at a time: DEFER, don't drop — re-surfaced on release.
      if (dialog.dialogInFlightRef.current) {
        dialog.pendingExternalPromptRef.current = { path: e.path, kind: e.kind }
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

    // Spec 004, FR-011: persistence failure → footer note; cleared on success.
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
  }, [dispatch, dispatchWorkspace, dialog, handleExternalChange, handleMenuCommand, handleQuitRequest, sessionRef])

  useEffect(() => {
    return () => {
      instancePool.destroyAll()
    }
  }, [])

  // Spec 002, US004: the explorer follows the active tab — reveal/select its
  // workspace file; untitled or workspace-external docs clear the highlight.
  const workspaceActiveId = session.activeId
  useEffect(() => {
    if (!workspace.name) return
    const active = sessionRef.current.documents.find(d => d.id === workspaceActiveId)
    const path = active?.path
    if (!path || !isWorkspaceRelative(path)) {
      dispatchWorkspace({ type: 'SELECT', payload: { id: null } })
      return
    }
    dispatchWorkspace({ type: 'SELECT', payload: { id: path } })
    const api = treeApiRef.current
    if (api) {
      api.openParents(path)
      api.scrollTo(path)
    }
  }, [workspaceActiveId, workspace.name, workspace.nodes, dispatchWorkspace, sessionRef, treeApiRef])

  const sidebarWidth = getSettings().sidebarWidth
  const hasWorkspace = workspace.name !== null

  return (
    <div className="app-container" data-editor-theme={editorTheme} data-theme={themeMode}>
      {/* Spec 010 (2026-08-05): one header row — chrome buttons + tabs. */}
      <div className="header-bar">
        <div className="chrome-bar">
          <HamburgerMenu onCommand={handleMenuCommand} onOpenSettings={() => setSettingsOpen(true)} />
          <button
            type="button"
            className="chrome-icon-button"
            aria-label="Toggle file explorer"
            title="Toggle file explorer"
            onClick={sidebar.handleToggleExplorer}
            disabled={!hasWorkspace}
          >
            <Squares2X2Icon className="chrome-icon" aria-hidden="true" />
          </button>
        </div>
        <TabBar
          documents={session.documents}
          activeId={session.activeId}
          onActivate={sessionApi.handleActivate}
          onClose={sessionApi.handleCloseRequest}
          onNew={sessionApi.handleNew}
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
                onResize={sidebar.handleSidebarResize}
              >
                <div className="sidebar">
                  <Tree
                    data={workspace.nodes}
                    selectedId={workspace.selectedId}
                    onSelect={tree.handleTreeSelect}
                    onActivate={tree.handleTreeActivate}
                    onToggle={tree.handleTreeToggle}
                    pendingEditId={pendingEditId}
                    onRename={tree.handleRename}
                    onEditingCancelled={tree.handleEditingCancelled}
                    onDeleteRequest={tree.runDeleteConfirmation}
                    onCreateRequest={tree.handleCreate}
                    onMove={tree.handleTreeMove}
                    onOpen={source.handleOpen}
                    onViewSource={source.handleViewSource}
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
                    spellcheckEnabled={spellcheckEnabled}
                    onContentChange={sessionApi.handleContentChange}
                    onBaselineCapture={sessionApi.handleBaselineCapture}
                    onCursorState={sessionApi.handleCursorState}
                    onRequestViewSource={source.handleShowSource}
                    onReturnToFormatted={source.handleReturnToFormatted}
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
          theme={themeChoice}
          onThemeChange={handleThemeChange}
          editorTheme={editorTheme}
          onEditorThemeSave={handleEditorThemeChange}
          spellcheckEnabled={spellcheckEnabled}
          onSpellcheckChange={handleSpellcheckChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
