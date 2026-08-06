import { BrowserWindow } from 'electron'
import { ctx } from './handlers/context'
import { registerAppHandlers } from './handlers/app'
import { registerFileHandlers } from './handlers/files'
import { registerWorkspaceHandlers } from './handlers/workspace'
import { registerDialogHandlers } from './handlers/dialogs'
import { registerSettingsHandlers } from './handlers/settings'
import { registerRecentHandlers } from './handlers/recent'

let registered = false

export function registerIpcHandlers(window: BrowserWindow): void {
  if (registered) return
  registered = true
  // app first — it owns the window-close handler and the allowClose flag.
  registerAppHandlers(window, ctx)
  registerFileHandlers(window, ctx)
  registerWorkspaceHandlers(window, ctx)
  registerDialogHandlers(window, ctx)
  registerSettingsHandlers(window, ctx)
  registerRecentHandlers(window, ctx)
}
