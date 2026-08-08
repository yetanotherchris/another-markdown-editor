import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { launchApp, closeAppSafely, openFolder } from './launch'

/**
 * Spec 015 suite (contracts/reveal.md): the explorer context menu reveals a
 * workspace file or folder in the OS file manager. Files go through
 * `shell.showItemInFolder` (parent folder, file highlighted — FR-001/004);
 * folders through `shell.openPath` (the folder itself — FR-002). The OS calls
 * are stubbed in main and their arguments recorded; errors surface as a quiet
 * footer note with the session untouched (FR-006).
 */

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-reveal-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.mkdirSync(path.join(testFolder, 'nested'))
  fs.writeFileSync(path.join(testFolder, 'nested', 'beta.md'), '# Beta')
})

test.beforeEach(async () => {
  ;({ app, window } = await launchApp(undefined, testFolder))
  await openFolder(window)
  // Stub the OS file-manager calls and record their targets.
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __revealShown: string[]; __revealOpened: string[] }
    g.__revealShown = []
    g.__revealOpened = []
    shell.showItemInFolder = (p: string) => {
      g.__revealShown.push(p)
    }
    shell.openPath = async (p: string) => {
      g.__revealOpened.push(p)
      return ''
    }
  })
})

test.afterEach(async () => {
  await closeAppSafely(app)
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function shownCalls(): Promise<string[]> {
  return app.evaluate(() => {
    const g = globalThis as unknown as { __revealShown: string[] }
    return g.__revealShown ?? []
  })
}

async function openedCalls(): Promise<string[]> {
  return app.evaluate(() => {
    const g = globalThis as unknown as { __revealOpened: string[] }
    return g.__revealOpened ?? []
  })
}

async function revealLabel(): Promise<string> {
  return window.evaluate(() => {
    const platform = (globalThis as unknown as { api?: { platform?: string } }).api?.platform
    if (platform === 'darwin') return 'Reveal in Finder'
    if (platform === 'win32') return 'Reveal in Explorer'
    return 'Reveal in file manager'
  })
}

test('US1/US3 a file reveal opens its parent folder with the file highlighted', async () => {
  await window.getByRole('treeitem').getByText('alpha.md').click({ button: 'right' })
  await window.getByRole('menuitem', { name: await revealLabel() }).click()

  // FR-004: the file itself is passed to showItemInFolder (the OS highlights it
  // in its parent folder).
  await expect.poll(shownCalls).toEqual([path.join(testFolder, 'alpha.md')])
  await expect.poll(openedCalls).toEqual([])
})

test('US1 scenario 3 a nested file reveals its nested parent folder', async () => {
  const nestedRow = window.getByRole('treeitem').filter({ hasText: 'nested' })
  await nestedRow.getByRole('button', { name: 'Expand' }).click()
  await expect(window.getByRole('treeitem').getByText('beta.md')).toBeVisible()
  await window.getByRole('treeitem').getByText('beta.md').click({ button: 'right' })
  await window.getByRole('menuitem', { name: await revealLabel() }).click()

  await expect.poll(shownCalls).toEqual([path.join(testFolder, 'nested', 'beta.md')])
})

test('US2 a folder reveal opens the folder directly', async () => {
  await window.getByRole('treeitem').getByText('nested').click({ button: 'right' })
  await window.getByRole('menuitem', { name: await revealLabel() }).click()

  await expect.poll(openedCalls).toEqual([path.join(testFolder, 'nested')])
  await expect.poll(shownCalls).toEqual([])
})

test('US4 a missing target shows a quiet footer note and leaves the session unchanged', async () => {
  // Open a document so "session unchanged" is observable.
  await window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  // Write a fresh file, open its context menu, then delete it externally while
  // the menu is still open: the reveal resolves AFTER the deletion, so main's
  // existence check fails (FR-006 scenario 1).
  fs.writeFileSync(path.join(testFolder, 'gone.md'), '# Gone')
  await expect(window.getByRole('treeitem').getByText('gone.md')).toBeVisible()
  await window.getByRole('treeitem').getByText('gone.md').click({ button: 'right' })
  fs.rmSync(path.join(testFolder, 'gone.md'), { force: true })
  await window.getByRole('menuitem', { name: await revealLabel() }).click()

  // Quiet, in-context error — a footer note, no modal — and no OS call ran.
  await expect(window.getByTestId('footer-note')).toBeVisible()
  expect(await shownCalls()).toEqual([])
  expect(await openedCalls()).toEqual([])
  // The session is unchanged: alpha.md is still the active tab.
  await expect(window.locator('.document-title')).toContainText('alpha.md')
})

test('US4 an OS launch failure is surfaced quietly and the session is untouched', async () => {
  await window.getByRole('treeitem').getByText('nested').click({ button: 'right' })
  // Make openPath fail like an unlaunchable file manager (FR-006 scenario 2).
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __revealOpened: string[] }
    shell.openPath = async (p: string) => {
      g.__revealOpened.push(p)
      return 'Failed to open folder'
    }
  })
  await window.getByRole('menuitem', { name: await revealLabel() }).click()

  await expect(window.getByTestId('footer-note')).toBeVisible()
  expect(await openedCalls()).toEqual([path.join(testFolder, 'nested')])
})
