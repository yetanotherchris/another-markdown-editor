import { BrowserWindow } from 'electron'
import { scrubAbsolutePaths } from './scrubPaths'

/**
 * Quiet, non-fatal recent-items persistence warning (spec 004, FR-011). A
 * config write failure must never fail the open (or clear) it accompanies; the
 * failure is pushed to the renderer as a footer note instead.
 *
 * Shared by the IPC handlers (record/remove) and the native menu (Clear Recent
 * Items) so the message shape and the path-scrubbing stay in one place.
 */
export function reportRecentItemsWarning(e: unknown, action: 'save' | 'clear' = 'save'): void {
  const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!w || w.isDestroyed()) return
  const msg = e instanceof Error ? e.message : 'Unknown error'
  // Principle II: never leak an absolute path into a renderer-visible message.
  const scrubbed = scrubAbsolutePaths(msg)
  w.webContents.send('recentItems:warning', {
    message: `Recent Items could not be ${action === 'save' ? 'saved' : 'cleared'}: ${scrubbed}`
  })
}

/** A recent-items persistence write succeeded — the renderer clears its
 *  previous warning note so it does not linger after the cause has resolved. */
export function notifyRecentItemsOk(): void {
  const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!w || w.isDestroyed()) return
  w.webContents.send('recentItems:ok')
}
