import { Menu, BrowserWindow, app } from 'electron'
import type { MenuCommand, RecentItem } from '../shared/ipc-contract'
import { loadRecentItems } from './recentItems'
import { recentItemsConfigPath } from './recentItemsPath'
import { shortenPath } from '../shared/shortenPath'

/** Character budget for a Recent Items menu label (spec 004 edge: long paths
 *  must remain unambiguous and selectable — shortenPath keeps the final
 *  segment whole). */
const RECENT_LABEL_MAX = 60

function recentItemLabel(item: RecentItem): string {
  const label = shortenPath(item.path, RECENT_LABEL_MAX)
  return item.kind === 'folder' ? `Folder: ${label}` : `File: ${label}`
}

function buildRecentItemsSubmenu(window: BrowserWindow): Electron.MenuItemConstructorOptions {
  const items = loadRecentItems(recentItemsConfigPath())
  const sendCommand = (command: MenuCommand) => {
    window.webContents.send('menu:command', command)
  }

  // Spec edge: an empty history is clearly indicated and offers no selectable
  // stale action (FR-001).
  if (items.length === 0) {
    return {
      label: 'Recent Items',
      submenu: [{ label: 'No Recent Items', enabled: false }]
    }
  }

  return {
    label: 'Recent Items',
    submenu: items.map((item) => ({
      label: recentItemLabel(item),
      click: () => sendCommand({ type: 'open-recent', path: item.path, kind: item.kind })
    }))
  }
}

export function createApplicationMenu(window: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  const sendCommand = (command: MenuCommand) => {
    window.webContents.send('menu:command', command)
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendCommand('open-file')
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendCommand('open-folder')
        },
        buildRecentItemsSubmenu(window),
        { type: 'separator' },
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendCommand('new-file')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendCommand('save')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendCommand('save-as')
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendCommand('close-tab')
        },
        { type: 'separator' },
        ...(isMac ? [] : [{ role: 'quit' as const }])
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/** Rebuild the application menu from current state (research R3). Called after
 *  any recent-items mutation so the Recent Items submenu stays in sync. */
export function refreshApplicationMenu(window: BrowserWindow): void {
  createApplicationMenu(window)
}
