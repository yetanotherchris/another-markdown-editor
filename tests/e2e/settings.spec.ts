import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { closeAppSafely, launchApp, openHamburger, openSettingsDialog } from './launch'

/**
 * Spec 016 settings suite (contracts/renderer.md §E2e): the Settings dialog with
 * the Editor Theme control (replaces the spec-012 Editor Font group — user
 * decision 2026-08-07: the editor theme owns the typeface), the Save-gating
 * semantics (FR-003/US1 S4), restart persistence (US2), the dirty-document
 * non-interference guarantee (FR-014), keyboard access (FR-007), and
 * missing/malformed-config tolerance (FR-006).
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-settings-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-settings-config-'))
  ;({ app, window } = await launchApp(configDir, testFolder))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.afterEach(async () => {
  await closeAppSafely(app)
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

async function canvasBackground(): Promise<string> {
  return window.locator('.milkdown').evaluate((el) => getComputedStyle(el).backgroundColor)
}

async function persistedEditorTheme(): Promise<string | undefined> {
  const configPath = path.join(configDir, 'config.json')
  if (!fs.existsSync(configPath)) return undefined
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')).settings?.editorTheme
}

test('US1 the hamburger opens a Settings dialog with the Theme and Editor Theme groups', async () => {
  await openFile()
  const dialog = await openSettingsDialog(window)

  // The dialog is a labelled, modal dialog.
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // The app Theme group (spec 013) has exactly three options.
  await expect(dialog.getByRole('group', { name: 'Theme', exact: true })).toBeVisible()
  await expect(
    dialog.getByRole('group', { name: 'Theme', exact: true }).getByRole('radio')
  ).toHaveCount(3)

  // The Editor Theme group (spec 016) lists exactly five options (FR-001).
  const themeGroup = dialog.getByRole('group', { name: 'Editor Theme' })
  await expect(themeGroup).toBeVisible()
  await expect(themeGroup.getByRole('radio')).toHaveCount(5)
  await expect(themeGroup.getByRole('radio', { name: 'Rustic', exact: true })).toBeVisible()
  await expect(themeGroup.getByRole('radio', { name: 'Scholarly', exact: true })).toBeVisible()
})

test('US1 S2/S3 selecting a theme and pressing Save applies it and persists it', async () => {
  await openFile()
  // Default canvas is Rustic (warm off-white #fdf6e3).
  await expect.poll(canvasBackground).toBe('rgb(253, 246, 227)')

  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Scholarly', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  // The canvas re-renders in Scholarly immediately (FR-003).
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'scholarly')
  await expect.poll(canvasBackground).toBe('rgb(255, 255, 255)')

  // The choice is persisted to the shared config.json (FR-004/FR-005).
  await expect.poll(persistedEditorTheme).toBe('scholarly')
})

test('US1 S4 closing without Save leaves the theme at the last committed value', async () => {
  await openFile()
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Monotone', exact: true }).check()
  // Close with the X — the staged selection is discarded.
  await dialog.getByRole('button', { name: 'Close settings' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
  await expect.poll(persistedEditorTheme).toBe('rustic')
})

test('US2/FR-007 reopening the dialog shows the current committed theme selected', async () => {
  await openFile()
  let dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Rustic Serif', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'Rustic Serif', exact: true })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: 'Rustic', exact: true })).not.toBeChecked()
})

test('US2 the theme choice survives a restart', async () => {
  await openFile()
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Monotone Serif', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect.poll(persistedEditorTheme).toBe('monotone-serif')

  await closeAppSafely(app)

  // Restart with the same config; the dialog shows the saved theme.
  ;({ app, window } = await launchApp(configDir, testFolder))
  await openFile()
  const reopened = await openSettingsDialog(window)
  await expect(reopened.getByRole('radio', { name: 'Monotone Serif', exact: true })).toBeChecked()
})

test('US4 the dialog never discards or alters the open document', async () => {
  await openFile()
  await window.locator('.ProseMirror:visible').click()
  await window.keyboard.type(' EXTRA')

  const alphaTab = window.getByRole('tab', { name: /alpha\.md/ })
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()

  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Scholarly', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  // The typed text and the dirty marker are unchanged (FR-008/FR-014).
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
    const focusedLabel = await window.evaluate(
      () => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? ''
    )
    if (focusedLabel === 'Settings…') break
    await window.keyboard.press('Tab')
  }
  const focused = await window.evaluate(
    () => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? ''
  )
  expect(focused).toBe('Settings…')
  await window.keyboard.press('Enter')
  await expect(window.getByTestId('settings-dialog')).toBeVisible()

  // The Editor Theme group is reachable and arrow keys change the staged
  // selection (the canvas does NOT change until Save).
  const dialog = window.getByTestId('settings-dialog')
  const themeGroup = dialog.getByRole('group', { name: 'Editor Theme' })
  await themeGroup.getByRole('radio', { name: 'Rustic', exact: true }).focus()
  await window.keyboard.press('ArrowDown')
  await expect(themeGroup.getByRole('radio', { name: 'Rustic Serif', exact: true })).toBeChecked()
  // Staged only — the canvas is still the default Rustic.
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')

  // Escape closes the dialog without committing the staged selection.
  await window.keyboard.press('Escape')
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
})

test('FR-006 a missing config opens with Rustic default and a change writes a valid config', async () => {
  // No config.json exists yet (fresh MM_CONFIG_DIR).
  await openFile()
  const dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'Rustic', exact: true })).toBeChecked()

  await dialog.getByRole('radio', { name: 'Rustic Serif', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect.poll(persistedEditorTheme).toBe('rustic-serif')
  // The written config is valid JSON and still carries recentItems.
  const configPath = path.join(configDir, 'config.json')
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  expect(parsed.settings.editorTheme).toBe('rustic-serif')
  expect(parsed.recentItems).toBeDefined()
})

test('FR-006 a malformed config still opens the dialog with Rustic default', async () => {
  const configPath = path.join(configDir, 'config.json')
  fs.writeFileSync(configPath, '{ not json', 'utf-8')

  // Deliberately do NOT open a file/folder first: a folder open records a
  // recent item, whose read-modify-write repairs the malformed file before the
  // dialog reads it (review #27 #4 — the old test was vacuous). Opening the
  // dialog directly exercises the true malformed-config tolerance path.
  const dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'Rustic', exact: true })).toBeChecked()
  const contents = fs.readFileSync(configPath, 'utf-8')
  expect(contents === '{ not json' || JSON.parse(contents).windowState !== undefined).toBe(true)
})
