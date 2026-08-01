import { describe, it, expect } from 'vitest'
import {
  documentsReducer,
  hasDirtyDocuments,
  EditingSession,
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
    it('sets baseline and recalculates dirty', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { path: 'f.md', name: 'f.md', content: 'original', mtimeMs: 1, size: 8 }
      })
      const docId = s1.documents[0].id

      // Content differs from original
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'modified' }
      })
      expect(s2.documents[0].dirty).toBe(true)

      // Capture new baseline (like Crepe normalisation)
      const s3 = documentsReducer(s2, {
        type: 'CAPTURE_BASELINE',
        payload: { id: docId, baseline: 'modified' }
      })
      expect(s3.documents[0].baseline).toBe('modified')
      expect(s3.documents[0].dirty).toBe(false)
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
})
