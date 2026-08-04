import { describe, it, expect } from 'vitest'
import { buildNativeDialogOptions, decisionFromResponse } from '../../src/shared/nativeDialog'
import type { NativeDialogRequest } from '../../src/shared/ipc-contract'

// Spec 008, FR-001/003/005/006: the per-platform button tables in
// contracts/renderer.md are enforced here for every kind × every platform.
// Windows/Linux: array order is the visual left→right order. macOS: buttons[0]
// renders at the FAR RIGHT (default position), so the macOS arrays are the
// visual order reversed.

const req = (kind: NativeDialogRequest['kind'], overrides: Partial<NativeDialogRequest> = {}): NativeDialogRequest => {
  const base: Record<string, unknown> = { kind }
  if ('documentTitle' in overrides) base.documentTitle = overrides.documentTitle
  if ('documentTitles' in overrides) base.documentTitles = overrides.documentTitles
  if ('targetName' in overrides) base.targetName = overrides.targetName
  if ('detail' in overrides) base.detail = overrides.detail
  if ('cleanToCloseTitles' in overrides) base.cleanToCloseTitles = overrides.cleanToCloseTitles
  if ('blockerTitles' in overrides) base.blockerTitles = overrides.blockerTitles
  if ('message' in overrides) base.message = overrides.message
  if ('error' in overrides) base.error = overrides.error
  return base as NativeDialogRequest
}

describe('buildNativeDialogOptions — unsaved-close / unsaved-quit / folder-open', () => {
  it('unsaved-close: VS Code-style instruction/content and platform button order', () => {
    const r = req('unsaved-close', { documentTitle: 'a.md' })
    expect(buildNativeDialogOptions('win32', r)).toMatchObject({
      type: 'warning',
      title: '',
      message: 'Do you want to save the changes you made to a.md?',
      detail: "Your changes will be lost if you don't save them.",
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    expect(buildNativeDialogOptions('darwin', r)).toMatchObject({
      title: '',
      buttons: ['Save', 'Cancel', "Don't Save"],
      defaultId: 0,
      cancelId: 1
    })
    expect(buildNativeDialogOptions('linux', r)).toMatchObject({
      title: '',
      buttons: ['Cancel', "Don't Save", 'Save'],
      defaultId: 2,
      cancelId: 0
    })
  })

  it('noLink is set only on Windows so buttons render as standard push buttons', () => {
    const r = req('unsaved-close', { documentTitle: 'a.md' })
    expect(buildNativeDialogOptions('win32', r).noLink).toBe(true)
    expect(buildNativeDialogOptions('darwin', r).noLink).toBeUndefined()
    expect(buildNativeDialogOptions('linux', r).noLink).toBeUndefined()
  })

  it('unsaved-close: re-prompt error detail is appended after the consequence', () => {
    const r = req('unsaved-close', { documentTitle: 'a.md', error: 'Could not save a.md.' })
    expect(buildNativeDialogOptions('win32', r).detail).toBe(
      "Your changes will be lost if you don't save them.\nCould not save a.md."
    )
  })

  it('unsaved-quit: VS Code-style instruction with the affected-document list', () => {
    const r = req('unsaved-quit', { documentTitles: ['a.md', 'b.md'] })
    const win = buildNativeDialogOptions('win32', r)
    expect(win.message).toBe('Do you want to save the changes you made?')
    expect(win.detail).toContain('a.md')
    expect(win.detail).toContain('b.md')
    expect(win.detail).toContain("Your changes will be lost if you don't save them.")
    expect(win.buttons).toEqual(['Save All', 'Discard and Quit', 'Cancel'])
    expect(buildNativeDialogOptions('darwin', r).buttons).toEqual(['Save All', 'Cancel', 'Discard and Quit'])
    expect(buildNativeDialogOptions('linux', r).buttons).toEqual(['Cancel', 'Discard and Quit', 'Save All'])
  })

  it('folder-open: same shape with Discard label', () => {
    const r = req('folder-open', { documentTitles: ['a.md'] })
    expect(buildNativeDialogOptions('win32', r).buttons).toEqual(['Save All', 'Discard', 'Cancel'])
    expect(buildNativeDialogOptions('darwin', r).buttons).toEqual(['Save All', 'Cancel', 'Discard'])
    expect(buildNativeDialogOptions('linux', r).buttons).toEqual(['Cancel', 'Discard', 'Save All'])
  })
})

describe('buildNativeDialogOptions — external dialogs', () => {
  it('external-changed: default is Keep (safe) on every platform', () => {
    const r = req('external-changed', { documentTitle: 'a.md' })
    for (const p of ['win32', 'darwin', 'linux'] as const) {
      const opts = buildNativeDialogOptions(p, r)
      expect(opts.type).toBe('warning')
      expect(opts.message).toContain('was modified by another program')
      expect(opts.buttons).toHaveLength(2)
      expect(new Set(opts.buttons)).toEqual(new Set(['Keep My Version', 'Reload from Disk']))
      expect(opts.cancelId).toBe(opts.defaultId) // Escape = the safe choice
    }
    expect(buildNativeDialogOptions('win32', r).buttons).toEqual(['Keep My Version', 'Reload from Disk'])
    expect(buildNativeDialogOptions('linux', r).buttons).toEqual(['Reload from Disk', 'Keep My Version'])
  })

  it('external-removed: Save As is the default; OK is the safe acknowledgement', () => {
    const r = req('external-removed', { documentTitle: 'a.md' })
    expect(buildNativeDialogOptions('win32', r)).toMatchObject({
      buttons: ['Save As...', 'OK'],
      defaultId: 0,
      cancelId: 1
    })
    expect(buildNativeDialogOptions('darwin', r)).toMatchObject({
      buttons: ['Save As...', 'OK'],
      defaultId: 0,
      cancelId: 1
    })
    expect(buildNativeDialogOptions('linux', r)).toMatchObject({
      buttons: ['OK', 'Save As...'],
      defaultId: 1,
      cancelId: 0
    })
  })

  it('external-removed: re-prompt error detail is appended', () => {
    const r = req('external-removed', { documentTitle: 'a.md', error: 'Could not save a.md.' })
    expect(buildNativeDialogOptions('win32', r).detail).toBe('Could not save a.md.')
  })
})

describe('buildNativeDialogOptions — destructive dialogs', () => {
  it('delete-to-trash: Delete may be default (recoverable), Cancel is cancelId', () => {
    const r = req('delete-to-trash', { targetName: 'b.md', detail: '', cleanToCloseTitles: [] })
    expect(buildNativeDialogOptions('win32', r)).toMatchObject({
      buttons: ['Delete', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    })
    expect(buildNativeDialogOptions('darwin', r)).toMatchObject({
      buttons: ['Delete', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    })
    expect(buildNativeDialogOptions('linux', r)).toMatchObject({
      buttons: ['Cancel', 'Delete'],
      defaultId: 1,
      cancelId: 0
    })
    expect(buildNativeDialogOptions('win32', r).message).toBe('Delete b.md?')
  })

  it('permanent-delete: the irreversible action is NEVER the default (FR-006, US1 sc 4)', () => {
    const r = req('permanent-delete', { targetName: 'b.md', detail: '', cleanToCloseTitles: [] })
    for (const p of ['win32', 'darwin', 'linux'] as const) {
      const opts = buildNativeDialogOptions(p, r)
      expect(opts.buttons[opts.defaultId]).toBe('Cancel')
      expect(opts.buttons[opts.cancelId]).toBe('Cancel')
      expect(opts.type).toBe('warning')
    }
    expect(buildNativeDialogOptions('win32', r).buttons).toEqual(['Delete Permanently', 'Cancel'])
    expect(buildNativeDialogOptions('darwin', r).buttons).toEqual(['Cancel', 'Delete Permanently'])
    expect(buildNativeDialogOptions('linux', r).buttons).toEqual(['Delete Permanently', 'Cancel'])
  })

  it('delete-blocked: single OK acknowledgement listing blockers', () => {
    const r = req('delete-blocked', { targetName: 'folder', blockerTitles: ['a.md'] })
    for (const p of ['win32', 'darwin', 'linux'] as const) {
      expect(buildNativeDialogOptions(p, r)).toMatchObject({
        buttons: ['OK'],
        defaultId: 0,
        cancelId: 0,
        type: 'warning'
      })
    }
    expect(buildNativeDialogOptions('win32', r).message).toContain('folder')
    expect(buildNativeDialogOptions('win32', r).detail).toContain('a.md')
  })
})

describe('buildNativeDialogOptions — operation-failed', () => {
  it('operation-failed: single OK with the error detail', () => {
    const r = req('operation-failed', { message: 'File or directory not found' })
    for (const p of ['win32', 'darwin', 'linux'] as const) {
      expect(buildNativeDialogOptions(p, r)).toMatchObject({
        type: 'error',
        buttons: ['OK'],
        defaultId: 0,
        cancelId: 0,
        detail: 'File or directory not found'
      })
    }
  })
})

describe('platform fallback', () => {
  it('unknown platforms fall back to the linux layout (spec edge case)', () => {
    const r = req('unsaved-close', { documentTitle: 'a.md' })
    expect(buildNativeDialogOptions('freebsd', r).buttons).toEqual(
      buildNativeDialogOptions('linux', r).buttons
    )
  })
})

describe('decisionFromResponse', () => {
  // Label → decision, platform-agnostic. Each platform places the labels
  // differently, so we resolve the label's index from THAT platform's array
  // and assert the decision follows the label, not the index.
  const cases: Array<{ make: () => NativeDialogRequest; labels: Record<string, string> }> = [
    { make: () => req('unsaved-close', { documentTitle: 'a' }), labels: { 'Save': 'save', "Don't Save": 'discard', 'Cancel': 'cancel' } },
    { make: () => req('unsaved-quit', { documentTitles: ['a'] }), labels: { 'Save All': 'save-all', 'Discard and Quit': 'discard-all', 'Cancel': 'cancel' } },
    { make: () => req('folder-open', { documentTitles: ['a'] }), labels: { 'Save All': 'save-all', 'Discard': 'discard-all', 'Cancel': 'cancel' } },
    { make: () => req('external-changed', { documentTitle: 'a' }), labels: { 'Keep My Version': 'keep', 'Reload from Disk': 'reload' } },
    { make: () => req('external-removed', { documentTitle: 'a' }), labels: { 'Save As...': 'save-as', 'OK': 'ok' } },
    { make: () => req('delete-to-trash', { targetName: 'b', detail: '', cleanToCloseTitles: [] }), labels: { 'Delete': 'delete', 'Cancel': 'cancel' } },
    { make: () => req('permanent-delete', { targetName: 'b', detail: '', cleanToCloseTitles: [] }), labels: { 'Delete Permanently': 'delete-permanent', 'Cancel': 'cancel' } },
    { make: () => req('delete-blocked', { targetName: 'b', blockerTitles: ['a'] }), labels: { 'OK': 'acknowledge' } },
    { make: () => req('operation-failed', { message: 'x' }), labels: { 'OK': 'acknowledge' } }
  ]

  it('maps each button label to its decision on every platform', () => {
    for (const p of ['win32', 'darwin', 'linux'] as const) {
      for (const { make, labels } of cases) {
        const r = make()
        const opts = buildNativeDialogOptions(p, r)
        for (const [label, expected] of Object.entries(labels)) {
          const index = opts.buttons.indexOf(label)
          expect(index, `${p} should contain ${label}`).toBeGreaterThanOrEqual(0)
          expect(decisionFromResponse(p, r, index), `${p} ${label}`).toBe(expected)
        }
      }
    }
  })

  it('maps Escape / window-close to the safe decision via cancelId on every platform', () => {
    for (const p of ['win32', 'darwin', 'linux'] as const) {
      for (const { make, labels } of cases) {
        const r = make()
        const opts = buildNativeDialogOptions(p, r)
        const safe = decisionFromResponse(p, r, opts.cancelId)
        const safeLabels = Object.entries(labels)
          .filter(([, d]) => d === 'cancel' || d === 'keep' || d === 'ok' || d === 'acknowledge')
          .map(([label]) => label)
        expect(safeLabels).toContain(opts.buttons[opts.cancelId])
        expect(safe).toBe(labels[opts.buttons[opts.cancelId]])
      }
    }
  })

  it('maps the macOS index for the reversed visual order', () => {
    // macOS unsaved-close visual: [Don't Save][Cancel][Save]; Save is default
    // at index 0, Escape/Cancel at index 1.
    const r = req('unsaved-close', { documentTitle: 'a' })
    expect(decisionFromResponse('darwin', r, 0)).toBe('save')
    expect(decisionFromResponse('darwin', r, 1)).toBe('cancel')
    expect(decisionFromResponse('darwin', r, 2)).toBe('discard')
  })

  it('fails closed to the safe decision for out-of-range indices', () => {
    const r = req('unsaved-close', { documentTitle: 'a' })
    expect(decisionFromResponse('win32', r, 99)).toBe('cancel')
    expect(decisionFromResponse('win32', r, -1)).toBe('cancel')
  })
})
