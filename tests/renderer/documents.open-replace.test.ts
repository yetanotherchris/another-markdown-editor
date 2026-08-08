import { describe, it, expect } from 'vitest'
import { documentsReducer, openFile } from '../../src/renderer/state/documents'
import type { EditingSession } from '../../src/renderer/state/documents'
import { createSession } from './helpers'

const file = (path: string, name = path) => ({ path, name, content: `# ${name}`, mtimeMs: 1, size: name.length + 3 })

function openExisting(state: EditingSession, path: string, mode?: 'replace'): EditingSession {
  return documentsReducer(state, { type: 'OPEN_EXISTING', payload: { value: file(path), mode } })
}

function openNew(state: EditingSession): EditingSession {
  return documentsReducer(state, { type: 'OPEN_NEW' })
}

function dirty(state: EditingSession, id: string): EditingSession {
  return documentsReducer(state, { type: 'UPDATE_CONTENT', payload: { id, content: 'edited' } })
}

describe('handleOpenExisting — spec 024 replace mode', () => {
  it('FR-001 replaces a clean active tab in place (no new tab, fresh doc)', () => {
    const s1 = openExisting(createSession(), 'a.md')
    const aId = s1.activeId
    const s2 = openExisting(s1, 'b.md', 'replace')

    expect(s2.documents).toHaveLength(1)
    expect(s2.documents[0].path).toBe('b.md')
    expect(s2.documents[0].title).toBe('b.md')
    expect(s2.documents[0].dirty).toBe(false)
    expect(s2.activeId).not.toBe(aId)
    expect(s2.documents[0].id).not.toBe(aId)
  })

  it('FR-002 a dirty active tab opens a new tab, leaving the dirty tab', () => {
    let s1 = openExisting(createSession(), 'a.md')
    const aId = s1.activeId!
    s1 = dirty(s1, aId)
    expect(s1.documents.find(d => d.id === aId)?.dirty).toBe(true)

    const s2 = openExisting(s1, 'b.md', 'replace')
    expect(s2.documents).toHaveLength(2)
    expect(s2.documents.find(d => d.id === aId)?.dirty).toBe(true)
    expect(s2.activeId).not.toBe(aId)
  })

  it('FR-009 a clean untitled active tab is replaced', () => {
    const s1 = openNew(createSession())
    const untitledId = s1.activeId!
    const s2 = openExisting(s1, 'a.md', 'replace')

    expect(s2.documents).toHaveLength(1)
    expect(s2.documents[0].path).toBe('a.md')
    expect(s2.documents[0].id).not.toBe(untitledId)
  })

  it('FR-003 an existing tab for the target path is activated, never replaced', () => {
    const s1 = openExisting(createSession(), 'a.md')
    const s2 = openExisting(s1, 'b.md') // b active, clean
    const s3 = openExisting(s2, 'a.md', 'replace')

    expect(s3.documents).toHaveLength(2)
    expect(s3.activeId).toBe(s1.documents[0].id)
    expect(s3.documents.map(d => d.path)).toEqual(['a.md', 'b.md'])
  })

  it('FR-004 with no active tab a new tab is created', () => {
    const s = openExisting(createSession(), 'a.md', 'replace')
    expect(s.documents).toHaveLength(1)
    expect(s.documents[0].path).toBe('a.md')
  })

  it('FR-006/FR-007 the replaced tab takes the new name/path and is a fresh clean document', () => {
    const s1 = openExisting(createSession(), 'a.md')
    const aId = s1.activeId!
    const s2 = openExisting(s1, 'b.md', 'replace')

    const replaced = s2.documents[0]
    expect(replaced.path).toBe('b.md')
    expect(replaced.title).toBe('b.md')
    expect(replaced.content).toBe('# b.md')
    expect(replaced.baseline).toBe('# b.md')
    expect(replaced.dirty).toBe(false)
    // The old document identity (and its undo history) is gone.
    expect(s2.documents.some(d => d.id === aId)).toBe(false)
  })

  it('mode absent behaves as before (new tab)', () => {
    const s1 = openExisting(createSession(), 'a.md')
    const s2 = openExisting(s1, 'b.md')
    expect(s2.documents).toHaveLength(2)
  })

  it('openFile still yields a fresh document identity', () => {
    const a = openFile(file('a.md'))
    const b = openFile(file('b.md'))
    expect(a.id).toBe('a.md')
    expect(b.id).toBe('b.md')
    expect(a.dirty).toBe(false)
  })
})
