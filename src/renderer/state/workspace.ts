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

export type WorkspaceAction =
  | { type: 'REPLACE'; payload: { name: string | null; root: string | null; entries: DirEntry[] } }
  | { type: 'EXPAND_START'; payload: { id: string } }
  | { type: 'EXPAND_SUCCESS'; payload: { id: string; entries: DirEntry[] } }
  | { type: 'EXPAND_ERROR'; payload: { id: string; error: string } }
  | { type: 'SELECT'; payload: { id: string | null } }
  | { type: 'APPLY_WATCH_EVENT'; payload: WatchEvent }
  | { type: 'INSERT_ENTRY'; payload: { parentPath: string; entry: DirEntry } }
  | { type: 'REMOVE_ENTRY'; payload: { id: string } }
  | { type: 'MOVE_ENTRY'; payload: { fromPath: string; toPath: string; entry: DirEntry } }

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

/** Depth-first search for a node by id (its workspace-relative path). */
export function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.kind === 'directory' && node.children) {
      const found = findNodeById(node.children, id)
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

/** Parent of a workspace-relative path, or `''` for a top-level entry. */
export function parentPathOf(id: string): string {
  const lastSlash = id.lastIndexOf('/')
  if (lastSlash <= 0) return ''
  return id.slice(0, lastSlash)
}

/** True when `path` is at or under `prefix` (folder moves, deletes, reroutes). */
export function isWithinOrEqual(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

function normalizeParent(parentPath: string): string {
  // entry:create reports the root parent as '.', while tree ids use ''.
  return parentPath === '.' ? '' : parentPath
}

function insertEntry(state: WorkspaceState, parentPath: string, entry: DirEntry): WorkspaceState {
  if (parentPath === '') {
    if (findNodeById(state.nodes, entry.path)) return state
    return {
      ...state,
      nodes: insertSorted(state.nodes, entryToNode(entry))
    }
  }
  const found = findParentAndIndex(state.nodes, parentPath)
  if (!found || !found.parent || found.parent.loadState !== 'loaded') return state
  if (findNodeById(found.parent.children ?? [], entry.path)) return state
  return {
    ...state,
    nodes: updateNode(state.nodes, parentPath, n => ({
      ...n,
      children: insertSorted(n.children ?? [], entryToNode(entry))
    }))
  }
}

/** Build a tree node for a watched path (name derived from the path tail). */
function watchedNode(path: string, isDirectory: boolean): TreeNode {
  return {
    id: path,
    name: path.split('/').pop() || path,
    kind: isDirectory ? 'directory' : 'file',
    children: isDirectory ? [] : null,
    loadState: isDirectory ? 'unloaded' : 'loaded'
  }
}

/** Insert a newly-added watched node at the top level, deduped. */
function addTopLevel(state: WorkspaceState, path: string, isDirectory: boolean): WorkspaceState {
  if (findNodeById(state.nodes, path)) return state
  return {
    ...state,
    nodes: insertSorted(state.nodes, watchedNode(path, isDirectory))
  }
}

/** Insert a newly-added watched node under a loaded parent, deduped. */
function addNested(state: WorkspaceState, parent: string, path: string, isDirectory: boolean): WorkspaceState {
  const found = findParentAndIndex(state.nodes, parent)
  if (!found || !found.parent || found.parent.loadState !== 'loaded') return state
  if (findNodeById(found.parent.children ?? [], path)) return state
  return {
    ...state,
    nodes: updateNode(state.nodes, parent, n => ({
      ...n,
      children: insertSorted(n.children ?? [], watchedNode(path, isDirectory))
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
    return parent === ''
      ? addTopLevel(state, path, isDirectory)
      : addNested(state, parent, path, isDirectory)
  }

  // kind === 'changed'
  const existing = findNodeById(state.nodes, path)
  if (!existing) return state
  return {
    ...state,
    nodes: updateNode(state.nodes, path, n => ({ ...n, name: n.name }))
  }
}

// ---- Per-action-case helpers (FR-019): each case body is a named, exported,
// pure function so it is short and independently testable. The reducer switch
// below only dispatches to them; the state-transition logic lives here. ----

export function handleReplace(state: WorkspaceState, payload: { name: string | null; root: string | null; entries: DirEntry[] }): WorkspaceState {
  const { name, root, entries } = payload
  return {
    name,
    root,
    nodes: entries.map(entryToNode).sort(sortNodes),
    selectedId: state.selectedId,
    error: null
  }
}

export function handleExpandStart(state: WorkspaceState, payload: { id: string }): WorkspaceState {
  const { id } = payload
  return {
    ...state,
    nodes: updateNode(state.nodes, id, n => ({ ...n, loadState: 'loading', children: [] }))
  }
}

export function handleExpandSuccess(state: WorkspaceState, payload: { id: string; entries: DirEntry[] }): WorkspaceState {
  const { id, entries } = payload
  return {
    ...state,
    nodes: updateNode(state.nodes, id, n => ({
      ...n,
      loadState: 'loaded',
      children: entries.map(entryToNode).sort(sortNodes)
    }))
  }
}

export function handleExpandError(state: WorkspaceState, payload: { id: string; error: string }): WorkspaceState {
  const { id, error } = payload
  return {
    ...state,
    nodes: updateNode(state.nodes, id, n => ({ ...n, loadState: 'error', children: [] })),
    error
  }
}

export function handleSelect(state: WorkspaceState, payload: { id: string | null }): WorkspaceState {
  const { id } = payload
  return { ...state, selectedId: id }
}

export function handleApplyWatchEvent(state: WorkspaceState, event: WatchEvent): WorkspaceState {
  return applyWatchEvent(state, event)
}

export function handleInsertEntry(state: WorkspaceState, payload: { parentPath: string; entry: DirEntry }): WorkspaceState {
  // Application-originated create (the watcher event for it is suppressed
  // in main, so the renderer applies it directly — T061).
  const { parentPath, entry } = payload
  return insertEntry(state, normalizeParent(parentPath), entry)
}

export function handleRemoveEntry(state: WorkspaceState, payload: { id: string }): WorkspaceState {
  const { id } = payload
  return {
    ...state,
    nodes: removeNode(state.nodes, id),
    selectedId: state.selectedId === id ? null : state.selectedId
  }
}

export function handleMoveEntry(state: WorkspaceState, payload: { fromPath: string; toPath: string; entry: DirEntry }): WorkspaceState {
  // Application-originated rename/move. The relocated node is removed from
  // its old position; it is inserted into the target parent only when that
  // parent is currently loaded (otherwise it appears when the parent is
  // expanded and read from disk). A moved directory resets to unloaded so
  // its path-derived child ids are not left stale.
  const { fromPath, toPath, entry } = payload
  const nodesWithout = removeNode(state.nodes, fromPath)
  const parent = parentPathOf(toPath)
  if (parent === '') {
    const moved = entryToNode(entry)
    const normalized: TreeNode = entry.kind === 'directory'
      ? { ...moved, loadState: 'unloaded', children: [] }
      : moved
    if (findNodeById(nodesWithout, normalized.id)) return { ...state, nodes: nodesWithout }
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
  if (findNodeById(found.parent.children ?? [], normalized.id)) return { ...state, nodes: nodesWithout }
  return {
    ...state,
    nodes: updateNode(nodesWithout, parent, n => ({
      ...n,
      children: insertSorted(n.children ?? [], normalized)
    }))
  }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'REPLACE':
      return handleReplace(state, action.payload)
    case 'EXPAND_START':
      return handleExpandStart(state, action.payload)
    case 'EXPAND_SUCCESS':
      return handleExpandSuccess(state, action.payload)
    case 'EXPAND_ERROR':
      return handleExpandError(state, action.payload)
    case 'SELECT':
      return handleSelect(state, action.payload)
    case 'APPLY_WATCH_EVENT':
      return handleApplyWatchEvent(state, action.payload)
    case 'INSERT_ENTRY':
      return handleInsertEntry(state, action.payload)
    case 'REMOVE_ENTRY':
      return handleRemoveEntry(state, action.payload)
    case 'MOVE_ENTRY':
      return handleMoveEntry(state, action.payload)
    default:
      return state
  }
}
