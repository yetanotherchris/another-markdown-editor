import { ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { saveRecentItems, normalizeRecentItems } from '../../recentItems'
import { recentItemsConfigPath } from '../../recentItemsPath'
import { reportRecentItemsWarning, notifyRecentItemsOk } from '../../recentItemsWarning'
import type { Result, OpenedFile, RecentItem } from '../../../shared/ipc-contract'
import {
  ctx, ok, err, ensureString, validateShape, sanitizeError, toAppError,
  isRecentEntry, recordRecent, removeRecent, canonicalPath, openFileFromPath, isAuthorizedRenderer
} from './context'

/**
 * Recent Items channels (US1/FR-005): open a recorded file, list, clear.
 * Bodies moved verbatim from the old handlers.ts (spec 004 R4/FR-011/FR-012).
 */
export function registerRecentHandlers(window: Electron.BrowserWindow, _ctx: typeof ctx): void {
  ipcMain.handle('recent:openFile', (event, args: unknown): Result<OpenedFile> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
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
          canonicalPath(opened.path ? path.resolve(ctx.workspaceRoot!, opened.path) : requestedPath),
          'file',
          opened.name
        )
        return ok(opened)
      } catch (e: unknown) {
        // FR-009: the target is unavailable — drop the entry, then report.
        removeRecent(requestedPath, 'file')
        const appErr = toAppError(e)
        return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
      }
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }
  })

  ipcMain.handle('recent:list', (event): Result<RecentItem[]> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    const configPath = recentItemsConfigPath()
    try {
      // Strict read: a genuinely MISSING config (first run, or a cleared
      // history that never re-wrote) is an empty history; an unreadable or
      // broken config must surface as an error so the hamburger keeps offering
      // Clear Recent Items (FR-011) instead of claiming the history is empty.
      // Windows reports a file-as-parent as ENOENT, so probe the parent
      // directory's type BEFORE reading the file to tell the two apart.
      const dirStat = fs.statSync(path.dirname(configPath))
      if (!dirStat.isDirectory()) throw new Error('config parent is not a directory')
      return ok(normalizeRecentItems(JSON.parse(fs.readFileSync(configPath, 'utf-8'))))
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return ok([])
      return err('IO', 'Recent Items could not be loaded')
    }
  })

  // FR-011: clearing is best-effort like record/remove — on a persistence
  // failure the empty list cannot be saved, the failure is reported quietly,
  // and nothing else changes.
  ipcMain.handle('recent:clear', (event): Result<null> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    try {
      saveRecentItems(recentItemsConfigPath(), [])
      notifyRecentItemsOk()
    } catch (e: unknown) {
      reportRecentItemsWarning(e, 'clear')
    }
    return ok(null)
  })
}
