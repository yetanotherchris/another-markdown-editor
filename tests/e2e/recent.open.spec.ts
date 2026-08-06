import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { launchApp } from './launch'
import {
  RecentContext,
  recentHooks,
  clickFileMenu,
  recentItemsState,
  clickRecentItem,
  stubDialog
} from './recent-helpers'

/**
 * Spec 004 Recent Items — US1/US2 (split from recent.spec.ts): opening and
 * reopening recorded files and folders, dedupe/move-to-front, restart
 * persistence, and file-vs-folder grouping (FR-006/FR-015).
 */

const ctx: RecentContext = {
  app: null as unknown as ElectronApplication,
  window: null as unknown as Page,
  testFolder: '',
  configDir: '',
  externalFile: ''
}
recentHooks(ctx)

test('US1 opening a file via the File menu records it and it can be reopened', async () => {
  await ctx.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, ctx.externalFile)

  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // The file appears in File > Recent Items (labels carry no File:/Folder:
  // prefix — the grouping conveys the type).
  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('external.md'))).toBe(true)

  // Reopen it from the menu: an already-open tab is simply activated.
  await clickRecentItem(ctx, 'external.md')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')
})

test('US1 reopening a recent file after its tab closed reopens it', async () => {
  await ctx.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, ctx.externalFile)

  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // Close the tab, then reopen from Recent Items.
  await clickFileMenu(ctx, 'Close Tab')
  await expect(ctx.window.locator('.document-title')).not.toContainText('external.md')
  await clickRecentItem(ctx, 'external.md')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')
})

test('US1 opening a folder records it and it can be reopened as the workspace', async () => {
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('ame-recent-e2e'))).toBe(true)

  await clickRecentItem(ctx, 'ame-recent-e2e')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
})

test('US1 reopening an entry moves it to the front without a duplicate', async () => {
  await stubDialog(ctx, ctx.externalFile)

  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // A second file so the file group has an order to verify the bump with.
  const external2 = path.join(ctx.testFolder, 'external2.md')
  fs.writeFileSync(external2, '# External 2')
  await stubDialog(ctx, external2)
  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external2.md')

  // Open a folder afterwards so neither file is the most recent overall.
  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const items = await recentItemsState(ctx)
  expect(items[0].label).toContain('ame-recent-e2e')
  expect(items).toHaveLength(3)

  // Reopen the older file — it stays a single entry and moves to the FRONT of
  // the FILES group (folders are grouped above files, FR-015). Poll: the menu
  // click starts an async renderer→main round trip, and the bump happens in
  // main only after that round trip completes. Position-based so a missing
  // bump is detectable.
  await clickRecentItem(ctx, 'external.md')
  await expect.poll(async () => {
    const state = await recentItemsState(ctx)
    return state.findIndex((i) => i.label.includes('external.md'))
  }).toBe(1)
  const itemsAfter = await recentItemsState(ctx)
  expect(itemsAfter.filter((i) => i.label.includes('external.md'))).toHaveLength(1)
  expect(itemsAfter.findIndex((i) => i.label.includes('external2.md'))).toBe(2)
})

test('US1 recent items survive an application restart', async () => {
  await ctx.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, ctx.externalFile)

  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // Close the app, then relaunch with the same config dir.
  await ctx.app.close()
  ;({ app: ctx.app, window: ctx.window } = await launchApp(ctx.configDir))

  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('external.md'))).toBe(true)

  await clickRecentItem(ctx, 'external.md')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')
})

test('US2 recent file and folder entries are distinguishable by grouping and open correctly', async () => {
  await stubDialog(ctx, ctx.externalFile)

  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  // Labels carry no File:/Folder: prefix (2026-08-04 clarification): the type
  // is conveyed by the FR-015 grouping — the folder entry sits in the top
  // group and the file entry below it, and a file name ends in `.md`.
  const items = await recentItemsState(ctx)
  expect(items).toHaveLength(2)
  expect(items[0].label).toContain('ame-recent-e2e')
  expect(items[0].label.endsWith('.md')).toBe(false)
  expect(items[1].label).toContain('external.md')

  // Selecting the file activates a document tab.
  await clickRecentItem(ctx, ctx.externalFile)
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // Selecting the folder replaces the workspace.
  await clickRecentItem(ctx, ctx.testFolder)
  await expect(ctx.window.getByRole('treeitem').getByText('beta.md')).toBeVisible()
})
