import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc/register'
import { createApplicationMenu } from './menu'
import { registerShortcuts } from './shortcuts'
import { loadSettings, flushSettings } from './settings'
import { applyThemeOverride } from './theme'
import { applySpellcheckSetting } from './spellcheck'
import { registerSpellcheckContextMenu } from './contextMenu'
import { resolveLaunchBounds, trackWindowState, flushWindowState } from './windowState'
import { reconcileExplorerClosedWithoutWorkspace } from './workspaceExplorerState'

// Spec 020 test seam (research R6): `AME_USER_DATA_DIR` relocates the Chromium
// profile — the home of the native spellcheck dictionary — so the e2e suite can
// isolate its profile per test and never pollute the developer's real
// dictionary. Must run before the app is ready (the session is created during
// window setup). Production never sets it.
if (process.env.AME_USER_DATA_DIR) {
  app.setPath('userData', process.env.AME_USER_DATA_DIR)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Spec 011 FR-001/FR-005: restore the saved position/size (clamped to the
  // available displays) and re-apply a maximized window.
  const { bounds, isMaximized } = resolveLaunchBounds()
  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js')
    }
  })
  // Spec 011 FR-005 (review #30 M1): maximize after the window is ready to be
  // shown — on Linux/X11 a maximize issued before the window is realized can be
  // a no-op, and showing the maximized window avoids a normal-bounds flash.
  mainWindow.once('ready-to-show', () => {
    if (isMaximized) mainWindow?.maximize()
    mainWindow?.show()
  })
  trackWindowState(mainWindow)

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
  // Spec 020 FR-002/FR-004: the native right-click correction menu for the
  // editor area (spelling suggestions + add-to-dictionary).
  registerSpellcheckContextMenu(mainWindow)
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

app.whenReady().then(() => {
  // Spec 011 FR-013: with no folder open the explorer is closed and that
  // closed state is persisted. Runs before the window is created so the config
  // is already honest when the renderer loads it.
  reconcileExplorerClosedWithoutWorkspace()
  // Spec 013: resolve the persisted theme override onto nativeTheme BEFORE the
  // window is created, so the native chrome (macOS window frame, native
  // scrollbars/context menus) reflects the choice from the start. The renderer's
  // first paint is themed separately — main.tsx preloads the settings before
  // rendering (research R1: themeSource does not propagate to the renderer).
  applyThemeOverride(loadSettings().themeOverride)
  // Spec 020 FR-006/FR-009: apply the persisted spellcheck choice BEFORE the
  // window loads, so the first paint already honours it.
  applySpellcheckSetting(loadSettings().spellcheckEnabled, loadSettings().spellcheckLanguage)
  createWindow()
})

app.on('window-all-closed', () => {
  // Review #27: flush any pending debounced settings write before exit so a
  // font change made within the 500 ms window survives a fast quit (FR-006).
  flushSettings()
  // Spec 011 FR-002/FR-009: drain any pending window-state write too so the
  // last position/size survives a fast quit.
  flushWindowState()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
