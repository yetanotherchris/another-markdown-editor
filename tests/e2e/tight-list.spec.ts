import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { launchApp, closeAppSafely, stubMessageBox, pressShortcut, openFile } from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string

const TIGHT_LIST = [
  '- Item one',
  '  - Item two',
  '- Item three'
].join('\n')

const LOOSE_LIST = [
  '- Item one',
  '',
  '- Item two'
].join('\n')

const TASK_LIST = [
  '- [x] done',
  '- [ ] todo',
  '  - [ ] subtask'
].join('\n')

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-tightlist-e2e-'))
})

test.beforeEach(async () => {
  ;({ app, window } = await launchApp(undefined, testFolder))
})

test.afterEach(async () => {
  await closeAppSafely(app)
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

/** Append text to the first list item (click its text, jump to its end) and
 *  save via the dirty-close prompt. Returns the bytes written to disk. */
async function appendToItemAndSave(name: string, itemText: string, edit: string): Promise<string> {
  await window.getByText(itemText).first().click()
  await window.keyboard.press('End')
  await window.keyboard.type(edit)
  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: `Close ${name}` }).click()
  return fs.readFileSync(path.join(testFolder, name), 'utf-8')
}

test('a tight nested bullet list stays tight after an edit + save', async () => {
  fs.writeFileSync(path.join(testFolder, 'tight.md'), TIGHT_LIST)
  await openFile(window, 'tight.md')

  const disk = await appendToItemAndSave('tight.md', 'Item one', ' appended')

  // The editor normalizes the marker (`-` → `*`) but must NOT insert blank
  // lines between the items — the sibling and nested items stay adjacent. The
  // trailing EOF blank line the editor emits after any edit is trimmed first.
  expect(disk.trimEnd()).toContain('* Item one appended\n  * Item two\n* Item three')
  expect(disk.trimEnd()).not.toContain('\n\n')
})

test('a genuinely loose list stays loose after an edit + save', async () => {
  fs.writeFileSync(path.join(testFolder, 'loose.md'), LOOSE_LIST)
  await openFile(window, 'loose.md')

  const disk = await appendToItemAndSave('loose.md', 'Item one', ' appended')

  // Blank lines the user typed between items are preserved (spread round-trips).
  expect(disk).toContain('* Item one appended\n\n* Item two')
})

test('task list checkboxes survive an edit + save', async () => {
  fs.writeFileSync(path.join(testFolder, 'tasks.md'), TASK_LIST)
  await openFile(window, 'tasks.md')

  const disk = await appendToItemAndSave('tasks.md', 'done', ' appended')

  // The gfm task extension still emits the checked/unchecked markers, and the
  // nested task stays tight (no blank lines).
  expect(disk).toContain('* [x] done appended')
  expect(disk).toContain('* [ ] todo\n  * [ ] subtask')
  expect(disk.trimEnd()).not.toContain('\n\n')
})

test('a no-edit save of a tight list file is byte-identical', async () => {
  fs.writeFileSync(path.join(testFolder, 'tight.md'), TIGHT_LIST)
  const before = fs.readFileSync(path.join(testFolder, 'tight.md'), 'utf-8')
  await openFile(window, 'tight.md')

  await pressShortcut(app, 's', ['control'])
  await expect.poll(() => fs.readFileSync(path.join(testFolder, 'tight.md'), 'utf-8')).toBe(before)
})
