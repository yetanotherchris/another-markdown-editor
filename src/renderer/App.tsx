import { useReducer, useEffect, useCallback, useRef, useState } from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'
import type { MenuCommand, EntryKind, EntryInfo } from '@shared/ipc-contract'
import {
  EditingSession,
  documentsReducer,
  getActiveDocument,
  getDirtyDocuments,
  planClose,
  DocumentState,
} from './state/documents'
import {
  initialWorkspaceState,
  workspaceReducer,
  TreeNode
} from './state/workspace'
import { loadSettingsFromMain, updateSettings, getSettings } from './state/settings'
import { instancePool } from './editor/instancePool'
import EditorPanel from './editor/EditorPanel'
import Tree from './explorer/Tree'
import TabBar from './tabs/TabBar'
import ConfirmDialog from './dialogs/ConfirmDialog'
import {
  renameTargetPath,
  moveTargetPath,
  validateEntryName,
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

type SaveResult = 'saved' | 'cancelled' | 'failed'

export default function App() {
  const [session, dispatch] = useReducer(documentsReducer, initialSession)
  const [workspace, dispatchWorkspace] = useReducer(workspaceReducer, initialWorkspaceState)
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  const [quitDirtyDocs, setQuitDirtyDocs] = useState<DocumentState[] | null>(null)
  const [externalPrompt, setExternalPrompt] = useState<{ id: string; kind: 'changed' | 'removed' } | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ node: TreeNode; info: EntryInfo; plan: DeletePlan } | null>(null)
  const [deleteRefused, setDeleteRefused] = useState<{ node: TreeNode; blockers: DocumentState[] } | null>(null)
  const [permanentDelete, setPermanentDelete] = useState<{ node: TreeNode; plan: DeletePlan } | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const pendingCreateRef = useRef(new Set<string>())
  const createCounterRef = useRef(0)
  const activeDoc = getActiveDocument(session)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const quitDirtyDocsRef = useRef(quitDirtyDocs)
  quitDirtyDocsRef.current = quitDirtyDocs

  useEffect(() => {
    loadSettingsFromMain()
  }, [])

  const handleContentChange = useCallback((id: string, content: string) => {
    dispatch({ type: 'UPDATE_CONTENT', payload: { id, content } })
  }, [])

  const handleBaselineCapture = useCallback((id: string, baseline: string) => {
    dispatch({ type: 'CAPTURE_BASELINE', payload: { id, baseline } })
  }, [])

  const handleCursorState = useCallback((id: string, cursorOffset: number, scrollTop: number) => {
    dispatch({ type: 'CAPTURE_EDITOR_STATE', payload: { id, cursorOffset, scrollTop } })
  }, [])

  const getContentToSave = useCallback((docId: string, fallback: string): string => {
    return instancePool.getMarkdown(docId) ?? fallback
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
    const live = getLiveContent(doc)
    return live !== null && live !== doc.baseline
  }, [getLiveContent])

  const flushLiveContent = useCallback(() => {
    for (const doc of sessionRef.current.documents) {
      const live = getLiveContent(doc)
      if (live !== null && live !== doc.content) {
        dispatch({ type: 'UPDATE_CONTENT', payload: { id: doc.id, content: live } })
      }
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
      // Capture the live content before dropping the pool entry — evictLRU
      // only finds the candidate; getMarkdown must still see it.
      const evictDoc = current.documents.find(d => d.id === evictId)
      const live = evictDoc ? getLiveContent(evictDoc) : null
      instancePool.remove(evictId)
      if (live !== null) {
        dispatch({ type: 'UPDATE_CONTENT', payload: { id: evictId, content: live } })
      }
      dispatch({ type: 'EVICT', payload: { id: evictId } })
    }
  }, [getLiveContent, isDirtyLive])

  const saveDocument = useCallback(async (doc: DocumentState, forceDialog = false): Promise<SaveResult> => {
    const content = getContentToSave(doc.id, doc.content)
    if (doc.path && !forceDialog) {
      const result = await window.api.writeFile(doc.path, content)
      if (result.ok) {
        dispatch({ type: 'SAVE_SUCCESS', payload: { id: doc.id, path: doc.path, content } })
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

  const handleCloseRequest = useCallback((id: string) => {
    const doc = sessionRef.current.documents.find(d => d.id === id)
    if (!doc) return
    if (planClose(sessionRef.current, id) === 'close' && !isDirtyLive(doc)) {
      doClose(id)
      return
    }
    flushLiveContent()
    setDialogError(null)
    setPendingCloseId(id)
  }, [doClose, flushLiveContent, isDirtyLive])

  const handleCloseDecision = useCallback(async (decision: 'save' | 'discard' | 'cancel') => {
    if (!pendingCloseId) return
    const id = pendingCloseId
    if (decision === 'cancel') {
      setPendingCloseId(null)
      return
    }
    if (decision === 'discard') {
      setPendingCloseId(null)
      doClose(id)
      return
    }
    const doc = sessionRef.current.documents.find(d => d.id === id)
    if (!doc) {
      setPendingCloseId(null)
      return
    }
    const result = await saveDocument(doc)
    if (result === 'saved') {
      setPendingCloseId(null)
      doClose(id)
    } else if (result === 'failed') {
      setDialogError(`Could not save ${doc.title}. The document stays open.`)
    }
  }, [pendingCloseId, saveDocument, doClose])

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

  const handleQuitDecision = useCallback(async (decision: 'save-all' | 'discard' | 'cancel') => {
    if (decision === 'cancel') {
      setQuitDirtyDocs(null)
      return
    }
    if (decision === 'discard') {
      window.api.confirmQuit('quit')
      return
    }
    for (const doc of getDirtyDocuments(sessionRef.current)) {
      const result = await saveDocument(doc)
      if (result !== 'saved') {
        if (result === 'failed') {
          setDialogError(`Could not save ${doc.title}. The application stays open.`)
        }
        return
      }
    }
    window.api.confirmQuit('quit')
  }, [saveDocument])

  const handleExternalDecision = useCallback(async (decision: 'keep' | 'reload' | 'ok' | 'save-as') => {
    if (!externalPrompt) return
    const doc = sessionRef.current.documents.find(d => d.id === externalPrompt.id)
    const prompt = externalPrompt
    setExternalPrompt(null)
    if (!doc) return
    if (decision === 'reload') {
      // The user explicitly chose to replace their version with the disk
      // version, so the pre-existing dirty state must not block the reload.
      await reloadDocument(doc, true)
    } else if (decision === 'save-as') {
      const result = await saveDocument(doc, true)
      if (result === 'failed' && prompt.kind === 'removed') {
        setDialogError(`Could not save ${doc.title}.`)
        setExternalPrompt(prompt)
      }
    }
  }, [externalPrompt, reloadDocument, saveDocument])

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
      setOperationError(result.message)
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
      setOperationError(error)
      return false
    }
    const fromPath = node.id
    const toPath = renameTargetPath(fromPath, newName.trim())
    if (toPath === fromPath) return true
    const applied = await applyMove(fromPath, toPath)
    if (applied) {
      pendingCreateRef.current.delete(fromPath)
      setPendingEditId(null)
    }
    return applied
  }, [applyMove])

  const handleEditingCancelled = useCallback((id: string) => {
    // A new entry the user declined to name: remove the placeholder.
    if (!pendingCreateRef.current.has(id)) return
    pendingCreateRef.current.delete(id)
    setPendingEditId(null)
    window.api.trashEntry(id).then((result) => {
      if (result.ok) {
        dispatchWorkspace({ type: 'REMOVE_ENTRY', payload: { id } })
      }
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

    createCounterRef.current++
    const placeholder = kind === 'file'
      ? `new-file-${createCounterRef.current}.md`
      : `new-folder-${createCounterRef.current}`
    const result = await window.api.createEntry(parent ? parent.id : '.', placeholder, kind)
    if (!result.ok) {
      setOperationError(result.message)
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

  const handleDeleteRequest = useCallback(async (node: TreeNode) => {
    const result = await window.api.describeEntry(node.id)
    if (!result.ok) {
      setOperationError(result.message)
      return
    }
    const plan = planDelete(sessionRef.current.documents, node.id, isDirtyLive)
    if (plan.dirtyBlockers.length > 0) {
      setDeleteRefused({ node, blockers: plan.dirtyBlockers })
      return
    }
    setDeleteTarget({ node, info: result.value, plan })
  }, [isDirtyLive])

  const cleanupAfterDelete = useCallback((node: TreeNode, plan: DeletePlan) => {
    for (const doc of plan.cleanToClose) {
      doClose(doc.id)
    }
    dispatchWorkspace({ type: 'REMOVE_ENTRY', payload: { id: node.id } })
    if (workspaceRef.current.selectedId === node.id) {
      dispatchWorkspace({ type: 'SELECT', payload: { id: null } })
    }
  }, [doClose])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    const { node, plan } = deleteTarget
    const result = await window.api.trashEntry(node.id)
    if (result.ok) {
      cleanupAfterDelete(node, plan)
      setDeleteTarget(null)
      return
    }
    if (result.code === 'TRASH_UNAVAILABLE') {
      // FR-029a: trash is not available — offer permanent deletion only as an
      // explicit second confirmation.
      setDeleteTarget(null)
      setPermanentDelete({ node, plan })
      return
    }
    setOperationError(result.message)
    setDeleteTarget(null)
  }, [deleteTarget, cleanupAfterDelete])

  const handleDeletePermanent = useCallback(async () => {
    if (!permanentDelete) return
    const { node, plan } = permanentDelete
    const result = await window.api.trashEntry(node.id, true)
    if (result.ok) {
      cleanupAfterDelete(node, plan)
      setPermanentDelete(null)
      return
    }
    setOperationError(result.message)
    setPermanentDelete(null)
  }, [permanentDelete, cleanupAfterDelete])

  // T059: drag-and-drop move between folders.
  const handleTreeMove = useCallback((id: string, targetParentId: string) => {
    const target = moveTargetPath(id, targetParentId)
    if (!target) return
    applyMove(id, target)
  }, [applyMove])

  const handleSidebarResize = useCallback((size: { asPercentage: number; inPixels: number }) => {
    updateSettings({ sidebarWidth: size.asPercentage })
    window.api.updateSettings({ sidebarWidth: size.asPercentage }).catch(() => { /* ignore */ })
  }, [])

  useEffect(() => {
    const unsubMenu = window.api.onMenuCommand((command: MenuCommand) => {
      const active = getActiveDocument(sessionRef.current)
      switch (command) {
        case 'open-file': {
          window.api.openFileDialog().then((result) => {
            if (result.ok && result.value) {
              dispatch({ type: 'OPEN_EXISTING', payload: result.value })
              enforcePoolCap(sessionRef.current.activeId)
            }
          })
          break
        }
        case 'open-folder': {
          window.api.openFolderDialog().then((result) => {
            if (result.ok && result.value) {
              dispatchWorkspace({
                type: 'REPLACE',
                payload: {
                  name: result.value.name,
                  root: null,
                  entries: result.value.entries
                }
              })
            }
          })
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
    })

    const unsubDocument = window.api.onDocumentChanged((e) => {
      const doc = sessionRef.current.documents.find(d => d.path === e.path)
      if (!doc) return
      dispatch({ type: 'EXTERNAL_CHANGE', payload: { path: e.path, kind: e.kind } })
      if (quitDirtyDocsRef.current) return
      if (e.kind === 'changed' && !doc.dirty && !isDirtyLive(doc)) {
        reloadDocument(doc)
        return
      }
      flushLiveContent()
      setDialogError(null)
      setExternalPrompt({ id: doc.id, kind: e.kind })
    })

    const unsubWorkspace = window.api.onWorkspaceChanged((e) => {
      dispatchWorkspace({ type: 'APPLY_WATCH_EVENT', payload: e })
    })

    const unsubQuit = window.api.onQuitRequested(() => {
      const current = sessionRef.current
      flushLiveContent()
      const dirtyDocs = current.documents.filter(d => isDirtyLive(d))
      if (dirtyDocs.length === 0) {
        window.api.confirmQuit('quit')
        return
      }
      setDialogError(null)
      setQuitDirtyDocs(dirtyDocs)
    })

    return () => {
      unsubMenu()
      unsubDocument()
      unsubWorkspace()
      unsubQuit()
    }
  }, [enforcePoolCap, flushLiveContent, handleCloseRequest, handleNew, isDirtyLive, reloadDocument, saveDocument])

  useEffect(() => {
    return () => {
      instancePool.destroyAll()
    }
  }, [])

  const handleOpenFolder = useCallback(async () => {
    const result = await window.api.openFolderDialog()
    if (result.ok && result.value) {
      dispatchWorkspace({
        type: 'REPLACE',
        payload: {
          name: result.value.name,
          root: null,
          entries: result.value.entries
        }
      })
    }
  }, [])

  const pendingCloseDoc = pendingCloseId
    ? session.documents.find(d => d.id === pendingCloseId) ?? null
    : null
  const externalDoc = externalPrompt
    ? session.documents.find(d => d.id === externalPrompt.id) ?? null
    : null

  const sidebarWidth = getSettings().sidebarWidth
  const hasWorkspace = workspace.name !== null

  return (
    <div className="app-container">
      <div className="toolbar">
        <button onClick={handleNew}>New</button>
        <button onClick={handleOpenFolder}>Open Folder</button>
        {activeDoc && (
          <span className="document-title">
            {activeDoc.title}{activeDoc.dirty ? ' \u2022' : ''}
          </span>
        )}
        {workspace.name && (
          <span className="workspace-name">{workspace.name}</span>
        )}
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
                onResize={handleSidebarResize}
              >
                <div className="sidebar">
                  <div className="sidebar-header">
                    <span className="workspace-title">{workspace.name}</span>
                  </div>
                  <Tree
                    data={workspace.nodes}
                    selectedId={workspace.selectedId}
                    onSelect={handleTreeSelect}
                    onActivate={handleTreeActivate}
                    onToggle={handleTreeToggle}
                    pendingEditId={pendingEditId}
                    onRename={handleRename}
                    onEditingCancelled={handleEditingCancelled}
                    onDeleteRequest={handleDeleteRequest}
                    onCreateRequest={handleCreate}
                    onMove={handleTreeMove}
                  />
                </div>
              </Panel>
              <Separator className="resize-handle" />
            </>
          )}
          <Panel className="editor-panel">
            <TabBar
              documents={session.documents}
              activeId={session.activeId}
              onActivate={handleActivate}
              onClose={handleCloseRequest}
            />
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
                  />
                ))
              )}
            </div>
          </Panel>
        </Group>
      </div>

      {quitDirtyDocs ? (
        <ConfirmDialog
          title="Quit with unsaved changes?"
          error={dialogError}
          onCancel={() => handleQuitDecision('cancel')}
          buttons={[
            { label: 'Cancel', onClick: () => handleQuitDecision('cancel') },
            { label: 'Discard and Quit', kind: 'danger', onClick: () => handleQuitDecision('discard') },
            { label: 'Save All and Quit', kind: 'primary', onClick: () => handleQuitDecision('save-all') }
          ]}
        >
          <p>The following documents have unsaved changes:</p>
          <ul>
            {quitDirtyDocs.map((doc) => (
              <li key={doc.id}>{doc.title}</li>
            ))}
          </ul>
        </ConfirmDialog>
      ) : pendingCloseDoc ? (
        <ConfirmDialog
          title="Unsaved changes"
          error={dialogError}
          onCancel={() => handleCloseDecision('cancel')}
          buttons={[
            { label: 'Cancel', onClick: () => handleCloseDecision('cancel') },
            { label: 'Discard', kind: 'danger', onClick: () => handleCloseDecision('discard') },
            { label: 'Save', kind: 'primary', onClick: () => handleCloseDecision('save') }
          ]}
        >
          <p>{pendingCloseDoc.title} has unsaved changes. What would you like to do?</p>
        </ConfirmDialog>
      ) : externalPrompt && externalDoc ? (
        externalPrompt.kind === 'removed' ? (
          <ConfirmDialog
            title="File deleted on disk"
            error={dialogError}
            onCancel={() => handleExternalDecision('ok')}
            buttons={[
              { label: 'OK', onClick: () => handleExternalDecision('ok') },
              { label: 'Save As...', kind: 'primary', onClick: () => handleExternalDecision('save-as') }
            ]}
          >
            <p>
              {externalDoc.title} was deleted or renamed on disk. Its content is still open here;
              you can save it to a new location.
            </p>
          </ConfirmDialog>
        ) : (
          <ConfirmDialog
            title="File changed on disk"
            onCancel={() => handleExternalDecision('keep')}
            buttons={[
              { label: 'Keep My Version', onClick: () => handleExternalDecision('keep') },
              { label: 'Reload from Disk', kind: 'primary', onClick: () => handleExternalDecision('reload') }
            ]}
          >
            <p>
              {externalDoc.title} was modified by another program. Keep your version, or replace it
              with the version on disk?
            </p>
          </ConfirmDialog>
        )
        ) : deleteRefused ? (
          <ConfirmDialog
            title="Cannot delete"
            onCancel={() => setDeleteRefused(null)}
            buttons={[{ label: 'OK', kind: 'primary', onClick: () => setDeleteRefused(null) }]}
          >
            <p>
              {deleteRefused.node.name} has unsaved changes in the editor. Save or close{' '}
              {deleteRefused.blockers.length > 1 ? 'those documents' : 'the document'} before
              deleting it.
            </p>
            <ul>
              {deleteRefused.blockers.map((doc) => (
                <li key={doc.id}>{doc.title}</li>
              ))}
            </ul>
          </ConfirmDialog>
        ) : deleteTarget ? (
          <ConfirmDialog
            title={`Delete ${deleteTarget.node.name}?`}
            error={dialogError}
            onCancel={() => setDeleteTarget(null)}
            buttons={[
              { label: 'Cancel', onClick: () => setDeleteTarget(null) },
              { label: 'Delete', kind: 'danger', onClick: handleDeleteConfirm }
            ]}
          >
            <p>{deleteDescription(deleteTarget.info)}</p>
            {deleteTarget.plan.cleanToClose.length > 0 && (
              <p>
                The open document{deleteTarget.plan.cleanToClose.length > 1 ? 's' : ''}{' '}
                {deleteTarget.plan.cleanToClose.map(d => d.title).join(', ')} will close.
              </p>
            )}
            <p>It will be moved to the recycle bin or trash.</p>
          </ConfirmDialog>
        ) : permanentDelete ? (
          <ConfirmDialog
            title="Trash unavailable"
            error={dialogError}
            onCancel={() => setPermanentDelete(null)}
            buttons={[
              { label: 'Cancel', onClick: () => setPermanentDelete(null) },
              { label: 'Delete Permanently', kind: 'danger', onClick: handleDeletePermanent }
            ]}
          >
            <p>
              {permanentDelete.node.name} could not be moved to the recycle bin or trash on this
              system. Deleting it permanently cannot be undone.
            </p>
            {permanentDelete.plan.cleanToClose.length > 0 && (
              <p>
                The open document{permanentDelete.plan.cleanToClose.length > 1 ? 's' : ''}{' '}
                {permanentDelete.plan.cleanToClose.map(d => d.title).join(', ')} will close.
              </p>
            )}
            <p>Delete permanently anyway?</p>
          </ConfirmDialog>
        ) : operationError ? (
          <ConfirmDialog
            title="Operation failed"
            onCancel={() => setOperationError(null)}
            buttons={[{ label: 'OK', kind: 'primary', onClick: () => setOperationError(null) }]}
          >
            <p>{operationError}</p>
          </ConfirmDialog>
        ) : null}
    </div>
  )
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}
