import { test, expect, ElectronApplication, Page } from '@playwright/test'
import type { Locator } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { closeAppSafely, launchApp, openFile, openSettingsDialog } from './launch'

/**
 * Spec 014 suite (contracts/renderer.md): the View source action is the last
 * `.top-bar-item` in the Crepe top bar (the custom 'view' group is appended by
 * buildTopBar). It must stand out from the formatting controls — its icon is
 * rendered in the app accent token on a translucent accent background — while
 * keeping its tooltip and behaviour (FR-001/004/005/006).
 */

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-view-source-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.beforeEach(async () => {
  ;({ app, window } = await launchApp(undefined, testFolder))
  await openFile(window, 'alpha.md')
})

test.afterEach(async () => {
  await closeAppSafely(app)
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

/** The View source button — the last top-bar item in the inner bar. */
function viewSourceButton(): Locator {
  return window.locator('.milkdown-top-bar .top-bar-inner > .top-bar-item').last()
}

/** The first formatting control (Bold) — the "ordinary" icon to compare against. */
function boldButton(): Locator {
  return window.locator('.milkdown-top-bar .top-bar-inner > .top-bar-item').first()
}

/** Resolve the app accent token to its computed rgb colour. */
async function accentColor(): Promise<string> {
  return window.evaluate(() => {
    const root = document.querySelector('.app-container') as Element
    const probe = document.createElement('span')
    probe.style.color = 'var(--mm-accent)'
    root.appendChild(probe)
    const rgb = getComputedStyle(probe).color
    probe.remove()
    return rgb
  })
}

/** The computed `color` of a button's icon SVG. */
async function iconColor(button: Locator): Promise<string> {
  return button.locator('svg').evaluate((svg) => getComputedStyle(svg).color)
}

test('US1/US2 the View source icon is the accent-coloured last toolbar item', async () => {
  const viewSource = viewSourceButton()
  await expect(viewSource).toBeVisible()

  // FR-004: the label pipeline (toolbarLabels.ts) keeps the tooltip intact.
  await expect(viewSource).toHaveAttribute('title', 'View source')
  await expect(viewSource).toHaveAttribute('aria-label', 'View source')

  // FR-006 + FR-001: it is the LAST control in the inner bar.
  const isLast = await viewSource.evaluate((el) => el === el.parentElement?.lastElementChild)
  expect(isLast).toBe(true)

  // FR-001/FR-003: its icon renders in the app accent; Bold stays muted outline.
  const accent = await accentColor()
  expect(await iconColor(viewSource)).toBe(accent)
  expect(await iconColor(boldButton())).not.toBe(accent)
})

test('FR-005 the icon stays distinct and accent-coloured in the dark theme', async () => {
  // Choose the Dark theme override (deterministic; matches US2 of spec 013).
  await openSettingsDialog(window)
  await window.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect(window.locator('.app-container')).toHaveAttribute('data-theme', 'dark')

  const viewSource = viewSourceButton()
  await expect(viewSource).toBeVisible()

  // Dark accent is #3794ff (rgb(55, 148, 255)); light was #d96b27.
  const accent = await accentColor()
  expect(accent).toBe('rgb(55, 148, 255)')
  expect(await iconColor(viewSource)).toBe(accent)
  expect(await iconColor(boldButton())).not.toBe(accent)
})
