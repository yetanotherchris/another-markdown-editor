import { dialog, ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { resolveWithinRoot } from '../fs/paths'
import { readDir, readFile, describeEntry } from '../fs/read'
import { writeFile } from '../fs/write'
import { atomicWrite } from '../fs/atomicWrite'
import { mkdir, createFile, moveEntry, trashEntry } from '../fs/mutate'
import { loadSettings, saveSettings } from '../settings'
import { WorkspaceState } from '../workspace'
import { loadRecentItems, saveRecentItems, recordRecentItem, removeRecentItem } from '../recentItems'
import { recentItemsConfigPath } from '../recentItemsPath'
import { reportRecentItemsWarning, notifyRecentItemsOk } from '../recentItemsWarning'
import { scrubAbsolutePaths } from '../scrubPaths'
import { refreshApplicationMenu } from '../menu'
import { showNativeConfirmation } from '../dialogs'
import { validateNativeDialogRequest } from './dialogValidation'
import type {
  Result, WorkspaceInfo, DirEntry, OpenedFile,
  WriteReceipt, TrashReceipt, Settings, EntryKind, ErrorCode,
  WatchEvent, EntryInfo, RecentKind, NativeDialogDecision
} from '../../shared/ipc-contract'

let workspaceState: WorkspaceState | null = null
let workspaceRoot: string | null = null
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
  // Principle II: NEVER leak an absolute path into a renderer-visible error —
  // run the absolute-path scrub unconditionally. With a workspace open only
  // the CURRENT root is otherwise scrubbed, so a failure while preparing a
  // dialog-chosen folder or committing a recent folder located elsewhere
  // (EACCES/ENOENT on `C:\Users\...\secret`) would pass the raw path through.
  return scrubAbsolutePaths(msg)
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

// Spec 008: a malformed dialog request fails closed — no dialog is shown
// (Principle II). Validation lives in dialogValidation.ts (electron-free, unit-
// tested) so the nine-kind whitelist and length caps are behaviorally pinned.

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

  // FR-011: a persistence failure must NEVER fail the open it follows
  // (FR-002/003) or delete a still-valid entry. Record/remove are best-effort —
  // on a save failure the in-memory list cannot be persisted, the failure is
  // reported quietly, and the open continues.
  function recordRecent(path_: string, kind: RecentKind, name: string): void {
    const configPath = recentItemsConfigPath()
    const items = loadRecentItems(configPath)
    try {
      saveRecentItems(configPath, recordRecentItem(items, {
        path: path_, kind, name, lastOpenedAt: Date.now()
      }))
      notifyRecentItemsOk()
    } catch (e: unknown) {
      reportRecentItemsWarning(e, 'save')
    }
    refreshApplicationMenu()
  }

  function removeRecent(path_: string, kind: RecentKind): void {
    const configPath = recentItemsConfigPath()
    const items = loadRecentItems(configPath)
    try {
      saveRecentItems(configPath, removeRecentItem(items, path_, kind))
      notifyRecentItemsOk()
    } catch (e: unknown) {
      reportRecentItemsWarning(e, 'save')
    }
    refreshApplicationMenu()
  }

  /** Realpath-canonical form of an absolute path for recording (FR-006: raw
   *  dialog spellings and realpath-resolved spellings of the same file must
   *  dedupe). Falls back to `path.resolve` when the target is already gone. */
  function canonicalPath(p: string): string {
    try {
      return fs.realpathSync(p)
    } catch {
      return path.resolve(p)
    }
  }

  // Opens a file by absolute path, mirroring the dialog handler: when the file
  // sits inside the current workspace the response carries the workspace-
  // relative path and the parent is watched; otherwise the content is read
  // directly with a `path: null` response.
  function openFileFromPath(filePath: string): OpenedFile {
    // Research R4 step 2: confirm the target still exists and has the right
    // type — a recorded 'file' whose path was replaced by a directory must not
    // be read as text (EISDIR would otherwise surface as a bare IO error).
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {
      throw Object.assign(new Error('Target is not a file'), { code: 'NOT_TEXT' as ErrorCode })
    }

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
      mtimeMs: stat.mtimeMs,
      size: stat.size
    }
  }

  // ---- spec-004 folder open is two-phase (FR-009/FR-010) ----

  // A folder open is split into *prepare* (validate the target and read its
  // entries WITHOUT touching the live workspace) and *commit* (swap the
  // workspace only once the renderer has confirmed). This is what makes
  // FR-009 ("leaves the current workspace and document session unchanged" when
  // the target cannot be opened) and FR-010 (the renderer's unsaved-work
  // confirmation cancels cleanly) actually hold: main never destroys the live
  // workspace unless and until the renderer commits.
  let pendingFolderOpen: { root: string; name: string; entries: DirEntry[] } | null = null

  ipcMain.handle('workspace:prepareFolderOpen', async (_e, args: unknown): Promise<Result<WorkspaceInfo | null>> => {
    let requestedPath: string | null = null
    let isRecentRequest = false
    try {
      // Single in-flight guard: while a prepared folder awaits the renderer's
      // confirm, a second prepare (toolbar button, native menu, or a
      // double-clicked recent folder) must NOT overwrite the slot — the first
      // flow's commit would otherwise swap to the second flow's folder, or the
      // second flow would error with "No folder open is pending". Reject the
      // new flow instead; the renderer surfaces the error in context.
      if (pendingFolderOpen) {
        return err('IO', 'A folder open is already in progress')
      }
      if (args !== undefined && args !== null) {
        validateShape(args, ['path'])
        ensureString((args as { path: unknown }).path, 'path')
        requestedPath = (args as { path: string }).path
        isRecentRequest = true
        // Research R4: only open a path main itself recorded.
        if (!isRecentEntry(requestedPath, 'folder')) {
          return err('OUTSIDE_WORKSPACE', 'Path is not a recorded recent folder')
        }
      } else {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory']
        })
        if (result.canceled || result.filePaths.length === 0) {
          return ok(null)
        }
        requestedPath = result.filePaths[0]
      }

      // Validate the target without committing it. readDir (not
      // WorkspaceState.getEntries, which swallows errors) is used so an
      // unreadable root throws here instead of masquerading as an empty
      // workspace (FR-009).
      const realRootPath = fs.realpathSync(requestedPath)
      if (!fs.statSync(realRootPath).isDirectory()) {
        throw Object.assign(new Error('Target is not a directory'), { code: 'NOT_FOUND' as ErrorCode })
      }
      const entries = readDir(realRootPath, '.')
      const name = path.basename(realRootPath) || realRootPath
      pendingFolderOpen = { root: realRootPath, name, entries }
      return ok({ path: realRootPath, name, entries })
    } catch (e: unknown) {
      pendingFolderOpen = null
      // FR-009: a recent folder that cannot be opened drops the dead entry.
      if (isRecentRequest && requestedPath !== null) {
        removeRecent(requestedPath, 'folder')
      }
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('workspace:commitFolderOpen', (): Result<WorkspaceInfo> => {
    const pending = pendingFolderOpen
    if (!pending) {
      return err('NO_WORKSPACE', 'No folder open is pending')
    }

    // FR-009: the prepare→commit window can outlive the target (the renderer's
    // unsaved-work confirmation may stay open arbitrarily long), so re-validate
    // the root here. chokidar reports a missing root via an async `error`
    // event, not a synchronous throw — without this check a folder deleted in
    // that window would silently commit to a dead workspace. A re-validation
    // failure PROVES the target unavailable, so the entry is dropped (FR-009).
    try {
      const real = fs.realpathSync(pending.root)
      if (!fs.statSync(real).isDirectory()) {
        throw Object.assign(new Error('Target is not a directory'), { code: 'NOT_FOUND' as ErrorCode })
      }
    } catch (e: unknown) {
      pendingFolderOpen = null
      removeRecent(pending.root, 'folder')
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }

    // Open into a local candidate: a watcher-start failure must destroy only
    // the candidate, never the live workspace (FR-009).
    let candidate: WorkspaceState | null = null
    try {
      candidate = new WorkspaceState(
        (e: WatchEvent) => window.webContents.send('workspace:changed', e),
        (e) => window.webContents.send('document:externallyChanged', e)
      )
      candidate.open(pending.root)

      workspaceState?.close()
      workspaceState = candidate
      candidate = null
      const root = pending.root
      const name = pending.name
      workspaceRoot = root
      pendingFolderOpen = null

      // FR-003/006: only a folder that was successfully opened is recorded /
      // bumped to the front. Best-effort (FR-011).
      recordRecent(root, 'folder', name)
      return ok({ path: root, name, entries: pending.entries })
    } catch (e: unknown) {
      candidate?.close()
      pendingFolderOpen = null
      // FR-009: a failure here (e.g. a watcher/environmental EMFILE/EPERM)
      // does NOT prove the folder invalid — the spec removes an entry only
      // after an attempted open proves it unavailable or invalid, so a still-
      // valid folder keeps its history entry. (The re-validation above is the
      // only place invalidity is proven in commit.)
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('workspace:cancelFolderOpen', (): Result<null> => {
    pendingFolderOpen = null
    return ok(null)
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
      // The stored path is realpath-canonical so a symlink/case spelling of an
      // already-recorded file does not duplicate the entry (FR-006).
      recordRecent(
        canonicalPath(opened.path ? path.resolve(workspaceRoot!, opened.path) : result.filePaths[0]),
        'file',
        opened.name
      )
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
        // FR-006: a successful reopen moves the entry to the front. The stored
        // path is canonical so reopen and first-open spellings agree (FR-006).
        recordRecent(
          canonicalPath(opened.path ? path.resolve(workspaceRoot!, opened.path) : requestedPath),
          'file',
          opened.name
        )
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

      atomicWrite(result.filePath, content)
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

  ipcMain.handle('dialog:show', async (_e, args: unknown): Promise<Result<NativeDialogDecision>> => {
    try {
      const request = validateNativeDialogRequest(args)
      const decision = await showNativeConfirmation(window, request)
      return ok(decision)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, workspaceRoot))
    }
  })

  ipcMain.handle('quit:respond', (_e, args: unknown) => {
    const decision = (args as { decision: string })?.decision
    if (decision === 'quit') {
      tryCloseWindow()
    }
  })
}
