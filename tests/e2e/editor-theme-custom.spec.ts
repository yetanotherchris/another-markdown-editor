import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { launchApp, closeAppSafely, openFile, openSettingsDialog } from './launch'

/**
 * Spec 023 suite (contracts/editor-theme.md): custom editor colours + font are
 * stored in the config, the settings dialog shows "Custom" when they match no
 * preset and the preset name when they match exactly, and choosing a preset
 * clears the overrides. Config is isolated per test via the MM_CONFIG_DIR seam.
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string

const CUSTOM_COLORS = {
  background: '#2b2b2b', foreground: '#e6e6e6', accent: '#3794ff',
  surface: '#1f1f1f', outline: '#6e6e6e', code: '#ff9d00'
}

function writeSettings(settings: Record<string, unknown>): void {
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ settings }), 'utf-8')
}

function readSettings(): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8')
  return JSON.parse(raw).settings ?? {}
}

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-custom-theme-ws-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-custom-theme-config-'))
})

test.afterEach(async () => {
  await closeAppSafely(app)
  fs.rmSync(configDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function launch(): Promise<void> {
  ;({ app, window } = await launchApp(configDir, testFolder))
  await openFile(window, 'alpha.md')
}

test('US1/US3/US4 a config with custom colours + font shows Custom and applies them', async () => {
  writeSettings({ editorTheme: 'rustic', editorFont: 'serif', editorColors: CUSTOM_COLORS })
  await launch()

  // The canvas applies the custom colours (inline token override on the
  // container inherits into the Crepe surface).
  await expect
    .poll(() => window.locator('.milkdown').evaluate((el) => getComputedStyle(el).getPropertyValue('--crepe-color-background').trim()))
    .toBe(CUSTOM_COLORS.background)

  // The settings dialog shows the display-only Custom option selected.
  const dialog = await openSettingsDialog(window)
  const customRadio = dialog.getByRole('radio', { name: 'Custom', exact: true })
  await expect(customRadio).toBeChecked()
  await expect(customRadio).toBeDisabled()

  // The appearance survives a restart (persisted config).
  await closeAppSafely(app)
  await launch()
  await expect(window.locator('.milkdown')).toHaveCSS('--crepe-color-background', CUSTOM_COLORS.background)
})

test('US2 selecting a preset clears the custom overrides and shows the preset', async () => {
  writeSettings({ editorTheme: 'rustic', editorFont: 'serif', editorColors: CUSTOM_COLORS })
  await launch()

  const dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'Custom', exact: true })).toBeChecked()

  // Choose Rustic (sans) and Save — overrides are cleared (FR-005).
  await dialog.getByRole('radio', { name: 'Rustic', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect.poll(() => readSettings()).toMatchObject({
    editorTheme: 'rustic',
    editorFont: 'sans-serif',
    editorColors: null
  })

  // The dialog now shows the preset, not Custom.
  const dialog2 = await openSettingsDialog(window)
  await expect(dialog2.getByRole('radio', { name: 'Rustic', exact: true })).toBeChecked()
  await expect(dialog2.getByRole('radio', { name: 'Custom', exact: true })).toHaveCount(0)
})

test('US1 exact preset values are detected as the preset, not Custom', async () => {
  // Config that exactly matches the Scholarly preset colours + font.
  writeSettings({
    editorTheme: 'rustic',
    editorFont: 'sans-serif',
    editorColors: {
      background: '#ffffff', foreground: '#1a1a1a', accent: '#00b0e9',
      surface: '#f7f7f7', outline: '#8a8a8a', code: '#b50000'
    }
  })
  await launch()

  const dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'Scholarly', exact: true })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: 'Custom', exact: true })).toHaveCount(0)
})
