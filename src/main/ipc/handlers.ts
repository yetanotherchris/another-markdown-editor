import { dialog, ipcMain, app } from 'electron'
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
  WriteReceipt, TrashReceipt, Settings, EntryKind, ErrorCode
} from '../../shared/ipc-contract'

let workspaceState: WorkspaceState | null = null
let workspaceRoot: string | null = null
let workspaceName: string | null = null

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
    msg = msg.replace(new RegExp(workspaceRootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '<workspace>')
  }
  return msg
}

function ensureString(val: unknown, name: string): asserts val is string {
  if (typeof val !== 'string') {
    throw Object.assign(new Error(`${name} must be a string`), { code: 'IO' as ErrorCode })
  }
}

function withWorkspace<T>(fn: () => T): Result<T> {
  if (!workspaceRoot) {
    return err('NO_WORKSPACE', 'No workspace is open')
  }
  try {
    return ok(fn())
  } catch (e: unknown) {
    if (e instanceof Error) {
      const code = (e as { code?: ErrorCode }).code
      if (code) return err(code, sanitizeError(e, workspaceRoot))
    }
    return err('IO', e instanceof Error ? sanitizeError(e, workspaceRoot) : 'Unknown error')
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

export function getWorkspaceState(): WorkspaceState | null {
  return workspaceState
}

export function getWorkspaceRoot(): string | null {
  return workspaceRoot
}

export function setupHandlers(sendToRenderer: (channel: string, ...args: unknown[]) => void): void {
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

      workspaceState = new WorkspaceState(
        (entries) => sendToRenderer('workspace:changed', entries),
        (e) => sendToRenderer('document:externallyChanged', e)
      )
      workspaceState.open(realRootPath)

      const entries = readDir(realRootPath, '.')

      return ok({
        name: workspaceName,
        entries
      })
    } catch (e: unknown) {
      workspaceRoot = null
      workspaceName = null
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
      if (e instanceof Error && 'code' in e) return err((e as { code: ErrorCode }).code, e.message)
      return err('IO', sanitizeError(e, workspaceRoot))
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
        const decoder = new TextDecoder('utf-8', { fatal: true })
        decoder.decode(buffer)
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
      if (e instanceof Error && 'code' in e) return err((e as { code: ErrorCode }).code, e.message)
      return err('IO', sanitizeError(e, workspaceRoot))
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
      if (e instanceof Error && 'code' in e) return err((e as { code: ErrorCode }).code, e.message)
      return err('IO', sanitizeError(e, workspaceRoot))
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
      const { parentPath, name, kind } = args as { parentPath: string; name: string; kind: EntryKind }

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
      if (e instanceof Error && 'code' in e) return err((e as { code: ErrorCode }).code, e.message)
      return err('IO', sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('entry:move', (_e, args: unknown): Result<DirEntry> => {
    try {
      validateShape(args, ['fromPath', 'toPath'])
      return withWorkspace(() => moveEntry(workspaceRoot!, (args as { fromPath: string }).fromPath, (args as { toPath: string }).toPath))
    } catch (e: unknown) {
      if (e instanceof Error && 'code' in e) return err((e as { code: ErrorCode }).code, e.message)
      return err('IO', sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('entry:trash', async (_e, args: unknown): Promise<Result<TrashReceipt>> => {
    try {
      validateShape(args, ['path'])
      const { path: p, permanent } = args as { path: string; permanent?: boolean }

      if (permanent === undefined) {
        // Require explicit confirmation
      }

      if (!workspaceRoot) return err('NO_WORKSPACE', 'No workspace is open')
      const receipt = await trashEntry(workspaceRoot, p, permanent)
      return ok(receipt)
    } catch (e: unknown) {
      if (e instanceof Error) {
        const code = (e as { code?: ErrorCode }).code
        if (code) return err(code, e.message)
      }
      return err('IO', sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('settings:get', (): Result<Settings> => {
    try {
      return ok(loadSettings())
    } catch {
      return ok({ sidebarWidth: 260, themeOverride: null })
    }
  })

  ipcMain.handle('settings:update', (_e, patch: unknown): Result<Settings> => {
    try {
      const current = loadSettings()
      const updated = { ...current, ...(patch as Partial<Settings>) }
      saveSettings(updated)
      return ok(updated)
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, null))
    }
  })

  ipcMain.handle('quit:respond', (_e, args: unknown) => {
    const decision = (args as { decision: string })?.decision
    if (decision === 'quit') {
      app.exit(0)
    }
  })
}
