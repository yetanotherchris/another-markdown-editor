import { describe, it, expect } from 'vitest'
import {
  workspaceReducer,
  initialWorkspaceState,
  TreeNode,
  WorkspaceState
} from '../../src/renderer/state/workspace'

function makeState(patch: Partial<WorkspaceState> = {}): WorkspaceState {
  return { ...initialWorkspaceState, ...patch }
}

function makeNode(patch: Partial<TreeNode> & { id: string; name: string; kind: TreeNode['kind'] }): TreeNode {
  return {
    children: patch.children ?? (patch.kind === 'directory' ? [] : null),
    loadState: patch.loadState ?? (patch.kind === 'directory' ? 'unloaded' : 'loaded'),
    ...patch
  }
}

describe('workspace reducer', () => {
  describe('REPLACE', () => {
    it('loads top-level entries', () => {
      const state = workspaceReducer(makeState(), {
        type: 'REPLACE',
        payload: {
          name: 'notes',
          root: '/notes',
          entries: [
            { path: 'a.md', name: 'a.md', kind: 'file' as const },
            { path: 'sub', name: 'sub', kind: 'directory' as const }
          ]
        }
      })
      expect(state.name).toBe('notes')
      expect(state.root).toBe('/notes')
      expect(state.nodes).toHaveLength(2)
      expect(state.nodes[0].kind).toBe('directory')
      expect(state.nodes[1].kind).toBe('file')
    })

    it('clears previous workspace', () => {
      const state = workspaceReducer(makeState({ nodes: [makeNode({ id: 'old', name: 'old', kind: 'file' })] }), {
        type: 'REPLACE',
        payload: { name: 'new', root: '/new', entries: [] }
      })
      expect(state.nodes).toHaveLength(0)
    })
  })

  describe('EXPAND / COLLAPSE', () => {
    it('expands a directory lazily', () => {
      let state = workspaceReducer(makeState(), {
        type: 'REPLACE',
        payload: {
          name: 'notes',
          root: '/notes',
          entries: [{ path: 'sub', name: 'sub', kind: 'directory' as const }]
        }
      })

      state = workspaceReducer(state, {
        type: 'EXPAND_START',
        payload: { id: 'sub' }
      })
      expect(state.nodes[0].loadState).toBe('loading')

      state = workspaceReducer(state, {
        type: 'EXPAND_SUCCESS',
        payload: {
          id: 'sub',
          entries: [{ path: 'sub/b.md', name: 'b.md', kind: 'file' as const }]
        }
      })
      expect(state.nodes[0].loadState).toBe('loaded')
      expect(state.nodes[0].children).toHaveLength(1)
      expect(state.nodes[0].children![0].id).toBe('sub/b.md')
    })

    it('collapsing keeps loaded children in memory (arborist owns visibility)', () => {
      // Collapse is arborist's own visibility state; the reducer never wipes
      // loaded children, so a re-open costs no refetch and an inline edit in
      // progress (which triggers an arborist open via scrollTo) cannot erase
      // the node being edited.
      let state = workspaceReducer(makeState(), {
        type: 'REPLACE',
        payload: {
          name: 'notes',
          root: '/notes',
          entries: [{ path: 'sub', name: 'sub', kind: 'directory' as const }]
        }
      })
      state = workspaceReducer(state, {
        type: 'EXPAND_SUCCESS',
        payload: { id: 'sub', entries: [{ path: 'sub/b.md', name: 'b.md', kind: 'file' as const }] }
      })
      expect(state.nodes[0].children).toHaveLength(1)
      expect(state.nodes[0].loadState).toBe('loaded')
    })

    it('reports load errors', () => {
      let state = workspaceReducer(makeState(), {
        type: 'REPLACE',
        payload: {
          name: 'notes',
          root: '/notes',
          entries: [{ path: 'sub', name: 'sub', kind: 'directory' as const }]
        }
      })
      state = workspaceReducer(state, {
        type: 'EXPAND_ERROR',
        payload: { id: 'sub', error: 'Failed to read' }
      })
      expect(state.nodes[0].loadState).toBe('error')
      expect(state.error).toBe('Failed to read')
    })
  })

  describe('SELECT', () => {
    it('sets selected id', () => {
      const state = workspaceReducer(makeState(), {
        type: 'SELECT',
        payload: { id: 'a.md' }
      })
      expect(state.selectedId).toBe('a.md')
    })
  })

  describe('APPLY_WATCH_EVENT', () => {
    it('adds top-level file', () => {
      const state = workspaceReducer(makeState({ nodes: [] }), {
        type: 'APPLY_WATCH_EVENT',
        payload: { path: 'new.md', kind: 'added', isDirectory: false }
      })
      expect(state.nodes).toHaveLength(1)
      expect(state.nodes[0].id).toBe('new.md')
    })

    it('adds nested file when parent is loaded', () => {
      let state = workspaceReducer(makeState(), {
        type: 'REPLACE',
        payload: {
          name: 'notes',
          root: '/notes',
          entries: [{ path: 'sub', name: 'sub', kind: 'directory' as const }]
        }
      })
      state = workspaceReducer(state, {
        type: 'EXPAND_SUCCESS',
        payload: { id: 'sub', entries: [] }
      })
      state = workspaceReducer(state, {
        type: 'APPLY_WATCH_EVENT',
        payload: { path: 'sub/new.md', kind: 'added', isDirectory: false }
      })
      expect(state.nodes[0].children).toHaveLength(1)
      expect(state.nodes[0].children![0].id).toBe('sub/new.md')
    })

    it('removes file', () => {
      const state = workspaceReducer(makeState({
        nodes: [makeNode({ id: 'a.md', name: 'a.md', kind: 'file' })],
        selectedId: 'a.md'
      }), {
        type: 'APPLY_WATCH_EVENT',
        payload: { path: 'a.md', kind: 'removed', isDirectory: false }
      })
      expect(state.nodes).toHaveLength(0)
      expect(state.selectedId).toBeNull()
    })

    it('ignores add to unloaded directory', () => {
      const state = workspaceReducer(makeState({
        nodes: [makeNode({ id: 'sub', name: 'sub', kind: 'directory' })]
      }), {
        type: 'APPLY_WATCH_EVENT',
        payload: { path: 'sub/new.md', kind: 'added', isDirectory: false }
      })
      expect(state.nodes[0].children).toHaveLength(0)
    })
  })

  describe('INSERT_ENTRY', () => {
    it('inserts a top-level entry (root parent)', () => {
      const state = workspaceReducer(makeState({ nodes: [] }), {
        type: 'INSERT_ENTRY',
        payload: {
          parentPath: '',
          entry: { path: 'fresh.md', name: 'fresh.md', kind: 'file' as const }
        }
      })
      expect(state.nodes).toHaveLength(1)
      expect(state.nodes[0].id).toBe('fresh.md')
    })

    it('inserts into a loaded directory, sorted', () => {
      let state = workspaceReducer(makeState(), {
        type: 'REPLACE',
        payload: {
          name: 'notes',
          root: '/notes',
          entries: [{ path: 'sub', name: 'sub', kind: 'directory' as const }]
        }
      })
      state = workspaceReducer(state, {
        type: 'EXPAND_SUCCESS',
        payload: { id: 'sub', entries: [{ path: 'sub/a.md', name: 'a.md', kind: 'file' as const }] }
      })
      state = workspaceReducer(state, {
        type: 'INSERT_ENTRY',
        payload: {
          parentPath: 'sub',
          entry: { path: 'sub/z.md', name: 'z.md', kind: 'file' as const }
        }
      })
      expect(state.nodes[0].children).toHaveLength(2)
      expect(state.nodes[0].children![0].id).toBe('sub/a.md')
      expect(state.nodes[0].children![1].id).toBe('sub/z.md')
    })

    it('does not insert into an unloaded directory', () => {
      const state = workspaceReducer(makeState({
        nodes: [makeNode({ id: 'sub', name: 'sub', kind: 'directory' })]
      }), {
        type: 'INSERT_ENTRY',
        payload: {
          parentPath: 'sub',
          entry: { path: 'sub/x.md', name: 'x.md', kind: 'file' as const }
        }
      })
      expect(state.nodes[0].children).toHaveLength(0)
    })

    it('does not duplicate an existing entry', () => {
      const state = workspaceReducer(makeState({
        nodes: [makeNode({ id: 'a.md', name: 'a.md', kind: 'file' })]
      }), {
        type: 'INSERT_ENTRY',
        payload: {
          parentPath: '',
          entry: { path: 'a.md', name: 'a.md', kind: 'file' as const }
        }
      })
      expect(state.nodes).toHaveLength(1)
    })
  })

  describe('REMOVE_ENTRY', () => {
    it('removes a node and clears selection', () => {
      const state = workspaceReducer(makeState({
        nodes: [makeNode({ id: 'a.md', name: 'a.md', kind: 'file' })],
        selectedId: 'a.md'
      }), {
        type: 'REMOVE_ENTRY',
        payload: { id: 'a.md' }
      })
      expect(state.nodes).toHaveLength(0)
      expect(state.selectedId).toBeNull()
    })

    it('removes a node deep in the tree', () => {
      const state = workspaceReducer(makeState({
        nodes: [makeNode({
          id: 'sub',
          name: 'sub',
          kind: 'directory',
          loadState: 'loaded',
          children: [makeNode({ id: 'sub/a.md', name: 'a.md', kind: 'file' })]
        })]
      }), {
        type: 'REMOVE_ENTRY',
        payload: { id: 'sub/a.md' }
      })
      expect(state.nodes[0].children).toHaveLength(0)
    })

    it('keeps other selection when a different node is removed', () => {
      const state = workspaceReducer(makeState({
        nodes: [makeNode({ id: 'a.md', name: 'a.md', kind: 'file' })],
        selectedId: 'a.md'
      }), {
        type: 'REMOVE_ENTRY',
        payload: { id: 'missing.md' }
      })
      expect(state.selectedId).toBe('a.md')
    })
  })

  describe('MOVE_ENTRY', () => {
    it('renames a file at the top level', () => {
      const state = workspaceReducer(makeState({
        nodes: [makeNode({ id: 'old.md', name: 'old.md', kind: 'file' })]
      }), {
        type: 'MOVE_ENTRY',
        payload: {
          fromPath: 'old.md',
          toPath: 'new.md',
          entry: { path: 'new.md', name: 'new.md', kind: 'file' as const }
        }
      })
      expect(state.nodes).toHaveLength(1)
      expect(state.nodes[0].id).toBe('new.md')
    })

    it('moves a file between loaded directories', () => {
      let state = workspaceReducer(makeState(), {
        type: 'REPLACE',
        payload: {
          name: 'notes',
          root: '/notes',
          entries: [
            { path: 'src', name: 'src', kind: 'directory' as const },
            { path: 'dst', name: 'dst', kind: 'directory' as const }
          ]
        }
      })
      state = workspaceReducer(state, { type: 'EXPAND_SUCCESS', payload: { id: 'src', entries: [{ path: 'src/a.md', name: 'a.md', kind: 'file' as const }] } })
      state = workspaceReducer(state, { type: 'EXPAND_SUCCESS', payload: { id: 'dst', entries: [] } })

      state = workspaceReducer(state, {
        type: 'MOVE_ENTRY',
        payload: {
          fromPath: 'src/a.md',
          toPath: 'dst/a.md',
          entry: { path: 'dst/a.md', name: 'a.md', kind: 'file' as const }
        }
      })
      expect(state.nodes.find(n => n.id === 'src')!.children).toHaveLength(0)
      expect(state.nodes.find(n => n.id === 'dst')!.children).toHaveLength(1)
      expect(state.nodes.find(n => n.id === 'dst')!.children![0].id).toBe('dst/a.md')
    })

    it('moves a directory but resets it to unloaded so child ids are not stale', () => {
      let state = workspaceReducer(makeState(), {
        type: 'REPLACE',
        payload: {
          name: 'notes',
          root: '/notes',
          entries: [
            { path: 'a', name: 'a', kind: 'directory' as const },
            { path: 'b', name: 'b', kind: 'directory' as const }
          ]
        }
      })
      state = workspaceReducer(state, { type: 'EXPAND_SUCCESS', payload: { id: 'a', entries: [{ path: 'a/x.md', name: 'x.md', kind: 'file' as const }] } })
      state = workspaceReducer(state, { type: 'EXPAND_SUCCESS', payload: { id: 'b', entries: [] } })

      state = workspaceReducer(state, {
        type: 'MOVE_ENTRY',
        payload: {
          fromPath: 'a',
          toPath: 'b/a',
          entry: { path: 'b/a', name: 'a', kind: 'directory' as const }
        }
      })
      expect(state.nodes.find(n => n.id === 'a')).toBeUndefined()
      const moved = state.nodes.find(n => n.id === 'b')!.children![0]
      expect(moved.id).toBe('b/a')
      expect(moved.loadState).toBe('unloaded')
      expect(moved.children).toHaveLength(0)
    })

    it('only removes from the old position when the target parent is unloaded', () => {
      const state = workspaceReducer(makeState({
        nodes: [
          makeNode({ id: 'a.md', name: 'a.md', kind: 'file' }),
          makeNode({ id: 'sub', name: 'sub', kind: 'directory' })
        ]
      }), {
        type: 'MOVE_ENTRY',
        payload: {
          fromPath: 'a.md',
          toPath: 'sub/a.md',
          entry: { path: 'sub/a.md', name: 'a.md', kind: 'file' as const }
        }
      })
      expect(state.nodes.find(n => n.id === 'a.md')).toBeUndefined()
      expect(state.nodes.find(n => n.id === 'sub')!.children).toHaveLength(0)
    })
  })
})
