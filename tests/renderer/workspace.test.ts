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

    it('collapses a directory', () => {
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
      state = workspaceReducer(state, {
        type: 'COLLAPSE',
        payload: { id: 'sub' }
      })
      expect(state.nodes[0].children).toHaveLength(0)
      expect(state.nodes[0].loadState).toBe('unloaded')
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
})
