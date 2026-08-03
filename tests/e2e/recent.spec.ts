import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { electronLaunchArgs } from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string
let externalFile: string
let configDir: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-recent-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta')
  fs.mkdirSync(path.join(testFolder, 'sub'))
  fs.writeFileSync(path.join(testFolder, 'sub', 'gamma.md'), '# Gamma')
  // A second workspace for replacement tests.
  fs.mkdirSync(path.join(testFolder, 'other'))
  fs.writeFileSync(path.join(testFolder, 'other', 'delta.md'), '# Delta')
  // Files opened through the File menu (outside any workspace).
  externalFile = path.join(testFolder, 'external.md')
  fs.writeFileSync(externalFile, '# External')
})

test.beforeEach(async () => {
  // A per-test config directory so tests never read or write the developer's
  // real ~/.config/ame (research R1, AME_CONFIG_DIR seam).
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-recent-config-'))
  app = await electron.launch({
    args: electronLaunchArgs,
    env: { ...process.env, AME_CONFIG_DIR: configDir }
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
  try {
    const closed = app.waitForEvent('close', { timeout: 8000 }).catch(() => {})
    const quitButton = window.getByRole('button', { name: 'Discard and Quit' })
    const dialogShown = expect(quitButton).toBeVisible({ timeout: 5000 }).catch(() => {})
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close()
    })
    await Promise.race([dialogShown, closed])
    if (await quitButton.isVisible().catch(() => false)) {
      await quitButton.click()
    }
    await closed
  } catch {
    await app.close().catch(() => {})
  }
  fs.rmSync(configDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

// ---- native-menu helpers ----

async function clickFileMenu(labelStartsWith: string): Promise<void> {
  await app.evaluate(({ Menu }, prefix) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    const item = file?.submenu?.items.find((i) => i.label?.startsWith(prefix as string))
    item?.click()
  }, labelStartsWith)
}

async function recentItemsState(): Promise<{ label: string; enabled: boolean }[]> {
  return app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    const recent = file?.submenu?.items.find((i) => i.label === 'Recent Items')
    return (recent?.submenu?.items ?? []).map((i) => ({ label: i.label, enabled: i.enabled }))
  })
}

async function clickRecentItem(labelContains: string): Promise<void> {
  await app.evaluate(({ Menu }, needle) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    const recent = file?.submenu?.items.find((i) => i.label === 'Recent Items')
    const item = recent?.submenu?.items.find((i) => i.label?.includes(needle as string))
    item?.click()
  }, labelContains)
}

async function openFolder(): Promise<void> {
  await window.getByRole('button', { name: 'Open Folder' }).click()
}

/** Point the (shared) open dialog stub at a specific path before a menu action. */
async function stubDialog(target: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [p as string]
    })
  }, target)
}

// ---------- US1: reopen recent files and folders ----------

test('US1 opening a file via the File menu records it and it can be reopened', async () => {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, externalFile)

  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // The file appears in File > Recent Items labelled as a file.
  const items = await recentItemsState()
  expect(items.some((i) => i.label.startsWith('File:') && i.label.includes('external.md'))).toBe(true)

  // Reopen it from the menu: an already-open tab is simply activated.
  await clickRecentItem('external.md')
  await expect(window.locator('.document-title')).toContainText('external.md')
})

test('US1 reopening a recent file after its tab closed reopens it', async () => {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, externalFile)

  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // Close the tab, then reopen from Recent Items.
  await clickFileMenu('Close Tab')
  await expect(window.locator('.document-title')).not.toContainText('external.md')
  await clickRecentItem('external.md')
  await expect(window.locator('.document-title')).toContainText('external.md')
})

test('US1 opening a folder records it and it can be reopened as the workspace', async () => {
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const items = await recentItemsState()
  expect(items.some((i) => i.label.startsWith('Folder:') && i.label.includes('ame-recent-e2e'))).toBe(true)

  await clickRecentItem('ame-recent-e2e')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
})

test('US1 reopening an entry moves it to the front without a duplicate', async () => {
  await stubDialog(externalFile)

  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // Open a folder afterwards so the file is no longer the most recent.
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const items = await recentItemsState()
  expect(items[0].label).toContain('ame-recent-e2e')
  expect(items.length).toBe(2)

  // Reopen the file — it moves to the front, still exactly one entry. Poll:
  // the menu click starts an async renderer→main round trip, and the bump to
  // the front happens in main only after that round trip completes.
  await clickRecentItem('external.md')
  await expect.poll(async () => (await recentItemsState())[0]?.label).toContain('external.md')
  const itemsAfter = await recentItemsState()
  expect(itemsAfter.filter((i) => i.label.includes('external.md'))).toHaveLength(1)
})

test('US1 recent items survive an application restart', async () => {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, externalFile)

  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // Close the app, then relaunch with the same config dir.
  await app.close()
  app = await electron.launch({
    args: electronLaunchArgs,
    env: { ...process.env, AME_CONFIG_DIR: configDir }
  })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('external.md'))).toBe(true)

  await clickRecentItem('external.md')
  await expect(window.locator('.document-title')).toContainText('external.md')
})

// ---------- US2: distinguish recent item types ----------

test('US2 recent file and folder entries are visually distinguishable and open correctly', async () => {
  await stubDialog(externalFile)

  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const items = await recentItemsState()
  const fileEntry = items.find((i) => i.label.startsWith('File:'))
  const folderEntry = items.find((i) => i.label.startsWith('Folder:'))
  expect(fileEntry).toBeTruthy()
  expect(folderEntry).toBeTruthy()

  // Selecting the file activates a document tab.
  await clickRecentItem(externalFile)
  await expect(window.locator('.document-title')).toContainText('external.md')

  // Selecting the folder replaces the workspace.
  await clickRecentItem(testFolder)
  await expect(window.getByRole('treeitem').getByText('beta.md')).toBeVisible()
})

// ---------- US3: unavailable entries ----------

test('US3 a deleted recent file explains, preserves the session, and is removed', async () => {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, externalFile)

  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // Remove the file behind the app's back (no workspace open, so no watcher
  // interference), then attempt to reopen it from Recent Items.
  fs.rmSync(externalFile)
  await clickRecentItem('external.md')

  // In-context error; the session is unchanged (a clean tab for beta.md was
  // never opened, so the error dialog is the only prompt).
  await expect(window.getByText('Operation failed')).toBeVisible()

  // The dead entry is gone from the menu.
  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('external.md'))).toBe(false)
})

test('US3 a deleted recent folder explains, preserves the workspace, and is removed', async () => {
  // A dedicated folder that will be deleted while it is NOT the current
  // workspace, so deleting it cannot disturb the running watcher.
  const doomed = path.join(testFolder, 'doomed')
  fs.mkdirSync(doomed)
  fs.writeFileSync(path.join(doomed, 'gone.md'), '# Gone')

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  // Open the doomed folder as the workspace first (records it), then switch to
  // a different workspace so doomed is no longer current.
  await stubDialog(doomed)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('gone.md')).toBeVisible()

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  // Delete the now-inactive folder, then reopen it from Recent Items.
  fs.rmSync(doomed, { recursive: true, force: true })
  await clickRecentItem('doomed')
  await expect(window.getByText('Operation failed')).toBeVisible()

  // The current workspace is unchanged.
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  // The dead folder entry is gone.
  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('doomed'))).toBe(false)
})

// ---------- Edges ----------

test('empty history shows a disabled No Recent Items entry', async () => {
  const items = await recentItemsState()
  expect(items).toEqual([{ label: 'No Recent Items', enabled: false }])
})

test('FR-013 files opened from the explorer never appear in Recent Items', async () => {
  await openFolder()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('alpha.md'))).toBe(false)
})

test('FR-012 more than 10 qualifying opens keep only the 10 most recent', async () => {
  const files: string[] = []
  for (let i = 0; i < 12; i++) {
    const f = path.join(testFolder, `many-${i}.md`)
    fs.writeFileSync(f, `# Many ${i}`)
    files.push(f)
  }
  for (const f of files) {
    await stubDialog(f)
    await clickFileMenu('Open File')
    // Wait for this specific document to become the active tab so the open
    // (and its recent-items write) has completed before the next dialog stub
    // replaces the shared stub.
    await expect(window.locator('.document-title')).toContainText(path.basename(f))
  }

  const items = await recentItemsState()
  expect(items).toHaveLength(10)
  expect(items[0].label).toContain('many-11.md')
  expect(items.some((i) => i.label.includes('many-0.md'))).toBe(false)
})

test('a long path is shortened with an ellipsis keeping the final name', async () => {
  const longName = 'a-very-long-folder-name-that-should-not-fit-in-a-single-menu-label'
  const deep = path.join(testFolder, 'x', 'y', longName)
  fs.mkdirSync(deep, { recursive: true })

  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder as string]
    })
  }, deep)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('y')).toHaveCount(0)

  const items = await recentItemsState()
  const entry = items.find((i) => i.label.includes(longName))
  expect(entry).toBeTruthy()
  expect(entry!.label).toContain('…')
})
