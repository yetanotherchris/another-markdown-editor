import { useCallback } from 'react'
import type { MenuCommand } from '../../shared/ipc-contract'
import type { DocumentsAction, EditingSession } from '../state/documents'
import { getActiveDocument } from '../state/documents'
import type { DialogQueue } from './useDialogQueue'
import type { DocumentSessionApi } from './useDocumentSession'
import type { WorkspaceFolderApi } from './useWorkspaceFolder'

export interface MenuCommandsApi {
  handleMenuCommand: (command: MenuCommand) => void
}

/**
 * Spec 010 menu-command routing (US1/FR-002): the single command bus shared by
 * the native-menu IPC listener, the renderer hamburger, and the keyboard
 * shortcuts. Every `MenuCommand` resolves to the same dispatch paths the old
 * File menu used (FR-001/FR-002), including spec 004's recent-item opens.
 */
export function useMenuCommands(opts: {
  sessionRef: React.MutableRefObject<EditingSession>
  dialog: DialogQueue
  session: Pick<DocumentSessionApi, 'saveDocument' | 'handleCloseRequest' | 'handleNew' | 'openFileFromTree'>
  folder: Pick<WorkspaceFolderApi, 'runFolderOpenFlow'>
  dispatch: React.Dispatch<DocumentsAction>
  enforcePoolCap: (activeId: string | null) => void
}): MenuCommandsApi {
  const { sessionRef, dialog, session, folder, dispatch, enforcePoolCap } = opts
  const { showOperationError } = dialog

  const handleMenuCommand = useCallback((command: MenuCommand) => {
    const active = getActiveDocument(sessionRef.current)
    if (typeof command === 'object') {
      // Spec 004: File > Recent Items. Route through the exact same dispatch
      // paths as File > Open File / Open Folder (FR-007). A failed open
      // surfaces in-context and leaves the session untouched (FR-009).
      if (command.type === 'open-recent') {
        if (command.kind === 'file') {
          window.api.openRecentFile(command.path).then((result) => {
            if (result.ok) {
              // Spec 024: route through the session gate so a clean active tab
              // is replaced (FR-001/008).
              session.openFileFromTree(result.value)
            } else {
              void showOperationError(result.message)
            }
          })
        } else {
          // Recent-folder open shares the prepare → (confirm) → commit flow
          // with File > Open Folder (FR-007/FR-010).
          void folder.runFolderOpenFlow(command.path)
        }
      }
      return
    }
    switch (command) {
      case 'open-file': {
        window.api.openFileDialog().then((result) => {
          if (result.ok && result.value) {
            session.openFileFromTree(result.value)
          } else if (!result.ok) {
            void showOperationError(result.message)
          }
        })
        break
      }
      case 'open-folder': {
        void folder.runFolderOpenFlow()
        break
      }
      case 'save': {
        if (active) session.saveDocument(active)
        break
      }
      case 'save-as': {
        if (active) session.saveDocument(active, true)
        break
      }
      case 'close-tab': {
        if (active) session.handleCloseRequest(active.id)
        break
      }
      case 'new-file': {
        session.handleNew()
        break
      }
      default:
        break
    }
  }, [dispatch, enforcePoolCap, folder, session, sessionRef, showOperationError])

  return { handleMenuCommand }
}
