import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { closeAppSafely, launchApp, openFile, openSettingsDialog } from './launch'

/**
 * Spec 018 header-bar-shade suite (contracts/renderer.md §E2e): the WYSIWYG
 * editor toolbar (`.milkdown-top-bar`) is a shade of grey visibly darker than
 * the active tab pill, in light (FR-001) and dark (FR-007), while the main app
 * header bar keeps its existing colour (FR-002), the tab pill stays unchanged
 * (FR-003/004), and the sidebar/status-footer/source-toolbar (FR-005) and the
 * editor canvas (FR-006) are untouched.
 *
 * Computed colours are asserted as `rgb(r, g, b)` strings and as channel sums
 * for the relationship checks, so the exact toolbar value can be retuned
 * without rewriting the suite.
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-header-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta\n\nSecond file.')
})

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-header-config-'))
  ;({ app, window } = await launchApp(configDir, testFolder))
})

test.afterEach(async () => {
  await closeAppSafely(app)
  fs.rmSync(configDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function bg(locator: ReturnType<Page['locator']>): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor)
}

const headerBg = () => bg(window.locator('.header-bar'))
const toolbarBg = () => bg(window.locator('.milkdown .milkdown-top-bar'))
const pillBg = () => bg(window.locator('.tab.active'))
const canvasBg = () => bg(window.locator('.milkdown'))
const sidebarBg = () => bg(window.locator('.sidebar-panel'))
const footerBg = () => bg(window.locator('.app-footer'))
const sourceToolbarBg = () => bg(window.locator('.source-toolbar'))

/** Sum the RGB channels of an `rgb(r, g, b)` string — "how light is it". */
function channelSum(rgb: string): number {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb)
  if (!m) throw new Error(`expected an rgb() color, got ${rgb}`)
  return Number(m[1]) + Number(m[2]) + Number(m[3])
}

test('US1 the editor toolbar is a shade darker than the active tab pill', async () => {
  await openFile(window, 'alpha.md')

  // The active pill is still the spec-010 #EAEAEA pill (FR-003).
  await expect.poll(pillBg).toBe('rgb(234, 234, 234)')

  // FR-001: the editor toolbar is the --mm-header shade and strictly darker.
  await expect.poll(toolbarBg).toBe('rgb(224, 224, 224)')
  expect(channelSum(await toolbarBg())).toBeLessThan(channelSum('rgb(234, 234, 234)'))

  // FR-006: the toolbar stays clearly distinct from the white canvas.
  const canvas = channelSum(await canvasBg())
  expect(canvas).toBeGreaterThan(channelSum('rgb(224, 224, 224)'))

  // FR-002: the main app header bar keeps its existing --mm-surface colour.
  await expect.poll(headerBg).toBe('rgb(249, 249, 251)')
})

test('FR-003/004 the active and inactive tab appearances are unchanged', async () => {
  await openFile(window, 'alpha.md')
  // Second tab via the explicit new-tab action (spec 024 FR-005) so the clean
  // active tab is not replaced.
  await window.getByRole('treeitem').getByText('beta.md').click({ button: 'middle' })
  await expect(window.getByRole('tab')).toHaveCount(2)

  // The active pill keeps its exact #EAEAEA background (FR-003).
  await expect.poll(pillBg).toBe('rgb(234, 234, 234)')

  // An inactive tab stays transparent — no background was introduced (FR-004).
  expect(await bg(window.locator('.tab:not(.active)'))).toBe('rgba(0, 0, 0, 0)')
})

test('FR-005 no other UI element changes', async () => {
  await openFile(window, 'alpha.md')

  // The main app header bar, sidebar, and status footer keep their existing
  // --mm-* values (the source toolbar renders only when the source view is
  // open).
  await expect.poll(headerBg).toBe('rgb(249, 249, 251)')
  await expect.poll(sidebarBg).toBe('rgb(248, 248, 250)')
  await expect.poll(footerBg).toBe('rgb(249, 249, 251)')

  await window.getByRole('button', { name: 'View source' }).click()
  await expect(window.getByTestId('source-view')).toBeVisible()
  await expect.poll(sourceToolbarBg).toBe('rgb(248, 248, 250)')
})

test('FR-007 in dark mode the toolbar stays a step below the dark pill', async () => {
  await openFile(window, 'alpha.md')

  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark')

  // The dark pill stays #2D2D2D (FR-003 holds in dark mode).
  await expect.poll(pillBg).toBe('rgb(45, 45, 45)')

  // FR-007: the toolbar is the dark --mm-header — strictly darker than the
  // pill.
  await expect.poll(toolbarBg).toBe('rgb(38, 38, 38)')
  expect(channelSum(await toolbarBg())).toBeLessThan(channelSum('rgb(45, 45, 45)'))

  // FR-002: the main app header bar keeps its existing dark colour (#1F1F1F).
  await expect.poll(headerBg).toBe('rgb(31, 31, 31)')

  // FR-006: still distinct from the canvas. Spec 016 (user decision 2026-08-07):
  // the editor theme owns the canvas — the default Rustic canvas stays warm
  // #fdf6e3 in dark mode, so the dark toolbar (#262626) remains clearly distinct.
  await expect.poll(canvasBg).toBe('rgb(253, 246, 227)')
  expect(channelSum(await toolbarBg())).toBeLessThan(channelSum('rgb(253, 246, 227)'))
})

test('edge case no open tabs — the header keeps its existing colour', async () => {
  // No folder, no document: the header row renders alone, unchanged.
  await expect.poll(headerBg).toBe('rgb(249, 249, 251)')
  await expect(window.getByRole('tab')).toHaveCount(0)
})
