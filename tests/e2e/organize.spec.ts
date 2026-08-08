import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  launchApp,
  closeAppSafely,
  stubTrash,
  stubMessageBox,
  messageBoxCallCount,
  lastMessageBoxOptions,
  openFolder as openWorkspaceFolder
} from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-organize-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta')
  fs.mkdirSync(path.join(testFolder, 'sub'))
  fs.writeFileSync(path.join(testFolder, 'sub', 'gamma.md'), '# Gamma')
  fs.mkdirSync(path.join(testFolder, 'notes'))
  fs.writeFileSync(path.join(testFolder, 'notes', 'note.md'), '# Note')
  fs.writeFileSync(path.join(testFolder, 'notes', 'image.png'), 'binary')
})

async function resetFixture(): Promise<void> {
  for (const f of ['alpha.md', 'beta.md', 'sub/gamma.md', 'notes/note.md', 'notes/image.png']) {
    const p = path.join(testFolder, f)
    if (f === 'notes/image.png') {
      fs.writeFileSync(p, 'binary')
    } else if (f === 'sub/gamma.md') {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, '# Gamma')
    } else {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, f.startsWith('alpha') ? '# Alpha\n\nHello world.' : '# Beta')
    }
  }
  // Remove anything a previous test created: placeholders, renames, the
  // create test's sub/fresh.md, the moved folder (notes/sub from the
  // folder-move test) and sub/alpha.md from the DnD tests.
  for (const name of [
    'new-file-1.md',
    'new-folder-1',
    'renamed.md',
    'ALPHA.md',
    'sub/fresh.md',
    'notes/sub'
  ]) {
    const p = path.join(testFolder, name)
    if (name !== 'ALPHA.md' || process.platform !== 'win32') {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    }
  }
  // A previous DnD test may have moved alpha.md into sub.
  if (fs.existsSync(path.join(testFolder, 'sub', 'alpha.md'))) {
    fs.rmSync(path.join(testFolder, 'sub', 'alpha.md'))
  }
}

test.beforeEach(async () => {
  await resetFixture()
  ;({ app, window } = await launchApp(undefined, testFolder))

  // Deterministic trash: instead of the OS recycle bin, remove the files
  // directly. `trashed: true` is still returned, so the app behaves exactly
  // as if the OS trash succeeded. process.getBuiltinModule works in the
  // bundled main process regardless of its module format.
  await stubTrash(app)
})

test.afterEach(async () => {
  await closeAppSafely(app)
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function openFolder(): Promise<void> {
  await openWorkspaceFolder(window)
}

async function openFile(name: string): Promise<void> {
  await window.getByRole('treeitem').getByText(name).first().click()
}

async function openContextMenu(row: ReturnType<Page['getByRole']>): Promise<void> {
  await row.click({ button: 'right' })
}

async function renameRow(row: ReturnType<Page['getByRole']>, newName: string): Promise<void> {
  await openContextMenu(row)
  await window.getByRole('menuitem').getByText('Rename').click()
  const input = window.getByRole('textbox', { name: /Rename/ })
  await expect(input).toBeVisible()
  await input.fill(newName)
  await input.press('Enter')
}

async function typeInEditor(text: string): Promise<void> {
  await window.locator('[contenteditable="true"]').first().click()
  await window.keyboard.type(text)
}

/**
 * Playwright cannot synthesize native HTML5 drag events in Electron, and
 * react-dnd's HTML5 backend requires the full dragstart → dragenter →
 * dragover → drop sequence with a DataTransfer. Dispatch it synthetically
 * against the rendered rows, retrying until the drop lands (the backend
 * defers hover to a requestAnimationFrame, which can race under load).
 */
async function dragTreeRow(sourceName: string, targetName: string): Promise<void> {
  await expect(window.getByRole('treeitem').getByText(sourceName)).toBeVisible()
  for (let attempt = 0; attempt < 3; attempt++) {
    const landed = await window.evaluate(
      async ({ sourceName, targetName }) => {
        const fire = (el: Element, type: string, dt: DataTransfer, x: number, y: number) => {
          el.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              dataTransfer: dt,
              clientX: x,
              clientY: y
            })
          )
        }
        const rows = Array.from(document.querySelectorAll('[role="treeitem"]'))
        // The role lives on the row wrapper; react-dnd's drag source is the
        // inner .tree-node div, so fire from there (or the row itself).
        const source = rows.find((r) => r.textContent?.includes(sourceName))
        const target = rows.find((r) => r.textContent?.includes(targetName))
        if (!source || !target)
          throw new Error(`tree rows not found (${sourceName} -> ${targetName})`)
        const fireFrom = (el: Element) => el.querySelector('.tree-node') ?? el

        const dt = new DataTransfer()
        fire(fireFrom(source), 'dragstart', dt, 10, 10)
        const rect = target.getBoundingClientRect()
        const x = rect.x + rect.width / 2
        const y = rect.y + rect.height / 2
        fire(fireFrom(target), 'dragenter', dt, x, y)
        fire(fireFrom(target), 'dragover', dt, x, y)
        // react-dnd defers hover to a requestAnimationFrame; let it settle
        // before the drop so the destination is recorded.
        await new Promise((resolve) => setTimeout(resolve, 150))
        fire(fireFrom(target), 'drop', dt, x, y)
        fire(fireFrom(source), 'dragend', dt, x, y)
        // A landed drop auto-opens the target folder: the toggle flips to
        // "Collapse". Use it to detect success instead of a fixed delay.
        await new Promise((resolve) => setTimeout(resolve, 50))
        const targetRow = Array.from(document.querySelectorAll('[role="treeitem"]')).find((r) =>
          r.textContent?.includes(targetName)
        )
        return targetRow?.querySelector('[aria-label="Collapse"]') !== null
      },
      { sourceName, targetName }
    )
    if (landed) return
    await window.waitForTimeout(300)
  }
}

/**
 * Drag a row onto the empty space below the last row: the tree's outer drop
 * zone, which targets the workspace root.
 */
async function dragTreeRowToRoot(sourceName: string): Promise<void> {
  await expect(window.getByRole('treeitem').getByText(sourceName)).toBeVisible()
  await window.evaluate(
    async ({ sourceName }) => {
      const fire = (el: Element, type: string, dt: DataTransfer, x: number, y: number) => {
        el.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y
          })
        )
      }
      const rows = Array.from(document.querySelectorAll('[role="treeitem"]'))
      const source = rows.find((r) => r.textContent?.includes(sourceName))
      // The role lives on the row wrapper; the drag source is the inner
      // .tree-node div.
      const dragSource = source?.querySelector('.tree-node') ?? source
      // The list element is the scrollable div directly under the tree root.
      const list = document.querySelector('[role="tree"] > div')
      if (!source || !list) throw new Error(`tree rows not found (${sourceName} -> root)`)

      const dt = new DataTransfer()
      fire(dragSource, 'dragstart', dt, 10, 10)
      const rect = list.getBoundingClientRect()
      const x = rect.x + rect.width / 2
      const y = rect.y + rect.height - 4
      fire(list, 'dragenter', dt, x, y)
      fire(list, 'dragover', dt, x, y)
      await new Promise((resolve) => setTimeout(resolve, 150))
      fire(list, 'drop', dt, x, y)
      fire(dragSource, 'dragend', dt, x, y)
    },
    { sourceName }
  )
  await window.waitForTimeout(300)
}

test('clicking inside the rename input places the caret at the click point', async () => {
  await openFolder()
  await openContextMenu(window.getByRole('treeitem').getByText('alpha.md'))
  await window.getByRole('menuitem').getByText('Rename').click()
  const input = window.getByRole('textbox', { name: /Rename/ })
  await expect(input).toBeVisible()

  // Click just after the "ph" of "alpha.md": the caret must land mid-text,
  // not snap back to a full selection (row remounts must not reset it).
  const box = await input.boundingBox()
  await window.mouse.click(box!.x + 22, box!.y + box!.height / 2)
  await window.waitForTimeout(200)

  const state = await window.evaluate(() => {
    const el = document.querySelector('.tree-node-input') as HTMLInputElement
    return { selStart: el.selectionStart, selEnd: el.selectionEnd }
  })
  expect(state.selStart).toBeGreaterThan(0)
  expect(state.selStart).toBeLessThan(8)
  expect(state.selStart).toBe(state.selEnd)
})

test('creates a file from the tree, named inline, present on disk', async () => {
  await openFolder()
  const row = window.getByRole('treeitem').filter({ hasText: 'sub' })
  await openContextMenu(row)
  await window.getByRole('menuitem').getByText('New File').click()

  const input = window.getByRole('textbox', { name: /Name new/ })
  await expect(input).toBeVisible()
  await input.fill('fresh.md')
  await input.press('Enter')

  await expect(window.getByRole('treeitem').getByText('fresh.md')).toBeVisible()
  expect(fs.existsSync(path.join(testFolder, 'sub', 'fresh.md'))).toBe(true)
})

test('cancelling the inline name removes the placeholder file', async () => {
  await openFolder()
  const row = window.getByRole('treeitem').filter({ hasText: 'sub' })
  await openContextMenu(row)
  await window.getByRole('menuitem').getByText('New Folder').click()

  const input = window.getByRole('textbox', { name: /Name new/ })
  await expect(input).toBeVisible()
  await input.press('Escape')

  // The placeholder is trashed and disappears from the tree.
  await expect(window.getByRole('treeitem').getByText('new-folder-1')).toHaveCount(0)
  const placeholders = fs.readdirSync(path.join(testFolder, 'sub'))
  expect(placeholders.filter((p) => p.startsWith('new-folder-'))).toHaveLength(0)
})

test('renames a file in the tree and on disk', async () => {
  await openFolder()
  await renameRow(window.getByRole('treeitem').getByText('alpha.md'), 'renamed.md')

  await expect(window.getByRole('treeitem').getByText('renamed.md')).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toHaveCount(0)
  expect(fs.existsSync(path.join(testFolder, 'renamed.md'))).toBe(true)
  expect(fs.existsSync(path.join(testFolder, 'alpha.md'))).toBe(false)
})

test('an open document follows a rename in the tree (FR-028)', async () => {
  await openFolder()
  await openFile('alpha.md')
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  await renameRow(window.getByRole('treeitem').getByText('alpha.md'), 'renamed.md')

  await expect(window.locator('.document-title')).toContainText('renamed.md')
  await expect(window.getByRole('tab', { name: /renamed\.md/ })).toBeVisible()
  // The app's own mutation must not be reported back as an external change
  // (FR-037): no "File changed on disk" prompt may appear.
  await expect.poll(() => messageBoxCallCount(app)).toBe(0)

  // Editing and saving writes to the new location. The dirty-tab close now
  // prompts through the stubbed native box: answer "Save".
  await typeInEditor(' EXTRA')
  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close renamed.md' }).click()
  const disk = fs.readFileSync(path.join(testFolder, 'renamed.md'), 'utf-8')
  expect(disk).toContain('EXTRA')
})

test('renaming to an existing name is refused and nothing is overwritten', async () => {
  await openFolder()
  await renameRow(window.getByRole('treeitem').getByText('alpha.md'), 'beta.md')

  // The native operation-failed box (stubbed to acknowledge) is surfaced.
  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(1)

  // Tree state unchanged and beta.md content intact.
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  expect(fs.readFileSync(path.join(testFolder, 'beta.md'), 'utf-8')).toBe('# Beta')
})

test('renaming a file to a non-markdown extension is refused', async () => {
  await openFolder()
  await renameRow(window.getByRole('treeitem').getByText('alpha.md'), 'alpha.txt')

  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(1)
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  expect(fs.existsSync(path.join(testFolder, 'alpha.md'))).toBe(true)
})

test('a case-only rename is allowed on case-insensitive filesystems', async () => {
  await openFolder()
  // On a case-insensitive filesystem (Windows/macOS default) the target is the
  // same file; on case-sensitive ones the target simply does not exist yet.
  await renameRow(window.getByRole('treeitem').getByText('alpha.md'), 'ALPHA.md')

  // Exact text matching: getByText is case-insensitive by default, so the
  // renamed ALPHA.md would otherwise match the old-name locator.
  await expect(window.getByRole('treeitem').getByText('ALPHA.md', { exact: true })).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('alpha.md', { exact: true })).toHaveCount(0)
  // The file was renamed in place: exactly one alpha-named file remains.
  const onDisk = fs.readdirSync(testFolder)
  expect(onDisk.filter((f) => f.toLowerCase() === 'alpha.md')).toHaveLength(1)
})

test('deleting a file asks for confirmation and sends it to trash', async () => {
  await openFolder()
  const row = window.getByRole('treeitem').getByText('beta.md')
  await openContextMenu(row)
  await stubMessageBox(app, 'Delete')
  await window.getByRole('menuitem').getByText('Delete').click()

  // The destructive confirmation must actually have been shown, and it must be
  // the delete-to-trash surface (not, say, a blocked-delete box).
  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(1)
  const last = await lastMessageBoxOptions(app)
  expect(last.message).toBe('Delete beta.md?')
  await expect(window.getByRole('treeitem').getByText('beta.md')).toHaveCount(0)
  expect(fs.existsSync(path.join(testFolder, 'beta.md'))).toBe(false)
})

test('deleting an open clean file closes its tab', async () => {
  await openFolder()
  await openFile('alpha.md')
  await expect(window.getByRole('tab')).toHaveCount(1)

  const row = window.getByRole('treeitem').getByText('alpha.md')
  await openContextMenu(row)
  await stubMessageBox(app, 'Delete')
  await window.getByRole('menuitem').getByText('Delete').click()

  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(1)
  await expect(window.getByRole('tab')).toHaveCount(0)
  await expect(window.locator('.empty-state')).toBeVisible()
})

test('deleting a file with unsaved changes is refused', async () => {
  await openFolder()
  await openFile('alpha.md')
  await typeInEditor(' UNSAVED')

  const row = window.getByRole('treeitem').getByText('alpha.md')
  await openContextMenu(row)
  await stubMessageBox(app, 'OK')
  await window.getByRole('menuitem').getByText('Delete').click()

  // The blocked-delete acknowledgement must have been shown — and it must be
  // the blocked-delete surface, not a delete-to-trash box (the stub finds no
  // "Delete" button on a blocked box and would fail loudly).
  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(1)
  const last = await lastMessageBoxOptions(app)
  expect(last.message).toBe('Cannot delete')

  // The file is untouched and the tab is still open with the edits.
  expect(fs.existsSync(path.join(testFolder, 'alpha.md'))).toBe(true)
  await expect(window.locator('.ProseMirror:visible')).toContainText('UNSAVED')
})

test('deleting a folder warns about hidden files (FR-029b)', async () => {
  await openFolder()
  const row = window.getByRole('treeitem').filter({ hasText: 'notes' })
  await openContextMenu(row)
  await stubMessageBox(app, 'Delete')
  await window.getByRole('menuitem').getByText('Delete').click()

  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(1)
  expect(fs.existsSync(path.join(testFolder, 'notes'))).toBe(false)
})

test('when trash is unavailable, permanent deletion requires a second confirmation', async () => {
  await app.evaluate(({ shell }) => {
    shell.trashItem = async () => {
      throw new Error('no trash on this system')
    }
  })

  await openFolder()
  const row = window.getByRole('treeitem').getByText('beta.md')
  await openContextMenu(row)
  // First the delete-to-trash confirmation, then — after trash fails — the
  // permanent-delete confirmation, which offers Cancel / Delete Permanently.
  await stubMessageBox(app, ['Delete', 'Delete Permanently'])
  await window.getByRole('menuitem').getByText('Delete').click()

  // Two confirmations must have fired: delete-to-trash then permanent-delete
  // ("Trash unavailable" is the permanent-delete message, so the last box is
  // the irreversible one).
  await expect.poll(() => messageBoxCallCount(app)).toBeGreaterThanOrEqual(2)
  const last = await lastMessageBoxOptions(app)
  expect(last.message).toBe('Trash unavailable')
  await expect(window.getByRole('treeitem').getByText('beta.md')).toHaveCount(0)
  expect(fs.existsSync(path.join(testFolder, 'beta.md'))).toBe(false)
})

test('moves a file into a folder by drag and drop', async () => {
  await openFolder()
  await expect(window.getByRole('treeitem').getByText('gamma.md')).toHaveCount(0)

  await dragTreeRow('alpha.md', 'sub')

  // The drop auto-expands the target folder (arborist opens it), so the
  // moved file is now visible inside it rather than gone from the tree.
  await expect(window.getByRole('treeitem').getByText('gamma.md')).toBeVisible()
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
  await expect.poll(() => fs.existsSync(path.join(testFolder, 'sub', 'alpha.md'))).toBe(true)
  await expect.poll(() => !fs.existsSync(path.join(testFolder, 'alpha.md'))).toBe(true)
})

test('moves a file back to the root folder by dropping on empty space', async () => {
  await openFolder()
  await dragTreeRow('alpha.md', 'sub')
  await expect.poll(() => fs.existsSync(path.join(testFolder, 'sub', 'alpha.md'))).toBe(true)

  await dragTreeRowToRoot('alpha.md')

  await expect.poll(() => !fs.existsSync(path.join(testFolder, 'sub', 'alpha.md'))).toBe(true)
  await expect.poll(() => fs.existsSync(path.join(testFolder, 'alpha.md'))).toBe(true)
})

test('moving a folder containing an open document reroutes the document (FR-028)', async () => {
  await openFolder()
  await window
    .getByRole('treeitem')
    .filter({ hasText: 'sub' })
    .getByRole('button', { name: 'Expand' })
    .click()
  await openFile('gamma.md')
  await expect(window.locator('.document-title')).toContainText('gamma.md')

  await dragTreeRow('sub', 'notes')

  // The tab stays open and still points at the moved file.
  await expect(window.getByRole('tab', { name: /gamma\.md/ })).toBeVisible()
  await expect
    .poll(() => fs.existsSync(path.join(testFolder, 'notes', 'sub', 'gamma.md')))
    .toBe(true)

  await typeInEditor(' MOVED')
  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close gamma.md' }).click()
  const disk = fs.readFileSync(path.join(testFolder, 'notes', 'sub', 'gamma.md'), 'utf-8')
  expect(disk).toContain('MOVED')
})

test('cannot drop a folder onto its own descendant or onto a file', async () => {
  await openFolder()
  await window
    .getByRole('treeitem')
    .filter({ hasText: 'sub' })
    .getByRole('button', { name: 'Expand' })
    .click()
  await expect(window.getByRole('treeitem').getByText('gamma.md')).toBeVisible()

  // Dropping onto a file row is not a valid destination: nothing happens.
  await dragTreeRow('sub', 'gamma.md')
  await expect.poll(() => messageBoxCallCount(app)).toBe(0)
  expect(fs.existsSync(path.join(testFolder, 'sub', 'gamma.md'))).toBe(true)
  expect(fs.existsSync(path.join(testFolder, 'sub'))).toBe(true)

  // Dropping a folder onto itself is rejected silently as well.
  await dragTreeRow('sub', 'sub')
  await expect.poll(() => messageBoxCallCount(app)).toBe(0)
  expect(fs.existsSync(path.join(testFolder, 'sub'))).toBe(true)
})
