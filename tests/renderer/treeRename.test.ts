import { describe, it, expect } from 'vitest'
import { treeRenameLabel } from '../../src/renderer/explorer/treeRename'

describe('treeRenameLabel', () => {
  it('labels a new-file placeholder', () => {
    expect(treeRenameLabel({ name: 'new-file-1.md', kind: 'file' })).toBe('Name new file')
  })

  it('labels a new-folder placeholder', () => {
    expect(treeRenameLabel({ name: 'new-folder-1', kind: 'directory' })).toBe('Name new folder')
  })

  it('labels a real file rename', () => {
    expect(treeRenameLabel({ name: 'notes.md', kind: 'file' })).toBe('Rename notes.md')
  })

  it('labels a real folder rename', () => {
    expect(treeRenameLabel({ name: 'docs', kind: 'directory' })).toBe('Rename docs')
  })
})
