import { describe, it, expect } from 'vitest'
import { treeMoveTarget, treeWouldMoveIntoOwnDescendant } from '../../src/renderer/explorer/treeMove'

describe('treeMoveTarget', () => {
  it('computes a move into a target folder', () => {
    expect(treeMoveTarget('a/b.md', 'a/sub')).toBe('a/sub/b.md')
  })

  it('moves a top-level file to a folder', () => {
    expect(treeMoveTarget('a.md', 'docs')).toBe('docs/a.md')
  })

  it('moves to the workspace root when the target is empty', () => {
    expect(treeMoveTarget('sub/c.md', '')).toBe('c.md')
  })

  it('returns null when the drop would not change the location (same parent)', () => {
    expect(treeMoveTarget('a/b.md', 'a')).toBeNull()
  })

  it('returns null when the target is a descendant of the dragged node', () => {
    expect(treeMoveTarget('a', 'a/sub')).toBeNull()
  })
})

describe('treeWouldMoveIntoOwnDescendant', () => {
  it('is true when dropping a folder into its own subtree', () => {
    expect(treeWouldMoveIntoOwnDescendant('a', 'a/sub')).toBe(true)
  })

  it('is true when dropping onto itself', () => {
    expect(treeWouldMoveIntoOwnDescendant('a', 'a')).toBe(true)
  })

  it('is false for an unrelated target', () => {
    expect(treeWouldMoveIntoOwnDescendant('a', 'b')).toBe(false)
  })
})
