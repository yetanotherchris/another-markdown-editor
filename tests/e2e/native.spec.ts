import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { electronLaunchArgs } from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-native-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta')
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
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function openFolder(): Promise<void> {
  await window.getByRole('button', { name: 'Open Folder' }).click()
}

async function openFile(name: string): Promise<void> {
  await window.getByRole('treeitem').getByText(name).click()
}

// ---------- US1: native tree icons ----------

test('US1 tree rows render cohesive lucide icons (folder, file, chevron)', async () => {
  await openFolder()

  // Folders show a Folder icon (closed state) with a chevron toggle.
  const subRow = window.getByRole('treeitem').filter({ hasText: 'sub' })
  await expect(subRow.locator('.tree-node-icon svg')).toBeVisible()
  await expect(subRow.getByRole('button', { name: 'Expand' })).toBeVisible()

  // Files show a FileText icon and no expand toggle.
  const alphaRow = window.getByRole('treeitem').filter({ hasText: 'alpha.md' })
  await expect(alphaRow.locator('.tree-node-icon svg')).toBeVisible()
  await expect(alphaRow.getByRole('button', { name: 'Expand' })).toHaveCount(0)

  // Expand flips the affordance (chevron + open-folder icon).
  await subRow.getByRole('button', { name: 'Expand' }).click()
  await expect(subRow.getByRole('button', { name: 'Collapse' })).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('gamma.md')).toBeVisible()
})

test('US1 keyboard access to the expand control (FR-013)', async () => {
  await openFolder()
  const subRow = window.getByRole('treeitem').filter({ hasText: 'sub' })
  const toggle = subRow.getByRole('button', { name: 'Expand' })
  // A real <button> is natively keyboard-focusable and Enter/Space-operable;
  // its accessible name exposes the purpose without relying on the icon
  // (US2 acceptance 3).
  await expect(toggle).toHaveAccessibleName('Expand')
  // The keyboard focus ring is defined in the loaded stylesheet (react-arborist
  // manages row focus, so assert the rule rather than transient DOM focus).
  const hasFocusRule = await window.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if ((rule as CSSStyleRule).selectorText?.includes('.tree-node-toggle:focus-visible')) {
            return true
          }
        }
      } catch {
        /* cross-origin sheet — skip */
      }
    }
    return false
  })
  expect(hasFocusRule).toBe(true)
})

// ---------- US2: toolbar action buttons use icons ----------

test('US2 New and Open Folder buttons show icons with accessible names', async () => {
  // Accessible names are preserved (text labels retained).
  await expect(window.getByRole('button', { name: 'New' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Open Folder' })).toBeVisible()

  // Each carries a lucide icon inside the button.
  const newIcon = await window.getByRole('button', { name: 'New' })
    .locator('svg').count()
  const openIcon = await window.getByRole('button', { name: 'Open Folder' })
    .locator('svg').count()
  expect(newIcon).toBe(1)
  expect(openIcon).toBe(1)
})

// ---------- US3: status footer ----------

test('US3 footer left shows the active document and follows tab switches', async () => {
  await openFolder()
  await openFile('alpha.md')
  await expect(window.locator('.app-footer .document-title')).toContainText('alpha.md')

  await openFile('beta.md')
  await expect(window.locator('.app-footer .document-title')).toContainText('beta.md')

  // Editing marks the footer's document label dirty (existing .document-title
  // contract, now in the footer — FR-011 keeps it out of the header).
  await openFile('alpha.md')
  await expect(window.locator('.app-footer .document-title')).toContainText('alpha.md')
  await window.locator('[contenteditable="true"]:visible').first().click()
  await window.keyboard.type('x')
  await expect(window.locator('.app-footer .document-title')).toContainText('\u2022')
})

test('US3 footer right shows the workspace full path', async () => {
  await openFolder()
  // The footer shows the resolved path of the opened folder (research R-Path).
  const resolved = fs.realpathSync(testFolder)
  await expect(window.getByTestId('footer-workspace')).toHaveText(resolved)
  // The full path is also the hover tooltip.
  await expect(window.getByTestId('footer-workspace')).toHaveAttribute('title', resolved)
})

test('US3 footer right shortens a long workspace path keeping the final folder', async () => {
  // Open a deeply nested workspace so the path exceeds the footer width.
  const longName = 'very-long-workspace-folder-name-that-will-not-fit'
  const nested = path.join(testFolder, 'parent', 'deep', longName)
  fs.mkdirSync(nested, { recursive: true })

  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder as string]
    })
  }, nested)
  await openFolder()

  const workspaceText = await window.getByTestId('footer-workspace').textContent()
  expect(workspaceText).toContain('…')
  // The final folder name survives whole (FR-010).
  expect(workspaceText).toContain(longName)
  // Nothing overlaps the footer: the workspace span does not overflow its box.
  const overflow = await window.getByTestId('footer-workspace').evaluate((el) => {
    return el.scrollWidth > el.clientWidth
  })
  expect(overflow).toBe(false)
})

test('US3 placeholders show with no workspace and no document', async () => {
  // Fresh app: no workspace, no document.
  await expect(window.getByTestId('footer-workspace')).toContainText('No folder open')
  await expect(window.getByTestId('footer-document')).toContainText('No document open')
})

test('US3 the header no longer shows the active document (FR-011)', async () => {
  await openFolder()
  await openFile('alpha.md')
  // The header toolbar has no document-title span; the footer carries it.
  await expect(window.locator('.toolbar .document-title')).toHaveCount(0)
  await expect(window.locator('.app-footer .document-title')).toContainText('alpha.md')
})

// ---------- US4: offline font + icons ----------

test('US4 Inter is loaded from bundled assets (no network dependency)', async () => {
  await openFolder()
  // The typeface must be available without a network fetch (FR-007).
  const loaded = await window.evaluate(() => document.fonts.check('16px Inter'))
  expect(loaded).toBe(true)
  // The chrome resolves to Inter.
  const font = await window.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(font).toContain('Inter')
})

// ---------- Edges ----------

test('untitled document shows its display title in the footer', async () => {
  await window.getByRole('button', { name: 'New' }).click()
  await expect(window.getByTestId('footer-document')).toContainText(/Untitled-\d/)
})
