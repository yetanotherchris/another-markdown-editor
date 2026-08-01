import { dialog, ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { resolveWithinRoot } from '../fs/paths'
import { readDir, readFile } from '../fs/read'
import { writeFile } from '../fs/write'
import { mkdir, createFile, moveEntry, trashEntry } from '../fs/mutate'
import { loadSettings, saveSettings } from '../settings'
import { WorkspaceState } from '../workspace'
import type {
  Result, WorkspaceInfo, DirEntry, OpenedFile,
  WriteReceipt, TrashReceipt, Settings, EntryKind, ErrorCode,
  WatchEvent
} from '../../shared/ipc-contract'

let workspaceState: WorkspaceState | null = null
let workspaceRoot: string | null = null
let workspaceName: string | null = null
let allowClose = false

function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

function err(code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code, message }
}

function sanitizeError(e: unknown, workspaceRootPath: string | null): string {
  if (!(e instanceof Error)) return 'Unknown error'
  let msg = e.message
  if (workspaceRootPath) {
    msg = msg.replace(
      new RegExp(workspaceRootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      '<workspace>'
    )
  }
  return msg
}

function toAppError(e: unknown): { code: ErrorCode; message: string } {
  if (!(e instanceof Error)) return { code: 'IO', message: 'Unknown error' }
  const errno = (e as NodeJS.ErrnoException).code
  if (errno === 'ENOENT') return { code: 'NOT_FOUND', message: 'File or directory not found' }
  if (errno === 'EACCES' || errno === 'EPERM') return { code: 'PERMISSION', message: 'Permission denied' }
  if (errno === 'EEXIST') return { code: 'CONFLICT', message: 'Already exists' }
  const appCode = (e as { code?: ErrorCode }).code
  if (appCode) return { code: appCode, message: e.message }
  return { code: 'IO', message: e.message }
}

function ensureString(val: unknown, name: string): asserts val is string {
  if (typeof val !== 'string') {
    throw Object.assign(new Error(`${name} must be a string`), { code: 'IO' as ErrorCode })
  }
}

function validateKind(val: unknown): asserts val is EntryKind {
  if (val !== 'file' && val !== 'directory') {
    throw Object.assign(new Error('kind must be "file" or "directory"'), { code: 'IO' as ErrorCode })
  }
}

function withWorkspace<T>(fn: () => T): Result<T> {
  if (!workspaceRoot) {
    return err('NO_WORKSPACE', 'No workspace is open')
  }
  try {
    return ok(fn())
  } catch (e: unknown) {
    const appErr = toAppError(e)
    return err(appErr.code, sanitizeError(e, workspaceRoot))
  }
}

function resolveAbsolutePath(root: string, absolutePath: string): string | null {
  try {
    const realFile = fs.realpathSync(absolutePath)
    const relative = path.relative(root, realFile)
    const segments = relative.split(path.sep)
    if (!relative || segments[0] === '..' || path.isAbsolute(relative)) {
      return null
    }
    return relative.split(path.sep).join('/')
  } catch {
    return null
  }
}

function atomicWriteAbsolute(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const randomSuffix = crypto.randomBytes(6).toString('hex')
  const tempPath = path.join(dir, `.${base}.tmp-${randomSuffix}`)

  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf-8', flag: 'wx' })
    const fd = fs.openSync(tempPath, 'r+')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fs.renameSync(tempPath, filePath)
  } catch (e: unknown) {
    try { fs.unlinkSync(tempPath) } catch { /* cleanup */ }
    throw e
  }
}

function validateShape(obj: unknown, requiredKeys: string[]): void {
  if (!obj || typeof obj !== 'object') {
    throw Object.assign(new Error('Invalid IPC request: expected an object'), { code: 'IO' as ErrorCode })
  }
  for (const key of requiredKeys) {
    if (!(key in (obj as Record<string, unknown>))) {
      throw Object.assign(new Error(`Missing required field: ${key}`), { code: 'IO' as ErrorCode })
    }
  }
}

function tryCloseWindow(): void {
  allowClose = true
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    windows[0].close()
  }
}

function setupWindowCloseHandler(window: BrowserWindow): void {
  window.on('close', (e) => {
    if (allowClose) return
    e.preventDefault()
    window.webContents.send('app:quitRequested')
  })
}

export function getWorkspaceState(): WorkspaceState | null {
  return workspaceState
}

export function getWorkspaceRoot(): string | null {
  return workspaceRoot
}

export function setupHandlers(window: BrowserWindow): void {
  setupWindowCloseHandler(window)

  ipcMain.handle('workspace:openDialog', async (): Promise<Result<WorkspaceInfo | null>> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return ok(null)
      }

      const rootPath = result.filePaths[0]
      const realRootPath = fs.realpathSync(rootPath)

      workspaceRoot = realRootPath
      workspaceName = path.basename(realRootPath) || realRootPath

      workspaceState?.close()
      workspaceState = new WorkspaceState(
        (e: WatchEvent) => window.webContents.send('workspace:changed', e),
        (e) => window.webContents.send('document:externallyChanged', e)
      )
      workspaceState.open(realRootPath)

      const entries = workspaceState.getEntries('.')
      return ok({ name: workspaceName, entries })
    } catch (e: unknown) {
      workspaceRoot = null
      workspaceName = null
      workspaceState?.close()
      workspaceState = null
      return err('IO', sanitizeError(e, null))
    }
  })

  ipcMain.handle('workspace:readDir', (_e, args: unknown): Result<DirEntry[]> => {
    try {
      validateShape(args, ['path'])
      ensureString((args as { path: unknown }).path, 'path')
      return withWorkspace(() => readDir(workspaceRoot!, (args as { path: string }).path))
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('file:openDialog', async (): Promise<Result<OpenedFile | null>> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return ok(null)
      }

      const filePath = result.filePaths[0]

      if (workspaceRoot) {
        const relativePath = resolveAbsolutePath(workspaceRoot, filePath)
        if (relativePath) {
          const opened = readFile(workspaceRoot, relativePath)
          return ok(opened)
        }
      }

      const buffer = fs.readFileSync(filePath)

      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      } catch {
        return err('NOT_TEXT', 'File is not valid UTF-8 text')
      }

      return ok({
        path: null,
        name: path.basename(filePath),
        content: buffer.toString('utf-8'),
        mtimeMs: fs.statSync(filePath).mtimeMs,
        size: fs.statSync(filePath).size
      })
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, null))
    }
  })

  ipcMain.handle('file:read', (_e, args: unknown): Result<OpenedFile> => {
    try {
      validateShape(args, ['path'])
      ensureString((args as { path: unknown }).path, 'path')
      return withWorkspace(() => readFile(workspaceRoot!, (args as { path: string }).path))
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('file:write', (_e, args: unknown): Result<WriteReceipt> => {
    try {
      validateShape(args, ['path', 'content'])
      ensureString((args as { path: unknown }).path, 'path')
      ensureString((args as { content: unknown }).content, 'content')

      if (!workspaceRoot) return err('NO_WORKSPACE', 'No workspace is open')

      const resolved = resolveWithinRoot(workspaceRoot, (args as { path: string }).path)
      workspaceState?.suppressWatch(resolved.resolved)

      const receipt = writeFile(workspaceRoot, (args as { path: string }).path, (args as { content: string }).content)
      return ok(receipt)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('file:saveDialog', async (_e, args: unknown): Promise<Result<OpenedFile | null>> => {
    try {
      validateShape(args, ['suggestedName', 'content'])
      const { suggestedName, content } = args as { suggestedName: string; content: string }

      const result = await dialog.showSaveDialog({
        defaultPath: suggestedName,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      })

      if (result.canceled || !result.filePath) {
        return ok(null)
      }

      atomicWriteAbsolute(result.filePath, content)
      const stat = fs.statSync(result.filePath)

      let relPath: string | null = null
      if (workspaceRoot) {
        relPath = resolveAbsolutePath(workspaceRoot, result.filePath)
      }

      return ok({
        path: relPath,
        name: path.basename(result.filePath),
        content,
        mtimeMs: stat.mtimeMs,
        size: stat.size
      })
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('entry:create', (_e, args: unknown): Result<DirEntry> => {
    try {
      validateShape(args, ['parentPath', 'name', 'kind'])
      const { parentPath, name, kind } = args as { parentPath: string; name: string; kind: unknown }
      ensureString(parentPath, 'parentPath')
      ensureString(name, 'name')
      validateKind(kind)

      if (name.includes('/') || name.includes('\\') || name === '..') {
        return err('IO', 'Invalid entry name')
      }

      return withWorkspace(() => {
        if (kind === 'directory') {
          return mkdir(workspaceRoot!, parentPath, name)
        }
        return createFile(workspaceRoot!, parentPath, name)
      })
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('entry:move', (_e, args: unknown): Result<DirEntry> => {
    try {
      validateShape(args, ['fromPath', 'toPath'])
      const { fromPath, toPath } = args as { fromPath: string; toPath: string }
      ensureString(fromPath, 'fromPath')
      ensureString(toPath, 'toPath')
      return withWorkspace(() => moveEntry(workspaceRoot!, fromPath, toPath))
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('entry:trash', async (_e, args: unknown): Promise<Result<TrashReceipt>> => {
    try {
      validateShape(args, ['path'])
      const { path: p, permanent } = args as { path: string; permanent?: unknown }

      if (typeof permanent === 'string') {
        return err('IO', 'permanent must be a boolean')
      }

      if (!workspaceRoot) return err('NO_WORKSPACE', 'No workspace is open')
      const receipt = await trashEntry(workspaceRoot, p, permanent as boolean | undefined)
      return ok(receipt)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('settings:get', (): Result<Settings> => {
    try {
      return ok(loadSettings())
    } catch {
      return ok({ sidebarWidth: 30, themeOverride: null })
    }
  })

  ipcMain.handle('settings:update', (_e, patch: unknown): Result<Settings> => {
    try {
      const current = loadSettings()
      if (!patch || typeof patch !== 'object') {
        return err('IO', 'Settings must be an object')
      }
      const p = patch as Record<string, unknown>
      const updated: Settings = {
        sidebarWidth: typeof p.sidebarWidth === 'number' ? p.sidebarWidth : current.sidebarWidth,
        themeOverride: p.themeOverride === 'light' || p.themeOverride === 'dark' || p.themeOverride === null
          ? p.themeOverride as 'light' | 'dark' | null
          : current.themeOverride
      }
      saveSettings(updated)
      return ok(updated)
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, null))
    }
  })

  ipcMain.handle('quit:respond', (_e, args: unknown) => {
    const decision = (args as { decision: string })?.decision
    if (decision === 'quit') {
      tryCloseWindow()
    }
  })
}
