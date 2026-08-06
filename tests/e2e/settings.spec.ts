import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { electronLaunchArgs, stubMessageBox, closeAppDiscardingQuit, openHamburger, openSettingsDialog } from './launch'

/**
 * Spec 012 settings suite (contracts/renderer.md §E2e): the Settings dialog,
 * the editor font-family choice (US1/US2), restart persistence (US3), the
 * dirty-document non-interference guarantee (US4/FR-008), keyboard access
 * (FR-007), and missing/malformed-config tolerance (FR-009).
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-settings-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const instance = await electron.launch({
    args: electronLaunchArgs,
    env: { ...process.env, AME_CONFIG_DIR: configDir }
  })
  const page = await instance.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await instance.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder as string] })
  }, testFolder)
  await stubMessageBox(instance)
  return { app: instance, window: page }
}

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-settings-config-'))
  ;({ app, window } = await launchApp())
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.afterEach(async () => {
  try {
    await closeAppDiscardingQuit(app)
  } catch {
    await app.close().catch(() => {})
  }
  fs.rmSync(configDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function openFolder(): Promise<void> {
  await openHamburger(window)
  await window.getByRole('menuitem', { name: 'Open Folder…' }).click()
  await window.getByRole('button', { name: 'Open menu' }).focus()
  await expect(window.getByRole('treeitem').first()).toBeVisible()
}

/** Open a markdown file so the WYSIWYG editor is mounted. */
async function openFile(): Promise<void> {
  await openFolder()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.ProseMirror:visible')).toBeVisible()
}

/** The editor's `--crepe-font-default` computed value — the mechanism the serif
 *  override uses (plan R2). */
async function editorFontVar(): Promise<string> {
  return window.locator('.milkdown').evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--crepe-font-default').trim()
  )
}

/** The top bar's resolved font — must stay sans-serif (Inter) regardless of the
 *  document font choice (user decision 2026-08-06). */
async function toolbarFont(): Promise<string> {
  return window.locator('.milkdown-top-bar').evaluate((el) =>
    getComputedStyle(el).fontFamily
  )
}

async function persistedEditorFont(): Promise<string | undefined> {
  const configPath = path.join(configDir, 'config.json')
  if (!fs.existsSync(configPath)) return undefined
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')).settings?.editorFont
}

test('US1 the hamburger opens a Settings dialog whose first setting is the editor font', async () => {
  await openFile()
  const dialog = await openSettingsDialog(window)

  // The dialog is a labelled, modal dialog.
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // The first (only) setting is Editor Font with exactly two options.
  await expect(dialog.getByRole('group', { name: 'Editor Font' })).toBeVisible()
  const options = dialog.getByRole('radio')
  await expect(options).toHaveCount(2)
  await expect(dialog.getByRole('radio', { name: 'Sans-serif', exact: true })).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Serif', exact: true })).toBeVisible()
})

test('US2 selecting Serif applies it to the editing surface and persists it', async () => {
  await openFile()
  const defaultFont = await editorFontVar()
  expect(defaultFont).not.toContain('Georgia')
  // The toolbar is editor chrome — sans-serif Inter by default.
  const defaultToolbar = await toolbarFont()
  expect(defaultToolbar).toContain('Inter')

  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Serif', exact: true }).check()

  // The editing surface re-renders in a serif face immediately (FR-005).
  await expect.poll(editorFontVar).toContain('Georgia')

  // The toolbar stays sans-serif (Inter) even though the document is serif
  // (user decision 2026-08-06: the toolbar is chrome, not the editing surface).
  expect(await toolbarFont()).toContain('Inter')

  // The choice is persisted to the shared config.json (FR-002/FR-006).
  await expect.poll(persistedEditorFont).toBe('serif')
})

test('US2/FR-007 reopening the dialog shows the current font choice selected', async () => {
  await openFile()
  let dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Serif', exact: true }).check()
  await dialog.getByRole('button', { name: 'Close settings' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'Serif', exact: true })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: 'Sans-serif', exact: true })).not.toBeChecked()
})

test('US3 the font choice survives a restart', async () => {
  await openFile()
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Serif', exact: true }).check()
  await expect.poll(persistedEditorFont).toBe('serif')

  await closeAppDiscardingQuit(app)

  // Restart with the same config; the editor renders serif.
  ;({ app, window } = await launchApp())
  await openFile()
  await expect.poll(editorFontVar).toContain('Georgia')
})

test('US4 the dialog never discards or alters the open document', async () => {
  await openFile()
  await window.locator('.ProseMirror:visible').click()
  await window.keyboard.type(' EXTRA')

  const alphaTab = window.getByRole('tab', { name: /alpha\.md/ })
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()

  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Serif', exact: true }).check()
  await dialog.getByRole('button', { name: 'Close settings' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  // The typed text and the dirty marker are unchanged (FR-008).
  await expect(window.locator('.ProseMirror:visible')).toContainText('EXTRA')
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()
})

test('FR-007 the dialog is keyboard-accessible (open, navigate, close)', async () => {
  await openFile()

  // Open via keyboard: focus the hamburger, Enter, Tab until Settings… is the
  // focused menuitem, then Enter to open the dialog.
  const trigger = window.getByRole('button', { name: 'Open menu' })
  await trigger.focus()
  await window.keyboard.press('Enter')
  await expect(window.getByRole('menu', { name: 'Application menu' })).toBeVisible()
  for (let i = 0; i < 12; i++) {
    const focusedLabel = await window.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '')
    if (focusedLabel === 'Settings…') break
    await window.keyboard.press('Tab')
  }
  const focused = await window.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '')
  expect(focused).toBe('Settings…')
  await window.keyboard.press('Enter')
  await expect(window.getByTestId('settings-dialog')).toBeVisible()

  // The radio group is reachable and arrow keys change the selection.
  const dialog = window.getByTestId('settings-dialog')
  await dialog.getByRole('radio', { name: 'Sans-serif', exact: true }).focus()
  await window.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('radio', { name: 'Serif', exact: true })).toBeChecked()
  await expect.poll(editorFontVar).toContain('Georgia')

  // Escape closes the dialog.
  await window.keyboard.press('Escape')
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)
})

test('FR-009 a missing config opens with defaults and a change writes a valid config', async () => {
  // No config.json exists yet (fresh AME_CONFIG_DIR).
  await openFile()
  const dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'Sans-serif', exact: true })).toBeChecked()

  await dialog.getByRole('radio', { name: 'Serif', exact: true }).check()
  await expect.poll(persistedEditorFont).toBe('serif')
  // The written config is valid JSON and still carries recentItems.
  const configPath = path.join(configDir, 'config.json')
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  expect(parsed.settings.editorFont).toBe('serif')
  expect(parsed.recentItems).toBeDefined()
})

test('FR-009 a malformed config still opens the dialog with defaults', async () => {
  const configPath = path.join(configDir, 'config.json')
  fs.writeFileSync(configPath, '{ not json', 'utf-8')

  // Deliberately do NOT open a file/folder first: a folder open records a
  // recent item, whose read-modify-write repairs the malformed file before the
  // dialog reads it (review #27 #4 — the old test was vacuous). Opening the
  // dialog directly exercises the true malformed-config tolerance path.
  const dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'Sans-serif', exact: true })).toBeChecked()
  // The malformed file was not rewritten by merely opening the dialog.
  expect(fs.readFileSync(configPath, 'utf-8')).toBe('{ not json')
})
