import { BrowserWindow, ipcMain } from 'electron'
import type { Result } from '../../../shared/ipc-contract'
import { err, ok, ctx } from './context'

/**
 * App lifecycle channels (US1/FR-005): the quit/close guard and the devtools
 * toggle. `setupWindowCloseHandler` owns the `allowClose` flag — it is the only
 * path that may arm it, so a dirty document is never discarded silently.
 */
export function registerAppHandlers(window: BrowserWindow, _ctx: typeof ctx): void {
  setupWindowCloseHandler(window)

  // Request a quit through the normal window-close flow (research R4): the
  // close handler sends `app:quitRequested`, the renderer flushes and prompts
  // for unsaved changes, then calls confirmQuit. Never call app.quit() here.
  // Crucially this must NOT arm `allowClose`: the close handler has to
  // intercept first (review 2026-08-06) so a dirty document is never discarded
  // silently — `quit:respond` (the renderer's confirmation) re-enters
  // `tryCloseWindow()`, which is the only path allowed to set `allowClose`.
  ipcMain.handle('app:requestQuit', (event): Result<null> => {
    if (event.sender !== window.webContents) return err('IO', 'Unauthorized renderer')
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      windows[0].close()
    }
    return ok(null)
  })

  ipcMain.handle('devtools:toggle', (event): Result<null> => {
    if (event.sender !== window.webContents) return err('IO', 'Unauthorized renderer')
    window.webContents.toggleDevTools()
    return ok(null)
  })

  ipcMain.handle('quit:respond', (event, args: unknown): Result<null> => {
    if (event.sender !== window.webContents) return err('IO', 'Unauthorized renderer')
    if (!args || typeof args !== 'object' || !('decision' in args)) {
      return err('IO', 'Invalid quit response')
    }
    const decision = (args as { decision: unknown }).decision
    if (decision !== 'quit' && decision !== 'cancel') {
      return err('IO', 'Invalid quit decision')
    }
    if (!ctx.quitRequestPending) {
      return err('IO', 'No quit request is pending')
    }
    ctx.quitRequestPending = false
    if (decision === 'quit') tryCloseWindow()
    return ok(null)
  })
}

function tryCloseWindow(): void {
  ctx.allowClose = true
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    windows[0].close()
  }
}

function setupWindowCloseHandler(window: BrowserWindow): void {
  window.on('close', (e) => {
    if (ctx.allowClose) return
    ctx.quitRequestPending = true
    e.preventDefault()
    window.webContents.send('app:quitRequested')
  })
}
