import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { closeAppSafely, launchApp, openSettingsDialog, openFile } from './launch'

/**
 * Spec 013 theme suite (contracts/renderer.md §E2e): the Theme setting's three
 * choices — Light (US1), Dark (US2), System default following the OS live
 * (US3/FR-005) — plus restart persistence (US4/FR-006), the editor-content
 * invariant (FR-010), keyboard access (FR-007), and missing/malformed-config
 * tolerance (FR-009).
 *
 * The OS theme cannot be changed deterministically, so OS switches are simulated
 * with Playwright's `emulateMedia({ colorScheme })`, which re-fires the
 * renderer's `prefers-color-scheme` media query exactly as an OS switch would.
 * (Research R1/R2: `nativeTheme.themeSource` does not propagate to the renderer
 * media query in this Electron build, so the palette follows the query — hence
 * this simulation is the faithful path.)
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-theme-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-theme-config-'))
  ;({ app, window } = await launchApp(configDir, testFolder))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.afterEach(async () => {
  await closeAppSafely(app)
  fs.rmSync(configDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

/** The header bar's resolved background — the chrome's `--mm-surface` token. */
async function headerBackground(): Promise<string> {
  return window.locator('.header-bar').evaluate((el) => getComputedStyle(el).backgroundColor)
}

/** The WYSIWYG editor content area's resolved background (FR-010: follows the
 *  theme — dark surface in dark mode). */
async function editorBackground(): Promise<string> {
  return window.locator('.milkdown').evaluate((el) => getComputedStyle(el).backgroundColor)
}

/** The editor's default text colour (the `--crepe-color-on-background` token). */
async function editorTextColor(): Promise<string> {
  return window.locator('.milkdown').evaluate((el) => getComputedStyle(el).color)
}

async function persistedThemeOverride(): Promise<string | null | undefined> {
  const configPath = path.join(configDir, 'config.json')
  if (!fs.existsSync(configPath)) return undefined
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')).settings?.themeOverride ?? null
}

/** Simulate an OS theme switch by re-firing the renderer's colour-scheme query
 *  (the faithful path — see the suite comment; research R1/R2). */
async function setOsColorScheme(scheme: 'light' | 'dark'): Promise<void> {
  await window.emulateMedia({ colorScheme: scheme })
}

test('US1 choosing Light applies the light chrome palette', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)

  await dialog.getByRole('radio', { name: 'Light', exact: true }).check()

  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'light')
  // The header bar resolves the light --mm-surface (#f9f9fb).
  await expect.poll(headerBackground).toBe('rgb(249, 249, 251)')
})

test('US2 choosing Dark applies the dark chrome palette and persists it', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)

  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check()

  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark')
  // The header bar resolves the dark --mm-surface (#1F1F1F, Main Editor Background).
  await expect.poll(headerBackground).toBe('rgb(31, 31, 31)')

  // The choice is persisted to the shared config.json (FR-006).
  await expect.poll(persistedThemeOverride).toBe('dark')
})

test('US3 System default follows the OS theme live (FR-005)', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'System default', exact: true }).check()

  // In System mode the palette follows the OS colour-scheme query. Simulate the
  // OS switching to dark: data-theme must follow without a restart.
  await setOsColorScheme('dark')
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark', {
    timeout: 5000
  })

  // Simulate the OS switching back to light.
  await setOsColorScheme('light')
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'light', {
    timeout: 5000
  })
})

test('US4 the theme survives a restart', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect.poll(persistedThemeOverride).toBe('dark')

  await closeAppSafely(app)

  // Restart with the same config; the chrome opens dark (FR-006).
  ;({ app, window } = await launchApp(configDir, testFolder))
  await openFile(window, 'alpha.md')
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(headerBackground).toBe('rgb(31, 31, 31)')
})

test('FR-010 the default Rustic canvas keeps its palette in dark mode; Monotone follows', async () => {
  await openFile(window, 'alpha.md')
  // The default editor theme is Rustic: warm off-white #fdf6e3 (spec 016 FR-007).
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
  const lightBackground = await editorBackground()
  expect(lightBackground).toBe('rgb(253, 246, 227)') // #fdf6e3

  // The app theme can be dark WITHOUT re-theming the canvas — the editor theme
  // owns the canvas; only the Monotone themes follow the resolved app theme
  // (spec 016 user decision 2026-08-07; research R5). The chrome flips dark.
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(headerBackground).toBe('rgb(31, 31, 31)') // chrome dark
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
  await expect.poll(editorBackground).toBe('rgb(253, 246, 227)') // canvas stays warm

  // Monotone follows the app theme: dark → white text on a black canvas.
  await dialog.getByRole('radio', { name: 'Monotone', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)
  await expect.poll(editorBackground).toBe('rgb(0, 0, 0)')
  expect(await editorTextColor()).toBe('rgb(255, 255, 255)')

  // The source view still follows the app theme — the "Back to visual editing"
  // button must not fall back to black text on the dark surface (regression
  // guard, unchanged from spec 013).
  await window.getByRole('button', { name: 'View source' }).click()
  await expect(window.getByTestId('source-view')).toBeVisible()
  expect(await window.locator('.source-return').evaluate((el) => getComputedStyle(el).color)).toBe(
    'rgb(140, 140, 140)'
  ) // inherits --mm-text #8C8C8C
})

test('FR-007 the Theme group is keyboard-reachable and arrow-key navigable', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)

  // The theme radios are real radios in the dialog's focus trap.
  const themeGroup = dialog.getByRole('group', { name: 'Theme', exact: true })
  await expect(themeGroup.getByRole('radio')).toHaveCount(3)

  // Arrow keys move the selection and apply the theme immediately.
  await themeGroup.getByRole('radio', { name: 'System default', exact: true }).focus()
  await window.keyboard.press('ArrowUp')
  await expect(themeGroup.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark')
})

test('FR-009 a missing config opens with System default and a change writes a valid config', async () => {
  // No config.json exists yet (fresh MM_CONFIG_DIR).
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'System default', exact: true })).toBeChecked()

  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect.poll(persistedThemeOverride).toBe('dark')
  // The written config is valid JSON and still carries recentItems.
  const configPath = path.join(configDir, 'config.json')
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  expect(parsed.settings.themeOverride).toBe('dark')
  expect(parsed.recentItems).toBeDefined()
})

test('FR-009 a malformed config still opens the dialog with System default', async () => {
  const configPath = path.join(configDir, 'config.json')
  fs.writeFileSync(configPath, '{ not json', 'utf-8')

  // Opening the dialog directly exercises the true malformed-config path (no
  // folder-open recent-item write repairs the file first).
  const dialog = await openSettingsDialog(window)
  await expect(dialog.getByRole('radio', { name: 'System default', exact: true })).toBeChecked()
  const contents = fs.readFileSync(configPath, 'utf-8')
  expect(contents === '{ not json' || JSON.parse(contents).windowState !== undefined).toBe(true)
})
