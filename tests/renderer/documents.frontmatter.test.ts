import { describe, it, expect } from 'vitest'
import { documentsReducer, openFile } from '../../src/renderer/state/documents'
import { getContentToSave, isDirtyLive } from '../../src/renderer/domain/dirty'
import { createSession } from './helpers'
import type { DocumentState, EditingSession } from '../../src/renderer/state/documents'

const FRONTMATTER_FILE = '---\ntitle: x\n---\n\n# Body\n\nText.'

function sessionWithFile(extra?: Partial<Record<'view' | 'path' | 'name', string>>): {
  state: EditingSession
  doc: DocumentState
} {
  const payload = {
    path: extra?.path ?? 'f.md',
    name: extra?.name ?? 'f.md',
    content: FRONTMATTER_FILE,
    mtimeMs: 1,
    size: FRONTMATTER_FILE.length,
    ...(extra?.view ? { view: extra.view } : {})
  }
  const state = documentsReducer(createSession(), { type: 'OPEN_EXISTING', payload: { value: payload } })
  return { state, doc: state.documents[0] }
}

/** A getMarkdown accessor that returns a fixed editor serialization. */
function markdownReturning(live: string | null) {
  return () => live
}

describe('documents reducer — frontmatter (spec 021)', () => {
  it('OPEN_EXISTING stores frontmatter separately and content as body only (FR-001..004)', () => {
    const { doc } = sessionWithFile()
    expect(doc.frontmatter).toBe('---\ntitle: x\n---\n')
    expect(doc.content).toBe('\n# Body\n\nText.')
    expect(doc.baseline).toBe(FRONTMATTER_FILE)
    expect(doc.dirty).toBe(false)
  })

  it('openFile on a file without frontmatter stores empty frontmatter and full content', () => {
    const doc = openFile({
      path: 'plain.md',
      name: 'plain.md',
      content: '# Plain\n',
      mtimeMs: 1,
      size: 8
    })
    expect(doc.frontmatter).toBe('')
    expect(doc.content).toBe('# Plain\n')
    expect(doc.baseline).toBe('# Plain\n')
  })

  it('openFile on an unclosed frontmatter treats the whole file as body', () => {
    const text = '---\nunclosed'
    const doc = openFile({ path: 'u.md', name: 'u.md', content: text, mtimeMs: 1, size: text.length })
    expect(doc.frontmatter).toBe('')
    expect(doc.content).toBe(text)
  })
})

describe('documents reducer — save with frontmatter (spec 021)', () => {
  it('SAVE_SUCCESS re-splits the written text, keeps frontmatter, clears dirty (FR-005/FR-008)', () => {
    const { state, doc } = sessionWithFile()
    const edited = documentsReducer(state, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: '\n# Body\n\nEdited.' }
    })
    const saved = documentsReducer(edited, {
      type: 'SAVE_SUCCESS',
      payload: { id: doc.id, path: 'f.md', content: '---\ntitle: x\n---\n\n# Body\n\nEdited.' }
    })
    const after = saved.documents[0]
    expect(after.frontmatter).toBe('---\ntitle: x\n---\n')
    expect(after.content).toBe('\n# Body\n\nEdited.')
    expect(after.baseline).toBe('---\ntitle: x\n---\n\n# Body\n\nEdited.')
    expect(after.dirty).toBe(false)
  })

  it('SAVE_SUCCESS keeps frontmatter intact after a body-only save (FR-008 scenario 2)', () => {
    const { state, doc } = sessionWithFile()
    const saved = documentsReducer(state, {
      type: 'SAVE_SUCCESS',
      payload: { id: doc.id, path: 'f.md', content: FRONTMATTER_FILE }
    })
    expect(saved.documents[0].frontmatter).toBe('---\ntitle: x\n---\n')
    expect(saved.documents[0].dirty).toBe(false)
  })

  it('RELOAD re-splits the re-read full file and resets baseline/dirty', () => {
    const { state, doc } = sessionWithFile()
    const reloaded = documentsReducer(state, {
      type: 'RELOAD',
      payload: { id: doc.id, content: FRONTMATTER_FILE }
    })
    const after = reloaded.documents[0]
    expect(after.frontmatter).toBe('---\ntitle: x\n---\n')
    expect(after.content).toBe('\n# Body\n\nText.')
    expect(after.baseline).toBe(FRONTMATTER_FILE)
    expect(after.dirty).toBe(false)
  })

  it('getContentToSave recombines frontmatter + body for a clean formatted doc', () => {
    const { doc } = sessionWithFile()
    expect(getContentToSave(doc, markdownReturning(null))).toBe(FRONTMATTER_FILE)
  })

  it('getContentToSave recombines frontmatter + editor serialization for a dirty formatted doc', () => {
    const { state, doc } = sessionWithFile()
    const edited = documentsReducer(state, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: '\n# Body\n\nEdited.' }
    })
    const dirty = edited.documents[0]
    expect(getContentToSave(dirty, markdownReturning('\n# Body\n\nEdited.'))).toBe(
      '---\ntitle: x\n---\n\n# Body\n\nEdited.'
    )
  })

  it('getContentToSave recombines frontmatter + body for source view', () => {
    const { state, doc } = sessionWithFile()
    const source = documentsReducer(state, { type: 'SET_VIEW', payload: { id: doc.id, view: 'source' } })
    expect(getContentToSave(source.documents[0], markdownReturning(null))).toBe(FRONTMATTER_FILE)
  })

  it('getContentToSave returns the body unchanged when frontmatter is empty (FR-010)', () => {
    const state = documentsReducer(createSession(), {
      type: 'OPEN_EXISTING',
      payload: { value: { path: 'plain.md', name: 'plain.md', content: '# Plain\n', mtimeMs: 1, size: 8 } }
    })
    expect(getContentToSave(state.documents[0], markdownReturning(null))).toBe('# Plain\n')
  })

  it('a frontmatter-only edit saves the raw untouched body, not the editor serialization', () => {
    // The file has no trailing newline in the body. After editing ONLY the
    // frontmatter in source view and returning to formatted, the save must
    // write the raw body bytes — the editor's appended newline is not adopted.
    const state = documentsReducer(createSession(), {
      type: 'OPEN_EXISTING',
      payload: { value: { path: 'f.md', name: 'f.md', content: '---\ntitle: a\n---\nbody', mtimeMs: 1, size: 17, view: 'source' } }
    })
    const doc = state.documents[0]
    const edited = documentsReducer(state, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: '---\ntitle: b\n---\nbody' }
    })
    const dirty = edited.documents[0]
    // The editor would serialize the body with a trailing newline; the store
    // keeps the raw bytes so the save stays byte-faithful to the body.
    expect(getContentToSave(dirty, markdownReturning('body\n'))).toBe('---\ntitle: b\n---\nbody')
  })

  it('a body starting with --- pasted in the visual editor is NOT promoted to frontmatter on save', () => {
    // Spec edge case: pasted `---` content in the visual editor is body. The
    // store partition must survive the save (SAVE_SUCCESS must not re-derive
    // the frontmatter from the written bytes).
    const state = documentsReducer(createSession(), {
      type: 'OPEN_EXISTING',
      payload: { value: { path: 'p.md', name: 'p.md', content: 'paragraph', mtimeMs: 1, size: 9 } }
    })
    const doc = state.documents[0]
    const pasted = documentsReducer(state, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: '---\nbody content\n---\nmore' }
    })
    const saved = documentsReducer(pasted, {
      type: 'SAVE_SUCCESS',
      payload: { id: doc.id, path: 'p.md', content: '---\nbody content\n---\nmore' }
    })
    const after = saved.documents[0]
    expect(after.frontmatter).toBe('')
    expect(after.content).toBe('---\nbody content\n---\nmore')
    expect(after.dirty).toBe(false)
  })
})

describe('documents reducer — source view with frontmatter (spec 021)', () => {
  it('UPDATE_CONTENT in source view re-splits the full textarea value (FR-007)', () => {
    const { state, doc } = sessionWithFile()
    const source = documentsReducer(state, { type: 'SET_VIEW', payload: { id: doc.id, view: 'source' } })
    const edited = documentsReducer(source, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: '---\ntitle: y\n---\n\n# Body\n\nEdited.' }
    })
    const after = edited.documents[0]
    expect(after.frontmatter).toBe('---\ntitle: y\n---\n')
    expect(after.content).toBe('\n# Body\n\nEdited.')
    expect(after.dirty).toBe(true)
  })

  it('UPDATE_CONTENT in source view re-extracts when frontmatter is added', () => {
    const state = documentsReducer(createSession(), {
      type: 'OPEN_EXISTING',
      payload: { value: { path: 'plain.md', name: 'plain.md', content: '# Plain\n', mtimeMs: 1, size: 8, view: 'source' } }
    })
    const doc = state.documents[0]
    const edited = documentsReducer(state, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: '---\nnew: 1\n---\n# Plain\n' }
    })
    expect(edited.documents[0].frontmatter).toBe('---\nnew: 1\n---\n')
    expect(edited.documents[0].content).toBe('# Plain\n')
    expect(edited.documents[0].dirty).toBe(true)
  })

  it('UPDATE_CONTENT in source view re-extracts when frontmatter is removed', () => {
    const { state, doc } = sessionWithFile()
    const source = documentsReducer(state, { type: 'SET_VIEW', payload: { id: doc.id, view: 'source' } })
    const edited = documentsReducer(source, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: '# Body\n\nText.' }
    })
    const after = edited.documents[0]
    expect(after.frontmatter).toBe('')
    expect(after.content).toBe('# Body\n\nText.')
    expect(after.dirty).toBe(true)
  })

  it('UPDATE_CONTENT in source view sets dirty against the full-file baseline', () => {
    const { state, doc } = sessionWithFile()
    const source = documentsReducer(state, { type: 'SET_VIEW', payload: { id: doc.id, view: 'source' } })
    // An edit then an undo back to the exact original is clean.
    const edited = documentsReducer(source, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: '---\ntitle: x\n---\n\n# Body\n\nChanged.' }
    })
    expect(edited.documents[0].dirty).toBe(true)
    const undone = documentsReducer(edited, {
      type: 'UPDATE_CONTENT',
      payload: { id: doc.id, content: FRONTMATTER_FILE }
    })
    expect(undone.documents[0].dirty).toBe(false)
  })

  it('REFRESH_FROM_SOURCE re-splits full recombined text and bumps the version', () => {
    const { state, doc } = sessionWithFile()
    const before = state.documents[0]
    const refreshed = documentsReducer(state, {
      type: 'REFRESH_FROM_SOURCE',
      payload: { id: doc.id, content: '---\ntitle: z\n---\n# New body' }
    })
    const after = refreshed.documents[0]
    expect(after.frontmatter).toBe('---\ntitle: z\n---\n')
    expect(after.content).toBe('# New body')
    expect(after.contentVersion).toBe(before.contentVersion + 1)
    // baseline/dirty untouched — the document stays unsaved.
    expect(after.baseline).toBe(FRONTMATTER_FILE)
    expect(after.dirty).toBe(false)
  })
})

describe('documents reducer — round trip with frontmatter (spec 021)', () => {
  it('no-edit open then save keeps frontmatter verbatim and clean', () => {
    const { state, doc } = sessionWithFile()
    // The editor serialization is the BODY only (the editor never sees the
    // frontmatter), so a clean open matches the body baseline.
    expect(isDirtyLive(state.documents[0], markdownReturning('\n# Body\n\nText.'))).toBe(false)
    const saved = documentsReducer(state, {
      type: 'SAVE_SUCCESS',
      payload: { id: doc.id, path: 'f.md', content: getContentToSave(state.documents[0], markdownReturning(null)) }
    })
    expect(saved.documents[0].dirty).toBe(false)
    expect(saved.documents[0].frontmatter).toBe('---\ntitle: x\n---\n')
  })
})
