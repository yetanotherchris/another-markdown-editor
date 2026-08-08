import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { launchApp, closeAppSafely, clickHamburgerItem } from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-native-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta')
  fs.mkdirSync(path.join(testFolder, 'sub'))
  fs.writeFileSync(path.join(testFolder, 'sub', 'gamma.md'), '# Gamma')
})

test.beforeEach(async () => {
  ;({ app, window } = await launchApp(undefined, testFolder))
})

test.afterEach(async () => {
  await closeAppSafely(app)
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function openFolder(): Promise<void> {
  // US3 opens empty / deeply nested workspaces, so unlike the shared helper
  // this must not wait for a treeitem (an empty folder has none).
  await clickHamburgerItem(window, 'Open Folder…')
}

async function openFile(name: string): Promise<void> {
  await window.getByRole('treeitem').getByText(name).click()
}

// ---------- US1: native tree icons ----------

test.describe('US1 native tree icons', () => {
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

    // The icons are genuinely distinct — a folder glyph is not a file glyph (a
    // regression that rendered one identical icon everywhere must fail here).
    const folderIcon = await subRow.locator('.tree-node-icon svg').innerHTML()
    const fileIcon = await alphaRow.locator('.tree-node-icon svg').innerHTML()
    expect(folderIcon).not.toBe(fileIcon)

    // Expand flips the affordance (chevron + open-folder icon).
    await subRow.getByRole('button', { name: 'Expand' }).click()
    await expect(subRow.getByRole('button', { name: 'Collapse' })).toBeVisible()
    await expect(window.getByRole('treeitem').getByText('gamma.md')).toBeVisible()
  })

  test('US1 keyboard access to expand/collapse via the focused row (FR-013)', async () => {
    await openFolder()
    const subRow = window.getByRole('treeitem').filter({ hasText: 'sub' })

    // The chevron keeps its accessible name for screen readers and mouse use.
    await expect(subRow.getByRole('button', { name: 'Expand' })).toHaveAccessibleName('Expand')

    // react-arborist gives the [role=tree] container the tree's single Tab
    // stop; focusing it roving-focuses the first row. Keyboard toggling happens
    // on the row (Space), not on the chevron button (which is mouse/SR-only —
    // the container's Tab handler skips elements inside the tree).
    await window.getByRole('tree').focus()
    await expect
      .poll(() =>
        window.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('role'))
      )
      .toBe('treeitem')

    // Space toggles the focused folder. A real keyboard event also establishes
    // the keyboard input modality so :focus-visible matches the focused row.
    await window.keyboard.press('Space')

    // The focused row carries a visible focus ring (the row that would otherwise
    // be silently focus-moved with no indicator — WCAG 2.4.7). Poll: the
    // `:focus-visible` keyboard modality applies right after the key press, and
    // under a loaded suite the window may not hold OS focus for a moment.
    await expect
      .poll(() =>
        window.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el) return false
          const style = getComputedStyle(el)
          return style.outlineStyle !== 'none' && style.outlineWidth !== '0px'
        })
      )
      .toBe(true)

    await expect(window.getByRole('treeitem').getByText('gamma.md')).toBeVisible()
  })
})

// ---------- US2: chrome action buttons use icons ----------

test.describe('US2 chrome action buttons use icons', () => {
  test('US2 chrome buttons show icons with accessible names', async () => {
    // The spec-010 chrome: hamburger, explorer toggle, and "+" new-file button
    // all carry icons with accessible names (FR-009, FR-011).
    await expect(window.getByRole('button', { name: 'Open menu' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Toggle file explorer' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'New file' })).toBeVisible()

    // Each carries a heroicon inside the button.
    const menuIcon = await window.getByRole('button', { name: 'Open menu' }).locator('svg').count()
    const toggleIcon = await window
      .getByRole('button', { name: 'Toggle file explorer' })
      .locator('svg')
      .count()
    const newIcon = await window.getByRole('button', { name: 'New file' }).locator('svg').count()
    expect(menuIcon).toBe(1)
    expect(toggleIcon).toBe(1)
    expect(newIcon).toBe(1)

    // The chrome glyphs are genuinely distinct (Bars3 vs Squares2X2 vs Plus) —
    // an "every button renders the same icon" regression must fail here.
    const menuSvg = await window
      .getByRole('button', { name: 'Open menu' })
      .locator('svg')
      .innerHTML()
    const toggleSvg = await window
      .getByRole('button', { name: 'Toggle file explorer' })
      .locator('svg')
      .innerHTML()
    const newSvg = await window.getByRole('button', { name: 'New file' }).locator('svg').innerHTML()
    expect(menuSvg).not.toBe(toggleSvg)
    expect(toggleSvg).not.toBe(newSvg)
  })

  test('US2 chrome buttons show a visible keyboard focus ring (FR-013)', async () => {
    // First Tab in a fresh window lands on the hamburger trigger (the first
    // focusable chrome control). A mouse click would not match :focus-visible,
    // so drive focus with the keyboard.
    await window.keyboard.press('Tab')
    const focused = await window.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return null
      const style = getComputedStyle(el)
      return {
        label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
        ring: style.outlineStyle !== 'none' && style.outlineWidth !== '0px'
      }
    })
    expect(focused?.label).toContain('Open menu')
    expect(focused?.ring).toBe(true)
  })
})

// ---------- US3: status footer ----------

test.describe('US3 status footer', () => {
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

    // Wait for the async open-dialog -> REPLACE -> render roundtrip before
    // reading text: a read-once textContent() right after the click races the
    // footer still showing the placeholder.
    const workspace = window.getByTestId('footer-workspace')
    await expect(workspace).toHaveCSS('text-overflow', 'ellipsis')
    const workspaceText = await workspace.getAttribute('title')
    expect(workspaceText).toContain('very-long-workspace-folder-name-that-will-not-fit')
    // The final folder name survives whole (FR-010).
    expect(workspaceText).toContain(longName)
    // Nothing overlaps the footer: the workspace span does not overflow its box.
    const overflow = await workspace.evaluate((el) => {
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
    // The header row has no document-title span; the footer carries it.
    await expect(window.locator('.header-bar .document-title')).toHaveCount(0)
    await expect(window.locator('.app-footer .document-title')).toContainText('alpha.md')
  })
})

// ---------- US4: offline font + icons ----------

test.describe('US4 offline font + icons', () => {
  test('US4 Inter is loaded from bundled assets (no network dependency)', async () => {
    await openFolder()
    // The typeface must be available without a network fetch (FR-007).
    // document.fonts.check is racy while the face is pending: gate on ready and
    // load the face first, then check.
    const loaded = await window.evaluate(async () => {
      await document.fonts.ready
      await document.fonts.load('16px Inter')
      return document.fonts.check('16px Inter')
    })
    expect(loaded).toBe(true)
    // The chrome resolves to Inter.
    const font = await window.evaluate(() => getComputedStyle(document.body).fontFamily)
    expect(font).toContain('Inter')
  })
})

// ---------- Edges ----------

test.describe('Edges', () => {
  test('untitled document shows its display title in the footer', async () => {
    await clickHamburgerItem(window, 'New File')
    await expect(window.getByTestId('footer-document')).toContainText(/Untitled-\d/)
  })

  test('non-Latin file and folder names stay readable and aligned (spec edge)', async () => {
    // The spec's non-Latin / long-name edge case: the tree rows and the footer
    // must keep working and the icons must stay aligned.
    const longName = '文件夹名称特别特别长-namethat-is-long'
    const nested = path.join(testFolder, '笔记', longName)
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, '文档.md'), '# 文档')

    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder as string]
      })
    }, nested)
    await openFolder()

    // The tree lists the non-Latin file with its icon.
    const docRow = window.getByRole('treeitem').filter({ hasText: '文档.md' })
    await expect(docRow).toBeVisible()
    await expect(docRow.locator('.tree-node-icon svg')).toBeVisible()
    // The footer shows the (non-Latin) final folder, not a stale placeholder.
    await expect(window.getByTestId('footer-workspace')).toContainText(longName)
  })

  test('US3 replacing the workspace updates the footer path promptly (FR-012)', async () => {
    await openFolder()
    await expect(window.getByTestId('footer-workspace')).toHaveText(fs.realpathSync(testFolder))

    // Open a different workspace; the footer must follow, never keeping a stale path.
    const other = path.join(testFolder, 'other-workspace')
    fs.mkdirSync(other)
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder as string]
      })
    }, other)
    await openFolder()
    await expect(window.getByTestId('footer-workspace')).toHaveText(fs.realpathSync(other))
  })

  test('US3 the workspace path in the footer is selectable text', async () => {
    // The footer's user-select: none must not block copying the real path.
    await openFolder()
    const selectable = await window.getByTestId('footer-workspace').evaluate((el) => {
      return getComputedStyle(el).userSelect === 'text'
    })
    expect(selectable).toBe(true)
  })
})
