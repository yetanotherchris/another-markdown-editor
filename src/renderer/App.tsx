import { useReducer, useEffect, useCallback, useRef } from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'
import type { MenuCommand } from '@shared/ipc-contract'
import {
  EditingSession,
  documentsReducer,
  getActiveDocument,
  hasDirtyDocuments,
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
import './App.css'

const initialSession: EditingSession = {
  documents: [],
  activeId: null,
  untitledCounter: 0
}

export default function App() {
  const [session, dispatch] = useReducer(documentsReducer, initialSession)
  const [workspace, dispatchWorkspace] = useReducer(workspaceReducer, initialWorkspaceState)
  const activeDoc = getActiveDocument(session)
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    loadSettingsFromMain()
  }, [])

  const handleContentChange = useCallback((id: string, content: string) => {
    dispatch({ type: 'UPDATE_CONTENT', payload: { id, content } })
  }, [])

  const handleBaselineCapture = useCallback((id: string, baseline: string) => {
    dispatch({ type: 'CAPTURE_BASELINE', payload: { id, baseline } })
  }, [])

  const getContentToSave = useCallback((docId: string, fallback: string): string => {
    return instancePool.getMarkdown(docId) ?? fallback
  }, [])

  const handleTreeSelect = useCallback(async (id: string | null) => {
    dispatchWorkspace({ type: 'SELECT', payload: { id } })
    if (!id) return
    const node = findNodeById(workspace.nodes, id)
    if (!node || node.kind !== 'file') return
    const result = await window.api.readFile(id)
    if (result.ok) {
      dispatch({ type: 'OPEN_EXISTING', payload: result.value })
    }
  }, [workspace.nodes])

  const handleTreeActivate = useCallback(async (id: string) => {
    const node = findNodeById(workspace.nodes, id)
    if (!node || node.kind !== 'file') return

    const result = await window.api.readFile(id)
    if (result.ok) {
      dispatch({ type: 'OPEN_EXISTING', payload: result.value })
    }
  }, [workspace.nodes])

  const handleTreeToggle = useCallback(async (id: string, isLoaded: boolean) => {
    if (isLoaded) {
      dispatchWorkspace({ type: 'COLLAPSE', payload: { id } })
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

  const handleSidebarResize = useCallback((size: { asPercentage: number; inPixels: number }) => {
    updateSettings({ sidebarWidth: size.asPercentage })
    window.api.updateSettings({ sidebarWidth: size.asPercentage }).catch(() => { /* ignore */ })
  }, [])

  useEffect(() => {
    const unsubMenu = window.api.onMenuCommand(async (command: MenuCommand) => {
      switch (command) {
        case 'open-file': {
          const result = await window.api.openFileDialog()
          if (result.ok && result.value) {
            dispatch({ type: 'OPEN_EXISTING', payload: result.value })
          }
          break
        }
        case 'open-folder': {
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
          break
        }
        case 'save': {
          if (!activeDoc) return
          const content = getContentToSave(activeDoc.id, activeDoc.content)
          if (activeDoc.path) {
            const result = await window.api.writeFile(activeDoc.path, content)
            if (result.ok) {
              dispatch({
                type: 'SAVE_SUCCESS',
                payload: { id: activeDoc.id, path: activeDoc.path, content }
              })
            } else {
              dispatch({ type: 'SAVE_FAILED', payload: { id: activeDoc.id } })
            }
          } else {
            const result = await window.api.saveFileDialog(activeDoc.title, content)
            if (result.ok && result.value) {
              dispatch({
                type: 'SAVE_SUCCESS',
                payload: { id: activeDoc.id, path: result.value.path, content: result.value.content }
              })
            }
          }
          break
        }
        case 'save-as': {
          if (!activeDoc) return
          const content = getContentToSave(activeDoc.id, activeDoc.content)
          const result = await window.api.saveFileDialog(activeDoc.title, content)
          if (result.ok && result.value) {
            dispatch({
              type: 'SAVE_SUCCESS',
              payload: { id: activeDoc.id, path: result.value.path, content: result.value.content }
            })
          }
          break
        }
        case 'close-tab': {
          if (activeDoc) {
            if (activeDoc.dirty) {
              // close-tab with dirty save/discard/cancel dialog: Phase 5 (T053)
            } else {
              dispatch({ type: 'CLOSE', payload: { id: activeDoc.id } })
              instancePool.remove(activeDoc.id)
            }
          }
          break
        }
        case 'new-file': {
          dispatch({ type: 'OPEN_NEW' })
          break
        }
        default:
          break
      }
    })

    const unsubDocument = window.api.onDocumentChanged((e) => {
      dispatch({
        type: 'EXTERNAL_CHANGE',
        payload: { path: e.path, kind: e.kind }
      })
    })

    const unsubWorkspace = window.api.onWorkspaceChanged((e) => {
      dispatchWorkspace({ type: 'APPLY_WATCH_EVENT', payload: e })
    })

    const unsubQuit = window.api.onQuitRequested(() => {
      const dirty = hasDirtyDocuments(sessionRef.current)
      if (dirty) {
        window.api.confirmQuit('cancel')
        return
      }
      window.api.confirmQuit('quit')
    })

    return () => {
      unsubMenu()
      unsubDocument()
      unsubWorkspace()
      unsubQuit()
    }
  }, [activeDoc])

  useEffect(() => {
    return () => {
      instancePool.destroyAll()
    }
  }, [])

  const handleNew = () => dispatch({ type: 'OPEN_NEW' })

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
                  />
                </div>
              </Panel>
              <Separator className="resize-handle" />
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
                  />
                ))
              )}
            </div>
          </Panel>
        </Group>
      </div>
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
