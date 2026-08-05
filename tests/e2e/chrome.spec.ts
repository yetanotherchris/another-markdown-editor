import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { electronLaunchArgs, stubMessageBox, closeAppDiscardingQuit, clickHamburgerItem } from './launch'

/**
 * Spec 010 chrome suite (contracts/renderer.md §E2e): the hamburger menu, the
 * explorer toggle, the tab strip pills, and the "+" new-file button in the one
 * header row — plus the FR-009 keyboard contract and the shortcuts that used to
 * live in the native menu bar (removed by FR-002).
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string

const LONG_NAME = 'a-very-long-filename-that-should-truncate-its-label-with-ellipsis.md'

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-chrome-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta\n\nSecond file.')
  fs.writeFileSync(path.join(testFolder, LONG_NAME), '# Long')
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
  // Isolated config dir per test so a persisted explorerVisible (or any other
  // setting) from a previous test/run cannot leak in (AME_CONFIG_DIR seam).
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-chrome-config-'))
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

const sidebarWidth = () =>
  window.locator('.sidebar-panel').evaluate((el) => el.getBoundingClientRect().width)

const editorWidth = () =>
  window.locator('.editor-panel').evaluate((el) => el.getBoundingClientRect().width)

async function openFolder(): Promise<void> {
  await clickHamburgerItem(window, 'Open Folder…')
  await expect(window.getByRole('treeitem').first()).toBeVisible()
  await expect.poll(sidebarWidth).toBeGreaterThan(50)
}

async function typeInEditor(text: string): Promise<void> {
  await window.locator('[contenteditable="true"]').first().click()
  await window.keyboard.type(text)
}

// Main-side accelerators live in `before-input-event` (spec 010), which
// Playwright's CDP-synthesized keyboard events do NOT reach. Inject the key
// through the webContents so the real shortcut pipeline runs (sendInputEvent
// goes through before-input-event exactly like a physical key).
async function pressShortcut(key: string, modifiers: Array<'control' | 'meta' | 'shift'> = []): Promise<void> {
  await app.evaluate(({ BrowserWindow }, { key, modifiers }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers })
  }, { key, modifiers })
}

test('US1 chrome buttons sit top-left and the active tab is the #EAEAEA pill', async () => {
  await openFolder()
  await window.getByRole('treeitem').getByText('alpha.md').click()

  // The chrome bar (hamburger + explorer toggle) is the first element of the
  // single header row; the tabs follow it.
  await expect(window.locator('.header-bar > .chrome-bar')).toBeVisible()
  await expect(window.locator('.chrome-bar').getByRole('button', { name: 'Open menu' })).toBeVisible()
  await expect(window.locator('.chrome-bar').getByRole('button', { name: 'Toggle file explorer' })).toBeVisible()
  const chromeFirst = await window.locator('.header-bar > .chrome-bar').evaluate(
    (el) => (el.nextElementSibling as HTMLElement | null)?.classList.contains('tab-bar') ?? false
  )
  expect(chromeFirst).toBe(true)

  // Active tab is a single #EAEAEA pill with an edit icon, label, close button.
  const activeTab = window.locator('.tab.active')
  await expect(activeTab).toHaveCount(1)
  await expect(activeTab).toContainText('alpha.md')
  await expect(activeTab.locator('svg.tab-edit-icon')).toBeVisible()
  await expect(activeTab.getByRole('button', { name: 'Close alpha.md' })).toBeVisible()
  const pillColor = await activeTab.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(pillColor).toBe('rgb(234, 234, 234)') // #EAEAEA

  // The "+" new-file button follows the active tab in the tab strip.
  const plusAfterActive = await activeTab.evaluate((el) => {
    const tabBar = el.closest('.tab-bar')
    const plus = tabBar?.querySelector('.tab-new')
    return plus ? (el.compareDocumentPosition(plus) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false
  })
  expect(plusAfterActive).toBe(true)
})

test('US1 inactive tabs truncate their labels', async () => {
  await openFolder()
  // Open the long-named file first, then alpha so alpha is the active tab and
  // the long label is the inactive one.
  await window.getByRole('treeitem').getByText(LONG_NAME).click()
  await window.getByRole('treeitem').getByText('alpha.md').click()

  const longTitle = window.getByRole('tab', { name: new RegExp(LONG_NAME) }).locator('.tab-title')
  const truncates = await longTitle.evaluate((el) => {
    const style = getComputedStyle(el)
    return style.textOverflow === 'ellipsis' && style.overflow === 'hidden' && el.scrollWidth > el.clientWidth
  })
  expect(truncates).toBe(true)
})

test('US2 toggling the explorer hides it and the editor expands', async () => {
  await openFolder()
  const editorBefore = await editorWidth()

  await window.getByRole('button', { name: 'Toggle file explorer' }).click()
  await expect.poll(sidebarWidth).toBeLessThan(3)
  await expect.poll(editorWidth).toBeGreaterThan(editorBefore)
})

test('US2 toggling back restores the previous explorer width', async () => {
  await openFolder()
  await window.waitForTimeout(300)
  const widthBefore = await sidebarWidth()

  await window.getByRole('button', { name: 'Toggle file explorer' }).click()
  await expect.poll(sidebarWidth).toBeLessThan(3)

  await window.getByRole('button', { name: 'Toggle file explorer' }).click()
  await expect.poll(sidebarWidth).toBeGreaterThan(50)
  await window.waitForTimeout(300)
  const widthAfter = await sidebarWidth()
  expect(Math.abs(widthAfter - widthBefore)).toBeLessThan(3)
})

test('US2 the persisted explorer state loads on restart; opening a folder reveals it', async () => {
  // Phase 1: hide the explorer and let the debounced settings write land.
  await openFolder()
  await window.getByRole('button', { name: 'Toggle file explorer' }).click()
  await expect.poll(sidebarWidth).toBeLessThan(3)
  await expect.poll(() => {
    const settingsPath = path.join(configDir, 'settings.json')
    if (!fs.existsSync(settingsPath)) return undefined
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')).explorerVisible
  }).toBe(false)

  await closeAppDiscardingQuit(app)

  // Phase 2: restart with the same config. A folder open always reveals the
  // explorer (reveal-on-open overrides a persisted hidden choice, clarification
  // 2026-08-05).
  ;({ app, window } = await launchApp())
  await openFolder()
  await expect.poll(sidebarWidth).toBeGreaterThan(50)

  await closeAppDiscardingQuit(app)

  // Phase 3: restart again; the last folder open persisted visible=true, so the
  // toggle's default is visible and a fresh open shows the explorer.
  ;({ app, window } = await launchApp())
  await openFolder()
  await expect.poll(sidebarWidth).toBeGreaterThan(50)
})

test('US3 the + button opens an untitled tab without discarding unsaved changes', async () => {
  await openFolder()
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await typeInEditor(' EXTRA')

  const alphaTab = window.getByRole('tab', { name: /alpha\.md/ })
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()

  await window.getByRole('button', { name: 'New file' }).click()
  await expect(window.getByRole('tab')).toHaveCount(2)
  await expect(window.getByRole('tab', { name: /Untitled-\d/ })).toHaveClass(/active/)

  // The unsaved edit is still there — switching back shows the typed text.
  await alphaTab.click()
  await expect(window.locator('.ProseMirror:visible')).toContainText('EXTRA')
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()
})

test('US4 the hamburger opens a dropdown and an outside click closes it', async () => {
  await window.getByRole('button', { name: 'Open menu' }).click()
  await expect(window.getByRole('menu', { name: 'Application menu' })).toBeVisible()
  await expect(window.getByRole('menuitem', { name: 'New File' })).toBeVisible()
  await expect(window.getByRole('menuitem', { name: 'Open File…' })).toBeVisible()

  await window.locator('.empty-state').click()
  await expect(window.getByRole('menu', { name: 'Application menu' })).toHaveCount(0)
})

test('FR-009 the chrome controls are focusable and Enter-activatable', async () => {
  // Hamburger: focus + Enter opens the dropdown; Escape closes it.
  await window.getByRole('button', { name: 'Open menu' }).focus()
  await window.keyboard.press('Enter')
  await expect(window.getByRole('menu', { name: 'Application menu' })).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(window.getByRole('menu', { name: 'Application menu' })).toHaveCount(0)

  // Explorer toggle: focus + Enter collapses, Enter again restores.
  await openFolder()
  await window.getByRole('button', { name: 'Toggle file explorer' }).focus()
  await window.keyboard.press('Enter')
  await expect.poll(sidebarWidth).toBeLessThan(3)
  await window.keyboard.press('Enter')
  await expect.poll(sidebarWidth).toBeGreaterThan(50)

  // "+" button: focus + Enter opens a new untitled tab.
  await window.getByRole('button', { name: 'New file' }).focus()
  await window.keyboard.press('Enter')
  await expect(window.getByRole('tab', { name: /Untitled-\d/ })).toBeVisible()
})

test('shortcuts still work after the menu bar is removed (Ctrl+N/O/S)', async () => {
  // Open a workspace first so Ctrl+O opens the file with a real (workspace-
  // relative) path; without one the doc is pathless and Ctrl+S would route to
  // the save dialog instead of the file on disk.
  await openFolder()

  // Ctrl+N: new untitled tab.
  await pressShortcut('n', ['control'])
  await expect(window.getByRole('tab', { name: /Untitled-\d/ })).toBeVisible()

  // Ctrl+O: the file-open dialog (stubbed in main) opens a markdown file.
  const target = path.join(testFolder, 'alpha.md')
  await app.evaluate(({ dialog }, fp) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fp as string] })
  }, target)
  await pressShortcut('o', ['control'])
  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toBeVisible()
  await expect(window.locator('.ProseMirror:visible')).toContainText('Hello world.')

  // Ctrl+S: save an edit and confirm the file on disk is updated.
  await window.locator('.ProseMirror:visible').click()
  await window.keyboard.type(' SAVEDBYSHORTCUT')
  await expect(window.locator('.ProseMirror:visible')).toContainText('SAVEDBYSHORTCUT')
  await pressShortcut('s', ['control'])
  await expect(window.getByRole('tab', { name: /alpha\.md/ }).locator('.tab-dirty')).toHaveCount(0)
  await expect.poll(() => fs.readFileSync(target, 'utf-8')).toContain('SAVEDBYSHORTCUT')
})
