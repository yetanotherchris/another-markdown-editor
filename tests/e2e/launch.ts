/**
 * Shared Electron launch args for the e2e suite.
 *
 * The app runs under Chromium's `--headless` switch so the suite never steals
 * desktop focus while it runs (the Electron windows are not shown on screen).
 * Set `MM_E2E_HEADED=1` to run with a visible, interactive window — e.g. when
 * debugging a failing scenario locally.
 */
export const electronLaunchArgs: string[] = process.env.MM_E2E_HEADED
  ? ['out/main/index.js']
  : [
      '--headless',
      ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []),
      'out/main/index.js'
    ]

import { _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

export interface HamburgerEntry {
  label: string
  enabled: boolean
}

/** Open the hamburger and the Recent Items submenu, waiting for the list to
 *  load (the submenu renders only after its IPC fetch resolves). Idempotent:
 *  opening the submenu again (e.g. after a state read) must not re-toggle it. */
async function openRecentSubmenu(window: Page) {
  await openHamburger(window)
  const parent = window.getByRole('menuitem', { name: 'Recent Items', exact: true })
  if ((await parent.getAttribute('aria-expanded')) !== 'true') await parent.click()
  const menu = window.getByRole('menu', { name: 'Recent Items' })
  await menu.waitFor()
  return menu
}

/**
 * Spec 010 (contracts/renderer.md §E2e): shared chrome helpers for driving the
 * renderer hamburger from Playwright. `window` is the renderer Page.
 */

/** Open the hamburger (idempotent: no-op if `aria-expanded` is already true).
 *  Clicking the trigger toggles, so a second call must not close it. */
export async function openHamburger(window: Page): Promise<void> {
  const trigger = window.getByRole('button', { name: 'Open menu' })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
}

/** Open the hamburger, click the menuitem whose accessible name is `label`, and
 *  close the dropdown. Dispatches through the shared command bus. */
export async function clickHamburgerItem(window: Page, label: string): Promise<void> {
  await openHamburger(window)
  await window.getByRole('menuitem', { name: label }).click()
  await window.getByRole('button', { name: 'Open menu' }).focus()
}

/** Open the hamburger and click `Settings…`, waiting for the settings dialog
 *  (contracts/renderer.md §E2e). Returns the renderer page. */
export async function openSettingsDialog(window: Page): Promise<Page> {
  await openHamburger(window)
  await window.getByRole('menuitem', { name: 'Settings…' }).click()
  await window.getByRole('button', { name: 'Open menu' }).focus()
  await window.getByTestId('settings-dialog').waitFor()
  return window
}

/** Match a submenu label against a query the way the native menu helper did:
 *  exact, either-as-substring, or the path basenames agree. A full-path query
 *  must match a shortened label, and a tail query a full label. */
function recentQueryMatches(label: string, query: string): boolean {
  if (label === query) return true
  if (label.includes(query) || query.includes(label)) return true
  const tail = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p
  const labelTail = tail(label)
  const queryTail = tail(query)
  return labelTail === queryTail
}

/** Open the hamburger → Recent Items submenu → click the entry matching
 *  `label`. Matching is label/substring/basename-based so both tail queries
 *  ('external.md') and full-path queries match shortened labels. */
export async function clickHamburgerRecent(window: Page, label: string): Promise<void> {
  const menu = await openRecentSubmenu(window)
  const items = menu.getByRole('menuitem')
  const count = await items.count()
  for (let i = 0; i < count; i++) {
    const text = ((await items.nth(i).textContent()) ?? '').trim()
    if (recentQueryMatches(text, label)) {
      await items.nth(i).click()
      return
    }
  }
  throw new Error(`No Recent Items entry matches ${JSON.stringify(label)}`)
}

/** The selectable recent entries in the hamburger's Recent Items submenu
 *  (labels only, excluding the Clear Recent Items action). */
export async function hamburgerRecentState(window: Page): Promise<HamburgerEntry[]> {
  const menu = await openRecentSubmenu(window)
  const items = menu.getByRole('menuitem')
  const count = await items.count()
  const result: HamburgerEntry[] = []
  for (let i = 0; i < count; i++) {
    const item = items.nth(i)
    const label = (await item.textContent()) ?? ''
    if (label === 'Clear Recent Items') continue
    result.push({ label, enabled: await item.isEnabled() })
  }
  return result
}

/** The full Recent Items submenu as `{ label, enabled }[]`: entries, the
 *  disabled placeholder, separators (empty label), and Clear Recent Items, in
 *  DOM order (replaces the native `recentMenuStructure`). */
export async function hamburgerRecentStructure(window: Page): Promise<HamburgerEntry[]> {
  const menu = await openRecentSubmenu(window)
  return menu.evaluate((el) =>
    Array.from(el.querySelectorAll('[role="menuitem"], [role="separator"]')).map((node) =>
      node.getAttribute('role') === 'separator'
        ? { label: '', enabled: false }
        : { label: (node.textContent ?? '').trim(), enabled: !(node as HTMLButtonElement).disabled }
    )
  )
}

/**
 * Stub `dialog.showMessageBox` in the main process so a test can drive a native
 * confirmation dialog deterministically (AGENTS.md: native dialogs are stubbed
 * with `electronApp.evaluate`). Playwright cannot see or click a real native
 * box, so every decision path is exercised by pre-selecting the response here.
 *
 * `choose`:
 * - `'cancel'` (default) — return the options' `cancelId` (the safe choice).
 * - a button label string — return the index of the button with that label.
 * - a function — return its result given the message-box options.
 */
export async function stubMessageBox(
  app: ElectronApplication,
  choose: 'cancel' | string | Array<'cancel' | string> = 'cancel'
): Promise<void> {
  await app.evaluate(({ dialog }, pick) => {
    const steps = Array.isArray(pick) ? pick : [pick]
    let i = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__stubMessageBoxCalls = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__stubMessageBoxLast = null
    dialog.showMessageBox = (async (
      _window: unknown,
      options: { message?: string; detail?: string; buttons?: string[]; cancelId?: number }
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__stubMessageBoxCalls++
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__stubMessageBoxLast = {
        message: options.message,
        detail: options.detail
      }
      const step = steps[Math.min(i, steps.length - 1)]
      i++
      let response: number
      if (step === 'cancel') {
        response = options.cancelId ?? 0
      } else {
        const idx = (options.buttons ?? []).indexOf(step)
        if (idx < 0) {
          // A requested label that no shown dialog has is a test bug, not a
          // "safe" fallback: fail loudly so a typo (or a label renamed in the
          // layout module) cannot silently rewrite a test's semantics (test
          // review 2026-08-04). The rejection surfaces through main's
          // dialog:show handler as an error Result and the flow aborts, so the
          // test's outcome assertions fail instead of coincidentally passing.
          throw new Error(
            `stubMessageBox: no button "${step}" on this dialog. Available: [${(options.buttons ?? []).join(', ')}]`
          )
        }
        response = idx
      }
      return { response, checkboxChecked: false }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  }, choose)
}

/** Number of native-message-box calls since the last stubMessageBox. Lets a
 *  test prove a re-prompt happened (e.g. a failed save re-showing the dialog). */
export async function messageBoxCallCount(app: ElectronApplication): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return app.evaluate(() => (globalThis as any).__stubMessageBoxCalls ?? 0)
}

/** The message/detail of the most recent stubbed native box (for asserting the
 *  exact text the OS would show, e.g. path-scrubbed error messages). */
export async function lastMessageBoxOptions(
  app: ElectronApplication
): Promise<{ message?: string; detail?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return app.evaluate(() => (globalThis as any).__stubMessageBoxLast ?? {})
}

/**
 * Teardown helper: close the app's window and dismiss the (stubbed) native quit
 * confirmation with "Discard and Quit" if dirty documents are left behind.
 * Replaces the old renderer-dialog teardown now that the quit dialog is native
 * (spec 008). Safe when the app has already closed (the evaluate throws, which
 * the per-spec afterEach catch absorbs).
 *
 * A stalled quit round-trip is NOT treated as "closed": swallowing the timeout
 * would leak a live Electron process into the next test. Throwing lets the
 * per-spec afterEach catch force-close the app, restoring the guard the shared
 * helper was meant to preserve (test review 2026-08-04).
 */
export async function closeAppDiscardingQuit(app: ElectronApplication): Promise<void> {
  await stubMessageBox(app, 'Discard and Quit')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await app.waitForEvent('close', { timeout: 8000 })
}

// ---- Spec 017 US4: the shared e2e harness (contracts/renderer.md §Test layout).
// Every spec's repeated launch/teardown/open/type/stub blocks delegate here so
// the suite stays DRY and a scenario never re-implements setup. ----

export interface LaunchResult {
  app: ElectronApplication
  window: Page
}

/**
 * Launch the built app with an optional isolated `MM_CONFIG_DIR` config dir,
 * stub the open-dialog to return `openFolderPath` when a native folder picker
 * is requested, and install the deterministic message-box stub. The per-spec
 * beforeEach calls this (replacing the near-identical local `launchApp()` and
 * inline `electron.launch` copies).
 *
 * `userDataDir`, when given, relocates the Chromium profile via the
 * `MM_USER_DATA_DIR` seam (spec 020 research R6) so the native spellcheck
 * dictionary never leaks into — or out of — a test.
 */
export async function launchApp(
  configDir?: string,
  openFolderPath?: string,
  userDataDir?: string,
  extraEnv?: Record<string, string>
): Promise<LaunchResult> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  if (configDir) env.MM_CONFIG_DIR = configDir
  if (userDataDir) env.MM_USER_DATA_DIR = userDataDir
  if (extraEnv) Object.assign(env, extraEnv)
  const instance = await electron.launch({
    args: electronLaunchArgs,
    env
  })
  const page = await instance.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  if (openFolderPath) await stubOpenDialog(instance, openFolderPath)
  await stubMessageBox(instance)
  return { app: instance, window: page }
}

/** Stub the native open-folder/file picker to return `folder`. */
export async function stubOpenDialog(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, folderPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folderPath as string] })
  }, folder)
}

/**
 * Deterministic trash stub: `shell.trashItem` is overridden in main so the
 * trash-dependent flows (organize, source) do not depend on the OS trash or
 * the `TRASH_UNAVAILABLE` fallback. Matches the local copy the specs used.
 */
export async function stubTrash(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const fs = process.getBuiltinModule('fs')
    const path = process.getBuiltinModule('path')
    shell.trashItem = async (p: string) => {
      fs.rmSync(p, { recursive: true, force: true })
    }
    void path
  })
}

/** afterEach teardown: close with "Discard and Quit", force-close on failure. */
export async function closeAppSafely(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return
  try {
    await closeAppDiscardingQuit(app)
  } catch {
    await app.close().catch(() => {})
  }
}

/** Open a workspace folder through the hamburger's "Open Folder…". */
export async function openFolder(window: Page): Promise<void> {
  await openHamburger(window)
  await window.getByRole('menuitem', { name: 'Open Folder…' }).click()
  await window.getByRole('button', { name: 'Open menu' }).focus()
  await expect(window.getByRole('treeitem').first()).toBeVisible()
}

/** Open a markdown file by name from the tree so the WYSIWYG editor mounts. */
export async function openFile(window: Page, name: string): Promise<void> {
  await openFolder(window)
  await window.getByRole('treeitem').getByText(name).click()
  await expect(window.locator('.ProseMirror:visible')).toBeVisible()
}

/** Type `text` into the visible contenteditable editor. */
export async function typeInEditor(window: Page, text: string): Promise<void> {
  await window.locator('[contenteditable="true"]').first().click()
  await window.keyboard.type(text)
}

/**
 * Send a keyboard shortcut through the main-side `before-input-event` pipeline
 * (spec 010 accelerators). Playwright's CDP-synthesized keyboard events do not
 * reach `before-input-event`, so the key is injected via `sendInputEvent`,
 * which runs exactly like a physical key.
 */
export async function pressShortcut(
  app: ElectronApplication,
  key: string,
  modifiers: Array<'control' | 'meta' | 'shift'> = []
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { key: k, modifiers: mods }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods })
    },
    { key, modifiers }
  )
}
