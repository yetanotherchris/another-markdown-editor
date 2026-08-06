import { BrowserWindow } from 'electron'
import type { MenuCommand } from '../shared/ipc-contract'

/**
 * The subset of Electron's `before-input-event` Input we match on. Kept as a
 * minimal structural type so `matchShortcut` is a pure function (research R1).
 */
export interface ShortcutInput {
  type: string
  key: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

/** The main-side devtools toggle, distinct from renderer `MenuCommand`s. */
export type ShortcutResult = MenuCommand | 'devtools'

/**
 * Spec 010 (contracts/renderer.md): re-implements the keyboard accelerators the
 * native menu used to own after FR-002 removes the menu bar (research R1). A
 * pure function — the single source of truth, unit-tested. Returns the
 * `MenuCommand` to send on `menu:command`, `'devtools'` for the main-side
 * devtools toggle, or `null` to leave the keypress untouched.
 *
 * Combos (CmdOrCtrl + Shift when noted):
 *   N → new-file, O → open-file, Shift+O → open-folder, S → save,
 *   Shift+S → save-as, W → close-tab, F12 / Shift+I → devtools.
 */
export function matchShortcut(input: ShortcutInput): ShortcutResult | null {
  if (input.type !== 'keyDown') return null
  if (input.key === 'F12') return 'devtools'
  const mod = input.control || input.meta
  if (!mod || input.alt) return null
  const key = input.key.toLowerCase()

  if (input.shift) {
    if (key === 'o') return 'open-folder'
    if (key === 's') return 'save-as'
    if (key === 'i') return 'devtools'
    return null
  }

  switch (key) {
    case 'n':
      return 'new-file'
    case 'o':
      return 'open-file'
    case 's':
      return 'save'
    case 'w':
      return 'close-tab'
    default:
      return null
  }
}

/**
 * Install the `before-input-event` handler on a window. Matched combinations
 * `preventDefault()` and send the existing `menu:command` channel — the same
 * command bus the old native menu used and the renderer hamburger shares — so
 * shortcuts keep working after the menu bar is removed (spec 010 edge case).
 */
export function registerShortcuts(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (event, input) => {
    const command = matchShortcut(input)
    if (command === null) return
    event.preventDefault()
    if (command === 'devtools') {
      window.webContents.toggleDevTools()
      return
    }
    window.webContents.send('menu:command', command)
  })
}
