import { describe, it, expect } from 'vitest'
import { documentsReducer, planClose } from '../../src/renderer/state/documents'
import { createSession, openTwoFiles } from './helpers'

describe('documents reducer', () => {
  describe('tab lifecycle (Phase 5)', () => {
    it('open existing activates the already-open tab without duplicating', () => {
      const s1 = openTwoFiles()
      const s2 = documentsReducer(s1, {
        type: 'OPEN_EXISTING',
        payload: { path: 'a.md', name: 'a.md', content: 'alpha', mtimeMs: 1, size: 5 }
      })
      expect(s2.documents).toHaveLength(2)
      expect(s2.activeId).toBe(s1.documents[0].id)
      expect(s2.documents[0].editorState).toBe('live')
    })

    it('open existing reactivates an evicted document (no dead editor in the active tab)', () => {
      let state = openTwoFiles()
      const doc = state.documents[0]
      state = documentsReducer(state, { type: 'EVICT', payload: { id: doc.id } })
      expect(state.documents[0].editorState).toBe('evicted')

      state = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'a.md', name: 'a.md', content: 'alpha', mtimeMs: 1, size: 5 }
      })
      expect(state.documents).toHaveLength(2)
      expect(state.activeId).toBe(doc.id)
      expect(state.documents[0].editorState).toBe('live')
    })

    it('switching tabs preserves content and dirty state (undo/scroll via mocked editor state)', () => {
      let state = openTwoFiles()
      const a = state.documents[0]
      const b = state.documents[1]

      // Edit b, then switch back to a, capturing the editor state of a
      // (as the real CrepeHost does when it becomes inactive).
      state = documentsReducer(state, {
        type: 'UPDATE_CONTENT',
        payload: { id: b.id, content: 'beta edited' }
      })
      state = documentsReducer(state, { type: 'ACTIVATE', payload: { id: a.id } })
      state = documentsReducer(state, {
        type: 'CAPTURE_EDITOR_STATE',
        payload: { id: a.id, cursorOffset: 42, scrollTop: 137 }
      })

      const aAfter = state.documents.find(d => d.id === a.id)!
      expect(aAfter.cursorOffset).toBe(42)
      expect(aAfter.scrollTop).toBe(137)
      expect(aAfter.editorState).toBe('live')
      expect(aAfter.content).toBe('alpha')

      // The dirty tab keeps its state while hidden.
      const bAfter = state.documents.find(d => d.id === b.id)!
      expect(bAfter.dirty).toBe(true)
      expect(bAfter.content).toBe('beta edited')

      // Switching back to b keeps its content and dirty flag; the captured
      // cursor/scroll values survive in the store, ready for the CrepeHost
      // to restore when the editor becomes active again (REACTIVATE test).
      state = documentsReducer(state, { type: 'ACTIVATE', payload: { id: b.id } })
      expect(state.activeId).toBe(b.id)
      expect(state.documents.find(d => d.id === b.id)!.dirty).toBe(true)
      expect(aAfter.cursorOffset).toBe(42)
      expect(aAfter.scrollTop).toBe(137)
    })

    it('EVICT marks a clean document evicted without losing content', () => {
      const s1 = openTwoFiles()
      const doc = s1.documents[0]
      const s2 = documentsReducer(s1, { type: 'EVICT', payload: { id: doc.id } })
      const evicted = s2.documents.find(d => d.id === doc.id)!
      expect(evicted.editorState).toBe('evicted')
      expect(evicted.content).toBe('alpha')
      expect(evicted.baseline).toBe('alpha')
      expect(evicted.dirty).toBe(false)
    })

    it('REACTIVATE restores the instance and the retained cursor and scroll', () => {
      const s1 = openTwoFiles()
      const doc = s1.documents[0]
      const s2 = documentsReducer(s1, { type: 'EVICT', payload: { id: doc.id } })
      const s3 = documentsReducer(s2, {
        type: 'REACTIVATE',
        payload: { id: doc.id, cursorOffset: 42, scrollTop: 137 }
      })
      const restored = s3.documents.find(d => d.id === doc.id)!
      expect(restored.editorState).toBe('live')
      expect(restored.cursorOffset).toBe(42)
      expect(restored.scrollTop).toBe(137)
    })

    it('RELOAD replaces content, clears dirty and external state, bumps content version', () => {
      let state = openTwoFiles()
      const doc = state.documents[0]
      state = documentsReducer(state, {
        type: 'EXTERNAL_CHANGE',
        payload: { path: 'a.md', kind: 'changed' }
      })
      const before = state.documents.find(d => d.id === doc.id)!
      expect(before.externalState).toBe('changedOnDisk')

      state = documentsReducer(state, {
        type: 'RELOAD',
        payload: { id: doc.id, content: 'new content from disk' }
      })
      const after = state.documents.find(d => d.id === doc.id)!
      expect(after.content).toBe('new content from disk')
      expect(after.baseline).toBe('new content from disk')
      expect(after.dirty).toBe(false)
      expect(after.externalState).toBe('clean')
      expect(after.contentVersion).toBe(before.contentVersion + 1)
    })

    it('CLOSE removes a clean tab without prompting plan-wise', () => {
      const s1 = openTwoFiles()
      const doc = s1.documents[0]
      expect(planClose(s1, doc.id)).toBe('close')
      const s2 = documentsReducer(s1, { type: 'CLOSE', payload: { id: doc.id } })
      expect(s2.documents).toHaveLength(1)
      expect(s2.documents.find(d => d.id === doc.id)).toBeUndefined()
    })

    it('planClose asks for confirmation for a dirty document', () => {
      let state = openTwoFiles()
      const doc = state.documents[0]
      state = documentsReducer(state, {
        type: 'UPDATE_CONTENT',
        payload: { id: doc.id, content: 'alpha edited' }
      })
      expect(planClose(state, doc.id)).toBe('prompt')
      expect(planClose(state, 'unknown-id')).toBe('close')
    })
  })

  describe('REROUTE_PATHS (FR-028)', () => {
    it('updates the path and title of a renamed open document, keeping its id', () => {
      const s1 = openTwoFiles()
      const doc = s1.documents[0]
      expect(doc.id).toBe('a.md')
      const s2 = documentsReducer(s1, {
        type: 'REROUTE_PATHS',
        payload: { fromPath: 'a.md', toPath: 'renamed.md' }
      })
      const moved = s2.documents.find(d => d.id === doc.id)!
      expect(moved).toBeDefined()
      expect(moved.path).toBe('renamed.md')
      expect(moved.title).toBe('renamed.md')
      expect(moved.content).toBe(doc.content)
      expect(moved.baseline).toBe(doc.baseline)
      expect(moved.dirty).toBe(false)
    })

    it('reroutes every open document inside a moved folder', () => {
      let state = createSession()
      for (const [path, name] of [['notes/a.md', 'a.md'], ['notes/sub/b.md', 'b.md'], ['other/c.md', 'c.md']] as const) {
        state = documentsReducer(state, {
          type: 'OPEN_EXISTING',
          payload: { path, name, content: name, mtimeMs: 1, size: 1 }
        })
      }
      state = documentsReducer(state, {
        type: 'REROUTE_PATHS',
        payload: { fromPath: 'notes', toPath: 'archive/notes' }
      })
      const paths = state.documents.map(d => d.path)
      expect(paths).toContain('archive/notes/a.md')
      expect(paths).toContain('archive/notes/sub/b.md')
      expect(paths).toContain('other/c.md')
    })

    it('rerouting a file to a path that is already open leaves both documents distinct', () => {
      const s1 = openTwoFiles()
      const s2 = documentsReducer(s1, {
        type: 'REROUTE_PATHS',
        payload: { fromPath: 'a.md', toPath: 'b.md' }
      })
      expect(s2.documents).toHaveLength(2)
      expect(s2.documents.find(d => d.path === 'b.md')).toBeDefined()
      // The rerouted document keeps its identity (id), so tabs never merge.
      expect(s2.documents.find(d => d.id === 'a.md')?.path).toBe('b.md')
    })

    it('ignores documents without a path and non-matching paths', () => {
      let state = documentsReducer(createSession(), { type: 'OPEN_NEW' })
      state = documentsReducer(state, {
        type: 'REROUTE_PATHS',
        payload: { fromPath: 'a.md', toPath: 'b.md' }
      })
      expect(state.documents[0].path).toBeNull()
      expect(state.documents[0].title).toMatch(/Untitled/)
    })

    it('keeps a dirty document dirty across a reroute', () => {
      const s1 = openTwoFiles()
      let s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: 'a.md', content: 'edited' }
      })
      s2 = documentsReducer(s2, {
        type: 'REROUTE_PATHS',
        payload: { fromPath: 'a.md', toPath: 'renamed.md' }
      })
      const moved = s2.documents.find(d => d.id === 'a.md')!
      expect(moved.path).toBe('renamed.md')
      expect(moved.content).toBe('edited')
      expect(moved.dirty).toBe(true)
    })
  })
})
