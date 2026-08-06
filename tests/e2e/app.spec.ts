import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { electronLaunchArgs, stubMessageBox, closeAppDiscardingQuit, clickHamburgerItem } from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta')
  fs.writeFileSync(path.join(testFolder, 'notes.txt'), 'not markdown')
  fs.mkdirSync(path.join(testFolder, 'sub'))
  fs.writeFileSync(path.join(testFolder, 'sub', 'gamma.md'), '# Gamma')
})

test.beforeEach(async () => {
  app = await electron.launch({
    args: electronLaunchArgs
  })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder as string]
    })
  }, testFolder)

  await stubMessageBox(app)
})

test.afterEach(async () => {
  try {
    await closeAppDiscardingQuit(app)
  } catch {
    await app.close().catch(() => {})
  }
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

test('launches and shows the editor shell', async () => {
  // Spec 010 chrome: the hamburger, the explorer toggle, and the "+" new-file
  // button live in the header row (the old text toolbar buttons are gone).
  await expect(window.getByRole('button', { name: 'Open menu' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Toggle file explorer' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'New file' })).toBeVisible()
  await expect(window.getByText(/Open a file or create a new document/)).toBeVisible()
})

test('opens a folder and lists only markdown files and folders', async () => {
  await clickHamburgerItem(window, 'Open Folder…')

  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('beta.md')).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('sub')).toBeVisible()
  await expect(window.getByText('notes.txt')).toHaveCount(0)
})

test('opens a file from the tree into the editor', async () => {
  await clickHamburgerItem(window, 'Open Folder…')
  await window.getByRole('treeitem').getByText('alpha.md').click()

  await expect(window.locator('.document-title')).toContainText('alpha.md')
  await expect(window.locator('.document-title')).not.toContainText('\u2022')
})

test('expands and collapses a folder in the tree', async () => {
  await clickHamburgerItem(window, 'Open Folder…')

  const subRow = window.getByRole('treeitem').filter({ hasText: 'sub' })
  await expect(subRow.getByRole('button', { name: 'Expand' })).toBeVisible()

  await subRow.getByRole('button', { name: 'Expand' }).click()
  await expect(window.getByRole('treeitem').getByText('gamma.md')).toBeVisible()

  await subRow.getByRole('button', { name: 'Collapse' }).click()
  await expect(window.getByRole('treeitem').getByText('gamma.md')).toHaveCount(0)
})

test('keeps documents open when switching tree selection', async () => {
  await clickHamburgerItem(window, 'Open Folder…')

  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  await window.getByRole('treeitem').getByText('beta.md').click()
  await expect(window.locator('.document-title')).toContainText('beta.md')

  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')
})

test('editor shows the persistent menu bar instead of the floating toolbar', async () => {
  await clickHamburgerItem(window, 'Open Folder…')
  await window.getByRole('treeitem').getByText('alpha.md').click()

  // The classic theme stylesheet ships the Crepe menu bar (headings +
  // formatting buttons) as the editor chrome.
  await expect(window.locator('.milkdown-top-bar')).toBeVisible()

  // The floating selection toolbar is disabled in favour of the menu bar.
  await expect(window.locator('.milkdown-toolbar')).toHaveCount(0)
})
