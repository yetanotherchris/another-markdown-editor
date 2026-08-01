import type { DirEntry, WatchEvent } from '../../shared/ipc-contract'

export type NodeKind = 'file' | 'directory'

export interface TreeNode {
  id: string
  name: string
  kind: NodeKind
  children: TreeNode[] | null
  loadState: 'unloaded' | 'loading' | 'loaded' | 'error'
}

export interface WorkspaceState {
  name: string | null
  root: string | null
  nodes: TreeNode[]
  selectedId: string | null
  error: string | null
}

export const initialWorkspaceState: WorkspaceState = {
  name: null,
  root: null,
  nodes: [],
  selectedId: null,
  error: null
}

export interface WorkspaceAction {
  type:
    | 'REPLACE'
    | 'EXPAND_START'
    | 'EXPAND_SUCCESS'
    | 'EXPAND_ERROR'
    | 'SELECT'
    | 'APPLY_WATCH_EVENT'
    | 'INSERT_ENTRY'
    | 'REMOVE_ENTRY'
    | 'MOVE_ENTRY'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any
}

export function entryToNode(entry: DirEntry): TreeNode {
  return {
    id: entry.path,
    name: entry.name,
    kind: entry.kind,
    children: entry.kind === 'directory' ? [] : null,
    loadState: entry.kind === 'directory' ? 'unloaded' : 'loaded'
  }
}

function sortNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function insertSorted(nodes: TreeNode[], node: TreeNode): TreeNode[] {
  const copy = [...nodes, node]
  copy.sort(sortNodes)
  return copy
}

function findParentAndIndex(nodes: TreeNode[], parentPath: string): {
  parent: TreeNode | null
  siblings: TreeNode[]
  index: number
} | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === parentPath) {
      return { parent: nodes[i], siblings: nodes[i].children ?? [], index: i }
    }
    if (nodes[i].kind === 'directory' && nodes[i].children) {
      const found = findParentAndIndex(nodes[i].children!, parentPath)
      if (found) return found
    }
  }
  return null
}

function removeNode(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter(n => n.id !== id)
    .map(n => {
      if (n.kind === 'directory' && n.children) {
        return { ...n, children: removeNode(n.children, id) }
      }
      return n
    })
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.kind === 'directory' && node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

function updateNode(nodes: TreeNode[], id: string, updater: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map(n => {
    if (n.id === id) return updater(n)
    if (n.kind === 'directory' && n.children) {
      return { ...n, children: updateNode(n.children, id, updater) }
    }
    return n
  })
}

function parentPathOf(id: string): string | null {
  const lastSlash = id.lastIndexOf('/')
  if (lastSlash <= 0) return null
  return id.slice(0, lastSlash)
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'REPLACE': {
      const { name, root, entries } = action.payload as {
        name: string | null
        root: string | null
        entries: DirEntry[]
      }
      return {
        name,
        root,
        nodes: entries.map(entryToNode).sort(sortNodes),
        selectedId: state.selectedId,
        error: null
      }
    }

    case 'EXPAND_START': {
      const { id } = action.payload as { id: string }
      return {
        ...state,
        nodes: updateNode(state.nodes, id, n => ({ ...n, loadState: 'loading', children: [] }))
      }
    }

    case 'EXPAND_SUCCESS': {
      const { id, entries } = action.payload as { id: string; entries: DirEntry[] }
      return {
        ...state,
        nodes: updateNode(state.nodes, id, n => ({
          ...n,
          loadState: 'loaded',
          children: entries.map(entryToNode).sort(sortNodes)
        }))
      }
    }

    case 'EXPAND_ERROR': {
      const { id, error } = action.payload as { id: string; error: string }
      return {
        ...state,
        nodes: updateNode(state.nodes, id, n => ({ ...n, loadState: 'error', children: [] })),
        error
      }
    }

    case 'SELECT': {
      const { id } = action.payload as { id: string | null }
      return { ...state, selectedId: id }
    }

    case 'APPLY_WATCH_EVENT': {
      const event = action.payload as WatchEvent
      return applyWatchEvent(state, event)
    }

    case 'INSERT_ENTRY': {
      // Application-originated create (the watcher event for it is suppressed
      // in main, so the renderer applies it directly — T061).
      const { parentPath, entry } = action.payload as { parentPath: string; entry: DirEntry }
      return insertEntry(state, normalizeParent(parentPath), entry)
    }

    case 'REMOVE_ENTRY': {
      const { id } = action.payload as { id: string }
      return {
        ...state,
        nodes: removeNode(state.nodes, id),
        selectedId: state.selectedId === id ? null : state.selectedId
      }
    }

    case 'MOVE_ENTRY': {
      // Application-originated rename/move. The relocated node is removed from
      // its old position; it is inserted into the target parent only when that
      // parent is currently loaded (otherwise it appears when the parent is
      // expanded and read from disk). A moved directory resets to unloaded so
      // its path-derived child ids are not left stale.
      const { fromPath, toPath, entry } = action.payload as {
        fromPath: string
        toPath: string
        entry: DirEntry
      }
      const nodesWithout = removeNode(state.nodes, fromPath)
      const parent = parentPathOf(toPath)
      if (parent === null) {
        const moved = entryToNode(entry)
        const normalized: TreeNode = entry.kind === 'directory'
          ? { ...moved, loadState: 'unloaded', children: [] }
          : moved
        if (findNode(nodesWithout, normalized.id)) return { ...state, nodes: nodesWithout }
        return {
          ...state,
          nodes: insertSorted(nodesWithout, normalized)
        }
      }
      const found = findParentAndIndex(nodesWithout, parent)
      if (!found || !found.parent || found.parent.loadState !== 'loaded') {
        return { ...state, nodes: nodesWithout }
      }
      const moved = entryToNode(entry)
      const normalized: TreeNode = entry.kind === 'directory'
        ? { ...moved, loadState: 'unloaded', children: [] }
        : moved
      if (findNode(found.parent.children ?? [], normalized.id)) return { ...state, nodes: nodesWithout }
      return {
        ...state,
        nodes: updateNode(nodesWithout, parent, n => ({
          ...n,
          children: insertSorted(n.children ?? [], normalized)
        }))
      }
    }

    default:
      return state
  }
}

function normalizeParent(parentPath: string): string {
  // entry:create reports the root parent as '.', while tree ids use ''.
  return parentPath === '.' ? '' : parentPath
}

function insertEntry(state: WorkspaceState, parentPath: string, entry: DirEntry): WorkspaceState {
  if (parentPath === '') {
    if (findNode(state.nodes, entry.path)) return state
    return {
      ...state,
      nodes: insertSorted(state.nodes, entryToNode(entry))
    }
  }
  const found = findParentAndIndex(state.nodes, parentPath)
  if (!found || !found.parent || found.parent.loadState !== 'loaded') return state
  if (findNode(found.parent.children ?? [], entry.path)) return state
  return {
    ...state,
    nodes: updateNode(state.nodes, parentPath, n => ({
      ...n,
      children: insertSorted(n.children ?? [], entryToNode(entry))
    }))
  }
}

function applyWatchEvent(state: WorkspaceState, event: WatchEvent): WorkspaceState {
  const { path, kind, isDirectory } = event

  if (kind === 'removed') {
    return {
      ...state,
      nodes: removeNode(state.nodes, path),
      selectedId: state.selectedId === path ? null : state.selectedId
    }
  }

  if (kind === 'added') {
    const parent = parentPathOf(path)
    if (parent === null) {
      // Top-level add
      if (findNode(state.nodes, path)) return state
      const newNode: TreeNode = {
        id: path,
        name: path.split('/').pop() || path,
        kind: isDirectory ? 'directory' : 'file',
        children: isDirectory ? [] : null,
        loadState: isDirectory ? 'unloaded' : 'loaded'
      }
      return {
        ...state,
        nodes: insertSorted(state.nodes, newNode)
      }
    }

    const found = findParentAndIndex(state.nodes, parent)
    if (!found || !found.parent || found.parent.loadState !== 'loaded') return state

    if (findNode(found.parent.children ?? [], path)) return state

    const newNode: TreeNode = {
      id: path,
      name: path.split('/').pop() || path,
      kind: isDirectory ? 'directory' : 'file',
      children: isDirectory ? [] : null,
      loadState: isDirectory ? 'unloaded' : 'loaded'
    }

    return {
      ...state,
      nodes: updateNode(state.nodes, parent, n => ({
        ...n,
        children: insertSorted(n.children ?? [], newNode)
      }))
    }
  }

  // kind === 'changed'
  const existing = findNode(state.nodes, path)
  if (!existing) return state
  return {
    ...state,
    nodes: updateNode(state.nodes, path, n => ({ ...n, name: n.name }))
  }
}

export function isDirectoryNode(node: TreeNode): boolean {
  return node.kind === 'directory'
}

export function isLoaded(node: TreeNode): boolean {
  return node.loadState === 'loaded'
}
