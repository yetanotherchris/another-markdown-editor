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
  // externalFile is a shared fixture that the US3 deleted-file test removes;
  // recreate it so any later test that opens it has a real target.
  fs.writeFileSync(externalFile, '# External')
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
  // Track actual closure: waitForEvent with a timeout RESOLVES on timeout, so
  // a stalled quit round-trip must not be treated as "closed" (which would leak
  // a live Electron process into the next test). If the app did not close,
  // force it closed explicitly.
  let closed = false
  const closeEvent = app.waitForEvent('close', { timeout: 8000 }).then(() => { closed = true }).catch(() => {})
  const quitButton = window.getByRole('button', { name: 'Discard and Quit' })
  const dialogShown = expect(quitButton).toBeVisible({ timeout: 5000 }).then(() => true).catch(() => false)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await Promise.race([dialogShown, closeEvent])
  if (await quitButton.isVisible().catch(() => false)) {
    await quitButton.click()
  }
  if (!closed) {
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

/** The selectable recent entries in File > Recent Items (labels only; the
 *  separator and the Clear Recent Items action are excluded). */
async function recentItemsState(): Promise<{ label: string; enabled: boolean }[]> {
  return app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    const recent = file?.submenu?.items.find((i) => i.label === 'Recent Items')
    return (recent?.submenu?.items ?? [])
      .filter((i) => i.label && i.label !== 'Clear Recent Items')
      .map((i) => ({ label: i.label, enabled: i.enabled }))
  })
}

/** The full Recent Items submenu, including separators and the Clear action
 *  (separator labels are an empty string in Electron). */
async function recentMenuStructure(): Promise<{ label: string | undefined; enabled: boolean }[]> {
  return app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    const recent = file?.submenu?.items.find((i) => i.label === 'Recent Items')
    return (recent?.submenu?.items ?? []).map((i) => ({ label: i.label, enabled: i.enabled }))
  })
}

/** Click a Recent Items action by its exact label (e.g. Clear Recent Items). */
async function clickMenuAction(label: string): Promise<void> {
  await app.evaluate(({ Menu }, name) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    const recent = file?.submenu?.items.find((i) => i.label === 'Recent Items')
    const item = recent?.submenu?.items.find((i) => i.label === name as string)
    item?.click()
  }, label)
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

/** Focus the editor of the active tab and type text into it. */
async function typeInEditor(text: string): Promise<void> {
  await window.locator('[contenteditable="true"]').first().click()
  await window.keyboard.type(text)
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

  // The file appears in File > Recent Items (labels carry no File:/Folder:
  // prefix — the grouping conveys the type).
  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('external.md'))).toBe(true)

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
  expect(items.some((i) => i.label.includes('ame-recent-e2e'))).toBe(true)

  await clickRecentItem('ame-recent-e2e')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
})

test('US1 reopening an entry moves it to the front without a duplicate', async () => {
  await stubDialog(externalFile)

  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // A second file so the file group has an order to verify the bump with.
  const external2 = path.join(testFolder, 'external2.md')
  fs.writeFileSync(external2, '# External 2')
  await stubDialog(external2)
  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external2.md')

  // Open a folder afterwards so neither file is the most recent overall.
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const items = await recentItemsState()
  expect(items[0].label).toContain('ame-recent-e2e')
  expect(items).toHaveLength(3)

  // Reopen the older file — it stays a single entry and moves to the FRONT of
  // the FILES group (folders are grouped above files, FR-015). Poll: the menu
  // click starts an async renderer→main round trip, and the bump happens in
  // main only after that round trip completes. Position-based so a missing
  // bump is detectable.
  await clickRecentItem('external.md')
  await expect.poll(async () => {
    const state = await recentItemsState()
    return state.findIndex((i) => i.label.includes('external.md'))
  }).toBe(1)
  const itemsAfter = await recentItemsState()
  expect(itemsAfter.filter((i) => i.label.includes('external.md'))).toHaveLength(1)
  expect(itemsAfter.findIndex((i) => i.label.includes('external2.md'))).toBe(2)
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

test('US2 recent file and folder entries are distinguishable by grouping and open correctly', async () => {
  await stubDialog(externalFile)

  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  // Labels carry no File:/Folder: prefix (2026-08-04 clarification): the type
  // is conveyed by the FR-015 grouping — the folder entry sits in the top
  // group and the file entry below it, and a file name ends in `.md`.
  const items = await recentItemsState()
  expect(items).toHaveLength(2)
  expect(items[0].label).toContain('ame-recent-e2e')
  expect(items[0].label.endsWith('.md')).toBe(false)
  expect(items[1].label).toContain('external.md')

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

  // In-context error; the session is unchanged (the still-open external.md tab
  // remains, and the error dialog is the only prompt).
  await expect(window.getByText('Operation failed')).toBeVisible()

  // The dead entry is gone from the menu.
  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('external.md'))).toBe(false)

  // The open document session is unchanged after the failed reopen.
  await window.getByRole('button', { name: 'OK' }).click()
  await expect(window.locator('.document-title')).toContainText('external.md')
})

test('US3 a failed recent open never leaks an absolute path in the error', async () => {
  await stubDialog(externalFile)
  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // Record a second folder outside the current (nonexistent) workspace root,
  // then delete it: the prepare failure's sanitized message must not contain
  // the absolute path (Principle II).
  const doomedFolder = path.join(testFolder, 'doomed-leak')
  fs.mkdirSync(doomedFolder)
  fs.writeFileSync(path.join(doomedFolder, 'gone.md'), '# Gone')
  await stubDialog(doomedFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('gone.md')).toBeVisible()

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  fs.rmSync(doomedFolder, { recursive: true, force: true })
  await clickRecentItem('doomed-leak')
  await expect(window.getByText('Operation failed')).toBeVisible()
  const body = await window.getByRole('dialog').textContent()
  expect(body).not.toContain(doomedFolder)
  expect(body).not.toMatch(/[A-Za-z]:\\[^\s]*ame-recent-e2e/)
  await window.getByRole('button', { name: 'OK' }).click()
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

  // Functional probe: the live workspace in MAIN must be intact, not just the
  // renderer's stale tree — clicking a tree file drives file:read through
  // withWorkspace, which fails with NO_WORKSPACE if main nulled the root.
  await window.getByRole('button', { name: 'OK' }).click()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  // The dead folder entry is gone.
  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('doomed'))).toBe(false)
})

test('US3 cancelling an unsaved-work confirmation keeps the session and the recent folder', async () => {
  // Record two recent folders: the primary workspace and an alternative.
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const other = path.join(testFolder, 'other')
  await stubDialog(other)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('delta.md')).toBeVisible()

  // Back to the primary workspace, open a file and make it dirty.
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')
  await typeInEditor(' UNSAVED')

  // Reopen the alternative folder from Recent Items: the unsaved-work
  // confirmation appears before the workspace swap (US3 scenario 3).
  await clickRecentItem('other')
  await expect(window.getByRole('dialog')).toContainText('unsaved changes')
  await expect(window.getByRole('dialog')).toContainText('alpha.md')

  // Cancel: session intact, edit intact, recent entry still present.
  await window.getByRole('button', { name: 'Cancel' }).click()
  await expect(window.getByRole('dialog')).toHaveCount(0)
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('delta.md')).toHaveCount(0)
  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('other'))).toBe(true)

  // The prepared folder was genuinely abandoned: a late commit must fail
  // closed (a stale-pending bug would commit the old 'other' folder here).
  const probe = await window.evaluate(async () => {
    const api = (window as unknown as { api: { commitFolderOpen(): Promise<{ ok: boolean; code?: string }> } }).api
    return api.commitFolderOpen()
  })
  expect(probe).toMatchObject({ ok: false, code: 'NO_WORKSPACE' })
})

test('US3 Save All in the folder-open confirmation saves before switching folders', async () => {
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const other = path.join(testFolder, 'other')
  await stubDialog(other)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('delta.md')).toBeVisible()

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')
  await typeInEditor(' UNSAVED')

  await clickRecentItem('other')
  await expect(window.getByRole('dialog')).toContainText('unsaved changes')
  await window.getByRole('button', { name: 'Save All' }).click()

  // The document was saved to its current location, then the folder switched.
  expect(fs.readFileSync(path.join(testFolder, 'alpha.md'), 'utf-8')).toContain('UNSAVED')
  await expect(window.getByRole('dialog')).toHaveCount(0)
  await expect(window.getByRole('treeitem').getByText('delta.md')).toBeVisible()
})

test('US3 a failing Save All keeps the confirmation open and does not commit', async () => {
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const other = path.join(testFolder, 'other')
  await stubDialog(other)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('delta.md')).toBeVisible()

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')
  await typeInEditor(' UNSAVED')

  // Make the save fail (read-only). On Windows this is the read-only attribute;
  // on POSIX the mode bits. Either way the write throws.
  const alphaPath = path.join(testFolder, 'alpha.md')
  fs.chmodSync(alphaPath, 0o444)
  try {
    await clickRecentItem('other')
    await expect(window.getByRole('dialog')).toContainText('unsaved changes')
    await window.getByRole('button', { name: 'Save All' }).click()

    // The failed save keeps the confirmation open, does NOT commit (no delta.md
    // in the tree), and reports the failure.
    await expect(window.getByRole('dialog')).toContainText('Could not save alpha.md')
    await expect(window.getByRole('treeitem').getByText('delta.md')).toHaveCount(0)

    // Cancel leaves the session on the current folder.
    await window.getByRole('button', { name: 'Cancel' }).click()
    await expect(window.getByRole('dialog')).toHaveCount(0)
    await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  } finally {
    // Restore so the shared fixture and afterAll cleanup can delete the file.
    fs.chmodSync(alphaPath, 0o666)
  }
})

test('US3 Discard in the folder-open confirmation switches the folder without saving', async () => {
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const other = path.join(testFolder, 'other')
  await stubDialog(other)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('delta.md')).toBeVisible()

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')
  // A marker unique to this test: the shared fixture may already hold a prior
  // test's edits on disk, so assert on this edit only.
  await typeInEditor(' DISCARDED')

  await clickRecentItem('other')
  await expect(window.getByRole('dialog')).toContainText('unsaved changes')
  await window.getByRole('button', { name: 'Discard' }).click()

  // Nothing was written to disk; the folder still switched; and "Discard"
  // actually discarded — the dirty alpha.md tab is CLOSED (leaving it open
  // dirty would let a later save write its content over the new folder's
  // file sharing the same relative path).
  expect(fs.readFileSync(path.join(testFolder, 'alpha.md'), 'utf-8')).not.toContain('DISCARDED')
  await expect(window.getByRole('dialog')).toHaveCount(0)
  await expect(window.getByRole('treeitem').getByText('delta.md')).toBeVisible()
  await expect(window.locator('.document-title')).not.toContainText('alpha.md')
})

// ---------- Edges ----------

test('empty history shows a disabled No Recent Items entry and no Clear action', async () => {
  const items = await recentItemsState()
  expect(items).toEqual([{ label: 'No Recent Items', enabled: false }])
  // Spec edge: an empty list offers no Clear Recent Items action.
  const structure = await recentMenuStructure()
  expect(structure).toEqual([{ label: 'No Recent Items', enabled: false }])
})

test('only files recorded: no leading/dangling separator (spec edge)', async () => {
  await stubDialog(externalFile)
  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // [file, separator, Clear Recent Items] — the folders/files separator must
  // not dangle at the top of the submenu when the folder group is empty.
  const labels = (await recentMenuStructure()).map((i) => i.label)
  expect(labels[0]?.includes('external.md')).toBe(true)
  expect(labels[1]).toBeFalsy()
  expect(labels[2]).toBe('Clear Recent Items')
})

test('only folders recorded: no leading/dangling separator (spec edge)', async () => {
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const labels = (await recentMenuStructure()).map((i) => i.label)
  expect(labels[0]?.includes('ame-recent-e2e')).toBe(true)
  expect(labels[1]).toBeFalsy()
  expect(labels[2]).toBe('Clear Recent Items')
})

test('FR-013 files opened from the explorer never appear in Recent Items', async () => {
  await openFolder()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('alpha.md'))).toBe(false)
})

test('R4 paths main never recorded are rejected with OUTSIDE_WORKSPACE', async () => {
  const unrecorded = path.join(testFolder, 'never-recorded.md')
  fs.writeFileSync(unrecorded, '# Never')
  const fileProbe = await window.evaluate(async (p) => {
    const api = (window as unknown as { api: { openRecentFile(p: string): Promise<{ ok: boolean; code?: string }> } }).api
    return api.openRecentFile(p)
  }, unrecorded)
  expect(fileProbe).toMatchObject({ ok: false, code: 'OUTSIDE_WORKSPACE' })

  const folderProbe = await window.evaluate(async (p) => {
    const api = (window as unknown as { api: { prepareFolderOpen(p: string): Promise<{ ok: boolean; code?: string }> } }).api
    return api.prepareFolderOpen(p)
  }, unrecorded)
  expect(folderProbe).toMatchObject({ ok: false, code: 'OUTSIDE_WORKSPACE' })
})

test('a recent folder whose path is now a regular file is dropped with NOT_FOUND', async () => {
  // A folder that will later become a FILE (wrong type at reopen) — the
  // exists-but-unopenable branch of FR-009.
  const target = path.join(testFolder, 'type-swap')
  fs.mkdirSync(target)
  fs.writeFileSync(path.join(target, 'leaf.md'), '# Leaf')
  await stubDialog(target)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('leaf.md')).toBeVisible()

  // Switch to another workspace so target is no longer current, then turn the
  // folder into a regular file behind the app's back.
  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  fs.rmSync(target, { recursive: true, force: true })
  fs.writeFileSync(target, '# Now a file')

  await clickRecentItem('type-swap')
  await expect(window.getByText('Operation failed')).toBeVisible()
  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('type-swap'))).toBe(false)
})

test('Unicode and whitespace path entries record and reopen', async () => {
  const unicodeFolder = path.join(testFolder, '名 文件夹')
  fs.mkdirSync(unicodeFolder, { recursive: true })
  const unicodeFile = path.join(unicodeFolder, '文 档 .md')
  fs.writeFileSync(unicodeFile, '# Unicode')

  await stubDialog(unicodeFile)
  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('文 档 .md')

  await stubDialog(unicodeFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('文 档 .md')).toBeVisible()

  const items = await recentItemsState()
  expect(items.some((i) => i.label.includes('文 档 .md'))).toBe(true)

  await clickRecentItem('文 档 .md')
  await expect(window.locator('.document-title')).toContainText('文 档 .md')
})

test('FR-012 more than 5 qualifying files keep only the 5 most recent files', async () => {
  const files: string[] = []
  for (let i = 0; i < 7; i++) {
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
  expect(items).toHaveLength(5)
  expect(items[0].label).toContain('many-6.md')
  expect(items.some((i) => i.label.includes('many-0.md'))).toBe(false)
})

test('FR-012 more than 5 qualifying folders keep only the 5 most recent folders', async () => {
  const folders: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = path.join(testFolder, `dir-${i}`)
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'leaf.md'), `# Leaf ${i}`)
    folders.push(d)
  }
  for (const d of folders) {
    await stubDialog(d)
    await clickFileMenu('Open Folder')
    await expect(window.getByRole('treeitem').getByText('leaf.md')).toBeVisible()
  }

  const items = await recentItemsState()
  // Only folders were recorded, so every entry is a folder (labels carry no
  // type prefix; the group is the type signal).
  expect(items).toHaveLength(5)
  expect(items[0].label).toContain('dir-6')
  expect(items.some((i) => i.label.includes('dir-0'))).toBe(false)
})

test('US2 folders are grouped above files, then Clear Recent Items (FR-015)', async () => {
  await stubDialog(externalFile)
  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const labels = (await recentMenuStructure()).map((i) => i.label)
  // [Folder, separator, File, separator, Clear Recent Items] (separators have
  // an empty label in Electron). Without a type prefix the group position
  // identifies the kind: the folder entry names the workspace temp dir, the
  // file entry ends in .md.
  expect(labels[0]?.includes('ame-recent-e2e')).toBe(true)
  expect(labels[1]).toBeFalsy()
  expect(labels[2]?.endsWith('external.md')).toBe(true)
  expect(labels[3]).toBeFalsy()
  expect(labels[4]).toBe('Clear Recent Items')
})

test('US4 Clear Recent Items empties the history, untouched session, persists across restart', async () => {
  await stubDialog(externalFile)
  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  expect((await recentItemsState()).length).toBe(2)

  await clickMenuAction('Clear Recent Items')
  await expect.poll(async () => await recentItemsState())
    .toEqual([{ label: 'No Recent Items', enabled: false }])
  expect(await recentItemsState()).toEqual([{ label: 'No Recent Items', enabled: false }])

  // The open document session is untouched (FR-014).
  await expect(window.locator('.document-title')).toContainText('external.md')

  // US4 scenario 3: the cleared history survives a restart.
  await app.close()
  app = await electron.launch({
    args: electronLaunchArgs,
    env: { ...process.env, AME_CONFIG_DIR: configDir }
  })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  expect(await recentItemsState()).toEqual([{ label: 'No Recent Items', enabled: false }])
})

test('FR-011 a config write failure is a quiet footer note and does not fail the open', async () => {
  // Break the config path: the directory named by AME_CONFIG_DIR becomes a
  // file, so the atomic write (mkdir + temp + rename) cannot proceed.
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.writeFileSync(configDir, 'x')

  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, externalFile)
  await clickFileMenu('Open File')

  // The open still succeeds (FR-011)...
  await expect(window.locator('.document-title')).toContainText('external.md')

  // ...and the persistence failure surfaces as a quiet, non-modal footer note.
  await expect(window.getByTestId('footer-note')).toContainText('Recent Items could not be saved')
})

test('FR-011 a config write failure during a FOLDER open is non-fatal', async () => {
  // Break the config path before the folder open.
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.writeFileSync(configDir, 'x')

  await stubDialog(testFolder)
  await clickFileMenu('Open Folder')

  // The folder still commits as the workspace (FR-003/FR-011)...
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  // ...and the persistence failure surfaces as a quiet footer note.
  await expect(window.getByTestId('footer-note')).toContainText('Recent Items could not be saved')
})

test('FR-011 Clear Recent Items with a broken config reports quietly', async () => {
  await stubDialog(externalFile)
  await clickFileMenu('Open File')
  await expect(window.locator('.document-title')).toContainText('external.md')

  // Break the config path AFTER recording, then clear.
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.writeFileSync(configDir, 'x')
  await clickMenuAction('Clear Recent Items')

  // The clear is best-effort: the failure is a quiet note, never a modal, and
  // the session is untouched.
  await expect(window.getByTestId('footer-note')).toContainText('Recent Items could not be cleared')
  await expect(window.locator('.document-title')).toContainText('external.md')
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
