import { BrowserWindow } from 'electron'
import { setupHandlers } from './handlers'

export function registerIpcHandlers(window: BrowserWindow): void {
  setupHandlers((channel: string, ...args: unknown[]) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, ...args)
    }
  })
}
