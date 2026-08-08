import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  loadWindowStateFile,
  writeWindowStateFile,
  snapshotToState
} from '../../src/main/windowStateFile'
import type { WindowSnapshot } from '../../src/main/windowStateFile'
import { readConfigFile } from '../../src/main/settingsFile'
import type { RecentItem } from '../../src/shared/ipc-contract'

function tempDir(): string {
  return path.join(os.tmpdir(), `mm-winstate-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function tempConfigFile(content?: string): string {
  const dir = tempDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'config.json')
  if (content !== undefined) fs.writeFileSync(file, content, 'utf-8')
  return file
}

const VALID = { x: 100, y: 80, width: 900, height: 600, isMaximized: false }

describe('loadWindowStateFile (spec 011 FR-004/FR-006)', () => {
  it('returns null when the file is missing', () => {
    const file = path.join(os.tmpdir(), 'does-not-exist-winstate.json')
    expect(loadWindowStateFile(file)).toBeNull()
  })

  it('returns null when the config is malformed', () => {
    const file = tempConfigFile('{ not json')
    expect(loadWindowStateFile(file)).toBeNull()
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('returns null when there is no windowState key', () => {
    const file = tempConfigFile(JSON.stringify({ recentItems: [], settings: {} }))
    expect(loadWindowStateFile(file)).toBeNull()
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('returns null when windowState is not an object', () => {
    const file = tempConfigFile(JSON.stringify({ windowState: 'junk' }))
    expect(loadWindowStateFile(file)).toBeNull()
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('reads a valid state (FR-004: x, y, width, height, isMaximized)', () => {
    const file = tempConfigFile(JSON.stringify({ windowState: VALID }))
    expect(loadWindowStateFile(file)).toEqual(VALID)
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('reads a maximized state (FR-005)', () => {
    const file = tempConfigFile(JSON.stringify({ windowState: { ...VALID, isMaximized: true } }))
    expect(loadWindowStateFile(file)?.isMaximized).toBe(true)
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('rejects non-finite or non-positive geometry', () => {
    const bad: Array<Partial<typeof VALID>> = [
      { x: NaN }, { y: Infinity }, { width: 0 }, { width: -5 }, { height: -1 }
    ]
    for (const patch of bad) {
      const file = tempConfigFile(JSON.stringify({ windowState: { ...VALID, ...patch } }))
      expect(loadWindowStateFile(file)).toBeNull()
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('defaults isMaximized to false when the field is missing', () => {
    const file = tempConfigFile(JSON.stringify({
      windowState: { x: 1, y: 2, width: 300, height: 200 }
    }))
    expect(loadWindowStateFile(file)).toEqual({ x: 1, y: 2, width: 300, height: 200, isMaximized: false })
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })
})

describe('writeWindowStateFile (FR-003 read-modify-write)', () => {
  it('round-trips a valid state', () => {
    const file = tempConfigFile()
    writeWindowStateFile(file, VALID)
    expect(loadWindowStateFile(file)).toEqual(VALID)
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('preserves a pre-existing recentItems and settings section', () => {
    const file = tempConfigFile()
    const recentItems: RecentItem[] = [{
      path: '/w/notes.md', kind: 'file', name: 'notes.md', lastOpenedAt: 123
    }]
    fs.writeFileSync(file, JSON.stringify({
      recentItems,
      settings: { sidebarWidth: 30, themeOverride: null, explorerVisible: true, editorFont: 'serif' }
    }), 'utf-8')

    writeWindowStateFile(file, VALID)
    const whole = readConfigFile(file)
    expect(whole.recentItems).toEqual(recentItems)
    expect((whole.settings as { editorFont: string }).editorFont).toBe('serif')
    expect(loadWindowStateFile(file)).toEqual(VALID)
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })

  it('writes over a malformed config without throwing', () => {
    const file = tempConfigFile('{ not json')
    writeWindowStateFile(file, VALID)
    expect(loadWindowStateFile(file)).toEqual(VALID)
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  })
})

describe('snapshotToState (FR-008: never persist while minimized)', () => {
  const snapshot: WindowSnapshot = {
    bounds: { x: 10, y: 20, width: 800, height: 600 },
    isMaximized: false,
    isMinimized: false
  }

  it('returns the state for a normal window', () => {
    expect(snapshotToState(snapshot)).toEqual({
      x: 10, y: 20, width: 800, height: 600, isMaximized: false
    })
  })

  it('records the maximized flag', () => {
    expect(snapshotToState({ ...snapshot, isMaximized: true })?.isMaximized).toBe(true)
  })

  it('returns null when the window is minimized (FR-008)', () => {
    expect(snapshotToState({ ...snapshot, isMinimized: true })).toBeNull()
  })
})
