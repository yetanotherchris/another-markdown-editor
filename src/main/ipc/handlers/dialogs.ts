import { ipcMain } from 'electron'
import { showNativeConfirmation } from '../../dialogs'
import { validateNativeDialogRequest } from '../dialogValidation'
import type { Result, NativeDialogDecision } from '../../../shared/ipc-contract'
import { ctx, ok, err, sanitizeError, toAppError, isAuthorizedRenderer } from './context'

/**
 * Native dialog channel (US1/FR-005): `dialog:show` routes through the
 * electron-free validator, then the platform message box (spec 008).
 */
export function registerDialogHandlers(window: Electron.BrowserWindow, _ctx: typeof ctx): void {
  ipcMain.handle('dialog:show', async (event, args: unknown): Promise<Result<NativeDialogDecision>> => {
    if (!isAuthorizedRenderer(event, window)) return err('IO', 'Unauthorized renderer')
    try {
      const request = validateNativeDialogRequest(args)
      const decision = await showNativeConfirmation(window, request)
      return ok(decision)
    } catch (e: unknown) {
      const appErr = toAppError(e)
      return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
    }
  })
}
