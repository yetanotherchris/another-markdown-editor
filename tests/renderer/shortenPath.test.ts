import { describe, it, expect } from 'vitest'
import { shortenPath } from '../../src/shared/shortenPath'

describe('shortenPath', () => {
  it('returns the full path when it fits', () => {
    expect(shortenPath('/home/me/notes', 30)).toBe('/home/me/notes')
  })

  it('returns the path unchanged when exactly at the limit', () => {
    expect(shortenPath('/home/me/notes', 14)).toBe('/home/me/notes')
  })

  it('keeps the final folder whole with an ellipsis prefix when too long', () => {
    expect(shortenPath('/home/me/very/long/path/notes', 16)).toBe('…/path/notes')
  })

  it('handles Windows-style separators', () => {
    expect(shortenPath('C:\\Users\\me\\projects\\notes', 16)).toBe('…\\projects\\notes')
  })

  it('never splits the final segment even at a tiny width floor', () => {
    // maxLength >= final.length keeps the folder name intact (callers apply
    // the final-folder floor; the helper still never splits it).
    expect(shortenPath('/home/me/a/b/notes', 8)).toBe('…/notes')
  })

  it('handles a single-segment path', () => {
    expect(shortenPath('notes', 3)).toBe('…/notes')
  })

  it('keeps the final folder even when only it fits', () => {
    expect(shortenPath('/a/b/c/d/e/folder', 10)).toBe('…/e/folder')
  })

  it('drops the leading separator when the tail is retained', () => {
    const out = shortenPath('/a/b/c/d/notes', 10)
    expect(out.startsWith('…/')).toBe(true)
    expect(out.endsWith('notes')).toBe(true)
  })

  it('handles mixed separators without mis-splitting', () => {
    // Backslash wins for output when the input mixes both separators.
    expect(shortenPath('C:\\Users\\me/notes', 12)).toBe('…\\me\\notes')
  })

  it('handles a trailing separator', () => {
    // The empty final segment is dropped, so the folder name survives.
    expect(shortenPath('C:\\Users\\me\\', 6)).toBe('…\\me')
  })

  it('returns an empty path unchanged', () => {
    expect(shortenPath('', 10)).toBe('')
  })

  it('handles maxLength of zero or less without throwing', () => {
    expect(shortenPath('/a/b/notes', 0)).toBe('…')
    expect(shortenPath('/a/b/notes', -5)).toBe('…')
  })
})
