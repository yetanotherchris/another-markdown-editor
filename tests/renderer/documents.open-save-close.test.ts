import { describe, it, expect } from 'vitest'
import { documentsReducer } from '../../src/renderer/state/documents'
import { createSession } from './helpers'

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

    it('numbers untitled documents sequentially 1, 2, 3…', () => {
      const s1 = documentsReducer(createSession(), { type: 'OPEN_NEW' })
      const s2 = documentsReducer(s1, { type: 'OPEN_NEW' })
      const s3 = documentsReducer(s2, { type: 'OPEN_NEW' })
      expect(s1.documents.map(d => d.title)).toEqual(['Untitled-1'])
      expect(s2.documents.map(d => d.title)).toEqual(['Untitled-1', 'Untitled-2'])
      expect(s3.documents.map(d => d.title)).toEqual(['Untitled-1', 'Untitled-2', 'Untitled-3'])
    })

    it('is pure: a double-invoked OPEN_NEW (React StrictMode) burns no numbers', () => {
      // StrictMode calls the reducer twice with the same state and keeps one
      // result. A counter side-effect inside createEmpty would produce
      // Untitled-2, Untitled-4, Untitled-6 — the reducer must be pure.
      const state = createSession()
      const ignored = documentsReducer(state, { type: 'OPEN_NEW' })
      const kept = documentsReducer(state, { type: 'OPEN_NEW' })
      expect(kept.documents).toHaveLength(1)
      expect(kept.documents[0].title).toBe('Untitled-1')
      expect(ignored.documents[0].title).toBe('Untitled-1')
    })
  })

  describe('OPEN_EXISTING', () => {
    it('opens a new document from payload', () => {
      const state = documentsReducer(createSession(), {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'readme.md', name: 'readme.md', content: '# Hello', mtimeMs: 100, size: 8 } }
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
        payload: { value: { path: 'a.md', name: 'a.md', content: 'a', mtimeMs: 1, size: 1 } }
      })
      const s2 = documentsReducer(s1, {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'b.md', name: 'b.md', content: 'b', mtimeMs: 2, size: 1 } }
      })
      const s3 = documentsReducer(s2, {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'a.md', name: 'a.md', content: 'a', mtimeMs: 1, size: 1 } }
      })
      expect(s3.documents).toHaveLength(2)
      expect(s3.activeId).toBe(s1.activeId)
    })
  })

  describe('SAVE_SUCCESS', () => {
    it('clears dirty and updates path', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'f.md', name: 'f.md', content: 'a', mtimeMs: 1, size: 1 } }
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
        payload: { value: { path: 'f.md', name: 'f.md', content: 'a', mtimeMs: 1, size: 1 } }
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
})
