import { describe, it, expect } from 'vitest'
import { validateNativeDialogRequest } from '../../src/main/ipc/dialogValidation'
import type { NativeDialogRequest } from '../../src/shared/ipc-contract'

// Spec 008, "Malformed request" edge case (contracts/renderer.md): the main-
// process validator rejects a bad request with an IO error and no dialog is
// shown. These behavioral tests pin the nine-kind whitelist and the length
// caps that the old type-shape tests could not (test review 2026-08-04).

const errorOf = (fn: () => NativeDialogRequest): string => {
  try {
    fn()
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('expected validateNativeDialogRequest to throw')
}

describe('validateNativeDialogRequest', () => {
  it('accepts every valid kind with its required fields', () => {
    const valid: unknown[] = [
      { kind: 'unsaved-close', documentTitle: 'a.md' },
      { kind: 'unsaved-quit', documentTitles: ['a.md', 'b.md'] },
      { kind: 'folder-open', documentTitles: ['a.md'], error: 'Could not save a.md.' },
      { kind: 'external-changed', documentTitle: 'a.md' },
      { kind: 'external-removed', documentTitle: 'a.md', error: 'Could not save a.md.' },
      { kind: 'delete-to-trash', targetName: 'b.md', detail: '', cleanToCloseTitles: ['a.md'] },
      { kind: 'permanent-delete', targetName: 'b.md', detail: '', cleanToCloseTitles: [] },
      { kind: 'delete-blocked', targetName: 'b.md', blockerTitles: ['a.md'] },
      { kind: 'operation-failed', message: 'File or directory not found' }
    ]
    expect(valid).toHaveLength(9)
    for (const request of valid) {
      expect(validateNativeDialogRequest(request).kind).toBe((request as { kind: string }).kind)
    }
  })

  it('rejects an unknown kind (whitelist)', () => {
    expect(errorOf(() => validateNativeDialogRequest({ kind: 'explode', documentTitle: 'a' })))
      .toContain('Invalid dialog request kind')
  })

  it('rejects a non-object payload', () => {
    expect(errorOf(() => validateNativeDialogRequest(null))).toContain('expected an object')
    expect(errorOf(() => validateNativeDialogRequest('unsaved-close'))).toContain('expected an object')
  })

  it('rejects a non-string documentTitle', () => {
    expect(errorOf(() => validateNativeDialogRequest({ kind: 'unsaved-close', documentTitle: 42 })))
      .toContain('documentTitle must be a string')
  })

  it('rejects an over-long documentTitle (MAX_STRING=500)', () => {
    expect(errorOf(() => validateNativeDialogRequest({ kind: 'unsaved-close', documentTitle: 'x'.repeat(501) })))
      .toContain('documentTitle is too long')
  })

  it('rejects an over-long error detail (MAX_ERROR=1000)', () => {
    expect(errorOf(() => validateNativeDialogRequest({ kind: 'unsaved-close', documentTitle: 'a', error: 'x'.repeat(1001) })))
      .toContain('error is too long')
  })

  it('rejects error: null (must be a string when present)', () => {
    expect(errorOf(() => validateNativeDialogRequest({ kind: 'unsaved-close', documentTitle: 'a', error: null })))
      .toContain('error must be a string')
  })

  it('rejects a non-array documentTitles', () => {
    expect(errorOf(() => validateNativeDialogRequest({ kind: 'unsaved-quit', documentTitles: 'a.md' })))
      .toContain('documentTitles must be an array')
  })

  it('rejects an over-long list (MAX_LIST=50)', () => {
    expect(errorOf(() => validateNativeDialogRequest({ kind: 'unsaved-quit', documentTitles: Array(51).fill('a.md') })))
      .toContain('documentTitles must be an array')
  })

  it('rejects a non-string list member', () => {
    expect(errorOf(() => validateNativeDialogRequest({ kind: 'delete-to-trash', targetName: 'b', detail: '', cleanToCloseTitles: [1] })))
      .toContain('cleanToCloseTitles[0] must be a string')
  })
})
