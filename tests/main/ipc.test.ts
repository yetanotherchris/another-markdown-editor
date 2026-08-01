import { describe, it, expect } from 'vitest'
import type {
  Result, WorkspaceInfo, DirEntry, OpenedFile,
  WriteReceipt, TrashReceipt, ErrorCode
} from '../src/shared/ipc-contract'

describe('IPC contract types', () => {
  it('Result<T> has ok branch', () => {
    const ok: Result<string> = { ok: true, value: 'hello' }
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.value).toBe('hello')
    }
  })

  it('Result<T> has error branch', () => {
    const err: Result<string> = { ok: false, code: 'NOT_FOUND', message: 'Not found' }
    expect(err.ok).toBe(false)
    if (!err.ok) {
      expect(err.code).toBe('NOT_FOUND')
      expect(err.message).toBe('Not found')
    }
  })

  it('ErrorCode is a closed set', () => {
    const validCodes: ErrorCode[] = [
      'OUTSIDE_WORKSPACE', 'NOT_FOUND', 'CONFLICT', 'PERMISSION',
      'LOCKED', 'TOO_LARGE', 'NOT_TEXT', 'TRASH_UNAVAILABLE',
      'NO_WORKSPACE', 'IO'
    ]
    expect(validCodes.length).toBe(10)
  })

  it('DirEntry shapes are correct', () => {
    const file: DirEntry = { path: 'docs/readme.md', name: 'readme.md', kind: 'file' }
    const dir: DirEntry = { path: 'docs', name: 'docs', kind: 'directory' }

    expect(file.kind).toBe('file')
    expect(dir.kind).toBe('directory')
  })

  it('OpenedFile has optional path for workspace-external files', () => {
    const external: OpenedFile = {
      path: null,
      name: 'external.md',
      content: '# External',
      mtimeMs: 1000,
      size: 10
    }
    expect(external.path).toBeNull()
  })

  it('WriteReceipt has mtime and size', () => {
    const receipt: WriteReceipt = { mtimeMs: 1000, size: 42 }
    expect(receipt.size).toBe(42)
  })

  it('TrashReceipt reports trash status', () => {
    const trashed: TrashReceipt = { trashed: true }
    const permanent: TrashReceipt = { trashed: false }
    expect(trashed.trashed).toBe(true)
    expect(permanent.trashed).toBe(false)
  })

  it('WorkspaceInfo contains name and entries', () => {
    const info: WorkspaceInfo = {
      name: 'my-workspace',
      entries: [{ path: 'readme.md', name: 'readme.md', kind: 'file' }]
    }
    expect(info.name).toBe('my-workspace')
    expect(info.entries.length).toBe(1)
  })
})
