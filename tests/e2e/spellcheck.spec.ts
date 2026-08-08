import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  launchApp,
  closeAppSafely,
  openFile as openWorkspaceFile,
  openSettingsDialog
} from './launch'

/**
 * Spec 020 spellcheck suite (JS whole-document engine, 2026-08-07).
 *
 * The WYSIWYG editor checks the whole document on open and as you type, using
 * bundled Hunspell dictionaries (nspell) running in the renderer. Misspelled
 * words get the `mm-spelling-error` decoration (wavy-red underline) and the
 * right-click correction menu is the renderer's own DOM menu
 * (`[data-testid="spelling-menu"]`) — so unlike the earlier native-engine spec,
 * nothing here needs main-process stubs; the tests drive the real DOM.
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string
let userDataDir: string

const DICT_WORD = 'zqwlux'

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-spellcheck-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'note.md'), '# Note\n\nThis is a clean document.\n')
  fs.writeFileSync(
    path.join(testFolder, 'misspelled.md'),
    '# Misspelled\n\nThis document has teh and recieve and definately errors.\n\nThis line is fine.\n'
  )
  fs.writeFileSync(
    path.join(testFolder, 'mixed.md'),
    '# Mixed\n\nThis has behaviour and color spellings.\n'
  )
  fs.writeFileSync(
    path.join(testFolder, 'supplemental.md'),
    '# Supplemental\n\nLacanian and Kleinian psychodynamic theory, JSON and hominem.\n\nMaladaptive behaviour and teh.\n'
  )
})

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-spellcheck-cfg-'))
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-spellcheck-ud-'))
  ;({ app, window } = await launchApp(configDir, testFolder, userDataDir))
})

test.afterEach(async () => {
  await closeAppSafely(app)
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

/** The misspelled words currently marked in the visible editor. */
async function markedWords(page: Page): Promise<string[]> {
  return page.locator('.ProseMirror:visible .mm-spelling-error').allTextContents()
}

/** Right-click the exact marked word; true if a marked word matched. */
async function rightClickMarked(page: Page, word: string): Promise<boolean> {
  const target = page.locator('.ProseMirror:visible .mm-spelling-error', { hasText: word }).first()
  const count = await target.count()
  if (count === 0) return false
  const box = await target.boundingBox()
  if (!box) return false
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
  await page.waitForTimeout(400)
  return true
}

/** Type a word into the editor and wait for the debounced re-check. */
async function typeWord(page: Page, word: string): Promise<void> {
  await page.locator('.ProseMirror:visible').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(` ${word}`)
  await page.waitForTimeout(1200)
}

// ---------- US1: whole-document checking ----------

test('US1 existing misspellings are flagged on open (whole document)', async () => {
  await openWorkspaceFile(window, 'misspelled.md')
  // The initial check runs right after mount (debounced ~250 ms).
  await expect.poll(() => markedWords(window)).toContain('teh')
  await expect.poll(() => markedWords(window)).toContain('recieve')
  await expect.poll(() => markedWords(window)).toContain('definately')
})

test('US1 a word typed into the editor is flagged as you type', async () => {
  await openWorkspaceFile(window, 'note.md')
  await typeWord(window, 'recieve')
  await expect.poll(() => markedWords(window)).toContain('recieve')
})

// ---------- US2: right-click correction ----------

test('US2 right-clicking a marked word offers suggestions that replace it', async () => {
  await openWorkspaceFile(window, 'misspelled.md')
  await expect.poll(() => markedWords(window)).toContain('recieve')
  expect(await rightClickMarked(window, 'recieve')).toBe(true)

  const menu = window.getByTestId('spelling-menu')
  await expect(menu).toBeVisible()
  const items = await menu.getByRole('menuitem').allTextContents()
  // Suggestions come first (nspell), "Add to dictionary" last.
  const suggestions = items.slice(0, -1)
  expect(suggestions.length).toBeGreaterThan(0)
  expect(items[items.length - 1]).toBe('Add to dictionary')

  await menu.getByRole('menuitem', { name: suggestions[0] }).click()
  const text = (await window.locator('.ProseMirror:visible').textContent()) ?? ''
  expect(text).not.toContain('recieve')
  expect(text).toContain(suggestions[0])
  await expect(menu).toHaveCount(0)
})

test('US2 right-clicking a correctly spelled word shows no spelling menu', async () => {
  await openWorkspaceFile(window, 'note.md')
  // Right-click a non-marked word ("clean").
  const box = await window.locator('.ProseMirror:visible').evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = walker.nextNode())) {
      const text = n.textContent ?? ''
      const idx = text.indexOf('clean')
      if (idx >= 0) {
        const range = document.createRange()
        range.setStart(n, idx)
        range.setEnd(n, idx + 5)
        const rect = range.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      }
    }
    return null
  })
  expect(box).not.toBeNull()
  await window.mouse.click(box!.x, box!.y, { button: 'right' })
  await window.waitForTimeout(400)
  await expect(window.getByTestId('spelling-menu')).toHaveCount(0)
})

// ---------- US3: add to dictionary ----------

test('US3 adding a word to the dictionary stops it being flagged', async () => {
  await openWorkspaceFile(window, 'note.md')
  await typeWord(window, DICT_WORD)
  await expect.poll(() => markedWords(window)).toContain(DICT_WORD)

  expect(await rightClickMarked(window, DICT_WORD)).toBe(true)
  await window
    .getByTestId('spelling-menu')
    .getByRole('menuitem', { name: 'Add to dictionary' })
    .click()

  // Same session: the word is no longer marked anywhere in the document.
  await expect.poll(() => markedWords(window)).not.toContain(DICT_WORD)
  // It is persisted to the config store.
  await expect
    .poll(() => {
      const configPath = path.join(configDir, 'config.json')
      if (!fs.existsSync(configPath)) return undefined
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')).spellcheckDictionary
    })
    .toContain(DICT_WORD)
})

test('US3 a learned word survives an app restart', async () => {
  await openWorkspaceFile(window, 'note.md')
  await typeWord(window, DICT_WORD)
  await expect.poll(() => markedWords(window)).toContain(DICT_WORD)
  expect(await rightClickMarked(window, DICT_WORD)).toBe(true)
  await window
    .getByTestId('spelling-menu')
    .getByRole('menuitem', { name: 'Add to dictionary' })
    .click()
  await window.waitForTimeout(800)

  await closeAppSafely(app)
  ;({ app, window } = await launchApp(configDir, testFolder, userDataDir))
  await openWorkspaceFile(window, 'note.md')
  await typeWord(window, DICT_WORD)
  await window.waitForTimeout(1000)
  expect(await markedWords(window)).not.toContain(DICT_WORD)
})

// ---------- US4: toggle and language ----------

// ---------- Spec 025: dictionary coverage ----------

test('US1 a common word missing from the old dictionary is not flagged', async () => {
  await openWorkspaceFile(window, 'supplemental.md')
  // "maladaptive" exists in the size-70 dictionaries, so it is not flagged.
  // Case-insensitive: the fixture writes sentence-initial "Maladaptive".
  await expect
    .poll(async () => (await markedWords(window)).map((w) => w.toLowerCase()))
    .not.toContain('maladaptive')
})

test('US2 domain and technical terms are accepted (JSON, Lacanian, hominem)', async () => {
  await openWorkspaceFile(window, 'supplemental.md')
  for (const word of ['Lacanian', 'Kleinian', 'psychodynamic', 'JSON', 'hominem']) {
    await expect.poll(() => markedWords(window)).not.toContain(word)
  }
  // The curated list does not mask genuine typos elsewhere in the document.
  await expect.poll(() => markedWords(window)).toContain('teh')
})

test('US2 a supplemental word is accepted in both en-GB and en-US', async () => {
  await openWorkspaceFile(window, 'supplemental.md')
  await expect.poll(() => markedWords(window)).not.toContain('Lacanian')
  // The fixture's British "behaviour" is accepted under en-GB.
  expect(await markedWords(window)).not.toContain('behaviour')

  await openSettingsDialog(window)
  await window.getByTestId('spellcheck-language').selectOption('en-US')
  await window.getByRole('button', { name: 'Close settings' }).click()
  // The switch took effect: en-US now flags the British spelling, while the
  // supplemental words are still accepted.
  await expect.poll(() => markedWords(window)).toContain('behaviour')
  await expect.poll(() => markedWords(window)).not.toContain('Lacanian')
  await expect.poll(() => markedWords(window)).not.toContain('JSON')
})

test('US4 the settings toggle clears and restores the underlines', async () => {
  await openWorkspaceFile(window, 'misspelled.md')
  await expect.poll(() => markedWords(window)).toContain('teh')

  await openSettingsDialog(window)
  await window.getByRole('checkbox', { name: 'Check spelling while typing' }).uncheck()
  await window.getByRole('button', { name: 'Close settings' }).click()
  await expect.poll(() => markedWords(window)).toEqual([])

  await openSettingsDialog(window)
  await window.getByRole('checkbox', { name: 'Check spelling while typing' }).check()
  await window.getByRole('button', { name: 'Close settings' }).click()
  await expect.poll(() => markedWords(window)).toContain('teh')
})

test('the language setting switches dictionaries (en-GB vs en-US)', async () => {
  await openSettingsDialog(window)
  await window.getByTestId('spellcheck-language').selectOption('en-GB')
  await window.getByRole('button', { name: 'Close settings' }).click()
  await openWorkspaceFile(window, 'mixed.md')
  // Explicit en-GB: American "color" is flagged, British "behaviour" accepted.
  await expect.poll(() => markedWords(window)).toContain('color')
  expect(await markedWords(window)).not.toContain('behaviour')

  await openSettingsDialog(window)
  await window.getByTestId('spellcheck-language').selectOption('en-US')
  await window.getByRole('button', { name: 'Close settings' }).click()
  await expect.poll(() => markedWords(window)).toContain('behaviour')
  expect(await markedWords(window)).not.toContain('color')

  await openSettingsDialog(window)
  await window.getByTestId('spellcheck-language').selectOption('en-GB')
  await window.getByRole('button', { name: 'Close settings' }).click()
  await expect.poll(() => markedWords(window)).toContain('color')
  expect(await markedWords(window)).not.toContain('behaviour')
})
