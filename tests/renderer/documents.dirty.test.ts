import { describe, it, expect } from 'vitest'
import { documentsReducer, hasDirtyDocuments } from '../../src/renderer/state/documents'
import { createSession } from './helpers'

describe('documents reducer', () => {
  describe('UPDATE_CONTENT', () => {
    it('updates content and marks dirty when different from baseline', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'f.md', name: 'f.md', content: 'hello', mtimeMs: 1, size: 5 } }
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
        payload: { value: { path: 'f.md', name: 'f.md', content: 'hello', mtimeMs: 1, size: 5 } }
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

    it('a formatted edit undone back to the original is not dirty (no trailing-newline file)', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'f.md', name: 'f.md', content: 'hello', mtimeMs: 1, size: 5 } }
      })
      const docId = s1.documents[0].id
      // Mount captured the editor's serialization: raw bytes + the newline
      // Milkdown always appends (CrepeHost CAPTURE_BASELINE).
      const s2 = documentsReducer(s1, {
        type: 'CAPTURE_BASELINE',
        payload: { id: docId, baseline: 'hello\n' }
      })
      // A real edit marks the document dirty...
      const s3 = documentsReducer(s2, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'hello world\n' }
      })
      expect(s3.documents[0].dirty).toBe(true)
      // ...but Ctrl+Z back to the original content must clear it again.
      const s4 = documentsReducer(s3, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'hello\n' }
      })
      expect(s4.documents[0].content).toBe('hello\n')
      expect(s4.documents[0].dirty).toBe(false)
    })

    it('a formatted edit undone back to the original is not dirty (file with trailing newline)', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'f.md', name: 'f.md', content: 'hello\n', mtimeMs: 1, size: 6 } }
      })
      const docId = s1.documents[0].id
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'hello world\n' }
      })
      expect(s2.documents[0].dirty).toBe(true)
      const s3 = documentsReducer(s2, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'hello\n' }
      })
      expect(s3.documents[0].dirty).toBe(false)
    })

    it('a real formatted edit stays dirty even after a CRLF→LF normalization', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: {
          value: {
            path: 'f.md',
            name: 'f.md',
            content: '# Title\r\n\r\nbody',
            mtimeMs: 1,
            size: 16
          }
        }
      })
      const docId = s1.documents[0].id
      // Mounted editor normalized EOLs; its baseline serialization is LF-only.
      const s2 = documentsReducer(s1, {
        type: 'CAPTURE_BASELINE',
        payload: { id: docId, baseline: '# Title\n\nbody\n' }
      })
      const s3 = documentsReducer(s2, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: '# Title\n\nbody edited\n' }
      })
      expect(s3.documents[0].dirty).toBe(true)
    })

    it('source view uses exact raw-byte comparison: a trailing newline typed in source is a real edit', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: {
          value: {
            path: 'f.md',
            name: 'f.md',
            content: 'hello',
            mtimeMs: 1,
            size: 5,
            view: 'source'
          }
        }
      })
      const docId = s1.documents[0].id
      // Source view reports raw text — a newline the user typed is an edit,
      // not editor normalization.
      const s2 = documentsReducer(s1, {
        type: 'UPDATE_CONTENT',
        payload: { id: docId, content: 'hello\n' }
      })
      expect(s2.documents[0].dirty).toBe(true)
    })
  })

  it('ignores a stale save completion after a newer edit', () => {
    const state = createSession()
    const opened = documentsReducer(state, {
      type: 'OPEN_EXISTING',
      payload: { value: { path: 'f.md', name: 'f.md', content: 'hello', mtimeMs: 1, size: 5 } }
    })
    const id = opened.documents[0].id
    const edited = documentsReducer(opened, {
      type: 'UPDATE_CONTENT',
      payload: { id, content: 'new' }
    })
    const stale = documentsReducer(edited, {
      type: 'SAVE_SUCCESS',
      payload: { id, path: 'f.md', content: 'new', revision: 0 }
    })
    expect(stale).toBe(edited)
    expect(stale.documents[0].dirty).toBe(true)
  })
  describe('CAPTURE_BASELINE', () => {
    it('does not adopt editor normalization into a raw document', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'f.md', name: 'f.md', content: 'original', mtimeMs: 1, size: 8 } }
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
  describe('EXTERNAL_CHANGE', () => {
    it('sets externalState to changedOnDisk on external change', () => {
      const state = createSession()
      const s1 = documentsReducer(state, {
        type: 'OPEN_EXISTING',
        payload: { value: { path: 'f.md', name: 'f.md', content: 'a', mtimeMs: 1, size: 1 } }
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
        payload: { value: { path: 'f.md', name: 'f.md', content: 'a', mtimeMs: 1, size: 1 } }
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
