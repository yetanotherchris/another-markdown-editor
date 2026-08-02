import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

let app: ElectronApplication
let window: Page
let testFolder: string

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ame-debug8-e2e-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha')
  fs.writeFileSync(path.join(testFolder, 'beta.md'), '# Beta')
})

test.beforeEach(async () => {
  app = await electron.launch({ args: ['out/main/index.js'] })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  window.on('console', (msg) => console.log('[renderer]', msg.type(), msg.text()))
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder as string] })
  }, testFolder)
})

test.afterEach(async () => { await app.close().catch(() => {}) })
test.afterAll(async () => { fs.rmSync(testFolder, { recursive: true, force: true }) })

test('debug caret placement in rename input', async () => {
  await window.getByRole('button', { name: 'Open Folder' }).click()
  const row = window.getByRole('treeitem').getByText('alpha.md')
  await row.click({ button: 'right' })
  await expect(window.getByRole('menuitem').getByText('Rename')).toBeVisible()
  await window.getByRole('menuitem').getByText('Rename').click()
  const input = window.getByRole('textbox', { name: /Rename/ })
  await expect(input).toBeVisible()

  // Click into the middle of the text ("alpha.md" -> click after "pha")
  const box = await input.boundingBox()
  await window.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height / 2)
  await window.waitForTimeout(300)

  const state = await window.evaluate(() => {
    const el = document.querySelector('.tree-node-input') as HTMLInputElement
    return el ? {
      selStart: el.selectionStart,
      selEnd: el.selectionEnd,
      focused: document.activeElement === el,
      value: el.value
    } : null
  })
  console.log('CARET:', JSON.stringify(state))
  expect(true).toBe(true)
})
