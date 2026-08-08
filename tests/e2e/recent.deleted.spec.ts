import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { stubMessageBox } from './launch'
import {
  RecentContext,
  recentHooks,
  clickFileMenu,
  recentItemsState,
  clickRecentItem,
  stubDialog,
  typeInEditor,
  expectMessageBox,
  messageBoxBody
} from './recent-helpers'

/**
 * Spec 004 Recent Items — US3 (split from recent.spec.ts): unavailable entries
 * (deleted files/folders, path-leak safety, type swap) and the folder-open
 * confirmation (Cancel / Save All / failing Save All / Discard) — FR-009/FR-010.
 */

const ctx: RecentContext = {
  app: null as unknown as ElectronApplication,
  window: null as unknown as Page,
  testFolder: '',
  configDir: '',
  externalFile: ''
}
recentHooks(ctx)

test('US3 a deleted recent file explains, preserves the session, and is removed', async () => {
  await ctx.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file as string]
    })
  }, ctx.externalFile)

  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // Remove the file behind the app's back (no workspace open, so no watcher
  // interference), then attempt to reopen it from Recent Items.
  fs.rmSync(ctx.externalFile)
  await clickRecentItem(ctx, 'external.md')

  // In-context error; the session is unchanged (the still-open external.md tab
  // remains). The native error box is stubbed to acknowledge.
  await expectMessageBox(ctx)

  // The dead entry is gone from the menu.
  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('external.md'))).toBe(false)

  // The open document session is unchanged after the failed reopen.
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')
})

test('US3 a failed recent open never leaks an absolute path in the error', async () => {
  await stubDialog(ctx, ctx.externalFile)
  await clickFileMenu(ctx, 'Open File')
  await expect(ctx.window.locator('.document-title')).toContainText('external.md')

  // Record a second folder outside the current (nonexistent) workspace root,
  // then delete it: the prepare failure's sanitized message must not contain
  // the absolute path (Principle II).
  const doomedFolder = path.join(ctx.testFolder, 'doomed-leak')
  fs.mkdirSync(doomedFolder)
  fs.writeFileSync(path.join(doomedFolder, 'gone.md'), '# Gone')
  await stubDialog(ctx, doomedFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('gone.md')).toBeVisible()

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  fs.rmSync(doomedFolder, { recursive: true, force: true })
  await clickRecentItem(ctx, 'doomed-leak')
  // The native operation-failed box is surfaced; its detail must not contain
  // the absolute path (Principle II).
  await expectMessageBox(ctx)
  const body = await messageBoxBody(ctx)
  expect(body).not.toContain(doomedFolder)
  expect(body).not.toMatch(/[A-Za-z]:\\[^\s]*mm-recent-e2e/)
})

test('US3 a deleted recent folder explains, preserves the workspace, and is removed', async () => {
  // A dedicated folder that will be deleted while it is NOT the current
  // workspace, so deleting it cannot disturb the running watcher.
  const doomed = path.join(ctx.testFolder, 'doomed')
  fs.mkdirSync(doomed)
  fs.writeFileSync(path.join(doomed, 'gone.md'), '# Gone')

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  // Open the doomed folder as the workspace first (records it), then switch to
  // a different workspace so doomed is no longer current.
  await stubDialog(ctx, doomed)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('gone.md')).toBeVisible()

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  // Delete the now-inactive folder, then reopen it from Recent Items.
  fs.rmSync(doomed, { recursive: true, force: true })
  await clickRecentItem(ctx, 'doomed')
  await expectMessageBox(ctx)

  // The current workspace is unchanged.
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  // Functional probe: the live workspace in MAIN must be intact, not just the
  // renderer's stale tree — clicking a tree file drives file:read through
  // withWorkspace, which fails with NO_WORKSPACE if main nulled the root.
  await ctx.window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(ctx.window.locator('.document-title')).toContainText('alpha.md')

  // The dead folder entry is gone.
  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('doomed'))).toBe(false)
})

test('US3 cancelling an unsaved-work confirmation keeps the session and the recent folder', async () => {
  // Record two recent folders: the primary workspace and an alternative.
  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const other = path.join(ctx.testFolder, 'other')
  await stubDialog(ctx, other)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('delta.md')).toBeVisible()

  // Back to the primary workspace, open a file and make it dirty.
  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await ctx.window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(ctx.window.locator('.document-title')).toContainText('alpha.md')
  await typeInEditor(ctx, ' UNSAVED')

  // Reopen the alternative folder from Recent Items: the native unsaved-work
  // confirmation appears before the workspace swap (US3 scenario 3). Stub it
  // to cancel.
  await stubMessageBox(ctx.app, 'Cancel')
  await clickRecentItem(ctx, 'other')

  // Cancel: session intact, edit intact, recent entry still present.
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await expect(ctx.window.getByRole('treeitem').getByText('delta.md')).toHaveCount(0)
  const items = await recentItemsState(ctx)
  expect(items.some((i) => i.label.includes('other'))).toBe(true)

  // The prepared folder was genuinely abandoned: a late commit must fail
  // closed (a stale-pending bug would commit the old 'other' folder here).
  const probe = await ctx.window.evaluate(async () => {
    const api = (
      window as unknown as { api: { commitFolderOpen(): Promise<{ ok: boolean; code?: string }> } }
    ).api
    return api.commitFolderOpen()
  })
  expect(probe).toMatchObject({ ok: false, code: 'NO_WORKSPACE' })
})

test('US3 Save All in the folder-open confirmation saves before switching folders', async () => {
  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const other = path.join(ctx.testFolder, 'other')
  await stubDialog(ctx, other)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('delta.md')).toBeVisible()

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await ctx.window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(ctx.window.locator('.document-title')).toContainText('alpha.md')
  await typeInEditor(ctx, ' UNSAVED')

  await stubMessageBox(ctx.app, 'Save All')
  await clickRecentItem(ctx, 'other')

  // The folder switched only after the document was saved to its current
  // location, so wait for the commit, then verify the bytes on disk.
  await expect(ctx.window.getByRole('treeitem').getByText('delta.md')).toBeVisible()
  expect(fs.readFileSync(path.join(ctx.testFolder, 'alpha.md'), 'utf-8')).toContain('UNSAVED')
})

test('US3 a failing Save All keeps the confirmation open and does not commit', async () => {
  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const other = path.join(ctx.testFolder, 'other')
  await stubDialog(ctx, other)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('delta.md')).toBeVisible()

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await ctx.window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(ctx.window.locator('.document-title')).toContainText('alpha.md')
  await typeInEditor(ctx, ' UNSAVED')

  // Make the save fail at temp-file creation. A read-only destination alone is
  // insufficient on POSIX because rename permission belongs to the directory.
  const alphaPath = path.join(ctx.testFolder, 'alpha.md')
  const folderMode = process.platform === 'win32' ? undefined : fs.statSync(ctx.testFolder).mode
  if (process.platform === 'win32') fs.chmodSync(alphaPath, 0o444)
  else fs.chmodSync(ctx.testFolder, 0o555)
  try {
    // First prompt answers "Save All" (fails), the re-prompt then cancels. The
    // native re-prompt is proven by the stub receiving a second call.
    await stubMessageBox(ctx.app, ['Save All', 'cancel'])
    await clickRecentItem(ctx, 'other')
    const { messageBoxCallCount } = await import('./launch')
    await expect.poll(() => messageBoxCallCount(ctx.app)).toBeGreaterThanOrEqual(2)

    // The re-prompt must EXPLAIN the failure, not just re-appear (FR-010, US2
    // scenario 4): assert the native detail carries the explanation.
    const body = await messageBoxBody(ctx)
    expect(body).toContain('Could not save alpha.md')

    // The failed save does NOT commit (no delta.md in the tree) and the session
    // stays on the current folder.
    await expect(ctx.window.getByRole('treeitem').getByText('delta.md')).toHaveCount(0)
    await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  } finally {
    if (process.platform === 'win32') fs.chmodSync(alphaPath, 0o666)
    else fs.chmodSync(ctx.testFolder, folderMode ?? 0o755)
  }
})

test('US3 Discard in the folder-open confirmation switches the folder without saving', async () => {
  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()

  const other = path.join(ctx.testFolder, 'other')
  await stubDialog(ctx, other)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('delta.md')).toBeVisible()

  await stubDialog(ctx, ctx.testFolder)
  await clickFileMenu(ctx, 'Open Folder')
  await expect(ctx.window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await ctx.window.getByRole('treeitem').getByText('alpha.md').click()
  await expect(ctx.window.locator('.document-title')).toContainText('alpha.md')
  // A marker unique to this test: the shared fixture may already hold a prior
  // test's edits on disk, so assert on this edit only.
  await typeInEditor(ctx, ' DISCARDED')

  await stubMessageBox(ctx.app, 'Discard')
  await clickRecentItem(ctx, 'other')

  // Nothing was written to disk; the folder still switched; and "Discard"
  // actually discarded — the dirty alpha.md tab is CLOSED (leaving it open
  // dirty would let a later save write its content over the new folder's
  // file sharing the same relative path).
  expect(fs.readFileSync(path.join(ctx.testFolder, 'alpha.md'), 'utf-8')).not.toContain('DISCARDED')
  await expect(ctx.window.getByRole('treeitem').getByText('delta.md')).toBeVisible()
  await expect(ctx.window.locator('.document-title')).not.toContainText('alpha.md')
})
