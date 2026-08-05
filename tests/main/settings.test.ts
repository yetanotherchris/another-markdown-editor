import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadSettingsFile, writeSettingsFile, DEFAULTS } from '../../src/main/settingsFile'

function tempSettingsFile(content?: string): string {
  const dir = path.join(os.tmpdir(), `ame-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'settings.json')
  if (content !== undefined) {
    fs.writeFileSync(file, content, 'utf-8')
  }
  return file
}

describe('loadSettingsFile', () => {
  it('returns the defaults when the file is missing', () => {
    const result = loadSettingsFile(path.join(os.tmpdir(), 'does-not-exist.json'))
    expect(result).toEqual(DEFAULTS)
    expect(result.explorerVisible).toBe(true)
  })

  it('returns the defaults when the file is malformed', () => {
    const file = tempSettingsFile('{ not json')
    expect(loadSettingsFile(file)).toEqual(DEFAULTS)
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('reads all three fields from a valid file', () => {
    const file = tempSettingsFile(JSON.stringify({
      sidebarWidth: 42,
      themeOverride: 'dark',
      explorerVisible: false
    }))
    expect(loadSettingsFile(file)).toEqual({ sidebarWidth: 42, themeOverride: 'dark', explorerVisible: false })
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('defaults explorerVisible to true when the field is missing (old configs)', () => {
    const file = tempSettingsFile(JSON.stringify({ sidebarWidth: 30, themeOverride: null }))
    const result = loadSettingsFile(file)
    expect(result.explorerVisible).toBe(true)
    expect(result.sidebarWidth).toBe(30)
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('rejects a non-boolean explorerVisible', () => {
    const file = tempSettingsFile(JSON.stringify({ sidebarWidth: 30, themeOverride: null, explorerVisible: 'yes' }))
    expect(loadSettingsFile(file).explorerVisible).toBe(true)
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('keeps recoverable fields from a partially-corrupt file', () => {
    const file = tempSettingsFile(JSON.stringify({ sidebarWidth: 'wide', themeOverride: null, explorerVisible: false }))
    expect(loadSettingsFile(file)).toEqual({ sidebarWidth: 30, themeOverride: null, explorerVisible: false })
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })
})

describe('writeSettingsFile', () => {
  it('writes a file that round-trips', () => {
    const file = tempSettingsFile()
    writeSettingsFile(file, { sidebarWidth: 25, themeOverride: null, explorerVisible: false })
    expect(loadSettingsFile(file)).toEqual({ sidebarWidth: 25, themeOverride: null, explorerVisible: false })
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })
})
