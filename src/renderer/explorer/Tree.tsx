import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Tree as ArboristTree, NodeApi, TreeApi } from 'react-arborist'
import type { RowRendererProps } from 'react-arborist'
import type { TreeNode } from '../state/workspace'
import { useElementSize } from '../hooks/useElementSize'
import { moveTargetPath, parentPathOf, wouldMoveIntoOwnDescendant } from './operations'
import type { EntryKind } from '../../shared/ipc-contract'
import './Tree.css'

interface TreeProps {
  data: TreeNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onActivate: (id: string) => void
  onToggle: (id: string, isOpen: boolean) => void
  /** App asks the tree to start inline editing on this node (create flow). */
  pendingEditId: string | null
  /** Rename committed; resolve true when applied (false keeps the old name). */
  onRename: (node: TreeNode, newName: string) => Promise<boolean>
  /** Inline edit ended without a commit (Escape or blur). */
  onEditingCancelled: (id: string) => void
  onDeleteRequest: (node: TreeNode) => void
  onCreateRequest: (parent: TreeNode | null, kind: EntryKind) => void
  onMove: (id: string, targetParentId: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  node: TreeNode | null
}

interface TreeNodeProps {
  node: NodeApi<TreeNode>
  style: React.CSSProperties
  dragHandle?: (el: HTMLDivElement | null) => void
  onRowContextMenu: (node: TreeNode, x: number, y: number) => void
}

function RenameInput({ node }: { node: NodeApi<TreeNode> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const closedRef = useRef(false)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  const commit = () => {
    if (closedRef.current) return
    closedRef.current = true
    node.submit(inputRef.current?.value ?? '')
  }

  const cancel = () => {
    if (closedRef.current) return
    closedRef.current = true
    node.reset()
  }

  return (
    <input
      ref={inputRef}
      className="tree-node-input"
      defaultValue={node.data.name}
      aria-label={`Rename ${node.data.name}`}
      draggable={false}
      // The row's select/activate handlers fire on every click and dispatch a
      // tree re-render; react-arborist's row keys are per-render objects, so
      // every re-render remounts the rows and this input along with them,
      // resetting the caret. Keep the input's mouse interactions away from
      // the row, and disable native dragging from inside the field so caret
      // placement and text selection are not hijacked by row drags.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onBlur={() => {
        // Blurring while the edit is still active means focus was stolen —
        // react-arborist's container refocuses `focusedNode || firstNode`
        // when the context menu closes, which would otherwise cancel the
        // edit. Give focus back. A blur after the edit closed (Enter/Escape
        // path, input unmounting) is a no-op via `closedRef`.
        if (node.isEditing) {
          inputRef.current?.focus()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') cancel()
      }}
    />
  )
}

function TreeNode({ node, style, dragHandle, onRowContextMenu }: TreeNodeProps) {
  const isDir = node.data.kind === 'directory'

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-node ${node.isSelected ? 'selected' : ''} ${node.isLeaf ? 'leaf' : ''}`}
      onClick={() => node.select()}
      onDoubleClick={() => node.activate()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onRowContextMenu(node.data, e.clientX, e.clientY)
      }}
      role="treeitem"
      aria-expanded={isDir ? node.isOpen : undefined}
      aria-selected={node.isSelected}
    >
      {isDir && (
        <span
          className="tree-node-toggle"
          role="button"
          aria-label={node.isOpen ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation()
            node.toggle()
          }}
        >
          {node.isOpen ? '\u25BE' : '\u25B8'}
        </span>
      )}
      <span className="tree-node-icon">{isDir ? (node.isOpen ? '📂' : '📁') : '📄'}</span>
      {node.isEditing ? (
        <RenameInput node={node} />
      ) : (
        <span className="tree-node-name">{node.data.name}</span>
      )}
    </div>
  )
}

export default function Tree({
  data,
  selectedId,
  onSelect,
  onActivate,
  onToggle,
  pendingEditId,
  onRename,
  onEditingCancelled,
  onDeleteRequest,
  onCreateRequest,
  onMove
}: TreeProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const treeRef = useRef<TreeApi<TreeNode> | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingIdRef = useRef(editingId)
  editingIdRef.current = editingId

  useEffect(() => {
    if (!pendingEditId || editingIdRef.current === pendingEditId) return
    setEditingId(pendingEditId)
  }, [pendingEditId])

  const startEditing = useCallback(async (id: string) => {
    let node = treeRef.current?.get(id)
    if (!node) {
      // The node exists in the data but its parent is closed in arborist's
      // own visibility state (create flow). Opening the parent fires our
      // onToggle, which lazy-loads the folder if needed and then leaves the
      // already-loaded data alone — see App.handleTreeToggle.
      const parent = parentPathOf(id)
      if (parent) treeRef.current?.open(parent)
      for (let i = 0; i < 20 && !node; i++) {
        await new Promise((resolve) => setTimeout(resolve, 25))
        node = treeRef.current?.get(id)
      }
    }
    if (!node) return
    const result = await node.edit()
    if (result.cancelled) {
      onEditingCancelled(id)
    }
    setEditingId((current) => (current === id ? null : current))
  }, [onEditingCancelled])

  useEffect(() => {
    if (editingId) {
      // The node exists only after the reducer applied the INSERT_ENTRY, so
      // wait a frame for react-arborist to pick it up.
      const timer = setTimeout(() => {
        startEditing(editingId)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [editingId, startEditing])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    if (!contextMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    const onClick = () => closeContextMenu()
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    window.addEventListener('blur', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
      window.removeEventListener('blur', onClick)
    }
  }, [contextMenu, closeContextMenu])

  const handleSelect = useCallback((nodes: NodeApi<TreeNode>[]) => {
    const first = nodes[0]
    onSelect(first?.id ?? null)
  }, [onSelect])

  const handleActivate = useCallback((node: NodeApi<TreeNode>) => {
    onActivate(node.id)
  }, [onActivate])

  const handleToggle = useCallback((id: string) => {
    const node = findNodeById(data, id)
    if (!node) return
    onToggle(id, node.loadState === 'loaded')
  }, [data, onToggle])

  const handleRename = useCallback(async (args: {
    id: string
    name: string
    node: NodeApi<TreeNode>
  }) => {
    const node = findNodeById(data, args.id)
    if (!node) return
    await onRename(node, args.name)
  }, [data, onRename])

  const handleMove = useCallback((args: {
    dragIds: string[]
    dragNodes: NodeApi<TreeNode>[]
    parentId: string | null
    parentNode: NodeApi<TreeNode> | null
    index: number
  }) => {
    // A drop on empty space targets the root: parentNode is the internal root
    // node (its data has no kind), which maps to the workspace root ''.
    const targetParentId = args.parentNode && !args.parentNode.isRoot
      ? args.parentNode.data.id
      : ''
    for (const id of args.dragIds) {
      const target = moveTargetPath(id, targetParentId)
      if (!target) continue
      if (wouldMoveIntoOwnDescendant(id, targetParentId)) continue
      onMove(id, targetParentId)
    }
  }, [onMove])

  const handleRowContextMenu = useCallback((node: TreeNode, x: number, y: number) => {
    setContextMenu({ x, y, node })
  }, [])

  // react-arborist puts role="treeitem" on the row wrapper AND on the node
  // renderer, doubling every row for screen readers and role locators. Strip
  // the wrapper role so each row exposes exactly one treeitem (the node div).
function Row({ node, attrs, innerRef, children }: RowRendererProps<TreeNode>) {
  return (
    <div
      ref={innerRef}
      style={attrs.style}
      className={attrs.className}
      tabIndex={attrs.tabIndex}
      onClick={node.handleClick}
    >
      {children}
    </div>
  )
}

  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node: null })
  }, [])

  const menuItem = (label: string, onClick: () => void) => (
    <button
      type="button"
      className="context-menu-item"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation()
        closeContextMenu()
        onClick()
      }}
    >
      {label}
    </button>
  )

  const menu = contextMenu && (
    <div
      className="context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      role="menu"
    >
      {contextMenu.node && (
        <div className="context-menu-title" aria-hidden="true">
          {contextMenu.node.name}
        </div>
      )}
      {(!contextMenu.node || contextMenu.node.kind === 'directory') && (
        <>
          {menuItem('New File', () => onCreateRequest(contextMenu.node, 'file'))}
          {menuItem('New Folder', () => onCreateRequest(contextMenu.node, 'directory'))}
        </>
      )}
      {contextMenu.node && (
        <>
          <div className="context-menu-separator" />
          {menuItem('Rename', () => startEditing(contextMenu.node!.id))}
          {menuItem('Delete', () => onDeleteRequest(contextMenu.node!))}
        </>
      )}
    </div>
  )

  return (
    <div
      ref={containerRef}
      className="tree-container"
      onContextMenu={handleContainerContextMenu}
    >
      {data.length === 0 ? (
        <div className="tree-empty">No markdown files in this folder</div>
      ) : (
        <ArboristTree
          ref={(api) => {
            if (api) treeRef.current = api
          }}
          data={data}
          width={size.width}
          height={size.height}
          rowHeight={28}
          selection={selectedId ?? undefined}
          onSelect={handleSelect}
          onActivate={handleActivate}
          onToggle={handleToggle}
          onRename={handleRename}
          onMove={handleMove}
          disableMultiSelection={true}
          disableDrop={({ parentNode, dragNodes }) => {
            // The internal root node (drop on empty space) is a valid
            // destination; everything else must be a directory.
            if (parentNode && !parentNode.isRoot && parentNode.data.kind !== 'directory') return true
            return dragNodes.some(dn =>
              parentNode && !parentNode.isRoot
                ? wouldMoveIntoOwnDescendant(dn.id, parentNode.data.id)
                : false
            )
          }}
          openByDefault={false}
          renderRow={Row}
        >
          {(nodeProps) => (
            <TreeNode
              {...nodeProps}
              onRowContextMenu={handleRowContextMenu}
            />
          )}
        </ArboristTree>
      )}

      {createPortal(menu, document.body)}
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
