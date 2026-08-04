import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { electronLaunchArgs, stubMessageBox, closeAppDiscardingQuit, messageBoxCallCount } from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-source-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta\n\nSecond file.')
  fs.mkdirSync(path.join(testFolder, 'nested'))
  fs.writeFileSync(path.join(testFolder, 'nested', 'deep.md'), '# Deep')
  fs.writeFileSync(path.join(testFolder, 'no-newline.md'), 'No trailing newline')
})

test.beforeEach(async () => {
  app = await electron.launch({
    args: electronLaunchArgs
  })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder as string]
    })
  }, testFolder)

  // Deterministic trash for the delete-related flows.
  await app.evaluate(({ shell }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsMod = (process as any).getBuiltinModule('fs')
    shell.trashItem = async (p: string) => {
      fsMod.rmSync(p, { recursive: true, force: true })
    }
  })

  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta\n\nSecond file.')

  await stubMessageBox(app)
})

test.afterEach(async () => {
  try {
    await closeAppDiscardingQuit(app)
  } catch {
    await app.close().catch(() => {})
  }
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

async function openFolder(): Promise<void> {
  await window.getByRole('button', { name: 'Open Folder' }).click()
}

async function openFile(name: string): Promise<void> {
  await window.getByRole('treeitem').getByText(name).click()
}

function getViewSourceButton(): ReturnType<Page['getByRole']> {
  return window.getByRole('button', { name: 'View source' })
}

// ---------- US1: toolbar View source, edit, return ----------

test('view source slides in, takes the tab, and returns (US1)', async () => {
  await openFolder()
  await openFile('alpha.md')
  await expect(window.locator('.document-title')).toContainText('alpha.md')

  // The toolbar View source button is present and labelled (US4).
  await expect(getViewSourceButton()).toHaveCount(1)
  await getViewSourceButton().click()

  // The source view overlay replaces the formatted editor in the same tab.
  await expect(window.getByTestId('source-view')).toBeVisible()
  await expect(window.getByTestId('source-textarea')).toBeVisible()
  await expect(window.locator('.source-textarea')).toHaveValue('# Alpha\n\nHello world.')

  // Edit the raw markdown; the document becomes dirty like formatted edits.
  await window.getByTestId('source-textarea').fill('# Alpha\n\nEdited in source.')
  await expect(window.locator('.document-title')).toContainText('\u2022')

  // Return to formatted view: the edit is reflected and still unsaved.
  await window.getByRole('button', { name: /Back to visual editing/ }).click()
  await expect(window.getByTestId('source-view')).toHaveCount(0)
  await expect(window.locator('.document-title')).toContainText('\u2022')

  // Saving writes the edited text back to disk (the dirty-tab close prompts
  // through the stubbed native box: answer "Save").
  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close alpha.md' }).click()
  const disk = fs.readFileSync(path.join(testFolder, 'alpha.md'), 'utf-8')
  expect(disk).toContain('Edited in source.')
})

test('US1 no-edit round trip keeps content and dirty state', async () => {
  await openFolder()
  await openFile('alpha.md')
  await getViewSourceButton().click()
  await expect(window.getByTestId('source-view')).toBeVisible()

  // No edits in source.
  await window.getByRole('button', { name: /Back to visual editing/ }).click()
  await expect(window.getByTestId('source-view')).toHaveCount(0)
  // Clean document — no dirty dot appeared because nothing changed.
  await expect(window.locator('.document-title')).not.toContainText('\u2022')
})

// ---------- US2: explorer context menu ----------

test('US2 opens an unopened file directly in source view', async () => {
  await openFolder()

  const row = window.getByRole('treeitem').getByText('beta.md')
  await row.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'View source' }).click()

  await expect(window.getByRole('tab', { name: /beta\.md/ })).toBeVisible()
  await expect(window.getByTestId('source-textarea')).toBeVisible()
  await expect(window.locator('.document-title')).toContainText('beta.md')
  await expect(window.locator('[data-testid="source-textarea"]')).toHaveValue('# Beta\n\nSecond file.')
})

test('US2 context-menu View source reuses the already-open formatted tab', async () => {
  await openFolder()
  await openFile('alpha.md')
  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toBeVisible()
  await openFile('beta.md')

  const alphaRow = window.getByRole('treeitem').getByText('alpha.md')
  await alphaRow.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'View source' }).click()

  // No duplicate tab; the existing alpha tab becomes active in source view.
  await expect(window.getByTestId('source-view')).toBeVisible()
  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toHaveCount(1)
  await expect(window.locator('.document-title')).toContainText('alpha.md')
})

// ---------- US3: mutual exclusivity ----------

test('US3 exactly one editing view is visible during a switch', async () => {
  await openFolder()
  await openFile('alpha.md')
  await getViewSourceButton().click()
  await expect(window.getByTestId('source-view')).toBeVisible()
  // Wait for the slide-in to settle; until it finishes, the overlay sits
  // offset from the host and would not intercept clicks at the editor's center.
  await expect(window.getByTestId('source-view')).toHaveCSS('transform', 'none')

  // The overlay and the textarea are the only editable surface. A real click at
  // the centre of the (covered) ProseMirror must land on the source textarea —
  // the ProseMirror underneath is not the interactive target (FR-009).
  const covered = window.locator('.editor-host .ProseMirror').first()
  await expect(covered).toBeAttached()
  const box = (await covered.boundingBox()) as { x: number; y: number; width: number; height: number }
  await window.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const focused = await window.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return el ? el.className : ''
  })
  expect(focused).toContain('source-textarea')

  await window.getByRole('button', { name: /Back to visual editing/ }).click()
  await expect(window.getByTestId('source-view')).toHaveCount(0)
  const editable = window.locator('[contenteditable="true"]').first()
  await expect(editable).toBeAttached()
})

// ---------- US4: tooltips ----------

test('US4 every formatted toolbar control has a tooltip', async () => {
  await openFolder()
  await openFile('alpha.md')
  await expect(getViewSourceButton()).toHaveCount(1)

  // The label pass assigns title/aria-label to all top-bar controls by order.
  const labels = await window.locator('.milkdown-top-bar button').evaluateAll((buttons) =>
    buttons.map((b) => (b instanceof SVGElement ? '' : b.getAttribute('aria-label') ?? b.title ?? ''))
  )
  expect(labels.length).toBeGreaterThan(10)
  for (const label of labels) {
    expect(label.length).toBeGreaterThan(0)
  }
  // Semantic spot checks: the heading selector is first, Bold carries its own
  // label (the exact misalignment the 13-entry draft produced) and the trailing
  // custom control is the View source action.
  expect(labels[0]).toContain('Paragraph or heading style')
  expect(labels).toContain('Bold')
  expect(labels[labels.length - 1]).toBe('View source')
})

// ---------- US5: task backspace ----------

test('US5: Backspace removes an empty task item', async () => {
  await openFolder()
  await openFile('alpha.md')
  // Place the caret in the paragraph text, then add one empty block.
  await window.locator('[contenteditable="true"] p').last().click()
  await window.keyboard.press('End')
  await window.keyboard.press('Enter')
  // Create the task item strictly with the checklist control (SC-005) rather
  // than by typing `- [ ] ` raw — the raw path makes the button click race the
  // ingest of the typed text and is flaky.
  await window.getByRole('button', { name: 'Task list' }).click()
  await expect(window.locator('.list-item .label-wrapper')).toBeVisible()

  // Cursor at the start of the empty task item; Backspace removes it.
  await window.keyboard.press('Home')
  await window.keyboard.press('Backspace')
  await expect(window.locator('.list-item .label-wrapper')).toHaveCount(0)
})

// ---------- FR-12: normalization is preserved, not announced ----------

test('FR-12: a construct Crepe normalises is preserved verbatim through a round trip', async () => {
  await openFolder()
  await openFile('alpha.md')
  await getViewSourceButton().click()
  // An https autolink round-trips as a bracketed link in Crepe's
  // serialization, so the fresh editor's baseline differs from the raw text
  // the user typed — the FR-12 "cannot be represented verbatim" case.
  const raw = '# Alpha\n\nhttp://example.com/path'
  await window.getByTestId('source-textarea').fill(raw)
  await window.getByRole('button', { name: /Back to visual editing/ }).click()
  await expect(window.getByTestId('source-view')).toHaveCount(0)

  // The raw text survived into the document and saves verbatim.
  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close alpha.md' }).click()
  const disk = fs.readFileSync(path.join(testFolder, 'alpha.md'), 'utf-8')
  expect(disk).toContain('http://example.com/path')
})

test('a no-edit view-source round trip does not mark a normalising file as changed', async () => {
  fs.writeFileSync(path.join(testFolder, 'link.md'), '# Alpha\n\nhttp://example.com/path')
  await openFolder()
  await openFile('link.md')
  await expect(window.locator('.document-title')).not.toContainText('\u2022')

  // View source and back without editing.
  await getViewSourceButton().click()
  await expect(window.getByTestId('source-textarea')).toBeVisible()
  await window.getByRole('button', { name: /Back to visual editing/ }).click()
  await expect(window.getByTestId('source-view')).toHaveCount(0)

  // No dirty dot, and closing the tab does NOT prompt for unsaved changes.
  await expect(window.locator('.document-title')).not.toContainText('\u2022')
  await window.getByRole('button', { name: 'Close link.md' }).click()
  // The native prompt must not have fired.
  await expect.poll(() => messageBoxCallCount(app)).toBe(0)
  await expect(window.getByRole('button', { name: 'Open Folder' })).toBeVisible()
})

test('saving a pristine normalising file from the formatted view keeps its bytes', async () => {
  fs.writeFileSync(path.join(testFolder, 'link.md'), '# Alpha\n\nhttp://example.com/path')
  await openFolder()
  await openFile('link.md')
  await expect(window.locator('.document-title')).not.toContainText('\u2022')

  // A pristine normalising file is not treated as having unsaved changes: no
  // save prompt on close, and the bytes on disk stay identical.
  await window.getByRole('button', { name: 'Close link.md' }).click()
  await expect.poll(() => messageBoxCallCount(app)).toBe(0)
  const disk = fs.readFileSync(path.join(testFolder, 'link.md'), 'utf-8')
  expect(disk).toBe('# Alpha\n\nhttp://example.com/path')
})

test('source-view save writes the exact raw bytes, never adding a trailing newline', async () => {
  await openFolder()
  const row = window.getByRole('treeitem').getByText('no-newline.md')
  await row.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'View source' }).click()
  await expect(window.getByTestId('source-textarea')).toHaveValue('No trailing newline')

  // Edit AND save while still in source view: the disk write must be the raw
  // store bytes — neither a re-serialized editor output nor an added `\n`.
  await window.getByTestId('source-textarea').fill('Edited raw source, no newline')
  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close no-newline.md' }).click()

  const disk = fs.readFileSync(path.join(testFolder, 'no-newline.md'), 'utf-8')
  expect(disk).toBe('Edited raw source, no newline')
})

// ---------- US7: explorer context-menu Open ----------

test('US7 Open opens an unopened file in a formatted tab', async () => {
  await openFolder()

  const row = window.getByRole('treeitem').getByText('beta.md')
  await row.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Open' }).click()

  await expect(window.getByRole('tab', { name: /beta\.md/ })).toBeVisible()
  // Formatted view, not source.
  await expect(window.getByTestId('source-view')).toHaveCount(0)
  await expect(window.locator('.document-title')).toContainText('beta.md')
  await expect(window.locator('[contenteditable="true"]:visible').first()).toBeVisible()
})

test('US7 Open activates the existing tab of an already-open formatted file', async () => {
  await openFolder()
  await openFile('alpha.md')
  await openFile('beta.md')
  await expect(window.locator('.document-title')).toContainText('beta.md')

  const alphaRow = window.getByRole('treeitem').getByText('alpha.md')
  await alphaRow.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Open' }).click()

  // No duplicate tab; the existing alpha tab becomes active in formatted view.
  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toHaveCount(1)
  await expect(window.locator('.document-title')).toContainText('alpha.md')
  await expect(window.getByTestId('source-view')).toHaveCount(0)
})

test('US7 Open returns a source-view tab to visual editing', async () => {
  await openFolder()
  await openFile('alpha.md')
  await getViewSourceButton().click()
  await expect(window.getByTestId('source-view')).toBeVisible()

  const alphaRow = window.getByRole('treeitem').getByText('alpha.md')
  await alphaRow.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Open' }).click()

  await expect(window.getByTestId('source-view')).toHaveCount(0)
  await expect(window.getByRole('tab', { name: /alpha\.md/ })).toHaveCount(1)
  await expect(window.locator('[contenteditable="true"]:visible').first()).toBeVisible()
})

// ---------- Edges ----------

test('tab-switch mid-view leaves the other tab usable', async () => {
  await openFolder()
  await openFile('alpha.md')
  await getViewSourceButton().click()
  await expect(window.getByTestId('source-view')).toBeVisible()

  // Switch to the other already-open tab.
  await openFile('beta.md')
  await expect(window.locator('.document-title')).toContainText('beta.md')
  // The beta tab's (already-open) formatted editor is the live surface; the
  // first contenteditable in DOM order belongs to the hidden alpha panel.
  const editable = window.locator('[contenteditable="true"]:visible').first()
  await expect(editable).toBeVisible()

  // Back to the source tab: the source view is complete and intact.
  await window.getByRole('tab', { name: /alpha\.md/ }).click()
  await expect(window.getByTestId('source-view')).toBeVisible()
  await expect(window.locator('[data-testid="source-textarea"]')).toHaveValue(/# Alpha/)
})

test('active document in a nested folder is highlighted in the explorer (FR-6)', async () => {
  await openFolder()
  // Reveal the nested folder first, then open the nested file; the tree must
  // highlight it when it is active.
  await window.getByRole('treeitem').filter({ hasText: 'nested' }).getByRole('button', { name: 'Expand' }).click()
  await openFile('deep.md')
  await expect(window.locator('.document-title')).toContainText('deep.md')

  const deepRow = window.getByRole('treeitem').filter({ hasText: 'deep.md' })
  await expect(deepRow).toBeVisible()
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
})