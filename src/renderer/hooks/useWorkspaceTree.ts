import { useCallback } from 'react'
import type { TreeApi } from 'react-arborist'
import type { EntryKind } from '../../shared/ipc-contract'
import type { DocumentsAction, EditingSession } from '../state/documents'
import type { WorkspaceState, TreeNode, WorkspaceAction } from '../state/workspace'
import { findNodeById } from '../state/workspace'
import {
  renameTargetPath,
  moveTargetPath,
  validateEntryName,
  entryName,
  planDelete,
  deleteDescription,
  DeletePlan,
} from '../explorer/operations'
import type { DialogQueue } from './useDialogQueue'
import type { DocumentSessionApi } from './useDocumentSession'

export interface WorkspaceTreeApi {
  handleTreeSelect: (id: string | null) => Promise<void>
  handleTreeActivate: (id: string) => Promise<void>
  handleTreeToggle: (id: string, isLoaded: boolean) => Promise<void>
  applyMove: (fromPath: string, toPath: string) => Promise<boolean>
  handleRename: (node: TreeNode, newName: string) => Promise<boolean>
  handleEditingCancelled: (id: string) => void
  handleCreate: (parent: TreeNode | null, kind: EntryKind) => Promise<void>
  cleanupAfterDelete: (node: TreeNode, plan: DeletePlan) => void
  runDeleteConfirmation: (node: TreeNode) => Promise<void>
  handleTreeMove: (id: string, targetParentId: string) => void
}

/**
 * Workspace tree CRUD (US1/FR-002): expand/select/open/create/rename/delete/
 * move, plus the confirmed-delete flow and the placeholder-cancel cleanup.
 */
export function useWorkspaceTree(opts: {
  dispatch: React.Dispatch<DocumentsAction>
  dispatchWorkspace: React.Dispatch<WorkspaceAction>
  sessionRef: React.MutableRefObject<EditingSession>
  workspaceRef: React.MutableRefObject<WorkspaceState>
  dialog: DialogQueue
  session: Pick<DocumentSessionApi, 'doClose' | 'isDirtyLive' | 'openFileFromTree'>
  treeApiRef: React.MutableRefObject<TreeApi<TreeNode> | null>
  pendingCreateRef: React.MutableRefObject<Set<string>>
  createCounterRef: React.MutableRefObject<number>
  enforcePoolCap: (activeId: string | null) => void
  setPendingEditId: (id: string | null) => void
}): WorkspaceTreeApi {
  const {
    dispatch,
    dispatchWorkspace,
    sessionRef,
    workspaceRef,
    dialog,
    session,
    pendingCreateRef,
    createCounterRef,
    enforcePoolCap,
    setPendingEditId
  } = opts
  const { dialogInFlightRef, releaseDialogSurface, showOperationError } = dialog
  const { doClose, isDirtyLive, openFileFromTree } = session

  const handleTreeSelect = useCallback(async (id: string | null) => {
    dispatchWorkspace({ type: 'SELECT', payload: { id } })
    if (!id) return
    const node = findNodeById(workspaceRef.current.nodes, id)
    if (!node || node.kind !== 'file') return
    const result = await window.api.readFile(id)
    if (result.ok) {
      // Spec 024: open through the session gate so a clean active tab is
      // replaced instead of spawning a new tab (FR-001).
      openFileFromTree(result.value)
    }
  }, [dispatchWorkspace, openFileFromTree, workspaceRef])

  const handleTreeActivate = useCallback(async (id: string) => {
    const node = findNodeById(workspaceRef.current.nodes, id)
    if (!node || node.kind !== 'file') return

    const result = await window.api.readFile(id)
    if (result.ok) {
      openFileFromTree(result.value)
    }
  }, [openFileFromTree, workspaceRef])

  const handleTreeToggle = useCallback(async (id: string, isLoaded: boolean) => {
    if (isLoaded) {
      // A folder already loaded: visibility is arborist's own state. Collapsing
      // must NOT wipe the children — arborist fires this for auto-opens too,
      // which would erase the node being edited right after creation.
      return
    }    dispatchWorkspace({ type: 'EXPAND_START', payload: { id } })
    const result = await window.api.readDir(id)
    if (result.ok) {
      dispatchWorkspace({ type: 'EXPAND_SUCCESS', payload: { id, entries: result.value } })
    } else {
      dispatchWorkspace({ type: 'EXPAND_ERROR', payload: { id, error: result.message } })
    }
  }, [dispatchWorkspace])

  const applyMove = useCallback(async (fromPath: string, toPath: string) => {
    const result = await window.api.moveEntry(fromPath, toPath)
    if (!result.ok) {
      void showOperationError(result.message)
      return false
    }
    // The watcher event for this mutation is suppressed in main (FR-037), so
    // the renderer applies the result to its own tree and document state.
    dispatchWorkspace({ type: 'MOVE_ENTRY', payload: { fromPath, toPath, entry: result.value } })
    dispatchWorkspace({ type: 'SELECT', payload: { id: toPath } })
    dispatch({ type: 'REROUTE_PATHS', payload: { fromPath, toPath } })
    return true
  }, [dispatch, dispatchWorkspace, showOperationError])
  // T058: inline rename commit from the tree (also used to name new entries).
  const handleRename = useCallback(async (node: TreeNode, newName: string): Promise<boolean> => {
    const error = validateEntryName(node.kind, node.name, newName)
    if (error) {
      void showOperationError(error)
      return false
    }
    const fromPath = node.id
    const toPath = renameTargetPath(fromPath, newName.trim())
    // The placeholder state ends at the first committed rename — a later
    // Escape-cancel must not trash a file that may now hold real content.
    pendingCreateRef.current.delete(fromPath)
    setPendingEditId(null)
    if (toPath === fromPath) return true
    return applyMove(fromPath, toPath)
  }, [applyMove, pendingCreateRef, setPendingEditId, showOperationError])

  const handleEditingCancelled = useCallback((id: string) => {
    // A new entry the user declined to name: remove the placeholder.
    if (!pendingCreateRef.current.has(id)) return
    pendingCreateRef.current.delete(id)
    setPendingEditId(null)
    window.api.trashEntry(id).then((result) => {
      if (result.ok) {
        dispatchWorkspace({ type: 'REMOVE_ENTRY', payload: { id } })
        return
      }
      // The placeholder is still on disk; surface it so the user can retry.
      const name = entryName(id)
      void showOperationError(`Could not remove "${name}". It is still on disk — right-click and delete it, or remove it manually.`)
    })
  }, [dispatchWorkspace, pendingCreateRef, setPendingEditId, showOperationError])

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

    // createCounterRef resets on app restart, so a leftover placeholder from a
    // previous session can make the first name collide (CONFLICT); retry.
    let result: Awaited<ReturnType<typeof window.api.createEntry>> | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      createCounterRef.current++
      const placeholder = kind === 'file'
        ? `new-file-${createCounterRef.current}.md`
        : `new-folder-${createCounterRef.current}`
      const attemptResult = await window.api.createEntry(parent ? parent.id : '.', placeholder, kind)
      if (attemptResult.ok || attemptResult.code !== 'CONFLICT') {
        result = attemptResult
        break
      }
    }
    if (!result || !result.ok) {
      void showOperationError(result?.message ?? 'Could not create the new entry')
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
  }, [createCounterRef, dispatchWorkspace, pendingCreateRef, setPendingEditId, showOperationError, workspaceRef])

  const cleanupAfterDelete = useCallback((node: TreeNode, plan: DeletePlan) => {
    for (const doc of plan.cleanToClose) {
      // A keystroke during the async trash would otherwise discard this edit
      // without a prompt (Principle III) — re-check and leave it open.
      const fresh = sessionRef.current.documents.find(d => d.id === doc.id)
      if (fresh && isDirtyLive(fresh)) continue
      doClose(doc.id)
    }
    dispatchWorkspace({ type: 'REMOVE_ENTRY', payload: { id: node.id } })
    const selected = workspaceRef.current.selectedId
    // A descendant may have been selected (e.g. a file inside a deleted
    // folder); it is gone too, so clear the selection as well.
    if (selected === node.id || (selected !== null && selected.startsWith(node.id + '/'))) {
      dispatchWorkspace({ type: 'SELECT', payload: { id: null } })
    }
  }, [dispatchWorkspace, doClose, isDirtyLive, sessionRef, workspaceRef])

  // Spec 008 delete flow, decomposed into named sub-steps (FR-004): describe →
  // plan → (delete-blocked | delete-to-trash) → trash; on TRASH_UNAVAILABLE an
  // explicit permanent-delete confirmation. The whole flow holds the
  // single-prompt guard (FR-012).
  const runDeleteConfirmation = useCallback(async (node: TreeNode) => {
    if (dialogInFlightRef.current) return
    dialogInFlightRef.current = true
    try {
      // ---- describe: gather the entry info for the confirmation ----
      const result = await window.api.describeEntry(node.id)
      if (!result.ok) {
        // The guard is held, so the error is queued and shown once released.
        void showOperationError(result.message)
        return
      }
      const info = result.value

      // ---- plan: which open documents the delete touches ----
      const plan = planDelete(sessionRef.current.documents, node.id, isDirtyLive)

      // ---- block-if-dirty: refuse while a blocker has unsaved changes ----
      if (plan.dirtyBlockers.length > 0) {
        const blocked = await window.api.showConfirmation({
          kind: 'delete-blocked',
          targetName: node.name,
          blockerTitles: plan.dirtyBlockers.map(d => d.title)
        })
        if (!blocked.ok) void showOperationError(blocked.message)
        return
      }

      // ---- confirm-trash: the primary confirmation ----
      const deleteDecision = await window.api.showConfirmation({
        kind: 'delete-to-trash',
        targetName: node.name,
        detail: deleteDescription(info),
        cleanToCloseTitles: plan.cleanToClose.map(d => d.title)
      })
      if (!deleteDecision.ok || deleteDecision.value !== 'delete') return

      // ---- trash, with the permanent-delete fallback ----
      const trashed = await window.api.trashEntry(node.id)
      if (trashed.ok) {
        cleanupAfterDelete(node, plan)
        return
      }
      if (trashed.code === 'TRASH_UNAVAILABLE') {
        // FR-029a: trash unavailable — offer permanent deletion only as an
        // explicit second confirmation.
        const permanent = await window.api.showConfirmation({
          kind: 'permanent-delete',
          targetName: node.name,
          detail: deleteDescription(info),
          cleanToCloseTitles: plan.cleanToClose.map(d => d.title)
        })
        if (!permanent.ok || permanent.value !== 'delete-permanent') return
        const deleted = await window.api.trashEntry(node.id, true)
        if (deleted.ok) {
          cleanupAfterDelete(node, plan)
          return
        }
        void showOperationError(deleted.message)
        return
      }
      void showOperationError(trashed.message)
    } finally {
      releaseDialogSurface()
    }
  }, [cleanupAfterDelete, dialogInFlightRef, isDirtyLive, releaseDialogSurface, sessionRef, showOperationError])

  // T059: drag-and-drop move between folders.
  const handleTreeMove = useCallback((id: string, targetParentId: string) => {
    const target = moveTargetPath(id, targetParentId)
    if (!target) return
    applyMove(id, target)
  }, [applyMove])

  return {
    handleTreeSelect,
    handleTreeActivate,
    handleTreeToggle,
    applyMove,
    handleRename,
    handleEditingCancelled,
    handleCreate,
    cleanupAfterDelete,
    runDeleteConfirmation,
    handleTreeMove
  }
}
