import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { launchApp, closeAppSafely } from './launch'

/**
 * Spec 011 window-state suite (contracts/renderer.md §E2e): restore-on-launch
 * (US1/FR-001), automatic move/resize persistence (US2/FR-002), maximized
 * restore (US3/FR-005), missing/malformed/off-screen fallback
 * (FR-006/FR-007/FR-009), and the FR-013 explorer-closed rule.
 *
 * Bounds/maximized assertions run in main via `app.evaluate` because the window
 * is the main process's; the suite runs headless (see launch.ts), where the
 * virtual display is 800×600 and the default window is clamped to it.
 */

let app: ElectronApplication
let window: Page
let configDir: string
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-winstate-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-winstate-config-'))
  ;({ app, window } = await launchApp(configDir, testFolder))
})

test.afterEach(async () => {
  await closeAppSafely(app)
  fs.rmSync(configDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

/** Current bounds + maximized state of the single main window. */
async function windowBounds(): Promise<{ x: number; y: number; width: number; height: number }> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
}

async function isMaximized(): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())
}

async function primaryWorkArea(): Promise<{ x: number; y: number; width: number; height: number }> {
  return app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
}

/** The persisted `windowState` from config.json, or undefined. */
function persistedWindowState():
  { x: number; y: number; width: number; height: number; isMaximized: boolean } | undefined {
  const configPath = path.join(configDir, 'config.json')
  if (!fs.existsSync(configPath)) return undefined
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')).windowState
}

/** Pre-write a config.json carrying `windowState` (plus valid siblings). */
function prewriteWindowState(state: {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}): void {
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      recentItems: [],
      settings: {
        sidebarWidth: 30,
        themeOverride: null,
        explorerVisible: true,
        editorFont: 'sans-serif'
      },
      windowState: state
    })
  )
}

test('US1/FR-001 a saved window state restores position and size on launch', async () => {
  await app.close()
  prewriteWindowState({ x: 40, y: 50, width: 500, height: 400, isMaximized: false })
  ;({ app, window } = await launchApp(configDir, testFolder))

  const bounds = await windowBounds()
  expect(bounds).toEqual({ x: 40, y: 50, width: 500, height: 400 })
  expect(await isMaximized()).toBe(false)
})

test('US2/FR-002 a window move/resize is persisted automatically within 1 s', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({ x: 10, y: 20, width: 420, height: 320 })
  })

  // SC-002: reflected in the config within 1 s of the change completing.
  await expect.poll(persistedWindowState, { timeout: 2000 }).toEqual({
    x: 10,
    y: 20,
    width: 420,
    height: 320,
    isMaximized: false
  })
})

test('US2/FR-002 the last state survives a fast quit (flush on close)', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({ x: 60, y: 70, width: 460, height: 360 })
  })
  // Quit immediately — before the 500 ms debounce would naturally fire.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await app.waitForEvent('close', { timeout: 8000 })

  expect(persistedWindowState()).toEqual({
    x: 60,
    y: 70,
    width: 460,
    height: 360,
    isMaximized: false
  })
})

test('US3/FR-005 a saved maximized window restores maximized', async () => {
  test.skip(
    process.platform === 'linux',
    'Xvfb does not provide a window manager for maximize state'
  )
  await app.close()
  prewriteWindowState({ x: 40, y: 50, width: 500, height: 400, isMaximized: true })
  ;({ app, window } = await launchApp(configDir, testFolder))

  await expect.poll(isMaximized).toBe(true)
})

test('FR-006 a missing window state opens at a sensible default', async () => {
  const workArea = await primaryWorkArea()
  const bounds = await windowBounds()
  // The default 1200×800 is clamped to the available display (headless 800×600).
  expect(bounds.width).toBe(Math.min(1200, workArea.width))
  expect(bounds.height).toBe(Math.min(800, workArea.height))
  // Centered on the display.
  expect(bounds.x).toBe(workArea.x + Math.round((workArea.width - bounds.width) / 2))
  expect(bounds.y).toBe(workArea.y + Math.round((workArea.height - bounds.height) / 2))
})

test('FR-006/FR-009 a malformed window state opens at the default and the app starts cleanly', async () => {
  fs.writeFileSync(path.join(configDir, 'config.json'), '{ not json', 'utf-8')
  await app.close()
  ;({ app, window } = await launchApp(configDir, testFolder))

  // The app started; the window sits at the clamped default within the display.
  const workArea = await primaryWorkArea()
  const bounds = await windowBounds()
  expect(bounds.x).toBeGreaterThanOrEqual(workArea.x)
  expect(bounds.y).toBeGreaterThanOrEqual(workArea.y)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height)
})

test('FR-007 an off-screen saved rect is restored fully visible', async () => {
  prewriteWindowState({ x: 99999, y: 99999, width: 500, height: 400, isMaximized: false })
  await app.close()
  ;({ app, window } = await launchApp(configDir, testFolder))

  const workArea = await primaryWorkArea()
  const bounds = await windowBounds()
  expect(bounds.x).toBeGreaterThanOrEqual(workArea.x)
  expect(bounds.y).toBeGreaterThanOrEqual(workArea.y)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height)
})

test('FR-013 with no folder open the persisted explorer state records closed', async () => {
  // The shared settings survive; only explorerVisible is reconciled to false.
  const configPath = path.join(configDir, 'config.json')
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      recentItems: [],
      settings: {
        sidebarWidth: 30,
        themeOverride: null,
        explorerVisible: true,
        editorFont: 'sans-serif'
      }
    })
  )

  // Relaunch so the startup reconcile runs against this config.
  await app.close()
  ;({ app, window } = await launchApp(configDir, testFolder))

  await expect
    .poll(() => {
      if (!fs.existsSync(configPath)) return undefined
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')).settings?.explorerVisible
    })
    .toBe(false)

  // No folder is open, so no explorer panel is rendered.
  await expect(window.getByRole('treeitem')).toHaveCount(0)
  await expect(window.getByRole('button', { name: 'Toggle file explorer' })).toBeDisabled()
})

test('FR-013/FR-010 opening a folder still reveals the explorer and persists open', async () => {
  const configPath = path.join(configDir, 'config.json')
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      recentItems: [],
      settings: {
        sidebarWidth: 30,
        themeOverride: null,
        explorerVisible: false,
        editorFont: 'sans-serif'
      }
    })
  )
  await app.close()
  ;({ app, window } = await launchApp(configDir, testFolder))

  // Open the folder: reveal-on-open (spec 010) reveals the explorer and
  // persists visible=true, over the FR-013 closed state.
  await window.getByRole('button', { name: 'Open menu' }).click()
  await window.getByRole('menuitem', { name: 'Open Folder…' }).click()
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  await expect
    .poll(() => {
      if (!fs.existsSync(configPath)) return undefined
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')).settings?.explorerVisible
    })
    .toBe(true)
})
