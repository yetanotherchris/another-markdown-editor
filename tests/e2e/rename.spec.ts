import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { launchApp, closeAppSafely } from './launch'

let app: ElectronApplication
let window: Page

test.beforeEach(async () => {
  ;({ app, window } = await launchApp())
})

test.afterEach(async () => {
  await closeAppSafely(app)
})

test('the window title is MarkdownMeister (spec 019 FR-001/FR-010)', async () => {
  // US1 acceptance scenarios 1-3: the title bar and taskbar/dock label derive
  // from the document title, which the packaged build takes from
  // src/renderer/index.html.
  await expect(window).toHaveTitle('MarkdownMeister')
  await expect(window.evaluate(() => document.title)).resolves.toBe('MarkdownMeister')
})
