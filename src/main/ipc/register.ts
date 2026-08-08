import { BrowserWindow, ipcMain } from 'electron'
import { ctx } from './handlers/context'
import { registerAppHandlers } from './handlers/app'
import { registerFileHandlers } from './handlers/files'
import { registerWorkspaceHandlers } from './handlers/workspace'
import { registerDialogHandlers } from './handlers/dialogs'
import { registerSettingsHandlers } from './handlers/settings'
import { registerRecentHandlers } from './handlers/recent'
import { registerSpellcheckHandlers } from './handlers/spellcheck'

export function registerIpcHandlers(window: BrowserWindow, approvedRendererUrl: string): void {
  // Electron keeps handlers process-wide while macOS can recreate windows.
  // Remove the previous registrations before binding the current window so no
  // command closes over a destroyed BrowserWindow.
  for (const channel of [
    'app:requestQuit',
    'devtools:toggle',
    'quit:respond',
    'file:openDialog',
    'file:read',
    'file:write',
    'file:saveDialog',
    'entry:create',
    'entry:move',
    'entry:trash',
    'entry:describe',
    'entry:reveal',
    'workspace:prepareFolderOpen',
    'workspace:commitFolderOpen',
    'workspace:cancelFolderOpen',
    'workspace:readDir',
    'dialog:show',
    'settings:get',
    'settings:update',
    'recent:list',
    'recent:clear',
    'recent:openFile',
    'spellcheck:getWords',
    'spellcheck:addWord'
  ]) {
    ipcMain.removeHandler(channel)
  }
  ctx.allowClose = false
  ctx.quitRequestPending = false
  ctx.approvedRendererUrl = approvedRendererUrl
  // app first — it owns the window-close handler and the allowClose flag.
  registerAppHandlers(window, ctx)
  registerFileHandlers(window, ctx)
  registerWorkspaceHandlers(window, ctx)
  registerDialogHandlers(window, ctx)
  registerSettingsHandlers(window, ctx)
  registerRecentHandlers(window, ctx)
  registerSpellcheckHandlers(window, ctx)
}
