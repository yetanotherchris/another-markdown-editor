import { test, expect, ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { launchApp, closeAppSafely } from './launch'

/**
 * Spec 022 suite (contracts/config-path.md): the config lives at the universal
 * `~/.config/markdownmeister/config.json` on every platform (Linux honours
 * `$XDG_CONFIG_HOME`), the startup migration moves an existing appData config
 * there, and the directory is created on write. `USERPROFILE`/`HOME` are
 * redirected to a temp home so the real universal path and migration are
 * exercised without `MM_CONFIG_DIR` and without touching the developer's
 * profile (research R4).
 */

let app: ElectronApplication
let window: Page
let testFolder: string
let tempHome: string

const homeEnvVar = process.platform === 'win32' ? 'USERPROFILE' : 'HOME'

function universalConfigPath(): string {
  return path.join(tempHome, '.config', 'markdownmeister', 'config.json')
}

function legacyConfigPath(): string {
  if (process.platform === 'linux') return universalConfigPath()
  const appData =
    process.platform === 'win32'
      ? path.join(tempHome, 'AppData', 'Roaming')
      : path.join(tempHome, 'Library', 'Application Support')
  return path.join(appData, 'markdownmeister', 'config.json')
}

test.beforeAll(async () => {
  testFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-universal-ws-'))
  fs.writeFileSync(path.join(testFolder, 'alpha.md'), '# Alpha\n\nHello world.')
})

test.beforeEach(async () => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-universal-home-'))
  // Electron needs its profile structure to exist under a redirected home or it
  // crashes at startup (verified locally); pre-create it so the redirect works.
  fs.mkdirSync(path.join(tempHome, 'AppData', 'Roaming', 'markdownmeister'), { recursive: true })
  fs.mkdirSync(path.join(tempHome, 'AppData', 'Local', 'markdownmeister'), { recursive: true })
  fs.mkdirSync(path.join(tempHome, '.config', 'markdownmeister'), { recursive: true })
})

test.afterEach(async () => {
  await closeAppSafely(app)
  fs.rmSync(tempHome, { recursive: true, force: true })
})

test.afterAll(async () => {
  fs.rmSync(testFolder, { recursive: true, force: true })
})

/** Launch the app with the home redirected to `tempHome` (no config seam). */
async function launch(): Promise<void> {
  ;({ app, window } = await launchApp(undefined, testFolder, undefined, {
    [homeEnvVar]: tempHome,
    ...(process.platform === 'linux' ? { XDG_CONFIG_HOME: path.join(tempHome, '.config') } : {})
  }))
}

/** Open the seeded workspace folder via the hamburger (writes recent items). */
async function openWorkspaceFolder(): Promise<void> {
  await window.getByRole('button', { name: 'Open menu' }).click()
  await window.getByRole('menuitem', { name: 'Open Folder…' }).click()
  await expect(window.getByRole('treeitem').getByText('alpha.md')).toBeVisible()
}

test('US1/SC-001 a fresh install writes config to ~/.config/markdownmeister', async () => {
  await launch()
  // Opening a folder records a recent item, which writes the shared config.
  await openWorkspaceFolder()

  const config = universalConfigPath()
  await expect.poll(() => fs.existsSync(config)).toBe(true)
  const parsed = JSON.parse(fs.readFileSync(config, 'utf-8'))
  expect(Array.isArray(parsed.recentItems)).toBe(true)
  // Nothing was written to the legacy location on a fresh install.
  expect(process.platform === 'linux' || !fs.existsSync(legacyConfigPath())).toBe(true)
})

test('US2/SC-002/003 an existing appData config is migrated on launch', async () => {
  test.skip(process.platform === 'linux', 'Linux legacy and universal config paths are identical')
  // Seed the legacy location BEFORE launch: the migration runs at startup.
  const legacy = legacyConfigPath()
  fs.mkdirSync(path.dirname(legacy), { recursive: true })
  fs.writeFileSync(
    legacy,
    JSON.stringify({
      recentItems: [{ path: '/old/a.md', kind: 'file', name: 'a.md', lastOpenedAt: 1 }],
      settings: { themeOverride: 'dark' }
    })
  )

  await launch()
  await openWorkspaceFolder()

  // The file moved to the universal location and the old location is empty.
  const config = universalConfigPath()
  await expect.poll(() => fs.existsSync(config)).toBe(true)
  expect(fs.existsSync(legacy)).toBe(false)
  const parsed = JSON.parse(fs.readFileSync(config, 'utf-8'))
  expect(parsed.settings?.themeOverride).toBe('dark')
  expect(parsed.recentItems.some((i: { path: string }) => i.path === '/old/a.md')).toBe(true)
})

test('FR-007 when both exist the universal config wins and the legacy is left', async () => {
  test.skip(process.platform === 'linux', 'Linux legacy and universal config paths are identical')
  const legacy = legacyConfigPath()
  const universal = universalConfigPath()
  fs.mkdirSync(path.dirname(legacy), { recursive: true })
  fs.mkdirSync(path.dirname(universal), { recursive: true })
  fs.writeFileSync(legacy, JSON.stringify({ marker: 'legacy' }))
  fs.writeFileSync(universal, JSON.stringify({ marker: 'universal' }))

  await launch()
  await openWorkspaceFolder()

  await expect.poll(() => fs.existsSync(universal)).toBe(true)
  expect(fs.existsSync(legacy)).toBe(true)
  expect(JSON.parse(fs.readFileSync(universal, 'utf-8')).marker).toBe('universal')
})

test('US3/FR-003 a missing ~/.config directory is created on write', async () => {
  fs.rmSync(path.join(tempHome, '.config'), { recursive: true, force: true })

  await launch()
  await openWorkspaceFolder()

  await expect.poll(() => fs.existsSync(universalConfigPath())).toBe(true)
})

test('US4/FR-010 MM_CONFIG_DIR still isolates config away from the universal path', async () => {
  const seamDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-universal-seam-'))
  try {
    ;({ app, window } = await launchApp(seamDir, testFolder, undefined, { [homeEnvVar]: tempHome }))
    await openWorkspaceFolder()

    await expect.poll(() => fs.existsSync(path.join(seamDir, 'config.json'))).toBe(true)
    // The universal path under the redirected home was never touched.
    expect(fs.existsSync(universalConfigPath())).toBe(false)
  } finally {
    fs.rmSync(seamDir, { recursive: true, force: true })
  }
})
