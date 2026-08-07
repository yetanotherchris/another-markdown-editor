import { test, expect, ElectronApplication, Page } from '@playwright/test'
import type { Menu } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { launchApp, closeAppSafely, openFile as openWorkspaceFile, openSettingsDialog } from './launch'

/**
 * Spec 020 spellcheck suite (contracts/spellcheck.md §Acceptance contract).
 *
 * Runs against the REAL native spellchecker (Chromium), with an isolated
 * Chromium profile per test (`AME_USER_DATA_DIR`, research R6) so learned words
 * never leak into the developer's dictionary and restart-persistence is
 * deterministic.
 *
 * Native menus are not clickable from Playwright, so the tests install two
 * hooks in main via `electronApp.evaluate` (research R6): a second
 * `context-menu` listener that records `{ misspelledWord, dictionarySuggestions }`,
 * and a `Menu.buildFromTemplate` wrapper that records the template the app
 * built (labels + click handlers). A test then invokes a menu item's `click`
 * handler directly — this drives the app's REAL context-menu code path (type →
 * native flag → context-menu event → app handler → menu → replace/dictionary).
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string
let userDataDir: string

/**
 * A guaranteed-unknown word for the add-to-dictionary scenarios. A fixed
 * nonsense word is unsafe: `addWordToSpellCheckerDictionary` also writes the OS
 * custom dictionary on Windows/macOS (electron.d.ts), so a word used by a
 * previous run would already be learned at the OS level and never flagged.
 * Letters-only: Chromium does not flag tokens containing digits.
 */
function randomWord(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let word = 'zq'
  for (let i = 0; i < 8; i += 1) {
    word += letters[Math.floor(Math.random() * letters.length)]
  }
  return word
}

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-spellcheck-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'note.md'), '# Note\n\nHello world.\n')
})

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-spellcheck-cfg-'))
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-spellcheck-ud-'))
  ;({ app, window } = await launchApp(configDir, testFolder, userDataDir))
  await installSpellcheckHooks(app)
})

test.afterEach(async () => {
  await closeAppSafely(app)
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

interface CapturedParams {
  misspelledWord: string
  dictionarySuggestions: string[]
}

/** The test hooks the specs place on the MAIN-process globalThis. */
interface SpellcheckTestHooks {
  __spellCtx: CapturedParams[]
  __lastMenuTemplate: Array<Electron.MenuItemConstructorOptions | Electron.MenuItem>
  __origMenuBuild: typeof Menu['buildFromTemplate']
}

/** Record the app's own context-menu params and built menu template in main. */
async function installSpellcheckHooks(instance: ElectronApplication): Promise<void> {
  await instance.evaluate(({ BrowserWindow, Menu }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const h = globalThis as unknown as SpellcheckTestHooks
    h.__spellCtx = []
    win.webContents.on('context-menu', (_e, params) => {
      h.__spellCtx.push({
        misspelledWord: params.misspelledWord,
        dictionarySuggestions: params.dictionarySuggestions
      })
    })
    if (!h.__origMenuBuild) {
      h.__origMenuBuild = Menu.buildFromTemplate
    }
    Menu.buildFromTemplate = (template) => {
      h.__lastMenuTemplate = template
      return h.__origMenuBuild(template)
    }
  })
}

/** The params of the most recent `context-menu` event (or null). */
async function lastCtx(instance: ElectronApplication): Promise<CapturedParams | null> {
  return instance.evaluate(() => {
    const h = globalThis as unknown as SpellcheckTestHooks
    return h.__spellCtx.length > 0 ? h.__spellCtx[h.__spellCtx.length - 1] : null
  })
}

/** The labels of the most recent menu the app built (or null). */
async function lastMenuLabels(instance: ElectronApplication): Promise<string[] | null> {
  return instance.evaluate(() => {
    const h = globalThis as unknown as SpellcheckTestHooks
    return h.__lastMenuTemplate ? h.__lastMenuTemplate.map((i) => i.label ?? '') : null
  })
}

/** Invoke the recorded menu item's `click` handler directly. */
async function clickMenuItem(instance: ElectronApplication, index: number): Promise<void> {
  await instance.evaluate((_, idx) => {
    const h = globalThis as unknown as SpellcheckTestHooks
    const item = h.__lastMenuTemplate[idx]
    ;(item.click as ((...args: unknown[]) => unknown) | undefined)?.()
  }, index)
}

/** Replace the editor content with `word` (plus a trailing space). */
async function setEditorText(page: Page, word: string): Promise<void> {
  await page.locator('.ProseMirror:visible').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(`${word} `)
}

/** Right-click the exact word in the visible editor; true if it was found. */
async function rightClickWord(page: Page, word: string): Promise<boolean> {
  const pos = await page.locator('.ProseMirror:visible').evaluate((el, w) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = walker.nextNode())) {
      const text = n.textContent ?? ''
      if (text.includes(w)) {
        const range = document.createRange()
        range.setStart(n, text.indexOf(w))
        range.setEnd(n, text.indexOf(w) + w.length)
        const rect = range.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      }
    }
    return null
  }, word)
  if (!pos) return false
  await page.mouse.click(pos.x, pos.y, { button: 'right' })
  await page.waitForTimeout(400)
  return true
}

/**
 * Type `word`, right-click it, and wait until Chromium reports it flagged.
 *
 * Re-types a FRESH render each iteration (research: once a rendered word has
 * been right-clicked before Chromium marked it, that instance stays unmarked —
 * no re-check happens without an edit). Re-typing forces a new spellcheck pass,
 * so a slow mark never wedges the poll.
 */
async function expectFlagged(instance: ElectronApplication, page: Page, word: string): Promise<CapturedParams> {
  const deadline = Date.now() + 30000
  let ctx: CapturedParams | null = null
  while (Date.now() < deadline) {
    await setEditorText(page, word)
    await page.waitForTimeout(1200)
    await rightClickWord(page, word)
    ctx = await lastCtx(instance)
    if (ctx?.misspelledWord) break
  }
  expect(ctx?.misspelledWord).toBe(word)
  return ctx as CapturedParams
}

async function sessionEnabled(instance: ElectronApplication): Promise<boolean> {
  return instance.evaluate(({ session }) => session.defaultSession.isSpellCheckerEnabled())
}

async function editorSpellcheck(page: Page): Promise<boolean> {
  return page.locator('.ProseMirror:visible').evaluate((el) => (el as HTMLElement).spellcheck)
}

// ---------- US1: misspelled words are highlighted ----------

test('US1 a misspelled word is flagged and the editor has spellcheck enabled', async () => {
  await openWorkspaceFile(window, 'note.md')
  // The WYSIWYG contenteditable opts into the native spellchecker (FR-007).
  expect(await editorSpellcheck(window)).toBe(true)
  // The word under the cursor is reported misspelled by Chromium.
  await expectFlagged(app, window, 'teh')
})

// ---------- US2: right-click correction ----------

test('US2 right-clicking a flagged word offers suggestions that replace it', async () => {
  await openWorkspaceFile(window, 'note.md')
  await expectFlagged(app, window, 'recieve')
  const labels = await lastMenuLabels(app)
  expect(labels).not.toBeNull()
  // The app's menu shows the dictionary suggestions followed by add-to-dictionary.
  const suggestions = labels!.slice(0, -1)
  expect(suggestions.length).toBeGreaterThan(0)

  // Invoking a suggestion replaces the word in place (FR-003, research R2).
  await clickMenuItem(app, 0)
  await window.waitForTimeout(600)
  const text = (await window.locator('.ProseMirror:visible').textContent()) ?? ''
  expect(text).not.toContain('recieve')
  expect(text).toContain(labels![0])
})

test('US2 right-clicking a correctly spelled word shows no spelling menu', async () => {
  await openWorkspaceFile(window, 'note.md')
  await setEditorText(window, 'correct')
  await rightClickWord(window, 'correct')
  await window.waitForTimeout(500)
  // The context-menu event fired (editable area) but reported no flagged word.
  const ctx = await lastCtx(app)
  expect(ctx).not.toBeNull()
  expect(ctx?.misspelledWord).toBe('')
  // The app built no spelling menu for a correctly spelled word.
  expect(await lastMenuLabels(app)).toBeNull()
})

// ---------- US3: add to dictionary ----------

test('US3 adding a word to the dictionary stops it being flagged', async () => {
  const word = randomWord()
  await openWorkspaceFile(window, 'note.md')
  await expectFlagged(app, window, word)
  const labels = await lastMenuLabels(app)
  const addIndex = labels?.findIndex((l) => l.toLowerCase().includes('dictionary'))
  expect(addIndex).toBeGreaterThanOrEqual(0)

  await clickMenuItem(app, addIndex as number)
  await window.waitForTimeout(600)

  // Same session: a fresh instance of the word is no longer flagged.
  await setEditorText(window, word)
  await rightClickWord(window, word)
  await window.waitForTimeout(500)
  const ctx = await lastCtx(app)
  expect(ctx?.misspelledWord || '').toBe('')
})

test('US3 a learned word survives an app restart', async () => {
  const word = randomWord()
  await openWorkspaceFile(window, 'note.md')
  await expectFlagged(app, window, word)
  const labels = await lastMenuLabels(app)
  const addIndex = labels?.findIndex((l) => l.toLowerCase().includes('dictionary'))
  expect(addIndex).toBeGreaterThanOrEqual(0)
  await clickMenuItem(app, addIndex as number)
  await window.waitForTimeout(1000)

  // Restart with the same isolated profile: the word stays learned (FR-005).
  await closeAppSafely(app)
  ;({ app, window } = await launchApp(configDir, testFolder, userDataDir))
  await installSpellcheckHooks(app)
  await openWorkspaceFile(window, 'note.md')
  await setEditorText(window, word)
  await rightClickWord(window, word)
  await window.waitForTimeout(500)
  const ctx = await lastCtx(app)
  expect(ctx?.misspelledWord || '').toBe('')
})

// ---------- US4: toggle on and off ----------

test('US4 the settings checkbox toggles spellcheck immediately', async () => {
  await openWorkspaceFile(window, 'note.md')
  expect(await sessionEnabled(app)).toBe(true)

  // The source-view textarea reflects the setting too (FR-007).
  await window.getByRole('button', { name: 'View source' }).click()
  const taSpellcheck = await window
    .getByTestId('source-textarea')
    .evaluate((el) => (el as HTMLTextAreaElement).spellcheck)
  expect(taSpellcheck).toBe(true)
  await window.getByRole('button', { name: /Back to visual editing/ }).click()

  // Disable: markers stop immediately (US4 S1).
  await openSettingsDialog(window)
  await window.getByRole('checkbox', { name: 'Check spelling while typing' }).uncheck()
  await window.getByRole('button', { name: 'Close settings' }).click()
  expect(await sessionEnabled(app)).toBe(false)
  expect(await editorSpellcheck(window)).toBe(false)

  await setEditorText(window, 'teh')
  await rightClickWord(window, 'teh')
  await window.waitForTimeout(500)
  const offCtx = await lastCtx(app)
  expect(offCtx?.misspelledWord || '').toBe('')

  // Re-enable: new words are flagged again (US4 S2, per the 2026-08-07
  // clarification — existing rendered words re-mark as they are edited).
  await openSettingsDialog(window)
  await window.getByRole('checkbox', { name: 'Check spelling while typing' }).check()
  await window.getByRole('button', { name: 'Close settings' }).click()
  expect(await sessionEnabled(app)).toBe(true)
  expect(await editorSpellcheck(window)).toBe(true)
  await expectFlagged(app, window, 'recieve')
})

test('US4 the spellcheck choice persists across restarts', async () => {
  await openWorkspaceFile(window, 'note.md')
  await openSettingsDialog(window)
  await window.getByRole('checkbox', { name: 'Check spelling while typing' }).uncheck()
  await window.getByRole('button', { name: 'Close settings' }).click()

  // Written to the settings store (debounced 500 ms).
  await expect.poll(() => {
    const configPath = path.join(configDir, 'config.json')
    if (!fs.existsSync(configPath)) return undefined
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')).settings?.spellcheckEnabled
  }).toBe(false)

  // Restart: the persisted choice is honoured at startup (FR-009).
  await closeAppSafely(app)
  ;({ app, window } = await launchApp(configDir, testFolder, userDataDir))
  await installSpellcheckHooks(app)
  await openWorkspaceFile(window, 'note.md')
  expect(await sessionEnabled(app)).toBe(false)
  expect(await editorSpellcheck(window)).toBe(false)
})

test('the spellcheck language setting applies immediately and persists', async () => {
  await openWorkspaceFile(window, 'note.md')

  // Default: the platform/system default, no explicit override.
  await openSettingsDialog(window)
  await expect(window.getByTestId('spellcheck-language')).toHaveValue('')
  await window.getByRole('button', { name: 'Close settings' }).click()

  // Pick an explicit language (en-US): applied to the session immediately and
  // written to the settings store.
  await openSettingsDialog(window)
  await window.getByTestId('spellcheck-language').selectOption('en-US')
  await window.getByRole('button', { name: 'Close settings' }).click()
  expect(await app.evaluate(({ session }) => session.defaultSession.getSpellCheckerLanguages())).toEqual(['en-US'])
  await expect.poll(() => {
    const configPath = path.join(configDir, 'config.json')
    if (!fs.existsSync(configPath)) return undefined
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')).settings?.spellcheckLanguage
  }).toBe('en-US')

  // Restart: the persisted language is applied at startup.
  await closeAppSafely(app)
  ;({ app, window } = await launchApp(configDir, testFolder, userDataDir))
  await installSpellcheckHooks(app)
  expect(await app.evaluate(({ session }) => session.defaultSession.getSpellCheckerLanguages())).toEqual(['en-US'])
})
