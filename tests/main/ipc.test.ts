import { describe, it, expect } from 'vitest'
import type {
  Result, WorkspaceInfo, DirEntry, OpenedFile,
  WriteReceipt, TrashReceipt, ErrorCode, MenuCommand, RecentItem,
  DesktopApi, NativeDialogRequest, NativeDialogDecision
} from '../../src/shared/ipc-contract'

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

  it('WorkspaceInfo contains name, path and entries', () => {
    const info: WorkspaceInfo = {
      name: 'my-workspace',
      path: '/home/me/projects/my-workspace',
      entries: [{ path: 'readme.md', name: 'readme.md', kind: 'file' }]
    }
    expect(info.name).toBe('my-workspace')
    expect(info.path).toBe('/home/me/projects/my-workspace')
    expect(info.entries.length).toBe(1)
  })

  it('RecentItem carries an absolute path, kind, name and timestamp', () => {
    const file: RecentItem = { path: '/home/me/notes/a.md', kind: 'file', name: 'a.md', lastOpenedAt: 1000 }
    const folder: RecentItem = { path: '/home/me/notes', kind: 'folder', name: 'notes', lastOpenedAt: 2000 }
    expect(file.kind).toBe('file')
    expect(folder.kind).toBe('folder')
    expect(folder.lastOpenedAt).toBeGreaterThan(file.lastOpenedAt)
  })

  it('MenuCommand includes the open-recent object form', () => {
    const cmd: MenuCommand = { type: 'open-recent', path: '/home/me/notes/a.md', kind: 'file' }
    expect(cmd).toMatchObject({ type: 'open-recent' })
  })
})

describe('DesktopApi recent-items operations', () => {
  it('types the two-phase folder-open operations', () => {
    // Type-level: each assignment compiles only if DesktopApi exposes the
    // operation with the documented signature.
    const prepare: DesktopApi['prepareFolderOpen'] = () => Promise.resolve({ ok: true, value: null })
    const commit: DesktopApi['commitFolderOpen'] = () => Promise.resolve({ ok: false, code: 'NO_WORKSPACE', message: 'none' })
    const cancel: DesktopApi['cancelFolderOpen'] = () => Promise.resolve({ ok: true, value: null })
    expect(typeof prepare).toBe('function')
    expect(typeof commit).toBe('function')
    expect(typeof cancel).toBe('function')
  })

  it('types the recent-file open and the warning/ok events', () => {
    const open: DesktopApi['openRecentFile'] = () => Promise.resolve({ ok: false, code: 'NOT_FOUND', message: 'none' })
    const warn: DesktopApi['onRecentItemsWarning'] = () => () => {}
    const ok: DesktopApi['onRecentItemsOk'] = () => () => {}
    expect(typeof open).toBe('function')
    expect(typeof warn).toBe('function')
    expect(typeof ok).toBe('function')
  })
})

describe('DesktopApi native-dialog operations (spec 008)', () => {
  it('types every NativeDialogRequest member with the right fields', () => {
    const close: NativeDialogRequest = { kind: 'unsaved-close', documentTitle: 'a.md' }
    const quit: NativeDialogRequest = { kind: 'unsaved-quit', documentTitles: ['a.md', 'b.md'], error: 'Could not save a.md.' }
    const folder: NativeDialogRequest = { kind: 'folder-open', documentTitles: ['a.md'] }
    const changed: NativeDialogRequest = { kind: 'external-changed', documentTitle: 'a.md' }
    const removed: NativeDialogRequest = { kind: 'external-removed', documentTitle: 'a.md', error: 'Could not save a.md.' }
    const trash: NativeDialogRequest = { kind: 'delete-to-trash', targetName: 'b.md', detail: '', cleanToCloseTitles: ['a.md'] }
    const permanent: NativeDialogRequest = { kind: 'permanent-delete', targetName: 'b.md', detail: '', cleanToCloseTitles: [] }
    const blocked: NativeDialogRequest = { kind: 'delete-blocked', targetName: 'b.md', blockerTitles: ['a.md'] }
    const failed: NativeDialogRequest = { kind: 'operation-failed', message: 'File or directory not found' }
    const all = [close, quit, folder, changed, removed, trash, permanent, blocked, failed]
    expect(all).toHaveLength(9)
    expect(all.every(r => typeof r.kind === 'string')).toBe(true)
  })

  it('NativeDialogDecision is the closed set of 12', () => {
    const decisions: NativeDialogDecision[] = [
      'save', 'discard', 'save-all', 'discard-all',
      'keep', 'reload', 'ok', 'save-as',
      'delete', 'delete-permanent', 'acknowledge', 'cancel'
    ]
    expect(new Set(decisions).size).toBe(12)
  })

  it('types DesktopApi.showConfirmation', () => {
    const op: DesktopApi['showConfirmation'] = () => Promise.resolve({ ok: true, value: 'cancel' })
    const opErr: DesktopApi['showConfirmation'] = () => Promise.resolve({ ok: false, code: 'IO', message: 'none' })
    expect(typeof op).toBe('function')
    expect(typeof opErr).toBe('function')
  })
})
