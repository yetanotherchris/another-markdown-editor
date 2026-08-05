import { Menu, app } from 'electron'

/**
 * Spec 010 (FR-002, clarification 2026-08-05): no OS-native File or View menu
 * is shown on ANY platform — every action lives in the renderer hamburger. On
 * Windows/Linux `Menu.setApplicationMenu(null)` removes the bar entirely (see
 * index.ts). macOS cannot remove its system menu bar, so it keeps a minimal
 * application menu: the About/Quit app roles and the Edit roles (clipboard and
 * undo shortcuts for text fields). File and View are intentionally absent even
 * on macOS; their accelerators are handled by `registerShortcuts`
 * (src/main/shortcuts.ts), which runs on every platform.
 */
export function createApplicationMenu(): void {
  if (process.platform !== 'darwin') return
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
