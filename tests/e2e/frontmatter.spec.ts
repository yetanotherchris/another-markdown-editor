import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { launchApp, closeAppSafely, stubMessageBox, pressShortcut } from './launch'

let app: ElectronApplication
let window: Page
let testFolder: string

const FRONTMATTER_FILE = [
  '---',
  'title: My Post',
  'date: 2026-08-07',
  'tags:',
  '  - one',
  '  - two',
  '---',
  '',
  '# Heading',
  '',
  'Body paragraph.'
].join('\n')

const COMPLEX_FILE = [
  '---',
  '# comment line',
  '  title: "Quoted title"',
  'author:',
  '  name: Chris',
  '  roles:',
  '    - maintainer',
  '    - reviewer',
  'nested:',
  '  key: value',
  '---',
  '',
  '# Body'
].join('\n')

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-fm-e2e-'))
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

async function openFolder(): Promise<void> {
  await window.getByRole('button', { name: 'Open menu' }).click()
  await window.getByRole('menuitem', { name: 'Open Folder…' }).click()
  await window.getByRole('button', { name: 'Open menu' }).focus()
  await expect(window.getByRole('treeitem').first()).toBeVisible()
}

async function openFile(name: string): Promise<void> {
  await openFolder()
  await window.getByRole('treeitem').getByText(name).click()
  await expect(window.locator('.ProseMirror:visible')).toBeVisible()
}

// ---------- US1: open in the visual editor ----------

test.describe('US1 visual editor hides frontmatter', () => {
test('US1 a file with frontmatter opens showing only the body', async () => {
  fs.writeFileSync(path.join(testFolder, 'post.md'), FRONTMATTER_FILE)
  await openFile('post.md')

  // Only the body is visible; no frontmatter keys, values, or `---` artefacts.
  await expect(window.locator('.document-title')).toContainText('post.md')
  await expect(window.locator('.ProseMirror')).toContainText('Heading')
  await expect(window.locator('.ProseMirror')).toContainText('Body paragraph.')
  await expect(window.locator('.ProseMirror')).not.toContainText('title:')
  await expect(window.locator('.ProseMirror')).not.toContainText('My Post')
  await expect(window.locator('.ProseMirror')).not.toContainText('tags:')
  // The `---` delimiters must not render as horizontal rules (US1 why).
  await expect(window.locator('.ProseMirror hr')).toHaveCount(0)
})

test('US1 frontmatter with nested YAML leaves no artefacts', async () => {
  const nested = [
    '---',
    'title: Nested',
    'tags:',
    '  - one',
    '  - two',
    'author:',
    '  name: Chris',
    '  roles:',
    '    - maintainer',
    '---',
    '',
    '# Only This',
    '',
    'Body line.'
  ].join('\n')
  fs.writeFileSync(path.join(testFolder, 'nested.md'), nested)
  await openFile('nested.md')

  await expect(window.locator('.ProseMirror')).toContainText('Only This')
  await expect(window.locator('.ProseMirror')).not.toContainText('maintainer')
  await expect(window.locator('.ProseMirror')).not.toContainText('author:')
  await expect(window.locator('.ProseMirror hr')).toHaveCount(0)
})

test('US1 a file without frontmatter shows the whole content', async () => {
  fs.writeFileSync(path.join(testFolder, 'plain.md'), '# Plain\n\nJust body.')
  await openFile('plain.md')
  await expect(window.locator('.ProseMirror')).toContainText('Plain')
  await expect(window.locator('.ProseMirror')).toContainText('Just body.')
})
})

// ---------- US2: save recombines ----------

test.describe('US2 save recombines frontmatter + body', () => {
test('US2 editing the body and saving preserves the original frontmatter', async () => {
  fs.writeFileSync(path.join(testFolder, 'post.md'), FRONTMATTER_FILE)
  await openFile('post.md')

  // Edit the body in the visual editor.
  await window.locator('.ProseMirror').click()
  await window.keyboard.press('Control+End')
  await window.keyboard.type(' Edited line.')

  // Save through the dirty-close prompt.
  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close post.md' }).click()

  const disk = fs.readFileSync(path.join(testFolder, 'post.md'), 'utf-8')
  expect(disk.startsWith('---\ntitle: My Post\ndate: 2026-08-07\ntags:\n  - one\n  - two\n---\n')).toBe(true)
  expect(disk).toContain('# Heading')
  expect(disk).toContain('Body paragraph. Edited line.')
})

test('US2 a no-edit save is byte-identical to the original', async () => {
  fs.writeFileSync(path.join(testFolder, 'post.md'), FRONTMATTER_FILE)
  const before = fs.readFileSync(path.join(testFolder, 'post.md'), 'utf-8')
  await openFile('post.md')

  // No edits; save via the shortcut.
  await pressShortcut(app, 's', ['control'])

  // Give the write a moment; assert the on-disk bytes are unchanged.
  await expect.poll(() => fs.readFileSync(path.join(testFolder, 'post.md'), 'utf-8')).toBe(before)
})

test('US2 a no-frontmatter file saves without adding a block', async () => {
  fs.writeFileSync(path.join(testFolder, 'plain.md'), '# Plain\n\nJust body.')
  await openFile('plain.md')

  await window.locator('.ProseMirror').click()
  await window.keyboard.press('Control+End')
  await window.keyboard.type(' added.')

  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close plain.md' }).click()

  const disk = fs.readFileSync(path.join(testFolder, 'plain.md'), 'utf-8')
  expect(disk.startsWith('---')).toBe(false)
  expect(disk).toContain('Just body. added.')
})
})

// ---------- US3: source view shows and edits the full file ----------

test.describe('US3 source view full file + frontmatter edits', () => {
async function openSource(name: string): Promise<void> {
  await openFile(name)
  await window.getByRole('button', { name: 'View source' }).click()
  await expect(window.getByTestId('source-view')).toBeVisible()
}

test('US3 source view shows the full file with frontmatter at the top', async () => {
  fs.writeFileSync(path.join(testFolder, 'post.md'), FRONTMATTER_FILE)
  await openSource('post.md')
  const value = await window.getByTestId('source-textarea').inputValue()
  expect(value).toBe(FRONTMATTER_FILE)
})

test('US3 editing frontmatter in source preserves it through return and save', async () => {
  fs.writeFileSync(path.join(testFolder, 'post.md'), FRONTMATTER_FILE)
  await openSource('post.md')

  await window.getByTestId('source-textarea').fill(
    FRONTMATTER_FILE.replace('title: My Post', 'title: Goodbye')
  )
  await window.getByRole('button', { name: /Back to visual editing/ }).click()
  await expect(window.getByTestId('source-view')).toHaveCount(0)

  // The visual editor still shows only the body.
  await expect(window.locator('.ProseMirror')).toContainText('Heading')
  await expect(window.locator('.ProseMirror')).not.toContainText('Goodbye')

  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close post.md' }).click()

  const disk = fs.readFileSync(path.join(testFolder, 'post.md'), 'utf-8')
  expect(disk).toContain('title: Goodbye')
  expect(disk).toContain('# Heading')
  expect(disk).toContain('Body paragraph.')
})

test('US3 adding frontmatter in source to a plain file extracts it on return and saves it', async () => {
  fs.writeFileSync(path.join(testFolder, 'plain.md'), '# Plain\n\nJust body.')
  await openSource('plain.md')

  await window.getByTestId('source-textarea').fill('---\nnew: true\n---\n# Plain\n\nJust body.')
  await window.getByRole('button', { name: /Back to visual editing/ }).click()
  await expect(window.getByTestId('source-view')).toHaveCount(0)

  // The frontmatter is hidden from the visual editor.
  await expect(window.locator('.ProseMirror')).not.toContainText('new: true')

  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close plain.md' }).click()

  const disk = fs.readFileSync(path.join(testFolder, 'plain.md'), 'utf-8')
  // The frontmatter block is present at the top (the body after it is the
  // editor's normalized serialization, which may differ in trailing newline).
  expect(disk.startsWith('---\nnew: true\n---\n')).toBe(true)
  expect(disk).toContain('# Plain')
  expect(disk).toContain('Just body.')
})

test('US3 removing the frontmatter block in source removes it on save', async () => {
  fs.writeFileSync(path.join(testFolder, 'post.md'), FRONTMATTER_FILE)
  await openSource('post.md')

  await window.getByTestId('source-textarea').fill('# Heading\n\nBody paragraph.')
  await window.getByRole('button', { name: /Back to visual editing/ }).click()
  await expect(window.getByTestId('source-view')).toHaveCount(0)

  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close post.md' }).click()

  const disk = fs.readFileSync(path.join(testFolder, 'post.md'), 'utf-8')
  expect(disk.startsWith('---')).toBe(false)
  expect(disk).toContain('# Heading')
})

test('US3 switching views any number of times does not alter frontmatter or body', async () => {
  fs.writeFileSync(path.join(testFolder, 'post.md'), FRONTMATTER_FILE)
  await openSource('post.md')

  for (let i = 0; i < 3; i++) {
    await window.getByRole('button', { name: /Back to visual editing/ }).click()
    await expect(window.getByTestId('source-view')).toHaveCount(0)
    await window.getByRole('button', { name: 'View source' }).click()
    await expect(window.getByTestId('source-view')).toBeVisible()
  }

  const value = await window.getByTestId('source-textarea').inputValue()
  expect(value).toBe(FRONTMATTER_FILE)
})
})

// ---------- US4: round-trip fidelity ----------

test.describe('US4 round-trip fidelity', () => {
test('US4 complex frontmatter saves byte-identically with no edits', async () => {
  fs.writeFileSync(path.join(testFolder, 'complex.md'), COMPLEX_FILE)
  const before = fs.readFileSync(path.join(testFolder, 'complex.md'), 'utf-8')
  await openFile('complex.md')

  await expect(window.locator('.ProseMirror')).toContainText('Body')
  await pressShortcut(app, 's', ['control'])
  await expect.poll(() => fs.readFileSync(path.join(testFolder, 'complex.md'), 'utf-8')).toBe(before)
})

test('US4 editing only the body leaves the frontmatter block unchanged', async () => {
  fs.writeFileSync(path.join(testFolder, 'complex.md'), COMPLEX_FILE)
  await openFile('complex.md')

  await window.locator('.ProseMirror').click()
  await window.keyboard.press('Control+End')
  await window.keyboard.type(' edited.')

  await stubMessageBox(app, 'Save')
  await window.getByRole('button', { name: 'Close complex.md' }).click()

  const disk = fs.readFileSync(path.join(testFolder, 'complex.md'), 'utf-8')
  // The frontmatter block (through the closing `---\n`) is byte-identical.
  // The body after it may be re-serialized by the editor (spec 002 allows
  // normalisation of body text); only the frontmatter must be preserved.
  const fmBlock = COMPLEX_FILE.slice(0, COMPLEX_FILE.indexOf('\n---\n') + 5)
  expect(disk.startsWith(fmBlock)).toBe(true)
  expect(disk).toContain('# Body')
  expect(disk).toContain('edited.')
})
})
