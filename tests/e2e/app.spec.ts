import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

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
    args: ['out/main/index.js']
  })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder as string]
    })
  }, testFolder)
})

test.afterEach(async () => {
  await app.close()
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

test('launches and shows the editor shell', async () => {
  await expect(window.getByRole('button', { name: 'New' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Open Folder' })).toBeVisible()
  await expect(window.getByText(/Open a file or create a new document/)).toBeVisible()
})

test('opens a folder and lists only markdown files and folders', async () => {
  await window.getByRole('button', { name: 'Open Folder' }).click()

  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('beta.md')).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('sub')).toBeVisible()
  await expect(window.getByText('notes.txt')).toHaveCount(0)
})

test('opens a file from the tree into the editor', async () => {
  await window.getByRole('button', { name: 'Open Folder' }).click()
  await window.getByRole('treeitem').getByText('alpha.md').click()

  await expect(window.locator('.document-title')).toContainText('alpha.md')
  await expect(window.locator('.document-title')).not.toContainText('\u2022')
})

test('expands and collapses a folder in the tree', async () => {
  await window.getByRole('button', { name: 'Open Folder' }).click()

  const subRow = window.getByRole('treeitem').filter({ hasText: 'sub' })
  await expect(subRow.getByRole('button', { name: 'Expand' })).toBeVisible()

  await subRow.getByRole('button', { name: 'Expand' }).click()
  await expect(window.getByRole('treeitem').getByText('gamma.md')).toBeVisible()

  await subRow.getByRole('button', { name: 'Collapse' }).click()
  await expect(window.getByRole('treeitem').getByText('gamma.md')).toHaveCount(0)
})

test('keeps documents open when switching tree selection', async () => {
  await window.getByRole('button', { name: 'Open Folder' }).click()

  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  await window.getByRole('treeitem').getByText('beta.md').click()
  await expect(window.locator('.document-title')).toContainText('beta.md')

  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')
})
