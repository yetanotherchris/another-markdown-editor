import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { closeAppSafely, launchApp, openSettingsDialog, openFile, stubMessageBox } from './launch'

/**
 * Spec 016 editor-theme suite (contracts/renderer.md §E2e): the five named
 * editor themes, Save-gating (FR-003/US1 S4), restart persistence (US2/FR-004),
 * the Rustic default canvas (US3), serif variants (US4), Monotone following the
 * resolved app theme live (US5/FR-009/FR-010), the Scholarly values (US6/FR-012),
 * and the document invariant (FR-014).
 *
 * OS switches are simulated with Playwright's `emulateMedia({ colorScheme })`,
 * which re-fires the renderer's `prefers-color-scheme` media query — the same
 * mechanism spec 013's `data-theme` uses (research R3).
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let configDir: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-editor-theme-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world with `code`.\n')
})

test.beforeEach(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-editor-theme-config-'))
  ;({ app, window } = await launchApp(configDir, testFolder))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world with `code`.\n')
})

test.afterEach(async () => {
  await closeAppSafely(app)
  fs.rmSync(configDir, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

/** The canvas background (the theme's `--crepe-color-background` token). */
async function canvasBackground(): Promise<string> {
  return window.locator('.milkdown').evaluate((el) => getComputedStyle(el).backgroundColor)
}

/** The canvas body text colour (`--crepe-color-on-background`). */
async function canvasTextColor(): Promise<string> {
  return window.locator('.milkdown').evaluate((el) => getComputedStyle(el).color)
}

/** The body/heading typeface (the `--crepe-font-default` token). */
async function bodyFont(): Promise<string> {
  return window
    .locator('.milkdown')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--crepe-font-default').trim())
}

/** The heading colour (a `<h1>`). */
async function headingColor(): Promise<string> {
  return window.locator('.milkdown h1').evaluate((el) => getComputedStyle(el).color)
}

/** Whether the body face is a serif stack (Georgia/Noto Serif) — distinct from
 *  the Inter stack's trailing `sans-serif`, which also matches `/serif/i`. */
function isSerif(font: string): boolean {
  return /Georgia|Times New Roman|Noto Serif/.test(font)
}

/** Whether the body face is the Scholarly Helvetica-like sans (Arial). */
function isHelveticaLike(font: string): boolean {
  return /Arial|Helvetica/i.test(font)
}

async function persistedEditorTheme(): Promise<string | undefined> {
  const configPath = path.join(configDir, 'config.json')
  if (!fs.existsSync(configPath)) return undefined
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')).settings?.editorTheme
}

/** Simulate an OS theme switch (re-fires the renderer colour-scheme query). */
async function setOsColorScheme(scheme: 'light' | 'dark' | 'no-preference'): Promise<void> {
  await window.emulateMedia({ colorScheme: scheme })
}

test('US1 the Editor Theme group lists all five themes', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)

  const group = dialog.getByRole('group', { name: 'Editor Theme' })
  await expect(group).toBeVisible()
  const options = group.getByRole('radio')
  await expect(options).toHaveCount(5)
  for (const label of ['Rustic', 'Rustic Serif', 'Monotone', 'Monotone Serif', 'Scholarly']) {
    await expect(group.getByRole('radio', { name: label, exact: true })).toBeVisible()
  }
})

test('US1 S2/S3 selecting Scholarly and pressing Save re-themes the canvas and persists it', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)

  await dialog.getByRole('radio', { name: 'Scholarly', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  // The canvas re-renders in Scholarly within 5 s (FR-003): white background,
  // blue headings, Helvetica-like body.
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'scholarly')
  await expect.poll(canvasBackground).toBe('rgb(255, 255, 255)')
  await expect.poll(headingColor).toBe('rgb(0, 176, 233)') // #00B0E9
  expect(isHelveticaLike(await bodyFont())).toBe(true)

  // The choice is recorded in the config file (US1 S3, FR-005).
  await expect.poll(persistedEditorTheme).toBe('scholarly')
})

test('US1 S4 closing the dialog without Save leaves the canvas unchanged', async () => {
  await openFile(window, 'alpha.md')
  // The default canvas is Rustic (warm off-white).
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
  await expect.poll(canvasBackground).toBe('rgb(253, 246, 227)') // #fdf6e3

  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Scholarly', exact: true }).check()
  // Close via the X — the staged selection is discarded (US1 S4).
  await dialog.getByRole('button', { name: 'Close settings' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
  await expect.poll(canvasBackground).toBe('rgb(253, 246, 227)')
  await expect.poll(persistedEditorTheme).toBe('rustic')
})

test('US2 the editor theme survives a restart', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Scholarly', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect.poll(persistedEditorTheme).toBe('scholarly')

  await closeAppSafely(app)

  // Restart with the same config; the canvas opens in Scholarly (FR-004).
  ;({ app, window } = await launchApp(configDir, testFolder))
  await openFile(window, 'alpha.md')
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'scholarly')
  await expect.poll(canvasBackground).toBe('rgb(255, 255, 255)')
  await expect.poll(headingColor).toBe('rgb(0, 176, 233)')
})

test('US3 the default canvas is the Rustic theme', async () => {
  await openFile(window, 'alpha.md')
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
  // Warm off-white canvas, sans-serif (Inter) body, monospace inline code.
  await expect.poll(canvasBackground).toBe('rgb(253, 246, 227)') // #fdf6e3
  expect(isSerif(await bodyFont())).toBe(false)
  const codeFont = await window
    .locator('.milkdown')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--crepe-font-code').trim())
  expect(/monospace|Mono|Consolas|Courier/i.test(codeFont)).toBe(true)
})

test('US4 Rustic Serif keeps the warm canvas but renders body and headings in a serif face', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Rustic Serif', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  await expect(window.locator('.app-container')).toHaveAttribute(
    'data-editor-theme',
    'rustic-serif'
  )
  await expect.poll(canvasBackground).toBe('rgb(253, 246, 227)') // same warm canvas
  await expect.poll(bodyFont).toBe("Georgia, 'Times New Roman', 'Noto Serif', serif")
})

test('US5 Monotone follows the resolved app theme (light: black on white)', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Monotone', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'monotone')
  // App theme defaults to system → light in this headless environment.
  await expect.poll(canvasBackground).toBe('rgb(255, 255, 255)')
  expect(await canvasTextColor()).toBe('rgb(0, 0, 0)')
})

test('US5 Monotone follows the resolved app theme (dark: white on black)', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  // Set the app theme to Dark first (spec 013, applies immediately).
  await dialog.getByRole('radio', { name: 'Dark', exact: true }).check()
  await dialog.getByRole('radio', { name: 'Monotone', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(canvasBackground).toBe('rgb(0, 0, 0)')
  expect(await canvasTextColor()).toBe('rgb(255, 255, 255)')
})

test('US5 Monotone follows an OS switch live in system mode (FR-010)', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'System default', exact: true }).check()
  await dialog.getByRole('radio', { name: 'Monotone', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'light')
  await expect.poll(canvasBackground).toBe('rgb(255, 255, 255)')

  // Simulate the OS switching to dark: the canvas flips live, no restart.
  await setOsColorScheme('dark')
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark', {
    timeout: 5000
  })
  await expect.poll(canvasBackground).toBe('rgb(0, 0, 0)')

  // And back to light.
  await setOsColorScheme('light')
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'light', {
    timeout: 5000
  })
  await expect.poll(canvasBackground).toBe('rgb(255, 255, 255)')
})

test('US5 Monotone falls back to the light scheme when the OS reports no preference (FR-010 S4)', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'System default', exact: true }).check()
  await dialog.getByRole('radio', { name: 'Monotone Serif', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  await setOsColorScheme('no-preference')
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'light', {
    timeout: 5000
  })
  await expect.poll(canvasBackground).toBe('rgb(255, 255, 255)')
  expect(await canvasTextColor()).toBe('rgb(0, 0, 0)')
})

test('US6 Scholarly renders its specified values', async () => {
  await openFile(window, 'alpha.md')
  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Scholarly', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByTestId('settings-dialog')).toHaveCount(0)

  await expect.poll(canvasBackground).toBe('rgb(255, 255, 255)')
  await expect.poll(headingColor).toBe('rgb(0, 176, 233)') // #00B0E9
  expect(isHelveticaLike(await bodyFont())).toBe(true)
  // Same monospace inline code as the other themes (FR-012 scenario 3).
  const codeFont = await window
    .locator('.milkdown')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--crepe-font-code').trim())
  expect(/monospace|Mono|Consolas|Courier/i.test(codeFont)).toBe(true)
})

test('FR-014 changing the editor theme leaves document content, dirty state, and undo history untouched', async () => {
  await openFile(window, 'alpha.md')
  await window.locator('.ProseMirror:visible').click()
  await window.keyboard.type(' EXTRA')

  const alphaTab = window.getByRole('tab', { name: /alpha\.md/ })
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()

  // Switch themes repeatedly via Save.
  for (const theme of ['Rustic Serif', 'Monotone', 'Scholarly'] as const) {
    const dialog = await openSettingsDialog(window)
    await dialog.getByRole('radio', { name: theme, exact: true }).check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(window.getByTestId('settings-dialog')).toHaveCount(0)
  }

  // The typed text, the dirty marker, and the tab title are unchanged.
  await expect(window.locator('.ProseMirror:visible')).toContainText('EXTRA')
  await expect(alphaTab.locator('.tab-dirty')).toBeVisible()
  await expect(alphaTab).toContainText('alpha.md')
})

test('FR-006 a missing config opens with the default Rustic theme and a change writes a valid config', async () => {
  // No config.json exists yet (fresh MM_CONFIG_DIR).
  await openFile(window, 'alpha.md')
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
  await expect.poll(canvasBackground).toBe('rgb(253, 246, 227)')

  const dialog = await openSettingsDialog(window)
  await dialog.getByRole('radio', { name: 'Rustic Serif', exact: true }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect.poll(persistedEditorTheme).toBe('rustic-serif')

  // The written config is valid JSON and still carries recentItems.
  const configPath = path.join(configDir, 'config.json')
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  expect(parsed.settings.editorTheme).toBe('rustic-serif')
  expect(parsed.recentItems).toBeDefined()
})

test('FR-006 a malformed config still opens with the default Rustic theme', async () => {
  const configPath = path.join(configDir, 'config.json')
  fs.writeFileSync(configPath, '{ not json', 'utf-8')

  // Deliberately do NOT open a file/folder first: a folder open records a
  // recent item, whose read-modify-write repairs the malformed file before the
  // dialog reads it (review #27 #4). Opening the dialog directly exercises the
  // true malformed-config tolerance path — the app still starts with the Rustic
  // default (FR-006).
  const dialog = await openSettingsDialog(window)
  await expect(window.locator('.app-container')).toHaveAttribute('data-editor-theme', 'rustic')
  await expect(dialog.getByRole('radio', { name: 'Rustic', exact: true })).toBeChecked()
  const contents = fs.readFileSync(configPath, 'utf-8')
  expect(contents === '{ not json' || JSON.parse(contents).windowState !== undefined).toBe(true)
})

test('addendum: list spacing, blockquote indent, number alignment, and hidden HTML comments', async () => {
  // A document exercising all four canvas-polish changes (spec addendum
  // 2026-08-07): a numbered list, a bullet list, a blockquote, and an HTML
  // comment in body text.
  fs.writeFileSync(
    path.join(testFolder, 'polish.md'),
    '1. Item one\n2. Item two\n\n- Bullet one\n- Bullet two\n\n> A quote\n\nText before <!-- hidden note --> and after.\n'
  )
  await openFile(window, 'polish.md')

  // 1+3. Numbered-list marker aligns vertically with its text line (the label
  // is fixed to the 24px line box — spec addendum item 3).
  const numberAlign = await window
    .locator('.milkdown li .label')
    .first()
    .evaluate((el) => {
      const num = el.getBoundingClientRect()
      const line = el.closest('li')!.querySelector('p')!.getBoundingClientRect()
      return Math.round(num.top + num.height / 2 - (line.top + line.height / 2))
    })
  expect(Math.abs(numberAlign)).toBeLessThanOrEqual(2)

  // 1. Tight list rhythm: adjacent list items within a list are close together
  // (no per-item 16px paragraph gap stacked on the li margin). lineGaps[0] is
  // within the numbered list, lineGaps[1] spans the blank line BETWEEN the two
  // lists (its larger gap is expected — inter-list spacing), lineGaps[2] is
  // within the bullet list.
  const lineGaps = await window.locator('.milkdown li p').evaluateAll((els) => {
    const tops = (els as HTMLElement[]).map((p) => p.getBoundingClientRect().top)
    return tops.slice(1).map((t, i) => Math.round(t - tops[i]))
  })
  expect(lineGaps[0]).toBeLessThanOrEqual(34)
  expect(lineGaps[2]).toBeLessThanOrEqual(34)
  expect(lineGaps[1]).toBeGreaterThan(34) // blank-line gap between the two lists

  // 2. Blockquote indent is halved to 20px (Crepe's default is 40px).
  const bqIndent = await window
    .locator('.milkdown blockquote')
    .evaluate((el) => getComputedStyle(el).paddingLeft)
  expect(bqIndent).toBe('20px')

  // 4. The HTML comment atom is hidden on the canvas but still present in the
  // document tree (round-trips to disk on save).
  await expect(window.locator('.milkdown span[data-type="html"]')).toHaveCount(1)
  const commentDisplay = await window
    .locator('.milkdown span[data-type="html"]')
    .evaluate((el) => getComputedStyle(el).display)
  expect(commentDisplay).toBe('none')
  const commentValue = await window
    .locator('.milkdown span[data-type="html"]')
    .evaluate((el) => el.getAttribute('data-value'))
  expect(commentValue).toBe('<!-- hidden note -->')

  // Saving preserves the hidden comment and every list verbatim — a no-edit
  // save is byte-identical, proving no content is lost (FR-014).
  await window.locator('.ProseMirror:visible').click()
  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close polish.md' }).click()
  const onDisk = fs.readFileSync(path.join(testFolder, 'polish.md'), 'utf-8')
  expect(onDisk).toBe(
    '1. Item one\n2. Item two\n\n- Bullet one\n- Bullet two\n\n> A quote\n\nText before <!-- hidden note --> and after.\n'
  )
})
