import type { ErrorCode, NativeDialogRequest } from '../../shared/ipc-contract'

// Spec 008: the renderer may only ask main to show one of the nine known dialog
// kinds, with length-bounded display strings (never paths). A malformed request
// fails closed — no dialog is shown (Principle II). Electron-free so the
// validator is unit-testable without Electron (tests/main/dialogValidation.test.ts).
const MAX_STRING = 500
const MAX_LIST = 50
const MAX_ERROR = 1000

function dialogString(val: unknown, name: string): string {
  if (typeof val !== 'string') {
    throw Object.assign(new Error(`${name} must be a string`), { code: 'IO' as ErrorCode })
  }
  if (val.length > MAX_STRING) {
    throw Object.assign(new Error(`${name} is too long`), { code: 'IO' as ErrorCode })
  }
  return val
}

function dialogErrorString(val: unknown): string {
  if (typeof val !== 'string') {
    throw Object.assign(new Error('error must be a string'), { code: 'IO' as ErrorCode })
  }
  if (val.length > MAX_ERROR) {
    throw Object.assign(new Error('error is too long'), { code: 'IO' as ErrorCode })
  }
  return val
}

function dialogStringList(val: unknown, name: string): string[] {
  if (!Array.isArray(val) || val.length > MAX_LIST) {
    throw Object.assign(new Error(`${name} must be an array of strings`), { code: 'IO' as ErrorCode })
  }
  return val.map((v, i) => dialogString(v, `${name}[${i}]`))
}

export function validateNativeDialogRequest(val: unknown): NativeDialogRequest {
  if (!val || typeof val !== 'object') {
    throw Object.assign(new Error('Invalid dialog request: expected an object'), { code: 'IO' as ErrorCode })
  }
  const req = val as Record<string, unknown>
  const kind = req.kind
  switch (kind) {
    case 'unsaved-close':
      return {
        kind,
        documentTitle: dialogString(req.documentTitle, 'documentTitle'),
        ...(req.error !== undefined ? { error: dialogErrorString(req.error) } : {})
      }
    case 'unsaved-quit':
    case 'folder-open':
      return {
        kind,
        documentTitles: dialogStringList(req.documentTitles, 'documentTitles'),
        ...(req.error !== undefined ? { error: dialogErrorString(req.error) } : {})
      }
    case 'external-changed':
      return { kind, documentTitle: dialogString(req.documentTitle, 'documentTitle') }
    case 'external-removed':
      return {
        kind,
        documentTitle: dialogString(req.documentTitle, 'documentTitle'),
        ...(req.error !== undefined ? { error: dialogErrorString(req.error) } : {})
      }
    case 'delete-to-trash':
    case 'permanent-delete':
      return {
        kind,
        targetName: dialogString(req.targetName, 'targetName'),
        detail: dialogString(req.detail, 'detail'),
        cleanToCloseTitles: dialogStringList(req.cleanToCloseTitles, 'cleanToCloseTitles')
      }
    case 'delete-blocked':
      return {
        kind,
        targetName: dialogString(req.targetName, 'targetName'),
        blockerTitles: dialogStringList(req.blockerTitles, 'blockerTitles')
      }
    case 'operation-failed':
      return { kind, message: dialogString(req.message, 'message') }
    default:
      throw Object.assign(new Error('Invalid dialog request kind'), { code: 'IO' as ErrorCode })
  }
}
