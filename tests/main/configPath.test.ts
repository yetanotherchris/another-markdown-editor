import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  universalConfigDir,
  universalConfigPath,
  legacyConfigPath,
  migrateConfigFile,
  type ConfigPathParts
} from '../../src/main/configPath'

const WIN: ConfigPathParts = { homeDir: 'C:\\Users\\alice', platform: 'win32', appDataDir: 'C:\\Users\\alice\\AppData\\Roaming' }
const DARWIN: ConfigPathParts = { homeDir: '/Users/alice', platform: 'darwin', appDataDir: '/Users/alice/Library/Application Support' }
const LINUX: ConfigPathParts = { homeDir: '/home/alice', platform: 'linux', appDataDir: '/home/alice/.config' }

// The pure functions use the native `path.join`, so expectations must be built
// with the same join (forward-slashed literals would only hold on POSIX).
const homeConfig = (...parts: string[]): string => path.join(...parts)
const winPath = (...parts: string[]): string => path.join(...parts)

describe('configPath — universal location (FR-001/002)', () => {
  it('resolves ~/.config/markdownmeister on Windows', () => {
    expect(universalConfigPath(WIN)).toBe(winPath('C:\\Users\\alice', '.config', 'markdownmeister', 'config.json'))
  })

  it('resolves ~/.config/markdownmeister on macOS', () => {
    expect(universalConfigPath(DARWIN)).toBe(homeConfig('/Users/alice', '.config', 'markdownmeister', 'config.json'))
  })

  it('resolves ~/.config/markdownmeister on Linux', () => {
    expect(universalConfigPath(LINUX)).toBe(homeConfig('/home/alice', '.config', 'markdownmeister', 'config.json'))
  })

  it('honours $XDG_CONFIG_HOME on Linux', () => {
    expect(universalConfigPath({ ...LINUX, xdgConfigHome: '/xdg' })).toBe(homeConfig('/xdg', 'markdownmeister', 'config.json'))
  })

  it('ignores XDG_CONFIG_HOME off-Linux', () => {
    expect(universalConfigDir({ ...WIN, xdgConfigHome: '/xdg' })).toBe(winPath('C:\\Users\\alice', '.config', 'markdownmeister'))
  })
})

describe('configPath — legacy location (FR-005)', () => {
  it('Windows legacy is %APPDATA%/markdownmeister/config.json', () => {
    expect(legacyConfigPath(WIN)).toBe(path.join(WIN.appDataDir!, 'markdownmeister', 'config.json'))
  })

  it('macOS legacy is ~/Library/Application Support/markdownmeister/config.json', () => {
    expect(legacyConfigPath(DARWIN)).toBe(homeConfig('/Users/alice', 'Library/Application Support', 'markdownmeister', 'config.json'))
  })

  it('Linux legacy equals the universal path (nothing to migrate)', () => {
    expect(legacyConfigPath(LINUX)).toBe(universalConfigPath(LINUX))
  })

  it('Linux legacy honours $XDG_CONFIG_HOME, matching the universal path', () => {
    const withXdg = { ...LINUX, xdgConfigHome: '/xdg' }
    expect(legacyConfigPath(withXdg)).toBe(universalConfigPath(withXdg))
  })

  it('falls back to homeDir when appDataDir is absent', () => {
    expect(legacyConfigPath({ homeDir: '/home/alice', platform: 'linux' })).toBe(universalConfigPath(LINUX))
  })
})

describe('migrateConfigFile (FR-004/006/007/008)', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-config-path-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('does nothing when neither file exists', () => {
    expect(migrateConfigFile(path.join(dir, 'legacy'), path.join(dir, 'nested', 'config.json'))).toBe('nothing')
  })

  it('migrates an existing legacy config (rename, parents created)', () => {
    const legacy = path.join(dir, 'legacy', 'config.json')
    const universal = path.join(dir, '.config', 'markdownmeister', 'config.json')
    fs.mkdirSync(path.dirname(legacy), { recursive: true })
    fs.writeFileSync(legacy, '{"recentItems":[]}')
    expect(migrateConfigFile(legacy, universal)).toBe('migrated')
    expect(fs.existsSync(universal)).toBe(true)
    expect(fs.readFileSync(universal, 'utf-8')).toBe('{"recentItems":[]}')
    expect(fs.existsSync(legacy)).toBe(false)
  })

  it('keeps the new config and leaves the old when both exist (new-wins)', () => {
    const legacy = path.join(dir, 'legacy', 'config.json')
    const universal = path.join(dir, '.config', 'markdownmeister', 'config.json')
    fs.mkdirSync(path.dirname(legacy), { recursive: true })
    fs.mkdirSync(path.dirname(universal), { recursive: true })
    fs.writeFileSync(legacy, '{"legacy":true}')
    fs.writeFileSync(universal, '{"universal":true}')
    expect(migrateConfigFile(legacy, universal)).toBe('new-wins')
    expect(fs.readFileSync(universal, 'utf-8')).toBe('{"universal":true}')
    expect(fs.readFileSync(legacy, 'utf-8')).toBe('{"legacy":true}')
  })

  it('reports failed and leaves the legacy file when the rename cannot complete', () => {
    const legacy = path.join(dir, 'legacy', 'config.json')
    fs.mkdirSync(path.dirname(legacy), { recursive: true })
    fs.writeFileSync(legacy, '{"keep":true}')
    // A universal target whose parent is a FILE makes the rename fail.
    const blocker = path.join(dir, 'blocker')
    fs.writeFileSync(blocker, 'file-not-dir')
    const universal = path.join(blocker, 'config.json')
    expect(migrateConfigFile(legacy, universal)).toBe('failed')
    expect(fs.existsSync(legacy)).toBe(true)
    expect(fs.readFileSync(legacy, 'utf-8')).toBe('{"keep":true}')
  })
})
