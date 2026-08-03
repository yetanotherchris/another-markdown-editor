import { dialog, ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { resolveWithinRoot } from '../fs/paths'
import { readDir, readFile, describeEntry } from '../fs/read'
import { writeFile } from '../fs/write'
import { mkdir, createFile, moveEntry, trashEntry } from '../fs/mutate'
import { loadSettings, saveSettings } from '../settings'
import { WorkspaceState } from '../workspace'
import { loadRecentItems, saveRecentItems, recordRecentItem, removeRecentItem } from '../recentItems'
import { recentItemsConfigPath } from '../recentItemsPath'
import { refreshApplicationMenu } from '../menu'
import type {
  Result, WorkspaceInfo, DirEntry, OpenedFile,
  WriteReceipt, TrashReceipt, Settings, EntryKind, ErrorCode,
  WatchEvent, EntryInfo, RecentKind
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

  // ---- spec-004 recent items helpers ----

  // The renderer may only open a path main itself recorded (research R4):
  // the recent-open handlers re-validate against the persisted list before any
  // filesystem access.
  function isRecentEntry(path_: string, kind: RecentKind): boolean {
    return loadRecentItems(recentItemsConfigPath()).some(
      (i) => i.path === path_ && i.kind === kind
    )
  }

  function recordRecent(path_: string, kind: RecentKind, name: string): void {
    const configPath = recentItemsConfigPath()
    const items = loadRecentItems(configPath)
    saveRecentItems(configPath, recordRecentItem(items, {
      path: path_, kind, name, lastOpenedAt: Date.now()
    }))
    refreshApplicationMenu(window)
  }

  function removeRecent(path_: string, kind: RecentKind): void {
    const configPath = recentItemsConfigPath()
    const items = loadRecentItems(configPath)
    saveRecentItems(configPath, removeRecentItem(items, path_, kind))
    refreshApplicationMenu(window)
  }

  // Opens a file by absolute path, mirroring the dialog handler: when the file
  // sits inside the current workspace the response carries the workspace-
  // relative path and the parent is watched; otherwise the content is read
  // directly with a `path: null` response.
  function openFileFromPath(filePath: string): OpenedFile {
    if (workspaceRoot) {
      const relativePath = resolveAbsolutePath(workspaceRoot, filePath)
      if (relativePath) {
        const opened = readFile(workspaceRoot, relativePath)
        const parent = relativePath.includes('/')
          ? relativePath.split('/').slice(0, -1).join('/')
          : '.'
        workspaceState?.watchDir(parent)
        return opened
      }
    }

    const buffer = fs.readFileSync(filePath)

    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
      throw Object.assign(new Error('File is not valid UTF-8 text'), { code: 'NOT_TEXT' as ErrorCode })
    }

    return {
      path: null,
      name: path.basename(filePath),
      content: buffer.toString('utf-8'),
      mtimeMs: fs.statSync(filePath).mtimeMs,
      size: fs.statSync(filePath).size
    }
  }

  // Opens a folder as the workspace by absolute path, mirroring the dialog
  // handler. On failure the workspace state is reset and the error propagates
  // so the caller can classify it and drop a dead recent entry (FR-009).
  function openFolderFromPath(rootPath: string): WorkspaceInfo {
    try {
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
      return { path: workspaceRoot, name: workspaceName, entries }
    } catch (e: unknown) {
      workspaceRoot = null
      workspaceName = null
      workspaceState?.close()
      workspaceState = null
      throw e
    }
  }

  ipcMain.handle('workspace:openDialog', async (): Promise<Result<WorkspaceInfo | null>> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return ok(null)
      }

      const info = openFolderFromPath(result.filePaths[0])
      // FR-003: a folder successfully opened as a workspace is a recent folder.
      // Store the resolved realpath so reopen and containment agree (R4).
      recordRecent(workspaceRoot!, 'folder', path.basename(workspaceRoot!))
      return ok(info)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('workspace:readDir', (_e, args: unknown): Result<DirEntry[]> => {
    try {
      validateShape(args, ['path'])
      ensureString((args as { path: unknown }).path, 'path')
      return withWorkspace(() => {
        const entries = readDir(workspaceRoot!, (args as { path: string }).path)
        workspaceState?.watchDir((args as { path: string }).path)
        return entries
      })
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

      const opened = openFileFromPath(result.filePaths[0])
      // FR-002: a markdown file successfully opened through the File menu is a
      // recent file. FR-013: explorer opens use file:read and never record.
      recordRecent(opened.path ? path.resolve(workspaceRoot!, opened.path) : result.filePaths[0], 'file', opened.name)
      return ok(opened)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('recent:openFile', (_e, args: unknown): Result<OpenedFile> => {
    try {
      validateShape(args, ['path'])
      ensureString((args as { path: unknown }).path, 'path')
      const requestedPath = (args as { path: string }).path

      // Research R4: only open a path main itself recorded. Rejecting here
      // keeps the renderer unable to read arbitrary paths through this channel.
      if (!isRecentEntry(requestedPath, 'file')) {
        return err('OUTSIDE_WORKSPACE', 'Path is not a recorded recent file')
      }

      try {
        const opened = openFileFromPath(requestedPath)
        // FR-006: a successful reopen moves the entry to the front.
        recordRecent(opened.path ? path.resolve(workspaceRoot!, opened.path) : requestedPath, 'file', opened.name)
        return ok(opened)
      } catch (e: unknown) {
        // FR-009: the target is unavailable — drop the entry, then report.
        removeRecent(requestedPath, 'file')
        const appErr = toAppError(e)
        return err(appErr.code, sanitizeError(e, workspaceRoot))
      }
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('recent:openFolder', (_e, args: unknown): Result<WorkspaceInfo> => {
    try {
      validateShape(args, ['path'])
      ensureString((args as { path: unknown }).path, 'path')
      const requestedPath = (args as { path: string }).path

      if (!isRecentEntry(requestedPath, 'folder')) {
        return err('OUTSIDE_WORKSPACE', 'Path is not a recorded recent folder')
      }

      try {
        const info = openFolderFromPath(requestedPath)
        // FR-006: reopen moves the folder to the front (store the realpath).
        recordRecent(workspaceRoot!, 'folder', path.basename(workspaceRoot!))
        return ok(info)
      } catch (e: unknown) {
        // FR-009: unavailable — drop the entry, then report.
        removeRecent(requestedPath, 'folder')
        const appErr = toAppError(e)
        return err(appErr.code, sanitizeError(e, workspaceRoot))
      }
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('file:read', (_e, args: unknown): Result<OpenedFile> => {
    try {
      validateShape(args, ['path'])
      ensureString((args as { path: unknown }).path, 'path')
      return withWorkspace(() => {
        const opened = readFile(workspaceRoot!, (args as { path: string }).path)
        const parent = (args as { path: string }).path.includes('/')
          ? (args as { path: string }).path.split('/').slice(0, -1).join('/')
          : '.'
        workspaceState?.watchDir(parent)
        return opened
      })
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

      if (name.length === 0 || name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
        return err('IO', 'Invalid entry name')
      }

      return withWorkspace(() => {
        const entry = kind === 'directory'
          ? mkdir(workspaceRoot!, parentPath, name)
          : createFile(workspaceRoot!, parentPath, name)
        // FR-037: the creation is ours — suppress the watcher so the tree is
        // not double-fed the event (the renderer applies it directly).
        const resolved = resolveWithinRoot(workspaceRoot!, entry.path)
        workspaceState?.suppressWatch(resolved.resolved)
        return entry
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
      return withWorkspace(() => {
        // FR-037: suppress both endpoints (plus subtrees via prefix matching)
        // so a move/rename the user performed in the app is not reported back
        // as an external change to its own open documents. The canonical path
        // plus the lexical target cover case-only renames, where realpath
        // canonicalises the case and chokidar may report either spelling.
        const fromResolved = resolveWithinRoot(workspaceRoot!, fromPath)
        const toResolved = resolveWithinRoot(workspaceRoot!, toPath)
        workspaceState?.suppressWatch(fromResolved.resolved)
        workspaceState?.suppressWatch(toResolved.resolved)
        workspaceState?.suppressWatch(path.resolve(workspaceRoot!, toPath))
        return moveEntry(workspaceRoot!, fromPath, toPath)
      })
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('entry:trash', async (_e, args: unknown): Promise<Result<TrashReceipt>> => {
    try {
      validateShape(args, ['path'])
      const { path: p, permanent } = args as { path: string; permanent?: unknown }

      // The contract is `permanent?: boolean`. Any other value must be
      // rejected: a truthy non-boolean (e.g. `{}` or `1`) would otherwise
      // take the unrecoverable permanent-delete path past the renderer's
      // double confirmation.
      if (permanent !== undefined && typeof permanent !== 'boolean') {
        return err('IO', 'permanent must be a boolean')
      }

      if (!workspaceRoot) return err('NO_WORKSPACE', 'No workspace is open')
      const resolved = resolveWithinRoot(workspaceRoot, p)
      // FR-037: the deletion is ours — do not report it back as external.
      workspaceState?.suppressWatch(resolved.resolved)
      const receipt = await trashEntry(workspaceRoot, p, permanent)
      return ok(receipt)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('entry:describe', (_e, args: unknown): Result<EntryInfo> => {
    try {
      validateShape(args, ['path'])
      const { path: p } = args as { path: string }
      ensureString(p, 'path')
      return withWorkspace(() => describeEntry(workspaceRoot!, p))
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
