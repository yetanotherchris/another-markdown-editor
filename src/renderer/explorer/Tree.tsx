import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Tree as ArboristTree, NodeApi, TreeApi } from 'react-arborist'
import type { RowRendererProps, NodeRendererProps } from 'react-arborist'
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react'
import type { TreeNode } from '../state/workspace'
import { findNodeById, parentPathOf } from '../state/workspace'
import { useElementSize } from '../hooks/useElementSize'
import { treeMoveTarget, treeWouldMoveIntoOwnDescendant } from './treeMove'
import { treeRenameLabel } from './treeRename'
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
  /** Spec 002 (US7): "Open" in a file's context menu — visual counterpart of
   *  "View source" (FR-022). */
  onOpen: (path: string) => void
  /** Spec 002: "View source" in a file's context menu (FR-004). */
  onViewSource: (path: string) => void
  /** Spec 015: "Reveal in Explorer/Finder" — open the item's location in the
   *  OS file manager (FR-001/002/003). */
  onReveal: (node: TreeNode) => void
  /** Spec 024 (FR-005): explicitly open a file in a NEW tab (middle-click),
   *  bypassing the replace-clean-tab behaviour. */
  onOpenNewTab: (node: TreeNode) => void
  /** Spec 002 (US004): imperative handle the app uses to open parents and
   *  scroll a node into view (explorer active-file highlight). */
  apiRef?: React.MutableRefObject<TreeApi<TreeNode> | null> | null
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

  // The placeholder flow names a brand-new entry; a real row is being renamed.
  const label = treeRenameLabel(node.data)

  return (
    <input
      ref={inputRef}
      className="tree-node-input"
      defaultValue={node.data.name}
      aria-label={label}
      draggable={false}
      // The row's select/activate handlers fire on every click and dispatch a
      // tree re-render; react-arborist keys rows by node id, so rows survive
      // re-renders, but the input must not hand its mouse interactions to the
      // row: keep them inside the field so caret placement and text selection
      // are not hijacked by row handlers or native drags.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onBlur={(e) => {
        // Focus leaving the field does not cancel the edit (Enter/Escape are
        // the only exits — plan.md Phase 6 decisions). Only reclaim focus when
        // it moved inside the tree or the context menu portal; a dialog, the
        // toolbar, or a tab must not be yanked back.
        if (!node.isEditing) return
        const next = e.relatedTarget as HTMLElement | null
        if (next && (next.closest('.tree-container') || next.closest('.context-menu'))) {
          inputRef.current?.focus()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') cancel()
        e.stopPropagation()
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
    >
      {isDir && (
        <button
          type="button"
          className="tree-node-toggle"
          aria-label={node.isOpen ? 'Collapse' : 'Expand'}
          // The chevron is a mouse/screen-reader affordance, not a keyboard
          // tab stop: react-arborist's container owns the tree's single Tab
          // stop and its Tab handler skips everything inside the tree (its
          // getFocusable filters out contained elements). Keyboard toggling
          // happens on the focused row (Space / ArrowRight / ArrowLeft), so
          // this button is removed from the tab order rather than leaving a
          // phantom stop its FR-013 ring can never reach. Mouse clicks still
          // focus it; :focus-visible does not match mouse-initiated focus.
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            node.toggle()
          }}
        >
          {node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
      <span className="tree-node-icon" aria-hidden="true">
        {isDir
          ? (node.isOpen ? <FolderOpen size={14} /> : <Folder size={14} />)
          : <FileText size={14} />}
      </span>
      {node.isEditing ? (
        <RenameInput node={node} />
      ) : (
        <span className="tree-node-name">{node.data.name}</span>
      )}
    </div>
  )
}

interface TreeRowProps extends RowRendererProps<TreeNode> {
  onKeyboardMenu: (node: TreeNode, x: number, y: number) => void
  onRenameKey: (node: TreeNode) => void
  onDeleteKey: (node: TreeNode) => void
  /** Spec 024: middle-click opens the file in a new tab. */
  onOpenNewTab: (node: TreeNode) => void
}

/**
 * Module-scope row component: a stable function identity keeps react-arborist
 * from remounting every visible row on each Tree re-render (a fresh inline
 * Row would be a new component type per render, remounting all rows' DOM and
 * dropping the inline-rename caret).
 */
function TreeRow({ node, attrs, innerRef, children, onKeyboardMenu, onRenameKey, onDeleteKey, onOpenNewTab }: TreeRowProps) {
  const isDir = node.data.kind === 'directory'

  // Keyboard access to the row operations (WCAG 2.1.1): F2 renames, Delete
  // opens the confirmed-delete flow, Shift+F10/Menu opens the context menu
  // anchored to this row.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'F2') {
      e.preventDefault()
      onRenameKey(node.data)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      onDeleteKey(node.data)
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      onKeyboardMenu(node.data, rect.x + 24, rect.y + rect.height / 2)
    }
  }

  return (
    <div
      ref={innerRef}
      style={attrs.style}
      className={attrs.className}
      tabIndex={attrs.tabIndex}
      role="treeitem"
      aria-level={node.level + 1}
      aria-selected={node.isSelected}
      aria-expanded={isDir ? node.isOpen : undefined}
      onClick={node.handleClick}
      onKeyDown={onKeyDown}
      onAuxClick={(e) => {
        // Spec 024 FR-005: middle-click opens a FILE in a new tab, bypassing
        // the replace-clean-tab behaviour. Directories are not openable.
        if (e.button === 1 && node.data.kind === 'file') {
          e.preventDefault()
          onOpenNewTab(node.data)
        }
      }}
    >
      {children}
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
  onMove,
  onOpen,
  onViewSource,
  onReveal,
  onOpenNewTab,
  apiRef
}: TreeProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const treeRef = useRef<TreeApi<TreeNode> | null>(null)
  if (apiRef) apiRef.current = treeRef.current
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingIdRef = useRef(editingId)
  editingIdRef.current = editingId
  const editingInFlightRef = useRef(false)

  useEffect(() => {
    if (!pendingEditId || editingIdRef.current === pendingEditId) return
    setEditingId(pendingEditId)
  }, [pendingEditId])

  const startEditing = useCallback(async (id: string) => {
    // One edit at a time: a second call (e.g. the deferred create-flow timer
    // racing a context-menu Rename on the same node) must not resolve the
    // first edit as cancelled and trash a placeholder mid-edit.
    if (editingInFlightRef.current) return
    editingInFlightRef.current = true
    try {
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
      if (!node) {
        // The node never became visible (slow expand). For a placeholder this
        // removes it instead of leaving it on disk under its generated name;
        // for any other id the callback is a no-op.
        onEditingCancelled(id)
        setEditingId((current) => (current === id ? null : current))
        return
      }
      const result = await node.edit()
      if (result.cancelled) {
        onEditingCancelled(id)
      }
      setEditingId((current) => (current === id ? null : current))
    } finally {
      editingInFlightRef.current = false
    }
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
      const target = treeMoveTarget(id, targetParentId)
      if (!target) continue
      onMove(id, targetParentId)
    }
  }, [onMove])

  const handleRowContextMenu = useCallback((node: TreeNode, x: number, y: number) => {
    setContextMenu({ x, y, node })
  }, [])

  const handleRenameKey = useCallback((node: TreeNode) => {
    startEditing(node.id)
  }, [startEditing])

  const handleDeleteKey = useCallback((node: TreeNode) => {
    onDeleteRequest(node)
  }, [onDeleteRequest])

  const handleKeyboardMenu = useCallback((node: TreeNode, x: number, y: number) => {
    setContextMenu({ x, y, node })
  }, [])

  // Stable render callbacks: fresh identities on every Tree render would make
  // react-arborist remount every visible row (perf M1) — rows are keyed by
  // node id, but component-type identity changes force full remounts.
  const renderNode = useCallback((nodeProps: NodeRendererProps<TreeNode>) => (
    <TreeNode
      {...nodeProps}
      onRowContextMenu={handleRowContextMenu}
    />
  ), [handleRowContextMenu])

  const renderRow = useCallback((rowProps: RowRendererProps<TreeNode>) => (
    <TreeRow
      {...rowProps}
      onKeyboardMenu={handleKeyboardMenu}
      onRenameKey={handleRenameKey}
      onDeleteKey={handleDeleteKey}
      onOpenNewTab={onOpenNewTab}
    />
  ), [handleKeyboardMenu, handleRenameKey, handleDeleteKey, onOpenNewTab])

  const disableDrop = useCallback(({ parentNode, dragNodes }: {
    parentNode: NodeApi<TreeNode>
    dragNodes: NodeApi<TreeNode>[]
  }) => {
    // The internal root node (drop on empty space) is a valid
    // destination; everything else must be a directory.
    if (!parentNode.isRoot && parentNode.data.kind !== 'directory') return true
    return dragNodes.some(dn =>
      parentNode.isRoot ? false : treeWouldMoveIntoOwnDescendant(dn.id, parentNode.data.id)
    )
  }, [])

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

  // Spec 015 FR-003: the reveal action is named after the OS file manager.
  const revealLabel =
    window.api.platform === 'darwin'
      ? 'Reveal in Finder'
      : window.api.platform === 'win32'
        ? 'Reveal in Explorer'
        : 'Reveal in file manager'

  const menu = contextMenu && (
    <div
      className="context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      role="menu"
      aria-label="Entry actions"
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
          {contextMenu.node.kind === 'file' && (
            <>
              {menuItem('Open', () => onOpen(contextMenu.node!.id))}
              {menuItem('View source', () => onViewSource(contextMenu.node!.id))}
              <div className="context-menu-separator" />
            </>
          )}
          {menuItem(revealLabel, () => onReveal(contextMenu.node!))}
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
          disableDrop={disableDrop}
          openByDefault={false}
          renderRow={renderRow}
          aria-label="Workspace files"
        >
          {renderNode}
        </ArboristTree>
      )}

      {createPortal(menu, document.body)}
    </div>
  )
}
