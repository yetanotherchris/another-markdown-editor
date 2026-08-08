import { describe, it, expect } from 'vitest'
import {
  documentsReducer,
  getDirtyDocuments,
  planQuit,
  EditingSession,
  DocumentState,
} from '../../src/renderer/state/documents'

function createSession(): EditingSession {
  return { documents: [], activeId: null, untitledCounter: 0 }
}

function openFile(path: string, content: string, mtimeMs: number): DocumentState {
  const state = documentsReducer(createSession(), {
    type: 'OPEN_EXISTING',
    payload: { value: { path, name: path, content, mtimeMs, size: content.length } }
  })
  return state.documents[0]
}

describe('quit guard (FR-023)', () => {
  it('planQuit returns quit when nothing is dirty', () => {
    const state = createSession()
    expect(planQuit(state)).toBe('quit')
  })

  it('planQuit returns prompt when any document is dirty', () => {
    const doc = openFile('a.md', 'alpha', 1)
    let state = createSession()
    state = {
      ...state,
      documents: [doc],
      activeId: doc.id
    }
    state = documentsReducer(state, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: 'alpha edited' }
    })
    expect(planQuit(state)).toBe('prompt')
  })

  it('getDirtyDocuments lists every affected document title', () => {
    const a = openFile('a.md', 'alpha', 1)
    const b = openFile('b.md', 'beta', 2)
    let state: EditingSession = {
      ...createSession(),
      documents: [a, b],
      activeId: a.id
    }
    state = documentsReducer(state, {
      type: 'UPDATE_CONTENT',
      payload: { id: a.id, content: 'alpha edited' }
    })
    state = documentsReducer(state, {
      type: 'UPDATE_CONTENT',
      payload: { id: b.id, content: 'beta edited' }
    })
    const dirty = getDirtyDocuments(state)
    expect(dirty.map(d => d.title)).toEqual(['a.md', 'b.md'])
  })
})
