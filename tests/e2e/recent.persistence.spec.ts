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
  recentMenuStructure,
  clickMenuAction,
  clickRecentItem,
  openFolder,
  stubDialog,
  expectMessageBox
} from './recent-helpers'

/**
 * Spec 004 Recent Items — US4 + FR-011/FR-012 + edges (split from
 * recent.spec.ts): Clear Recent Items and restart persistence, per-kind caps,
 * the quiet footer-note on config write failures, empty/separator history,
 * FR-013 explorer-opens-never-record, R4 OUTSIDE_WORKSPACE rejection, and the
 * long-path ellipsis.
 */

const ctx: RecentContext = {
  app: null as unknown as ElectronApplication,
  window: null as unknown as Page,
  testFolder: '',
  configDir: '',
  externalFile: ''
}
recentHooks(ctx)

test('empty history shows a disabled No Recent Items entry and no Clear action', async () => {
  const items = await recentItemsState(ctx)
  expect(items).toEqual([{ label: 'No Recent Items', enabled: false }])
  // Spec edge: an empty list offers no Clear Recent Items action.
  const structure = await recentMenuStructure(ctx)
  expect(structure).toEqual([{ label: 'No Recent Items', enabled: false }])
})

test('only files recorded: no leading/dangling separator (spec edge)', async () => {
  await stubDialog(ctx, ctx.externalFile)
  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // [file, separator, Clear Recent Items] — the folders/files separator must
  // not dangle at the top of the submenu when the folder group is empty.
  const labels = (await recentMenuStructure(ctx)).map((i) => i.label)
  expect(labels[0]?.includes('external.md')).toBe(true)
  expect(labels[1]).toBeFalsy()
  expect(labels[2]).toBe('Clear Recent Items')
})

test('only folders recorded: no leading/dangling separator (spec edge)', async () => {
  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const labels = (await recentMenuStructure(ctx)).map((i) => i.label)
  expect(labels[0]?.includes('ame-recent-e2e')).toBe(true)
  expect(labels[1]).toBeFalsy()
  expect(labels[2]).toBe('Clear Recent Items')
})

test('FR-013 files opened from the explorer never appear in Recent Items', async () => {
  await openFolder(ctx)
  await ctx.window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(ctx.window.locator('.document-title')).toContainText('alpha.md')

  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('alpha.md'))).toBe(false)
})

test('a recent folder whose path is now a regular file is dropped with NOT_FOUND', async () => {
  // A folder that will later become a FILE (wrong type at reopen) — the
  // exists-but-unopenable branch of FR-009.
  const target = path.join(ctx.testFolder, 'type-swap')
  fs.mkdirSync(target)
  fs.writeFileSync(path.join(target, 'leaf.md'), '# Leaf')
  await stubDialog(ctx, target)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('leaf.md')).toBeVisible()

  // Switch to another workspace so target is no longer current, then turn the
  // folder into a regular file behind the app's back.
  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  fs.rmSync(target, { recursive: true, force: true })
  fs.writeFileSync(target, '# Now a file')

  await clickRecentItem(ctx, 'type-swap')
  await expectMessageBox(ctx)
  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('type-swap'))).toBe(false)
})

test('Unicode and whitespace path entries record and reopen', async () => {
  const unicodeFolder = path.join(ctx.testFolder, '名 文件夹')
  fs.mkdirSync(unicodeFolder, { recursive: true })
  const unicodeFile = path.join(unicodeFolder, '文 档 .md')
  fs.writeFileSync(unicodeFile, '# Unicode')

  await stubDialog(ctx, unicodeFile)
  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('文 档 .md')

  await stubDialog(ctx, unicodeFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('文 档 .md')).toBeVisible()

  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('文 档 .md'))).toBe(true)

  await clickRecentItem(ctx, '文 档 .md')
  await expect(ctx.window.locator('.document-title')).toContainText('文 档 .md')
})

test('FR-012 more than 5 qualifying files keep only the 5 most recent files', async () => {
  const files: string[] = []
  for (let i = 0; i < 7; i++) {
    const f = path.join(ctx.testFolder, `many-${i}.md`)
    fs.writeFileSync(f, `# Many ${i}`)
    files.push(f)
  }
  for (const f of files) {
    await stubDialog(ctx, f)
    await clickFileMenu(ctx, 'Open File')
    // Wait for this specific document to become the active tab so the open
    // (and its recent-items write) has completed before the next dialog stub
    // replaces the shared stub.
    await expect(ctx.window.locator('.document-title')).toContainText(path.basename(f))
  }

  const items = await recentItemsState(ctx)
  expect(items).toHaveLength(5)
  expect(items[0].label).toContain('many-6.md')
  expect(items.some((i) => i.label.includes('many-0.md'))).toBe(false)
})

test('FR-012 more than 5 qualifying folders keep only the 5 most recent folders', async () => {
  const folders: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = path.join(ctx.testFolder, `dir-${i}`)
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'leaf.md'), `# Leaf ${i}`)
    folders.push(d)
  }
  for (const d of folders) {
    await stubDialog(ctx, d)
    await clickFileMenu(ctx, 'Open Folder')
    await expect(ctx.window.getByRole('treeitem').getByText('leaf.md')).toBeVisible()
  }

  const items = await recentItemsState(ctx)
  // Only folders were recorded, so every entry is a folder (labels carry no
  // type prefix; the group is the type signal).
  expect(items).toHaveLength(5)
  expect(items[0].label).toContain('dir-6')
  expect(items.some((i) => i.label.includes('dir-0'))).toBe(false)
})

test('US2 folders are grouped above files, then Clear Recent Items (FR-015)', async () => {
  await stubDialog(ctx, ctx.externalFile)
  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const labels = (await recentMenuStructure(ctx)).map((i) => i.label)
  // [Folder, separator, File, separator, Clear Recent Items] (separators have
  // an empty label in Electron). Without a type prefix the group position
  // identifies the kind: the folder entry names the workspace temp dir, the
  // file entry ends in .md.
  expect(labels[0]?.includes('ame-recent-e2e')).toBe(true)
  expect(labels[1]).toBeFalsy()
  expect(labels[2]?.endsWith('external.md')).toBe(true)
  expect(labels[3]).toBeFalsy()
  expect(labels[4]).toBe('Clear Recent Items')
})

test('US4 Clear Recent Items empties the history, untouched session, persists across restart', async () => {
  await stubDialog(ctx, ctx.externalFile)
  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  expect((await recentItemsState(ctx)).length).toBe(2)

  await clickMenuAction(ctx, 'Clear Recent Items')
  await expect.poll(async () => await recentItemsState(ctx))
    .toEqual([{ label: 'No Recent Items', enabled: false }])
  expect(await recentItemsState(ctx)).toEqual([{ label: 'No Recent Items', enabled: false }])

  // The open document session is untouched (FR-014).
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // US4 scenario 3: the cleared history survives a restart.
  await ctx.app.close()
  ;({ app: ctx.app, window: ctx.window } = await launchApp(ctx.configDir))
  expect(await recentItemsState(ctx)).toEqual([{ label: 'No Recent Items', enabled: false }])
})

test('FR-011 a config write failure is a quiet footer note and does not fail the open', async () => {
  // Break the config path: the directory named by AME_CONFIG_DIR becomes a
  // file, so the atomic write (mkdir + temp + rename) cannot proceed.
  fs.rmSync(ctx.configDir, { recursive: true, force: true })
  fs.writeFileSync(ctx.configDir, 'x')

  await ctx.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, ctx.externalFile)
  await clickFileMenu(ctx, 'Open File')

  // The open still succeeds (FR-011)...
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // ...and the persistence failure surfaces as a quiet, non-modal footer note.
  await expect(ctx.window.getByTestId('footer-note')).toContainText('Recent Items could not be saved')
})

test('FR-011 a config write failure during a FOLDER open is non-fatal', async () => {
  // Break the config path before the folder open.
  fs.rmSync(ctx.configDir, { recursive: true, force: true })
  fs.writeFileSync(ctx.configDir, 'x')

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')

  // The folder still commits as the workspace (FR-003/FR-011)...
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  // ...and the persistence failure surfaces as a quiet footer note.
  await expect(ctx.window.getByTestId('footer-note')).toContainText('Recent Items could not be saved')
})

test('FR-011 Clear Recent Items with a broken config reports quietly', async () => {
  await stubDialog(ctx, ctx.externalFile)
  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // Break the config path AFTER recording, then clear.
  fs.rmSync(ctx.configDir, { recursive: true, force: true })
  fs.writeFileSync(ctx.configDir, 'x')
  await clickMenuAction(ctx, 'Clear Recent Items')

  // The clear is best-effort: the failure is a quiet note, never a modal, and
  // the session is untouched.
  await expect(ctx.window.getByTestId('footer-note')).toContainText('Recent Items could not be cleared')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')
})
