import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-tabs-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta\n\nSecond file.')
  // Extra files to drive the 8-instance LRU eviction cap (T035/R2).
  for (let i = 1; i <= 9; i++) {
    fs.writeFileSync(path.join(testFolder, `f${String(i).padStart(2, '0')}.md`), `# File ${i}`)
  }
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

  // Reset the fixture file in case a previous test modified it.
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta\n\nSecond file.')
})

test.afterEach(async () => {
  // Playwright's window close triggers the application's real quit guard:
  // when a test leaves dirty documents behind, a "Quit with unsaved changes"
  // dialog appears and blocks the close. Dismiss it the same way a user would.
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
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function openFolderAndFile(fileName: string): Promise<void> {
  await window.getByRole('button', { name: 'Open Folder' }).click()
  await window.getByRole('treeitem').getByText(fileName).click()
}

async function openSecondFile(fileName: string): Promise<void> {
  await window.getByRole('treeitem').getByText(fileName).click()
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

test('closing a clean tab closes it without a prompt', async () => {
  await openFolderAndFile('alpha.md')
  await openSecondFile('beta.md')

  await window.getByRole('button', { name: 'Close alpha.md' }).click()
  await expect(window.getByRole('tab')).toHaveCount(1)
  await expect(window.getByRole('dialog')).toHaveCount(0)
  await expect(window.locator('.document-title')).toContainText('beta.md')
})

test('closing a dirty tab prompts; cancel keeps it open', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  await window.getByRole('button', { name: 'Close alpha.md' }).click()
  await expect(window.getByRole('dialog')).toBeVisible()
  await expect(window.getByRole('dialog')).toContainText('alpha.md')
  await expect(window.getByRole('dialog')).toContainText('Unsaved changes')

  await window.getByRole('button', { name: 'Cancel' }).click()
  await expect(window.getByRole('dialog')).toHaveCount(0)
  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toBeVisible()
})

test('closing a dirty tab with Discard removes it', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  await window.getByRole('button', { name: 'Close alpha.md' }).click()
  await window.getByRole('button', { name: 'Discard' }).click()

  await expect(window.getByRole('tab')).toHaveCount(0)
  await expect(window.locator('.empty-state')).toBeVisible()
})

test('closing a dirty tab with Save writes the file and closes it', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  await window.getByRole('button', { name: 'Close alpha.md' }).click()
  await window.getByRole('button', { name: 'Save' }).click()

  await expect(window.getByRole('tab')).toHaveCount(0)
  const disk = fs.readFileSync(path.join(testFolder, 'alpha.md'), 'utf-8')
  expect(disk).toContain('EXTRA')
})

test('quitting with dirty documents prompts, and cancel keeps the app open', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })

  await expect(window.getByRole('dialog')).toBeVisible()
  await expect(window.getByRole('dialog')).toContainText('alpha.md')
  await expect(window.getByRole('button', { name: 'Discard and Quit' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Save All and Quit' })).toBeVisible()

  await window.getByRole('button', { name: 'Cancel' }).click()
  await expect(window.getByRole('dialog')).toHaveCount(0)
  await expect(window.locator('.document-title')).toContainText('alpha.md')
})

test('quitting with Discard and Quit closes the application', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' EXTRA')

  const closed = app.waitForEvent('close')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await expect(window.getByRole('dialog')).toBeVisible()
  await window.getByRole('button', { name: 'Discard and Quit' }).click()
  await closed
})

test('external change to a clean document auto-reloads it', async () => {
  await openFolderAndFile('alpha.md')
  await expect(window.locator('.ProseMirror')).toContainText('Hello world.')

  fs.writeFileSync(
    path.join(testFolder, 'alpha.md'),
    '# Alpha\n\nChanged by another program.'
  )

  await expect(window.locator('.ProseMirror')).toContainText('Changed by another program.', {
    timeout: 15_000
  })
  await expect(window.getByRole('dialog')).toHaveCount(0)
})

test('external change to a dirty document prompts keep-or-reload', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' MYEDIT')

  fs.writeFileSync(
    path.join(testFolder, 'alpha.md'),
    '# Alpha\n\nChanged by another program.'
  )

  await expect(window.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
  await expect(window.getByRole('dialog')).toContainText('File changed on disk')
  await expect(window.getByRole('button', { name: 'Keep My Version' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Reload from Disk' })).toBeVisible()

  await window.getByRole('button', { name: 'Keep My Version' }).click()
  await expect(window.locator('.ProseMirror:visible')).toContainText('MYEDIT')
  await expect(window.getByRole('tab', { name: /alpha\.md/ }).locator('.tab-dirty')).toBeVisible()
})

test('external change to a dirty document: Reload from Disk replaces the edit', async () => {
  await openFolderAndFile('alpha.md')
  await typeInEditor(' MYEDIT')

  fs.writeFileSync(
    path.join(testFolder, 'alpha.md'),
    '# Alpha\n\nChanged by another program.'
  )

  await expect(window.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
  await window.getByRole('button', { name: 'Reload from Disk' }).click()

  await expect(window.locator('.ProseMirror:visible')).toContainText(
    'Changed by another program.',
    { timeout: 15_000 }
  )
  await expect(window.locator('.ProseMirror:visible')).not.toContainText('MYEDIT')
  await expect(window.getByRole('tab', { name: /alpha\.md/ }).locator('.tab-dirty')).toHaveCount(0)
  await expect(window.getByRole('dialog')).toHaveCount(0)
})

test('switching to the oldest tab at the instance cap keeps its editor alive', async () => {
  await window.getByRole('button', { name: 'Open Folder' }).click()
  // Fill the pool to the 8-instance cap.
  for (let i = 1; i <= 8; i++) {
    await window.getByRole('treeitem').getByText(`f${String(i).padStart(2, '0')}.md`).click()
  }
  // Activate the oldest tab; eviction must not take the just-activated editor.
  await window.getByRole('tab', { name: /f01\.md/ }).click()
  await expect(window.locator('.document-title')).toContainText('f01.md')

  await typeInEditor(' EDITABLE')
  await expect(window.getByRole('tab', { name: /f01\.md/ }).locator('.tab-dirty')).toBeVisible()
})

test('reopening an evicted document from the tree brings its editor back', async () => {
  await window.getByRole('button', { name: 'Open Folder' }).click()
  // Open nine files so the oldest (f01) is evicted by the LRU cap.
  for (let i = 1; i <= 9; i++) {
    await window.getByRole('treeitem').getByText(`f${String(i).padStart(2, '0')}.md`).click()
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

  const clipped = window.locator(
    '.editor-host:visible .milkdown-top-bar svg g[clip-path]'
  )
  await expect(clipped).toHaveCount(7)
  const clipValues = await clipped.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).clipPath)
  )
  for (const value of clipValues) {
    expect(value).toBe('none')
  }
})
