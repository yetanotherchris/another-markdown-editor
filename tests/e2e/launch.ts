/**
 * Shared Electron launch args for the e2e suite.
 *
 * The app runs under Chromium's `--headless` switch so the suite never steals
 * desktop focus while it runs (the Electron windows are not shown on screen).
 * Set `AME_E2E_HEADED=1` to run with a visible, interactive window — e.g. when
 * debugging a failing scenario locally.
 */
export const electronLaunchArgs: string[] = process.env.AME_E2E_HEADED
  ? ['out/main/index.js']
  : ['out/main/index.js', '--headless']

import type { ElectronApplication } from '@playwright/test'

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
    dialog.showMessageBox = (async (_window: unknown, options: { message?: string; detail?: string; buttons?: string[]; cancelId?: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__stubMessageBoxCalls++
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__stubMessageBoxLast = { message: options.message, detail: options.detail }
      const step = steps[Math.min(i, steps.length - 1)]
      i++
      let response: number
      if (step === 'cancel') {
        response = options.cancelId ?? 0
      } else {
        const idx = (options.buttons ?? []).indexOf(step)
        response = idx >= 0 ? idx : (options.cancelId ?? 0)
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
export async function lastMessageBoxOptions(app: ElectronApplication): Promise<{ message?: string; detail?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return app.evaluate(() => (globalThis as any).__stubMessageBoxLast ?? {})
}

/**
 * Teardown helper: close the app's window and dismiss the (stubbed) native quit
 * confirmation with "Discard and Quit" if dirty documents are left behind.
 * Replaces the old renderer-dialog teardown now that the quit dialog is native
 * (spec 008). Safe when the app has already closed.
 */
export async function closeAppDiscardingQuit(app: ElectronApplication): Promise<void> {
  await stubMessageBox(app, 'Discard and Quit')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close()
  })
  await app.waitForEvent('close', { timeout: 8000 }).catch(() => {})
}
