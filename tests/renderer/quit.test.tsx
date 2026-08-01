import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  documentsReducer,
  getDirtyDocuments,
  planQuit,
  EditingSession,
  DocumentState,
} from '../../src/renderer/state/documents'
import ConfirmDialog from '../../src/renderer/dialogs/ConfirmDialog'

function createSession(): EditingSession {
  return { documents: [], activeId: null, untitledCounter: 0 }
}

function openFile(path: string, content: string, mtimeMs: number): DocumentState {
  const state = documentsReducer(createSession(), {
    type: 'OPEN_EXISTING',
    payload: { path, name: path, content, mtimeMs, size: content.length }
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

describe('ConfirmDialog (close/quit prompt UI)', () => {
  let container: HTMLElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
  })

  it('renders title, body, and all buttons', async () => {
    await act(async () => {
      root.render(
        <ConfirmDialog
          title="Unsaved changes"
          onCancel={() => {}}
          buttons={[
            { label: 'Discard', kind: 'danger', onClick: () => {} },
            { label: 'Cancel', onClick: () => {} },
            { label: 'Save', kind: 'primary', onClick: () => {} }
          ]}
        >
          <p>a.md has unsaved changes.</p>
        </ConfirmDialog>
      )
    })
    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    expect(container.textContent).toContain('Unsaved changes')
    expect(container.textContent).toContain('a.md has unsaved changes.')
    const buttons = [...container.querySelectorAll('button')].map(b => b.textContent)
    expect(buttons).toEqual(['Discard', 'Cancel', 'Save'])
  })

  it('shows the error message when a save fails', async () => {
    await act(async () => {
      root.render(
        <ConfirmDialog
          title="Unsaved changes"
          error="Could not save a.md. The document stays open."
          onCancel={() => {}}
          buttons={[{ label: 'OK', onClick: () => {} }]}
        >
          <p>a.md has unsaved changes.</p>
        </ConfirmDialog>
      )
    })
    expect(container.querySelector('.dialog-error')?.textContent).toContain(
      'Could not save a.md'
    )
  })
})
