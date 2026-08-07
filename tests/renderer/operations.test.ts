import { describe, it, expect } from 'vitest'
import { parentPathOf } from '../../src/renderer/state/workspace'
import {
  entryName,
  renameTargetPath,
  moveTargetPath,
  wouldMoveIntoOwnDescendant,
  validateEntryName,
  isWithinOrEqual,
  planDelete,
  deleteDescription,
} from '../../src/renderer/explorer/operations'
import type { DocumentState } from '../../src/renderer/state/documents'

function makeDoc(patch: Partial<DocumentState> & { id: string; path: string | null }): DocumentState {
  return {
    title: patch.path?.split('/').pop() || patch.id,
    baseline: '',
    editorBaseline: '',
    content: '',
    frontmatter: '',
    dirty: false,
    diskBytes: null,
    editorState: 'live',
    cursorOffset: 0,
    scrollTop: 0,
    lastActiveAt: 0,
    externalState: 'clean',
    contentVersion: 0,
    view: 'formatted',
    ...patch
  }
}

describe('path helpers', () => {
  it('parentPathOf splits on the last slash', () => {
    expect(parentPathOf('a.md')).toBe('')
    expect(parentPathOf('notes/a.md')).toBe('notes')
    expect(parentPathOf('notes/sub/a.md')).toBe('notes/sub')
  })

  it('entryName returns the last segment', () => {
    expect(entryName('a.md')).toBe('a.md')
    expect(entryName('notes/sub/a.md')).toBe('a.md')
  })

  it('renameTargetPath renames within the same directory', () => {
    expect(renameTargetPath('a.md', 'b.md')).toBe('b.md')
    expect(renameTargetPath('notes/a.md', 'b.md')).toBe('notes/b.md')
  })

  it('moveTargetPath builds the new location and detects no-ops', () => {
    expect(moveTargetPath('notes/a.md', 'other')).toBe('other/a.md')
    expect(moveTargetPath('notes/a.md', '')).toBe('a.md')
    expect(moveTargetPath('notes/a.md', 'notes')).toBeNull()
    expect(moveTargetPath('a.md', '')).toBeNull()
  })

  it('wouldMoveIntoOwnDescendant detects folder-into-itself and descendants', () => {
    expect(wouldMoveIntoOwnDescendant('notes', 'notes')).toBe(true)
    expect(wouldMoveIntoOwnDescendant('notes', 'notes/sub')).toBe(true)
    expect(wouldMoveIntoOwnDescendant('notes', 'notes2')).toBe(false)
    expect(wouldMoveIntoOwnDescendant('notes', 'other')).toBe(false)
  })

  it('isWithinOrEqual matches prefix boundaries only', () => {
    expect(isWithinOrEqual('notes/a.md', 'notes')).toBe(true)
    expect(isWithinOrEqual('notes', 'notes')).toBe(true)
    expect(isWithinOrEqual('notes2/a.md', 'notes')).toBe(false)
  })
})

describe('validateEntryName', () => {
  it('rejects empty names', () => {
    expect(validateEntryName('file', 'a.md', '')).not.toBeNull()
    expect(validateEntryName('file', 'a.md', '   ')).not.toBeNull()
  })

  it('accepts the current name as a no-op', () => {
    expect(validateEntryName('file', 'a.md', 'a.md')).toBeNull()
  })

  it('rejects path separators and dot names', () => {
    expect(validateEntryName('file', 'a.md', 'x/y.md')).not.toBeNull()
    expect(validateEntryName('file', 'a.md', 'x\\y.md')).not.toBeNull()
    expect(validateEntryName('file', 'a.md', '..')).not.toBeNull()
    expect(validateEntryName('file', 'a.md', '.')).not.toBeNull()
  })

  it('requires markdown extensions for files (FR-010 tree visibility)', () => {
    expect(validateEntryName('file', 'a.md', 'a.txt')).not.toBeNull()
    expect(validateEntryName('file', 'a.md', 'a')).not.toBeNull()
    expect(validateEntryName('file', 'a.md', 'b.md')).toBeNull()
    expect(validateEntryName('file', 'a.md', 'b.MARKDOWN')).toBeNull()
    expect(validateEntryName('file', 'a.md', 'b.md2')).not.toBeNull()
  })

  it('does not restrict folder names', () => {
    expect(validateEntryName('directory', 'a', 'anything-goes')).toBeNull()
    expect(validateEntryName('directory', 'a', 'b.txt')).toBeNull()
  })
})

describe('planDelete', () => {
  const docs = [
    makeDoc({ id: 'x.md', path: 'x.md' }),
    makeDoc({ id: 'notes/a.md', path: 'notes/a.md', dirty: true }),
    makeDoc({ id: 'other.md', path: 'other.md' }),
    makeDoc({ id: 'untitled', path: null })
  ]

  it('finds clean and dirty open documents for a file target', () => {
    const plan = planDelete(docs, 'x.md')
    expect(plan.open.map(d => d.id)).toEqual(['x.md'])
    expect(plan.cleanToClose.map(d => d.id)).toEqual(['x.md'])
    expect(plan.dirtyBlockers).toHaveLength(0)
  })

  it('flags dirty documents inside a deleted folder as blockers', () => {
    const plan = planDelete(docs, 'notes')
    expect(plan.dirtyBlockers.map(d => d.id)).toEqual(['notes/a.md'])
    expect(plan.cleanToClose).toHaveLength(0)
  })

  it('ignores unrelated and unsaved documents', () => {
    const plan = planDelete(docs, 'other.md')
    expect(plan.open.map(d => d.id)).toEqual(['other.md'])
    expect(plan.cleanToClose.map(d => d.id)).toEqual(['other.md'])
  })
})

describe('deleteDescription', () => {
  it('warns for non-empty folders', () => {
    const text = deleteDescription({ kind: 'directory', isEmpty: false, hasHiddenFiles: false })
    expect(text).toContain('not empty')
    expect(text).not.toContain('not shown in the explorer')
  })

  it('warns about hidden files (FR-029b)', () => {
    const text = deleteDescription({ kind: 'directory', isEmpty: false, hasHiddenFiles: true })
    expect(text).toContain('not shown in the explorer')
  })

  it('says nothing extra for empty folders and files', () => {
    expect(deleteDescription({ kind: 'directory', isEmpty: true, hasHiddenFiles: false }))
      .toBe('')
    expect(deleteDescription({ kind: 'file', isEmpty: false, hasHiddenFiles: false }))
      .toBe('')
  })
})
