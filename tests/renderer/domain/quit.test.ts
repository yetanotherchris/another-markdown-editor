import { describe, it, expect } from 'vitest'
import {
  dirtyDocumentsToSave,
  shouldRePromptForFailedSave
} from '../../../src/renderer/domain/quit'
import type { DocumentState } from '../../../src/renderer/state/documents'

function makeDoc(id: string, dirty: boolean): DocumentState {
  return {
    id,
    path: `${id}.md`,
    title: `${id}.md`,
    baseline: '',
    editorBaseline: '',
    content: '',
    dirty,
    diskBytes: null,
    editorState: 'live',
    cursorOffset: 0,
    scrollTop: 0,
    lastActiveAt: 0,
    externalState: 'clean',
    contentVersion: 0,
    view: 'formatted'
  }
}

describe('dirtyDocumentsToSave', () => {
  it('returns only the documents the isDirty predicate flags', () => {
    const docs = [makeDoc('a', true), makeDoc('b', false), makeDoc('c', true)]
    const dirty = dirtyDocumentsToSave(docs, (d) => d.dirty)
    expect(dirty.map((d) => d.id)).toEqual(['a', 'c'])
  })

  it('returns an empty list when nothing is dirty', () => {
    const docs = [makeDoc('a', false), makeDoc('b', false)]
    expect(dirtyDocumentsToSave(docs, (d) => d.dirty)).toHaveLength(0)
  })

  it('accepts a live-dirty predicate (the quit guard uses the live check)', () => {
    const docs = [makeDoc('a', false), makeDoc('b', false)]
    const dirty = dirtyDocumentsToSave(docs, () => true)
    expect(dirty).toHaveLength(2)
  })
})

describe('shouldRePromptForFailedSave', () => {
  it('re-prompts on a failed save (keeps the doc dirty)', () => {
    expect(shouldRePromptForFailedSave('failed')).toBe(true)
  })

  it('re-prompts on a cancelled Save-As (the tab stays open)', () => {
    expect(shouldRePromptForFailedSave('cancelled')).toBe(true)
  })

  it('ends the loop on a successful save', () => {
    expect(shouldRePromptForFailedSave('saved')).toBe(false)
  })
})
