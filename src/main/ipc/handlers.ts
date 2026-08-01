import { dialog, ipcMain, shell, app, BrowserWindow } from 'electron'
import { resolveWithinRoot } from '../fs/paths'
import { readDir, readFile } from '../fs/read'
import { writeFile } from '../fs/write'
import { mkdir, createFile, moveEntry, trashEntry } from '../fs/mutate'
import { loadSettings, saveSettings } from '../settings'
import type {
  Result, WorkspaceInfo, DirEntry, OpenedFile,
  WriteReceipt, TrashReceipt, Settings, EntryKind
} from '../../shared/ipc-contract'

let workspaceRoot: string | null = null
let workspaceName: string | null = null

function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

import type { ErrorCode } from '../../shared/ipc-contract'

function err(code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code, message }
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
      if (code) return err(code, e.message)
    }
    return err('IO', e instanceof Error ? e.message : 'Unknown error')
  }
}

export function setupHandlers(): void {
  ipcMain.handle('workspace:openDialog', async (): Promise<Result<WorkspaceInfo | null>> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return ok(null)
      }

      const rootPath = result.filePaths[0]
      workspaceRoot = rootPath
      workspaceName = rootPath.split(/[/\\]/).pop() || rootPath

      const entries = readDir(rootPath, '')

      return ok({
        name: workspaceName,
        entries
      })
    } catch (e: unknown) {
      return err('IO', e instanceof Error ? e.message : 'Failed to open folder')
    }
  })

  ipcMain.handle('workspace:readDir', (_e, args: { path: string }): Result<DirEntry[]> => {
    return withWorkspace(() => readDir(workspaceRoot!, args.path))
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
        try {
          const { resolved, relative } = resolveWithinRoot(workspaceRoot, filePath)
          const opened = readFile(workspaceRoot, relative)
          return ok(opened)
        } catch {
          // File is outside workspace, open without workspace context
        }
      }

      const fs = await import('fs')
      const path = await import('path')
      const buffer = fs.readFileSync(filePath)

      let content: string
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true })
        decoder.decode(buffer)
        content = buffer.toString('utf-8')
      } catch {
        return err('NOT_TEXT', 'File is not valid UTF-8 text')
      }

      return ok({
        path: null,
        name: path.basename(filePath),
        content,
        mtimeMs: fs.statSync(filePath).mtimeMs,
        size: fs.statSync(filePath).size
      })
    } catch (e: unknown) {
      return err('IO', e instanceof Error ? e.message : 'Failed to open file')
    }
  })

  ipcMain.handle('file:read', (_e, args: { path: string }): Result<OpenedFile> => {
    return withWorkspace(() => readFile(workspaceRoot!, args.path))
  })

  ipcMain.handle('file:write', (_e, args: { path: string; content: string }): Result<WriteReceipt> => {
    return withWorkspace(() => writeFile(workspaceRoot!, args.path, args.content))
  })

  ipcMain.handle('file:saveDialog', async (_e, args: { suggestedName: string; content: string }): Promise<Result<OpenedFile | null>> => {
    try {
      const result = await dialog.showSaveDialog({
        defaultPath: args.suggestedName,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      })

      if (result.canceled || !result.filePath) {
        return ok(null)
      }

      const fs = await import('fs')
      fs.writeFileSync(result.filePath, args.content, 'utf-8')
      const stat = fs.statSync(result.filePath)

      return ok({
        path: null,
        name: result.filePath.split(/[/\\]/).pop() || args.suggestedName,
        content: args.content,
        mtimeMs: stat.mtimeMs,
        size: stat.size
      })
    } catch (e: unknown) {
      return err('IO', e instanceof Error ? e.message : 'Failed to save file')
    }
  })

  ipcMain.handle('entry:create', (_e, args: { parentPath: string; name: string; kind: EntryKind }): Result<DirEntry> => {
    return withWorkspace(() => {
      if (args.kind === 'directory') {
        return mkdir(workspaceRoot!, args.parentPath, args.name)
      }
      return createFile(workspaceRoot!, args.parentPath, args.name)
    })
  })

  ipcMain.handle('entry:move', (_e, args: { fromPath: string; toPath: string }): Result<DirEntry> => {
    return withWorkspace(() => moveEntry(workspaceRoot!, args.fromPath, args.toPath))
  })

  ipcMain.handle('entry:trash', async (_e, args: { path: string; permanent?: boolean }): Promise<Result<TrashReceipt>> => {
    if (!workspaceRoot) {
      return err('NO_WORKSPACE', 'No workspace is open')
    }
    try {
      const receipt = await trashEntry(workspaceRoot, args.path, args.permanent)
      return ok(receipt)
    } catch (e: unknown) {
      if (e instanceof Error) {
        const code = (e as { code?: ErrorCode }).code
        if (code) return err(code, e.message)
      }
      return err('IO', e instanceof Error ? e.message : 'Unknown error')
    }
  })

  ipcMain.handle('settings:get', (): Result<Settings> => {
    try {
      return ok(loadSettings())
    } catch (e: unknown) {
      return ok({ sidebarWidth: 260, themeOverride: null })
    }
  })

  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>): Result<Settings> => {
    try {
      const current = loadSettings()
      const updated = { ...current, ...patch }
      saveSettings(updated)
      return ok(updated)
    } catch (e: unknown) {
      return err('IO', e instanceof Error ? e.message : 'Failed to save settings')
    }
  })

  let quitCallback: (() => void) | null = null

  ipcMain.handle('quit:respond', (_e, args: { decision: 'quit' | 'cancel' }) => {
    if (args.decision === 'quit') {
      app.exit(0)
    }
  })
}
