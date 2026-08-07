import { BrowserWindow, Menu, session } from 'electron'
import { spellcheckMenuActions } from './spellcheckMenu'

/**
 * Spec 020 FR-002/FR-003/FR-004/FR-008: the native right-click correction menu
 * for the editor area. Electron's `context-menu` event fires whenever the
 * renderer shows a context menu; when the focused editable element has a
 * flagged word, the event params carry `misspelledWord` and
 * `dictionarySuggestions`.
 *
 * A flagged word gets a native `Menu` built from `spellcheckMenuActions`:
 * clicking a suggestion replaces the word in place via
 * `webContents.replaceMisspelling` (research R2 — verified to work in the
 * ProseMirror editor and the source textarea), and "Add … to Dictionary" learns
 * the word via the session's custom dictionary (research R3 — persists
 * natively across restarts). When no word is flagged, no menu is built or shown:
 * nothing is suppressed (FR-008); the app simply has no other edit menu.
 */
export function registerSpellcheckContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const actions = spellcheckMenuActions(params)
    if (actions.length === 0) return

    const template = actions.map((action) => ({
      label: action.label,
      click: () => {
        if (action.kind === 'suggestion') {
          window.webContents.replaceMisspelling(action.suggestion)
        } else {
          session.defaultSession.addWordToSpellCheckerDictionary(action.word)
        }
      }
    }))

    Menu.buildFromTemplate(template).popup({ window })
  })
}
