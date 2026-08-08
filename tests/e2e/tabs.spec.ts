import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  launchApp,
  closeAppSafely,
  stubMessageBox,
  messageBoxCallCount,
  lastMessageBoxOptions,
  clickHamburgerItem,
  openHamburger
} from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-tabs-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta\n\nSecond file.')
  // Extra files to drive the 8-instance LRU eviction cap (T035/R2).
  for (let i = 1; i <= 9; i++) {
    fs.writeFileSync(path.join(testFolder, `f${String(i).padStart(2, '0')}.md`), `# File ${i}`)
  }
})

test.beforeEach(async () => {
  ;({ app, window } = await launchApp(undefined, testFolder))

  // Reset the fixture file in case a previous test modified it.
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta\n\nSecond file.')
})

test.afterEach(async () => {
  await closeAppSafely(app)
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function openFolderAndFile(fileName: string): Promise<void> {
  await clickHamburgerItem(window, 'Open Folder…')
  await window.getByRole('treeitem').getByText(fileName).click()
}

async function openSecondFile(fileName: string): Promise<void> {
  // Spec 024: a single click on a clean active tab REPLACES it, so multi-tab
  // setups use the explicit new-tab action (middle-click, FR-005).
  await window.getByRole('treeitem').getByText(fileName).click({ button: 'middle' })
}

async function typeInEditor(text: string): Promise<void> {
  await window.locator('[contenteditable="true"]').first().click()
  await window.keyboard.type(text)
}

test('opening a second file creates two tabs and activates the second', async () => {
  await openFolderAndFile('alpha.md')
  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toBeVisible()
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  await openSecondFile('beta.md')
  await expect(window.getByRole('tab')).toHaveCount(2)
  await expect(window.locator('.document-title')).toContainText('beta.md')
})

test('clicking a tab switches the active document', async () => {
  await openFolderAndFile('alpha.md')
  await openSecondFile('beta.md')

  await window.getByRole('tab', { name: /alpha\.md/ }).click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  await window.getByRole('tab', { name: /beta\.md/ }).click()
  await expect(window.locator('.document-title')).toContainText('beta.md')
})

test('reopening an already-open file activates its tab instead of duplicating', async () => {
  await openFolderAndFile('alpha.md')
  await openSecondFile('beta.md')
  await window.getByRole('tab', { name: /alpha\.md/ }).click()

  await openSecondFile('alpha.md')
  await expect(window.getByRole('tab')).toHaveCount(2)
  await expect(window.locator('.document-title')).toContainText('alpha.md')
})

test('edits mark a tab dirty and survive tab switches', async () => {
  await openFolderAndFile('alpha.md')
  await openSecondFile('beta.md')

  const alphaTab = window.getByRole('tab', { name: /alpha\.md/ })
  await alphaTab.click()
  await typeInEditor(' EXTRA')

  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()
  await expect(window.locator('.document-title')).toContainText('\u2022')

  await window.getByRole('tab', { name: /beta\.md/ }).click()
  await window.getByRole('tab', { name: /alpha\.md/ }).click()

  await expect(window.locator('.ProseMirror:visible')).toContainText('EXTRA')
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()
})

test('opening a no-trailing-newline file stays clean, and edit undone to original clears dirty', async () => {
  await openFolderAndFile('alpha.md')

  // alpha.md is written without a trailing newline; the editor appends one on
  // serialization, but a pristine document must not show a dirty marker.
  const alphaTab = window.getByRole('tab', { name: /alpha\.md/ })
  await expect(alphaTab.locator('.tab-dirty')).toHaveCount(0)

  await typeInEditor(' EXTRA')
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()

  // Undo back to the original content: no real change remains, so the dirty
  // marker clears (the appended trailing newline is not an edit).
  await window.keyboard.press('Control+z')
  await expect(alphaTab.locator('.tab-dirty')).toHaveCount(0)
})

test('closing a clean tab closes it without a prompt', async () => {
  await openFolderAndFile('alpha.md')
  await openSecondFile('beta.md')

  await window.getByRole('button', { name: 'Close alpha.md' }).click()
  await expect(window.getByRole('tab')).toHaveCount(1)
  // No native prompt may fire for a clean close.
  await expect.poll(() => messageBoxCallCount(app)).toBe(0)
  await expect(window.locator('.document-title')).toContainText('beta.md')
})

test('closing a dirty tab prompts; cancel keeps it open', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  // The native box is stubbed to the safe cancellation decision.
  await stubMessageBox(app, 'Cancel')
  await window.getByRole('button', { name: 'Close alpha.md' }).click()

  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toBeVisible()
})

test('closing a dirty tab with Discard removes it', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  await stubMessageBox(app, "Don't Save")
  await window.getByRole('button', { name: 'Close alpha.md' }).click()

  await expect(window.getByRole('tab')).toHaveCount(0)
  await expect(window.locator('.empty-state')).toBeVisible()
})

test('closing a dirty tab with Save writes the file and closes it', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close alpha.md' }).click()

  await expect(window.getByRole('tab')).toHaveCount(0)
  const disk = fs.readFileSync(path.join(testFolder, 'alpha.md'), 'utf-8')
  expect(disk).toContain('EXTRA')
})

test('closing a dirty tab with a failing save re-prompts and keeps the tab open and unsaved', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  // Make the save fail at temp-file creation. A read-only destination alone is
  // insufficient on POSIX because rename permission belongs to the directory.
  const alphaPath = path.join(testFolder, 'alpha.md')
  const folderMode = process.platform === 'win32' ? undefined : fs.statSync(testFolder).mode
  if (process.platform === 'win32') fs.chmodSync(alphaPath, 0o444)
  else fs.chmodSync(testFolder, 0o555)
  try {
    await stubMessageBox(app, ['Save', 'cancel'])
    await window.getByRole('button', { name: 'Close alpha.md' }).click()

    // The re-prompt is proven by the stub receiving a second call; the tab
    // stays open and dirty, and nothing was written to disk.
    await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(2)
    // The re-prompt must EXPLAIN the failure, not just re-appear (FR-007/008,
    // US2 scenario 4): assert the native detail carries the explanation.
    const last = await lastMessageBoxOptions(app)
    expect(last.detail).toContain('Could not save alpha.md')
    await expect(window.getByRole('tab', { name: /alpha\.md/ })).toBeVisible()
    await expect(window.getByRole('tab', { name: /alpha\.md/ }).locator('.tab-dirty')).toBeVisible()
    expect(fs.readFileSync(alphaPath, 'utf-8')).not.toContain('EXTRA')
  } finally {
    if (process.platform === 'win32') fs.chmodSync(alphaPath, 0o666)
    else fs.chmodSync(testFolder, folderMode ?? 0o755)
  }
})

test('quitting with dirty documents prompts, and cancel keeps the app open', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  await stubMessageBox(app, 'Cancel')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })

  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(1)
  await expect(window.locator('.document-title')).toContainText('alpha.md')
})

test('quitting with Discard and Quit closes the application', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  const closed = app.waitForEvent('close')
  await stubMessageBox(app, 'Discard and Quit')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await closed
})

test('quitting with Save All writes every dirty document and closes the app', async () => {
  await openFolderAndFile('alpha.md')
  await openSecondFile('beta.md')

  // Dirty both documents. typeInEditor targets the FIRST contenteditable in the
  // DOM, so activate the tab being typed into first (the active editor is the
  // visible one; the others stay mounted but hidden).
  await window.getByRole('tab', { name: /alpha\.md/ }).click()
  await typeInEditor(' ALPHA')
  await window.getByRole('tab', { name: /beta\.md/ }).click()
  await window.locator('[contenteditable="true"]:visible').click()
  await window.keyboard.type(' BETA')

  const closed = app.waitForEvent('close')
  await stubMessageBox(app, 'Save All')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await closed
  // Save All wrote both dirty documents to disk before quitting.
  expect(fs.readFileSync(path.join(testFolder, 'alpha.md'), 'utf-8')).toContain('ALPHA')
  expect(fs.readFileSync(path.join(testFolder, 'beta.md'), 'utf-8')).toContain('BETA')
})

test('hamburger Quit with a dirty document prompts, and cancel keeps the app open', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  await stubMessageBox(app, 'Cancel')
  await clickHamburgerItem(window, 'Quit')

  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(1)
  await expect(window.locator('.document-title')).toContainText('alpha.md')
})

test('hamburger Quit with Discard and Quit closes the application', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  const closed = app.waitForEvent('close')
  await stubMessageBox(app, 'Discard and Quit')
  // Click Quit directly (not via clickHamburgerItem, whose post-click focus
  // step cannot run once the app closes).
  await openHamburger(window)
  await window.getByRole('menuitem', { name: 'Quit' }).click()
  await closed
})

test('external change to a clean document auto-reloads it', async () => {
  await openFolderAndFile('alpha.md')
  await expect(window.locator('.ProseMirror')).toContainText('Hello world.')

  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nChanged by another program.')

  await expect(window.locator('.ProseMirror')).toContainText('Changed by another program.', {
    timeout: 15_000
  })
  // A clean document auto-reloads with no prompt.
  await expect.poll(() => messageBoxCallCount(app)).toBe(0)
})

test('external change to a dirty document: Keep My Version keeps the edit', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' MYEDIT')

  // The native keep-or-reload box is stubbed to the safe choice (Keep).
  await stubMessageBox(app, 'Keep My Version')
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nChanged by another program.')

  await expect(window.locator('.ProseMirror:visible')).toContainText('MYEDIT', { timeout: 15_000 })
  await expect(window.getByRole('tab', { name: /alpha\.md/ }).locator('.tab-dirty')).toBeVisible()
})

test('external change to a dirty document: Reload from Disk replaces the edit', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' MYEDIT')

  await stubMessageBox(app, 'Reload from Disk')
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nChanged by another program.')

  await expect(window.locator('.ProseMirror:visible')).toContainText(
    'Changed by another program.',
    { timeout: 15_000 }
  )
  await expect(window.locator('.ProseMirror:visible')).not.toContainText('MYEDIT')
  await expect(window.getByRole('tab', { name: /alpha\.md/ }).locator('.tab-dirty')).toHaveCount(0)
})

test('external deletion of an open dirty document prompts ok/save-as', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' MYEDIT')

  // Save As keeps the content by writing it to a new location; the tab stays
  // open because its backing file is gone.
  const savedPath = path.join(testFolder, 'alpha-saved.md')
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: p as string
    })
  }, savedPath)
  await stubMessageBox(app, 'Save As...')
  fs.rmSync(path.join(testFolder, 'alpha.md'))

  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toBeVisible({ timeout: 15_000 })
  await expect(async () => {
    expect(fs.readFileSync(savedPath, 'utf-8')).toContain('MYEDIT')
  }).toPass({ timeout: 10_000 })
})

test('external deletion of an open document: OK keeps it in memory', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' MYEDIT')

  await stubMessageBox(app, 'OK')
  fs.rmSync(path.join(testFolder, 'alpha.md'))

  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toBeVisible({ timeout: 15_000 })
  await expect(window.locator('.ProseMirror:visible')).toContainText('MYEDIT')
  await expect(window.getByRole('tab', { name: /alpha\.md/ }).locator('.tab-warning')).toBeVisible()
})

test('switching to the oldest tab at the instance cap keeps its editor alive', async () => {
  await clickHamburgerItem(window, 'Open Folder…')
  // Fill the pool to the 8-instance cap. Middle-click (spec 024 FR-005) so each
  // file opens in a new tab rather than replacing the clean active tab.
  for (let i = 1; i <= 8; i++) {
    await window
      .getByRole('treeitem')
      .getByText(`f${String(i).padStart(2, '0')}.md`)
      .click({ button: 'middle' })
  }
  // Activate the oldest tab; eviction must not take the just-activated editor.
  await window.getByRole('tab', { name: /f01\.md/ }).click()
  await expect(window.locator('.document-title')).toContainText('f01.md')

  await typeInEditor(' EDITABLE')
  await expect(window.getByRole('tab', { name: /f01\.md/ }).locator('.tab-dirty')).toBeVisible()
})

test('reopening an evicted document from the tree brings its editor back', async () => {
  await clickHamburgerItem(window, 'Open Folder…')
  // Open nine files so the oldest (f01) is evicted by the LRU cap. Middle-click
  // (spec 024 FR-005) so every file opens in a new tab.
  for (let i = 1; i <= 9; i++) {
    await window
      .getByRole('treeitem')
      .getByText(`f${String(i).padStart(2, '0')}.md`)
      .click({ button: 'middle' })
  }
  // Re-open the evicted file from the tree: the active tab must not be dead.
  await window.getByRole('treeitem').getByText('f01.md').click()
  await expect(window.locator('.document-title')).toContainText('f01.md')

  await typeInEditor(' BACK')
  await expect(window.getByRole('tab', { name: /f01\.md/ }).locator('.tab-dirty')).toBeVisible()
})

// Crepe's top-bar icons clip via a document-global url(#clip...) fragment id;
// with several editor hosts in the DOM the later editors' icons would resolve
// against the first host's (hidden) clipPath and never paint. App.css sets
// clip-path: none on those groups (research.md R22); assume the active tab's
// top bar still has the rules applied.
test('top-bar clip-path groups are neutralised so icons paint on any tab', async () => {
  await openFolderAndFile('alpha.md')
  await openSecondFile('beta.md')

  const clipped = window.locator('.editor-host:visible .milkdown-top-bar svg g[clip-path]')
  await expect(clipped).toHaveCount(7)
  const clipValues = await clipped.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).clipPath)
  )
  for (const value of clipValues) {
    expect(value).toBe('none')
  }
})
