import { useReducer, useEffect, useCallback, useRef } from 'react'
import type { MenuCommand } from '@shared/ipc-contract'
import {
  EditingSession,
  documentsReducer,
  getActiveDocument,
  hasDirtyDocuments,
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
            // Phase 4: update workspace state
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
