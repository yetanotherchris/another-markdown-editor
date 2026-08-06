import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  launchApp,
  closeAppSafely,
  stubOpenDialog,
  clickHamburgerItem,
  clickHamburgerRecent,
  hamburgerRecentState,
  hamburgerRecentStructure,
  openFolder as openWorkspaceFolder,
  typeInEditor as typeSharedInEditor
} from './launch'

/**
 * Shared fixtures and recent-menu helpers for the split recent-items suite
 * (US4 scenario 3): the temp workspace + external file, the per-test config
 * dir, and the hamburger Recent Items helpers. Each spec calls `recentHooks()`
 * in its own test hooks; every covered scenario stays covered (FR-009).
 */
export interface RecentContext {
  app: ElectronApplication
  window: Page
  testFolder: string
  configDir: string
  externalFile: string
}

const FILE_MENU_LABELS = { 'Open File': 'Open File…', 'Open Folder': 'Open Folder…', 'Close Tab': 'Close Tab' } as const

export function recentHooks(ctx: RecentContext): void {
  test.beforeAll(async () => {
    ctx.testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-recent-e2e-'))
    fs.writeFileSync(path.join(ctx.testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
    fs.writeFileSync(path.join(ctx.testFolder, 'beta.md'), '# Beta')
    fs.mkdirSync(path.join(ctx.testFolder, 'sub'))
    fs.writeFileSync(path.join(ctx.testFolder, 'sub', 'gamma.md'), '# Gamma')
    // A second workspace for replacement tests.
    fs.mkdirSync(path.join(ctx.testFolder, 'other'))
    fs.writeFileSync(path.join(ctx.testFolder, 'other', 'delta.md'), '# Delta')
    // Files opened through the File menu (outside any workspace).
    ctx.externalFile = path.join(ctx.testFolder, 'external.md')
    fs.writeFileSync(ctx.externalFile, '# External')
  })

  test.beforeEach(async () => {
    // A per-test config directory so tests never read or write the developer's
    // real ~/.config/ame (research R1, AME_CONFIG_DIR seam).
    ctx.configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-recent-config-'))
    // externalFile is a shared fixture that the deleted-file tests remove;
    // recreate it so any later test that opens it has a real target.
    fs.writeFileSync(ctx.externalFile, '# External')
    ;({ app: ctx.app, window: ctx.window } = await launchApp(ctx.configDir, ctx.testFolder))
  })

  test.afterEach(async () => {
    // closeAppSafely force-closes the app if the stubbed quit round-trip
    // stalls, so a live Electron process never leaks into the next test.
    await closeAppSafely(ctx.app)
    fs.rmSync(ctx.configDir, { recursive: true, force: true })
  })

  test.afterAll(async () => {
    fs.rmSync(ctx.testFolder, { recursive: true, force: true })
  })
}

/** Open the hamburger and click the named File-menu action. */
export async function clickFileMenu(ctx: RecentContext, prefix: keyof typeof FILE_MENU_LABELS): Promise<void> {
  await clickHamburgerItem(ctx.window, FILE_MENU_LABELS[prefix])
}

/** The selectable recent entries (labels only; Clear Recent Items excluded). */
export async function recentItemsState(ctx: RecentContext): Promise<{ label: string; enabled: boolean }[]> {
  return hamburgerRecentState(ctx.window)
}

/** The full Recent Items submenu, including separators and the Clear action. */
export async function recentMenuStructure(ctx: RecentContext): Promise<{ label: string; enabled: boolean }[]> {
  return hamburgerRecentStructure(ctx.window)
}

/** Click a Recent Items action by its exact label (e.g. Clear Recent Items). */
export async function clickMenuAction(ctx: RecentContext, label: string): Promise<void> {
  await clickHamburgerRecent(ctx.window, label)
}

/** Click a recent entry whose shortened label contains `labelContains`. */
export async function clickRecentItem(ctx: RecentContext, labelContains: string): Promise<void> {
  await clickHamburgerRecent(ctx.window, labelContains)
}

/** Open a workspace folder through the hamburger (delegates to the harness). */
export async function openFolder(ctx: RecentContext): Promise<void> {
  await openWorkspaceFolder(ctx.window)
}

/** Point the (shared) open dialog stub at a specific path before a menu action. */
export async function stubDialog(ctx: RecentContext, target: string): Promise<void> {
  await stubOpenDialog(ctx.app, target)
}

/** Focus the editor of the active tab and type text into it. */
export async function typeInEditor(ctx: RecentContext, text: string): Promise<void> {
  await typeSharedInEditor(ctx.window, text)
}

/** Assert a native message-box appeared at least once (the suites use this for
 *  error surfacing and re-prompt proof). */
export async function expectMessageBox(ctx: RecentContext): Promise<void> {
  const { messageBoxCallCount } = await import('./launch')
  await expect.poll(() => messageBoxCallCount(ctx.app)).toBeGreaterThanOrEqual(1)
}

/** Assert the stubbed message-box body does NOT contain an absolute path
 *  (Principle II — used by the path-leak tests). */
export async function messageBoxBody(ctx: RecentContext): Promise<string> {
  const { lastMessageBoxOptions } = await import('./launch')
  const last = await lastMessageBoxOptions(ctx.app)
  return `${last.message ?? ''}\n${last.detail ?? ''}`
}
