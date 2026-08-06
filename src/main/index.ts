import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc/register'
import { createApplicationMenu } from './menu'
import { registerShortcuts } from './shortcuts'
import { flushSettings } from './settings'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js')
    }
  })

  // Spec 010 FR-002: the native menu bar is replaced by the renderer hamburger.
  // Windows/Linux drop the bar entirely; macOS keeps only the OS-required
  // application/Edit roles (clarification 2026-08-05). The File/View
  // accelerators are re-registered on every platform (registerShortcuts).
  if (process.platform === 'darwin') {
    createApplicationMenu()
  } else {
    Menu.setApplicationMenu(null)
  }
  registerShortcuts(mainWindow)
  registerIpcHandlers(mainWindow)

  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    const url = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    mainWindow.loadURL(url)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  // Review #27: flush any pending debounced settings write before exit so a
  // font change made within the 500 ms window survives a fast quit (FR-006).
  flushSettings()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
