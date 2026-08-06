import { ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { resolveWithinRoot } from '../../fs/paths'
import { readFile, describeEntry } from '../../fs/read'
import { writeFile } from '../../fs/write'
import { atomicWrite } from '../../fs/atomicWrite'
import { mkdir, createFile, moveEntry, trashEntry } from '../../fs/mutate'
import type {
  Result, OpenedFile, WriteReceipt, DirEntry, TrashReceipt, EntryInfo
} from '../../../shared/ipc-contract'
import {
  ctx, ok, err, ensureString, validateKind, validateShape, sanitizeError, toAppError,
  withWorkspace, resolveAbsolutePath, recordRecent, canonicalPath, openFileFromPath
} from './context'

/**
 * File channels (US1/FR-005): open dialog, read, write, save dialog. Bodies
 * moved verbatim from the old handlers.ts.
 */
export function registerFileHandlers(_window: Electron.BrowserWindow, _ctx: typeof ctx): void {
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
        canonicalPath(opened.path ? path.resolve(ctx.workspaceRoot!, opened.path) : result.filePaths[0]),
        'file',
        opened.name
      )
      return ok(opened)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }
  })

  ipcMain.handle('file:read', (_e, args: unknown): Result<OpenedFile> => {
    try {
      validateShape(args, ['path'])
      ensureString((args as { path: unknown }).path, 'path')
      return withWorkspace(() => {
        const opened = readFile(ctx.workspaceRoot!, (args as { path: string }).path)
        const parent = (args as { path: string }).path.includes('/')
          ? (args as { path: string }).path.split('/').slice(0, -1).join('/')
          : '.'
        ctx.workspaceState?.watchDir(parent)
        return opened
      })
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }
  })

  ipcMain.handle('file:write', (_e, args: unknown): Result<WriteReceipt> => {
    try {
      validateShape(args, ['path', 'content'])
      ensureString((args as { path: unknown }).path, 'path')
      ensureString((args as { content: unknown }).content, 'content')

      if (!ctx.workspaceRoot) return err('NO_WORKSPACE', 'No workspace is open')

      const resolved = resolveWithinRoot(ctx.workspaceRoot, (args as { path: string }).path)
      ctx.workspaceState?.suppressWatch(resolved.resolved)

      const receipt = writeFile(ctx.workspaceRoot, (args as { path: string }).path, (args as { content: string }).content)
      return ok(receipt)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
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
      if (ctx.workspaceRoot) {
        relPath = resolveAbsolutePath(ctx.workspaceRoot, result.filePath)
      }

      return ok({
        path: relPath,
        name: path.basename(result.filePath),
        content,
        mtimeMs: stat.mtimeMs,
        size: stat.size
      })
    } catch (e: unknown) {
      return err('IO', sanitizeError(e, ctx.workspaceRoot))
    }
  })

  // ---- entry:* channels (create/move/trash/describe) ----

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
          ? mkdir(ctx.workspaceRoot!, parentPath, name)
          : createFile(ctx.workspaceRoot!, parentPath, name)
        // FR-037: the creation is ours — suppress the watcher so the tree is
        // not double-fed the event (the renderer applies it directly).
        const resolved = resolveWithinRoot(ctx.workspaceRoot!, entry.path)
        ctx.workspaceState?.suppressWatch(resolved.resolved)
        return entry
      })
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
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
        const fromResolved = resolveWithinRoot(ctx.workspaceRoot!, fromPath)
        const toResolved = resolveWithinRoot(ctx.workspaceRoot!, toPath)
        ctx.workspaceState?.suppressWatch(fromResolved.resolved)
        ctx.workspaceState?.suppressWatch(toResolved.resolved)
        ctx.workspaceState?.suppressWatch(path.resolve(ctx.workspaceRoot!, toPath))
        return moveEntry(ctx.workspaceRoot!, fromPath, toPath)
      })
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
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

      if (!ctx.workspaceRoot) return err('NO_WORKSPACE', 'No workspace is open')
      const resolved = resolveWithinRoot(ctx.workspaceRoot, p)
      // FR-037: the deletion is ours — do not report it back as external.
      ctx.workspaceState?.suppressWatch(resolved.resolved)
      const receipt = await trashEntry(ctx.workspaceRoot, p, permanent)
      return ok(receipt)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }
  })

  ipcMain.handle('entry:describe', (_e, args: unknown): Result<EntryInfo> => {
    try {
      validateShape(args, ['path'])
      const { path: p } = args as { path: string }
      ensureString(p, 'path')
      return withWorkspace(() => describeEntry(ctx.workspaceRoot!, p))
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }
  })
}
