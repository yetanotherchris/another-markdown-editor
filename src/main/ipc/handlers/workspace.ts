import { ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { readDir } from '../../fs/read'
import { WorkspaceState } from '../../workspace'
import type {
  Result,
  WorkspaceInfo,
  DirEntry,
  WatchEvent,
  DocumentChangeEvent
} from '../../../shared/ipc-contract'
import {
  ctx,
  ok,
  err,
  ensureString,
  validateShape,
  sanitizeError,
  toAppError,
  withWorkspace,
  isRecentEntry,
  recordRecent,
  removeRecent,
  isAuthorizedRenderer
} from './context'

/**
 * Workspace channels (US1/FR-005): the two-phase folder open (spec 004
 * FR-009/FR-010) and readDir. Bodies moved verbatim from the old handlers.ts.
 */
export function registerWorkspaceHandlers(window: Electron.BrowserWindow, _ctx: typeof ctx): void {
  // ---- spec-004 folder open is two-phase (FR-009/FR-010) ----

  // A folder open is split into *prepare* (validate the target and read its
  // entries WITHOUT touching the live workspace) and *commit* (swap the
  // workspace only once the renderer has confirmed). This is what makes
  // FR-009 ("leaves the current workspace and document session unchanged" when
  // the target cannot be opened) and FR-010 (the renderer's unsaved-work
  // confirmation cancels cleanly) actually hold: main never destroys the live
  // workspace unless and until the renderer commits.
  let pendingFolderOpen: {
    root: string
    name: string
    entries: DirEntry[]
    identity: { dev: number; ino: number }
  } | null = null

  ipcMain.handle(
    'workspace:prepareFolderOpen',
    async (event, args: unknown): Promise<Result<WorkspaceInfo | null>> => {
      if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
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
        const stat = fs.statSync(realRootPath)
        if (!stat.isDirectory()) {
          throw Object.assign(new Error('Target is not a directory'), {
            code: 'NOT_FOUND' as const
          })
        }
        const entries = readDir(realRootPath, '.')
        const name = path.basename(realRootPath) || realRootPath
        pendingFolderOpen = {
          root: realRootPath,
          name,
          entries,
          identity: { dev: stat.dev, ino: stat.ino }
        }
        return ok({ path: realRootPath, name, entries })
      } catch (e: unknown) {
        pendingFolderOpen = null
        // FR-009: a recent folder that cannot be opened drops the dead entry.
        if (isRecentRequest && requestedPath !== null) {
          removeRecent(requestedPath, 'folder')
        }
        const appErr = toAppError(e)
        return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
      }
    }
  )

  ipcMain.handle('workspace:commitFolderOpen', (event): Result<WorkspaceInfo> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
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
      if (real !== pending.root) {
        throw Object.assign(new Error('Workspace folder changed while opening'), {
          code: 'OUTSIDE_WORKSPACE' as const
        })
      }
      const stat = fs.statSync(real)
      if (!stat.isDirectory()) {
        throw Object.assign(new Error('Target is not a directory'), { code: 'NOT_FOUND' as const })
      }
      if (stat.dev !== pending.identity.dev || stat.ino !== pending.identity.ino) {
        throw Object.assign(new Error('Workspace folder changed while opening'), {
          code: 'OUTSIDE_WORKSPACE' as const
        })
      }
    } catch (e: unknown) {
      pendingFolderOpen = null
      removeRecent(pending.root, 'folder')
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }

    // Open into a local candidate: a watcher-start failure must destroy only
    // the candidate, never the live workspace (FR-009).
    let candidate: WorkspaceState | null = null
    try {
      candidate = new WorkspaceState(
        (e: WatchEvent) => window.webContents.send('workspace:changed', e),
        (e: DocumentChangeEvent) => window.webContents.send('document:externallyChanged', e)
      )
      candidate.open(pending.root)

      ctx.workspaceState?.close()
      ctx.workspaceState = candidate
      candidate = null
      const root = pending.root
      const name = pending.name
      ctx.workspaceRoot = root
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
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }
  })

  ipcMain.handle('workspace:cancelFolderOpen', (event): Result<null> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    pendingFolderOpen = null
    return ok(null)
  })

  ipcMain.handle('workspace:readDir', (event, args: unknown): Result<DirEntry[]> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    try {
      validateShape(args, ['path'])
      ensureString((args as { path: unknown }).path, 'path')
      return withWorkspace(() => {
        const entries = readDir(ctx.workspaceRoot!, (args as { path: string }).path)
        ctx.workspaceState?.watchDir((args as { path: string }).path)
        return entries
      })
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }
  })
}
