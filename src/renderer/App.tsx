import { useReducer, useEffect, useCallback } from 'react'
import type { MenuCommand } from '@shared/ipc-contract'
import {
  EditingSession,
  DocumentState,
  documentsReducer,
  getActiveDocument,
} from './state/documents'
import { loadSettingsFromMain } from './state/settings'
import { instancePool } from './editor/instancePool'
import EditorPanel from './editor/EditorPanel'
import './App.css'

const initialState: EditingSession = {
  documents: [],
  activeId: null,
  untitledCounter: 0
}

export default function App() {
  const [session, dispatch] = useReducer(documentsReducer, initialState)
  const activeDoc = getActiveDocument(session)

  useEffect(() => {
    loadSettingsFromMain()
  }, [])

  const handleContentChange = useCallback((id: string, content: string) => {
    dispatch({ type: 'UPDATE_CONTENT', payload: { id, content } })
  }, [])

  const handleBaselineCapture = useCallback((id: string, baseline: string) => {
    dispatch({ type: 'CAPTURE_BASELINE', payload: { id, baseline } })
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
        case 'save': {
          if (!activeDoc) return
          if (activeDoc.path) {
            const result = await window.api.writeFile(activeDoc.path, activeDoc.content)
            if (result.ok) {
              dispatch({
                type: 'SAVE_SUCCESS',
                payload: { id: activeDoc.id, path: activeDoc.path, content: activeDoc.content }
              })
            } else {
              dispatch({ type: 'SAVE_FAILED', payload: { id: activeDoc.id } })
            }
          } else {
            const result = await window.api.saveFileDialog(activeDoc.title, activeDoc.content)
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
          const result = await window.api.saveFileDialog(activeDoc.title, activeDoc.content)
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
              // close-tab with dirty: handled in Phase 5
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

    const unsubQuit = window.api.onQuitRequested(() => {
      window.api.confirmQuit('quit')
    })

    return () => {
      unsubMenu()
      unsubDocument()
      unsubQuit()
    }
  }, [activeDoc])

  useEffect(() => {
    return () => {
      instancePool.destroyAll()
    }
  }, [])

  const handleNew = () => dispatch({ type: 'OPEN_NEW' })

  return (
    <div className="app-container">
      <div className="toolbar">
        <button onClick={handleNew}>New</button>
        {activeDoc && (
          <span className="document-title">
            {activeDoc.title}{activeDoc.dirty ? ' \u2022' : ''}
          </span>
        )}
      </div>
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
    </div>
  )
}
