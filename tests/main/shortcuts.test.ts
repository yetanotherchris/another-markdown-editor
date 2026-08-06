import { describe, it, expect } from 'vitest'
import { matchShortcut, ShortcutInput } from '../../src/main/shortcuts'

function keyDown(partial: Partial<ShortcutInput>): ShortcutInput {
  return { type: 'keyDown', key: '', control: false, meta: false, alt: false, shift: false, ...partial }
}

describe('matchShortcut (spec 010 contracts/renderer.md)', () => {
  it('maps the six renderer commands', () => {
    expect(matchShortcut(keyDown({ key: 'n', control: true }))).toBe('new-file')
    expect(matchShortcut(keyDown({ key: 'o', control: true }))).toBe('open-file')
    expect(matchShortcut(keyDown({ key: 'o', control: true, shift: true }))).toBe('open-folder')
    expect(matchShortcut(keyDown({ key: 's', control: true }))).toBe('save')
    expect(matchShortcut(keyDown({ key: 's', control: true, shift: true }))).toBe('save-as')
    expect(matchShortcut(keyDown({ key: 'w', control: true }))).toBe('close-tab')
  })

  it('accepts the meta (Cmd) modifier identically to control', () => {
    expect(matchShortcut(keyDown({ key: 's', meta: true }))).toBe('save')
    expect(matchShortcut(keyDown({ key: 'o', meta: true, shift: true }))).toBe('open-folder')
  })

  it('maps devtools to F12 and Ctrl/Cmd+Shift+I', () => {
    expect(matchShortcut(keyDown({ key: 'F12' }))).toBe('devtools')
    expect(matchShortcut(keyDown({ key: 'i', control: true, shift: true }))).toBe('devtools')
    expect(matchShortcut(keyDown({ key: 'i', meta: true, shift: true }))).toBe('devtools')
  })

  it('ignores keyUp and other event types', () => {
    expect(matchShortcut(keyDown({ type: 'keyUp', key: 's', control: true }))).toBeNull()
  })

  it('ignores unmodified keypresses', () => {
    expect(matchShortcut(keyDown({ key: 'a' }))).toBeNull()
    expect(matchShortcut(keyDown({ key: 'n' }))).toBeNull()
    expect(matchShortcut(keyDown({ key: 's' }))).toBeNull()
  })

  it('ignores unknown modified combinations', () => {
    expect(matchShortcut(keyDown({ key: 'p', control: true }))).toBeNull()
    expect(matchShortcut(keyDown({ key: 'z', control: true, shift: true }))).toBeNull()
  })

  it('ignores combinations with Alt held (reserved for window/system shortcuts)', () => {
    expect(matchShortcut(keyDown({ key: 'n', control: true, alt: true }))).toBeNull()
  })

  it('treats the shifted key case-insensitively', () => {
    // With Shift held Electron reports the key in uppercase; toLowerCase normalises it.
    expect(matchShortcut(keyDown({ key: 'O', control: true, shift: true }))).toBe('open-folder')
  })
})
