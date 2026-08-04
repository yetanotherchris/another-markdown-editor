import { Menu, BrowserWindow, app } from 'electron'
import type { MenuCommand, RecentItem } from '../shared/ipc-contract'
import { loadRecentItems, saveRecentItems } from './recentItems'
import { recentItemsConfigPath } from './recentItemsPath'
import { reportRecentItemsWarning, notifyRecentItemsOk } from './recentItemsWarning'
import { shortenPath } from '../shared/shortenPath'

/** Character budget for a Recent Items menu label (spec 004 edge: long paths
 *  must remain unambiguous and selectable — shortenPath keeps the final
 *  segment whole). */
const RECENT_LABEL_MAX = 60

/** A recent entry's label is the shortened path itself (no `File:`/`Folder:`
 *  prefix — the FR-015 folders-above-files grouping conveys the type, and the
 *  user requested the prefix be removed). */
function recentItemLabel(item: RecentItem, budget: number): string {
  return shortenPath(item.path, budget)
}

/** Build one selectable recent entry, disambiguating shortened labels. */
function recentEntry(window: BrowserWindow, usedLabels: Set<string>, item: RecentItem): Electron.MenuItemConstructorOptions {
  let budget = RECENT_LABEL_MAX
  let label = recentItemLabel(item, budget)
  // Rare: two different paths can shorten to the same tail (e.g. sibling
  // projects sharing a deep `…\shared\file.md` suffix). Grow the budget, which
  // reveals more leading segments, until the label is unique or the full path
  // is shown — entries must stay unambiguous (spec edge). The Set is shared
  // across both kinds now that labels carry no type prefix, so a folder and a
  // file that shorten to the same tail (a hand-edited-config-only case) is
  // disambiguated too.
  while (usedLabels.has(label) && budget < item.path.length) {
    budget += 4
    label = recentItemLabel(item, budget)
  }
  usedLabels.add(label)
  return {
    label,
    click: () => window.webContents.send('menu:command', {
      type: 'open-recent', path: item.path, kind: item.kind
    })
  }
}

/** Clear Recent Items (FR-014): a main-only action — write an empty list
 *  (best-effort; a persistence failure is the quiet footer warning, never
 *  fatal) and rebuild the menu. The open document/workspace session is never
 *  touched. */
function clearRecentItems(): void {
  try {
    saveRecentItems(recentItemsConfigPath(), [])
    notifyRecentItemsOk()
  } catch (e: unknown) {
    reportRecentItemsWarning(e, 'clear')
  }
  refreshApplicationMenu()
}

function buildRecentItemsSubmenu(window: BrowserWindow): Electron.MenuItemConstructorOptions {
  const items = loadRecentItems(recentItemsConfigPath())

  // Spec edge: an empty history is clearly indicated and offers no selectable
  // stale action (FR-001), and there is nothing to clear.
  if (items.length === 0) {
    return {
      label: 'Recent Items',
      submenu: [{ label: 'No Recent Items', enabled: false }]
    }
  }

  // FR-015: folders first, then a separator, then files, then a separator,
  // then Clear Recent Items. The folders/files separator appears only when BOTH
  // groups are non-empty — with files only (or folders only) it would dangle at
  // the top of the submenu (spec edge: absent groups are omitted with their
  // separators).
  const usedLabels = new Set<string>()
  const folders = items.filter((i) => i.kind === 'folder')
  const files = items.filter((i) => i.kind === 'file')
  const submenu: Electron.MenuItemConstructorOptions[] = [
    ...folders.map((item) => recentEntry(window, usedLabels, item)),
    ...(folders.length > 0 && files.length > 0 ? [{ type: 'separator' as const }] : []),
    ...files.map((item) => recentEntry(window, usedLabels, item)),
    { type: 'separator' },
    { label: 'Clear Recent Items', click: () => clearRecentItems() }
  ]

  return {
    label: 'Recent Items',
    submenu
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
 *  any recent-items mutation so the Recent Items submenu stays in sync. The
 *  target window is resolved at call time so a macOS `activate` window recreate
 *  (which rebuilds the BrowserWindow under a fresh `registerIpcHandlers` guard)
 *  cannot leave the menu wired to a destroyed webContents. */
export function refreshApplicationMenu(): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (window && !window.isDestroyed()) {
    createApplicationMenu(window)
  }
}
