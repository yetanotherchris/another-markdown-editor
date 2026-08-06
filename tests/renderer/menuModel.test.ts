import { describe, it, expect } from 'vitest'
import {
  hamburgerMenuStructure,
  recentMenuEntries,
  formatAccelerator,
  RECENT_LABEL_MAX,
  HamburgerItem
} from '../../src/renderer/chrome/menuModel'
import type { RecentItem, RecentKind } from '../../src/shared/ipc-contract'

function item(path: string, kind: RecentKind): RecentItem {
  return { path, kind, name: path.split('/').pop() ?? path, lastOpenedAt: 1 }
}

describe('hamburgerMenuStructure (spec 010)', () => {
  it('orders File actions, the Recent Items submenu parent, Save/Close, devtools, Settings, Quit with separators', () => {
    const items = hamburgerMenuStructure('win32')
    expect(items.map((i) => (i.kind === 'separator' || i.kind === 'recent-items') ? i.kind : i.label)).toEqual([
      'New File', 'Open File…', 'Open Folder…',
      'recent-items', 'separator',
      'Save', 'Save As…', 'Close Tab',
      'separator',
      'Toggle Developer Tools',
      'separator',
      'Settings…',
      'separator',
      'Quit'
    ])
  })

  it('exposes Recent Items as its own parent submenu entry (like File > Recent Items)', () => {
    const recent = hamburgerMenuStructure('win32').find((i) => i.kind === 'recent-items')
    expect(recent).toBeDefined()
  })

  it('maps every File command to a MenuCommand the renderer bus handles', () => {
    const commands = hamburgerMenuStructure('win32')
      .filter((i): i is Extract<HamburgerItem, { kind: 'command' }> => i.kind === 'command')
    expect(commands.map((c) => c.command)).toEqual([
      'new-file', 'open-file', 'open-folder', 'save', 'save-as', 'close-tab'
    ])
  })

  it('places Settings… after Toggle Developer Tools and before Quit (spec 012 FR-001)', () => {
    const items = hamburgerMenuStructure('win32')
    const labels = items.map((i) => (i.kind === 'separator' || i.kind === 'recent-items') ? i.kind : i.label)
    const devtoolsIndex = labels.indexOf('Toggle Developer Tools')
    const settingsIndex = labels.indexOf('Settings…')
    const quitIndex = labels.indexOf('Quit')
    expect(settingsIndex).toBeGreaterThan(devtoolsIndex)
    expect(settingsIndex).toBeLessThan(quitIndex)
    expect(items[settingsIndex]).toEqual({ kind: 'action', label: 'Settings…', action: 'settings' })
  })

  it('uses Ctrl+ on Windows/Linux and ⌘ on macOS', () => {
    const win = hamburgerMenuStructure('win32')
    const mac = hamburgerMenuStructure('darwin')
    const labels = (items: ReturnType<typeof hamburgerMenuStructure>) =>
      items
        .filter((i): i is Extract<HamburgerItem, { kind: 'command' }> => i.kind === 'command')
        .map((i) => i.accelerator)
    expect(labels(win)).toEqual(['Ctrl+N', 'Ctrl+O', 'Ctrl+Shift+O', 'Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+W'])
    expect(labels(mac)).toEqual(['⌘N', '⌘O', '⇧⌘O', '⌘S', '⇧⌘S', '⌘W'])
  })

  it('formats accelerators consistently', () => {
    expect(formatAccelerator('open-folder', 'linux')).toBe('Ctrl+Shift+O')
    expect(formatAccelerator('save-as', 'darwin')).toBe('⇧⌘S')
  })
})

describe('recentMenuEntries (spec 010)', () => {
  it('lists folders before files', () => {
    const entries = recentMenuEntries([item('/w/notes/one.md', 'file'), item('/w/proj', 'folder')])
    expect(entries.map((e) => e.item.kind)).toEqual(['folder', 'file'])
  })

  it('shortens long paths with the native-menu budget', () => {
    const long = item('/a/very/long/path/that/exceeds/any/reasonable/budget/notes-folder.md', 'file')
    const entries = recentMenuEntries([long])
    expect(entries[0].label.length).toBeLessThanOrEqual(RECENT_LABEL_MAX + 1)
    expect(entries[0].label).toContain('notes-folder.md')
  })

  it('disambiguates labels that shorten to the same tail by growing the budget', () => {
    const a = item('/proj-a/shared/notes', 'folder')
    const b = item('/proj-b/shared/notes', 'folder')
    const entries = recentMenuEntries([a, b])
    const labels = entries.map((e) => e.label)
    expect(new Set(labels).size).toBe(2)
    expect(labels[0].endsWith('notes')).toBe(true)
  })

  it('preserves the original items for dispatch', () => {
    const file = item('/w/a.md', 'file')
    const entries = recentMenuEntries([file])
    expect(entries[0].item).toBe(file)
  })
})
