import { describe, it, expect } from 'vitest'
import { documentsReducer, editorMatchesContent } from '../../src/renderer/state/documents'
import { createSession } from './helpers'

describe('documents reducer', () => {
    describe('view mode (spec 002)', () => {
      it('new documents default to formatted view', () => {
        const s1 = documentsReducer(createSession(), { type: 'OPEN_NEW' })
        expect(s1.documents[0].view).toBe('formatted')
      })

      it('opened files default to formatted view', () => {
        const state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 } }
        })
        expect(state.documents[0].view).toBe('formatted')
      })

      it('OPEN_EXISTING with view source opens the file in source view', () => {
        const state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1, view: 'source' } }
        })
        expect(state.documents[0].view).toBe('source')
      })

      it('OPEN_EXISTING with view source switches an already-open formatted tab without duplicating', () => {
        const s1 = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 } }
        })
        const id = s1.documents[0].id
        const s2 = documentsReducer(s1, {
          type: 'OPEN_EXISTING',
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1, view: 'source' } }
        })
        expect(s2.documents).toHaveLength(1)
        expect(s2.activeId).toBe(id)
        expect(s2.documents[0].view).toBe('source')
      })

      it('OPEN_EXISTING without view leaves an existing tab untouched (dedupe unchanged)', () => {
        const s1 = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 } }
        })
        const id = s1.documents[0].id
        const s2 = documentsReducer(s1, {
          type: 'OPEN_EXISTING',
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 } }
        })
        expect(s2.documents).toHaveLength(1)
        expect(s2.documents[0].view).toBe('formatted')
        expect(s2.activeId).toBe(id)
      })

      it('SET_VIEW flips the view and leaves content and dirty untouched', () => {
        let state = documentsReducer(createSession(), {
          type: 'OPEN_EXISTING',
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 } }
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
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 } }
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
          payload: { value: { path: 'a.md', name: 'a.md', content: 'a', mtimeMs: 1, size: 1 } }
        })
        const s2 = documentsReducer(s1, {
          type: 'OPEN_EXISTING',
          payload: { value: { path: 'b.md', name: 'b.md', content: 'b', mtimeMs: 1, size: 1 } }
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
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 } }
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
          payload: { value: { path: 'f.md', name: 'f.md', content: 'x', mtimeMs: 1, size: 1 } }
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
})
