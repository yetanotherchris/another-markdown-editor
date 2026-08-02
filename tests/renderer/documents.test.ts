import { describe, it, expect } from 'vitest'
import {
  documentsReducer,
  hasDirtyDocuments,
  planClose,
  EditingSession,
  editorMatchesContent,
} from '../../src/renderer/state/documents'

function createSession(): EditingSession {
  return { documents: [], activeId: null, untitledCounter: 0 }
}

describe('documents reducer', () => {
  describe('OPEN_NEW', () => {
    it('creates a new untitled document', () => {
      const state = documentsReducer(createSession(), { type: 'OPEN_NEW' })
      expect(state.documents).toHaveLength(1)
      expect(state.documents[0].title).toMatch(/Untitled/)
      expect(state.documents[0].path).toBeNull()
      expect(state.documents[0].dirty).toBe(false)
      expect(state.activeId).toBe(state.documents[0].id)
    })

    it('appends to existing documents', () => {
      const state = createSession()
      const s1 = documentsReducer(state, { type: 'OPEN_NEW' })
      const s2 = documentsReducer(s1, { type: 'OPEN_NEW' })
      expect(s2.documents).toHaveLength(2)
      expect(s2.activeId).toBe(s2.documents[1].id)
    })
  })

  describe('OPEN_EXISTING', () => {
    it('opens a new document from payload', () => {
      const state = documentsReducer(createSession(), {
        type: 'OPEN_EXISTING',
        payload: { path: 'readme.md', name: 'readme.md', content: '# Hello', mtimeMs: 100, size: 8 }
      })
      expect(state.documents).toHaveLength(1)
      const doc = state.documents[0]
      expect(doc.path).toBe('readme.md')
      expect(doc.title).toBe('readme.md')
      expect(doc.content).toBe('# Hello')
      expect(doc.baseline).toBe('# Hello')
      expect(doc.dirty).toBe(false)
    })

    it('activates existing document with same path', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'a.md', name: 'a.md', content: 'a', mtimeMs: 1, size: 1 }
      })
      const s2 = documentsReducer(s1, {
        type: 'OPEN_EXISTING',
        payload: { path: 'b.md', name: 'b.md', content: 'b', mtimeMs: 2, size: 1 }
      })
      const s3 = documentsReducer(s2, {
        type: 'OPEN_EXISTING',
        payload: { path: 'a.md', name: 'a.md', content: 'a', mtimeMs: 1, size: 1 }
      })
      expect(s3.documents).toHaveLength(2)
      expect(s3.activeId).toBe(s1.activeId)
    })
  })

  describe('UPDATE_CONTENT', () => {
    it('updates content and marks dirty when different from baseline', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'f.md', name: 'f.md', content: 'hello', mtimeMs: 1, size: 5 }
      })
      const docId = s1.documents[0].id
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'hello world' }
      })
      expect(s2.documents[0].content).toBe('hello world')
      expect(s2.documents[0].dirty).toBe(true)
    })

    it('clears dirty when content matches baseline', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'f.md', name: 'f.md', content: 'hello', mtimeMs: 1, size: 5 }
      })
      const docId = s1.documents[0].id
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'hello world' }
      })
      expect(s2.documents[0].dirty).toBe(true)
      const s3 = documentsReducer(s2, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'hello' }
      })
      expect(s3.documents[0].dirty).toBe(false)
    })
  })

  describe('CAPTURE_BASELINE', () => {
    it('does not adopt editor normalization into a raw document', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'f.md', name: 'f.md', content: 'original', mtimeMs: 1, size: 8 }
      })
      const docId = s1.documents[0].id

      // A real edit arrives (e.g. typed in source).
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'modified' }
      })
      expect(s2.documents[0].dirty).toBe(true)

      // Crepe's baseline emission (e.g. its normalized serialization with a
      // trailing newline) must not rewrite the raw content or clear the dirty
      // flag (raw-bytes policy, spec 002). It is stored in the separate
      // editorBaseline field used by the live-dirty check.
      const s3 = documentsReducer(s2, {
        type: 'CAPTURE_BASELINE',
        payload: { id: docId, baseline: 'original\n' }
      })
      expect(s3.documents[0].content).toBe('modified')
      expect(s3.documents[0].baseline).toBe('original')
      expect(s3.documents[0].dirty).toBe(true)
      expect(s3.documents[0].editorBaseline).toBe('original\n')
    })
  })

  describe('SAVE_SUCCESS', () => {
    it('clears dirty and updates path', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'f.md', name: 'f.md', content: 'a', mtimeMs: 1, size: 1 }
      })
      const docId = s1.documents[0].id
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'b' }
      })
      expect(s2.documents[0].dirty).toBe(true)
      const s3 = documentsReducer(s2, {
        type: 'SAVE_SUCCESS',
        payload: { id: docId, path: 'f.md', content: 'b' }
      })
      expect(s3.documents[0].dirty).toBe(false)
      expect(s3.documents[0].baseline).toBe('b')
      expect(s3.documents[0].externalState).toBe('clean')
    })

    it('updates path for first-time save of untitled document', () => {
      const state = createSession()
      const s1 = documentsReducer(state, { type: 'OPEN_NEW' })
      const docId = s1.documents[0].id
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'new content' }
      })
      const s3 = documentsReducer(s2, {
        type: 'SAVE_SUCCESS',
        payload: { id: docId, path: 'docs/newfile.md', content: 'new content' }
      })
      expect(s3.documents[0].path).toBe('docs/newfile.md')
      expect(s3.documents[0].title).toBe('newfile.md')
    })
  })

  describe('SAVE_FAILED', () => {
    it('keeps document dirty', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'f.md', name: 'f.md', content: 'a', mtimeMs: 1, size: 1 }
      })
      const docId = s1.documents[0].id
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'b' }
      })
      const s3 = documentsReducer(s2, {
        type: 'SAVE_FAILED',
        payload: { id: docId }
      })
      expect(s3.documents[0].dirty).toBe(true)
      expect(s3.documents[0].content).toBe('b')
    })
  })

  describe('CLOSE', () => {
    it('removes document and activates neighbor', () => {
      const state = createSession()
      const s1 = documentsReducer(state, { type: 'OPEN_NEW' })
      const s2 = documentsReducer(s1, { type: 'OPEN_NEW' })
      const s3 = documentsReducer(s2, { type: 'OPEN_NEW' })

      const secondId = s3.documents[1].id
      const thirdId = s3.documents[2].id

      // Activate second
      const s4 = documentsReducer(s3, { type: 'ACTIVATE', payload: { id: secondId } })
      const s5 = documentsReducer(s4, { type: 'CLOSE', payload: { id: secondId } })

      expect(s5.documents).toHaveLength(2)
      expect(s5.documents.find(d => d.id === secondId)).toBeUndefined()
      expect(s5.activeId).toBe(thirdId)
    })

    it('sets activeId to null when closing last document', () => {
      const state = createSession()
      const s1 = documentsReducer(state, { type: 'OPEN_NEW' })
      const docId = s1.documents[0].id
      const s2 = documentsReducer(s1, { type: 'CLOSE', payload: { id: docId } })
      expect(s2.documents).toHaveLength(0)
      expect(s2.activeId).toBeNull()
    })
  })

  describe('EXTERNAL_CHANGE', () => {
    it('sets externalState to changedOnDisk on external change', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'f.md', name: 'f.md', content: 'a', mtimeMs: 1, size: 1 }
      })
      const s2 = documentsReducer(s1, {
        type: 'EXTERNAL_CHANGE',
        payload: { path: 'f.md', kind: 'changed' }
      })
      expect(s2.documents[0].externalState).toBe('changedOnDisk')
    })

    it('sets externalState to deletedOnDisk on removal', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'f.md', name: 'f.md', content: 'a', mtimeMs: 1, size: 1 }
      })
      const s2 = documentsReducer(s1, {
        type: 'EXTERNAL_CHANGE',
        payload: { path: 'f.md', kind: 'removed' }
      })
      expect(s2.documents[0].externalState).toBe('deletedOnDisk')
    })
  })

  describe('hasDirtyDocuments', () => {
    it('returns true when any document is dirty', () => {
      const state = createSession()
      const s1 = documentsReducer(state, { type: 'OPEN_NEW' })
      const docId = s1.documents[0].id
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'changed' }
      })
      expect(hasDirtyDocuments(s2)).toBe(true)
    })
  })

  describe('tab lifecycle (Phase 5)', () => {
    function openTwoFiles(): EditingSession {
      const s1 = documentsReducer(createSession(), {
        type: 'OPEN_EXISTING',
        payload: { path: 'a.md', name: 'a.md', content: 'alpha', mtimeMs: 1, size: 5 }
      })
      return documentsReducer(s1, {
        type: 'OPEN_EXISTING',
        payload: { path: 'b.md', name: 'b.md', content: 'beta', mtimeMs: 2, size: 4 }
      })
    }

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

    describe('view mode (spec 002)', () => {
      it('new documents default to formatted view', () => {
        const s1 = documentsReducer(createSession(), { type: 'OPEN_NEW' })
        expect(s1.documents[0].view).toBe('formatted')
      })

      it('opened files default to formatted view', () => {
        const state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 }
        })
        expect(state.documents[0].view).toBe('formatted')
      })

      it('OPEN_EXISTING with view source opens the file in source view', () => {
        const state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1, view: 'source' }
        })
        expect(state.documents[0].view).toBe('source')
      })

      it('OPEN_EXISTING with view source switches an already-open formatted tab without duplicating', () => {
        const s1 = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 }
        })
        const id = s1.documents[0].id
        const s2 = documentsReducer(s1, {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1, view: 'source' }
        })
        expect(s2.documents).toHaveLength(1)
        expect(s2.activeId).toBe(id)
        expect(s2.documents[0].view).toBe('source')
      })

      it('OPEN_EXISTING without view leaves an existing tab untouched (dedupe unchanged)', () => {
        const s1 = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 }
        })
        const id = s1.documents[0].id
        const s2 = documentsReducer(s1, {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 }
        })
        expect(s2.documents).toHaveLength(1)
        expect(s2.documents[0].view).toBe('formatted')
        expect(s2.activeId).toBe(id)
      })

      it('SET_VIEW flips the view and leaves content and dirty untouched', () => {
        let state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 }
        })
        const id = state.documents[0].id
        state = documentsReducer(state, { type: 'UPDATE_CONTENT', payload: { id, content: 'y' } })
        state = documentsReducer(state, { type: 'SET_VIEW', payload: { id, view: 'source' } })
        expect(state.documents[0].view).toBe('source')
        expect(state.documents[0].content).toBe('y')
        expect(state.documents[0].dirty).toBe(true)
      })

      it('SET_VIEW with the same view is a no-op (same state reference, no re-render)', () => {
        const state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 }
        })
        const id = state.documents[0].id
        const after = documentsReducer(state, { type: 'SET_VIEW', payload: { id, view: 'formatted' } })
        expect(after).toBe(state)
        expect(state.documents[0].view).toBe('formatted')
        expect(state.documents).toHaveLength(1)
      })

      it('SET_VIEW does not affect other documents', () => {
        const s1 = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'a.md', name: 'a.md', content: 'a', mtimeMs: 1, size: 1 }
        })
        const s2 = documentsReducer(s1, {
          type: 'OPEN_EXISTING',
          payload: { path: 'b.md', name: 'b.md', content: 'b', mtimeMs: 1, size: 1 }
        })
        const aId = s2.documents[0].id
        const bId = s2.documents[1].id
        expect(aId).not.toBe(bId)
        const s3 = documentsReducer(s2, { type: 'SET_VIEW', payload: { id: aId, view: 'source' } })
        expect(s3.documents.find(d => d.id === aId)?.view).toBe('source')
        expect(s3.documents.find(d => d.id === bId)?.view).toBe('formatted')
      })

      it('REFRESH_FROM_SOURCE replaces content, resets cursor/scroll, bumps version, keeps dirty', () => {
        let state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 }
        })
        const id = state.documents[0].id
        state = documentsReducer(state, { type: 'UPDATE_CONTENT', payload: { id, content: 'raw [ ] text' } })
        state = documentsReducer(state, {
          type: 'CAPTURE_EDITOR_STATE',
          payload: { id, cursorOffset: 42, scrollTop: 137 }
        })
        const before = state.documents[0]
        state = documentsReducer(state, {
          type: 'REFRESH_FROM_SOURCE',
          payload: { id, content: '*edited* raw' }
        })
        const after = state.documents[0]
        expect(after.content).toBe('*edited* raw')
        expect(after.baseline).toBe('x')
        expect(after.dirty).toBe(true)
        expect(after.cursorOffset).toBe(0)
        expect(after.scrollTop).toBe(0)
        expect(after.contentVersion).toBe(before.contentVersion + 1)
      })

      it('REFRESH_FROM_SOURCE keeps baseline so a clean doc stays clean when text unchanged', () => {
        const state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 }
        })
        const id = state.documents[0].id
        const after = documentsReducer(state, {
          type: 'REFRESH_FROM_SOURCE',
          payload: { id, content: 'x' }
        })
        expect(after.documents[0].content).toBe('x')
        expect(after.documents[0].baseline).toBe('x')
        expect(after.documents[0].dirty).toBe(false)
      })
    })

    describe('editorMatchesContent (spec 002, return-to-formatted remount)', () => {
      it('editor output equal to stored content is unchanged', () => {
        expect(editorMatchesContent('# title', '# title')).toBe(true)
      })

      it('the editor\'s single appended trailing newline is unchanged', () => {
        expect(editorMatchesContent('# title\n', '# title')).toBe(true)
      })

      it('CRLF disk content matches a live editor that normalized EOLs', () => {
        expect(editorMatchesContent('# title\n\nbody\n', '# title\r\n\r\nbody')).toBe(true)
      })

      it('an extra blank line at EOF is a real difference (not dropped)', () => {
        expect(editorMatchesContent('# title\n', '# title\n\n')).toBe(false)
      })

      it('a missing editor newline (content has it, editor does not) is not the editor normalization', () => {
        expect(editorMatchesContent('# title', '# title\n')).toBe(false)
      })

      it('content with real edits is different', () => {
        expect(editorMatchesContent('# title\n\nEdited.', '# title\n')).toBe(false)
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
})
