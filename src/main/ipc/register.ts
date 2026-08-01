import { BrowserWindow } from 'electron'
import { setupHandlers } from './handlers'

let registered = false

export function registerIpcHandlers(window: BrowserWindow): void {
  if (!registered) {
    registered = true
    setupHandlers(window)
  }
}
