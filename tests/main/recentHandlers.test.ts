import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { isRecentEntry } from '../../src/main/ipc/handlers/context'
import { saveRecentItems } from '../../src/main/recentItems'
import { recentItemsConfigPath } from '../../src/main/recentItemsPath'

/**
 * The spec-004 R4 guard: the renderer may only open a path main itself
 * recorded. `isRecentEntry` re-validates against the persisted list before any
 * filesystem access — the OUTSIDE_WORKSPACE rejection the e2e suite probes at
 * the IPC boundary is the same rule, unit-tested here (FR-010: the low-level
 * assertion does not need to be duplicated in e2e).
 */
describe('isRecentEntry (R4 recent-open guard)', () => {
  let dir: string
  let prev: string | undefined

  beforeEach(() => {
    dir = path.join(os.tmpdir(), `mm-recent-entry-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    prev = process.env.MM_CONFIG_DIR
    process.env.MM_CONFIG_DIR = dir
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.MM_CONFIG_DIR
    else process.env.MM_CONFIG_DIR = prev
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('accepts a recorded recent file path', () => {
    saveRecentItems(recentItemsConfigPath(), [
      { path: '/notes/a.md', kind: 'file', name: 'a.md', lastOpenedAt: 1 }
    ])
    expect(isRecentEntry('/notes/a.md', 'file')).toBe(true)
  })

  it('accepts a recorded recent folder path', () => {
    saveRecentItems(recentItemsConfigPath(), [
      { path: '/notes', kind: 'folder', name: 'notes', lastOpenedAt: 1 }
    ])
    expect(isRecentEntry('/notes', 'folder')).toBe(true)
  })

  it('rejects a path main never recorded (OUTSIDE_WORKSPACE at the handler)', () => {
    saveRecentItems(recentItemsConfigPath(), [
      { path: '/notes/a.md', kind: 'file', name: 'a.md', lastOpenedAt: 1 }
    ])
    // Wrong kind for the same path, and a totally unrecorded path.
    expect(isRecentEntry('/notes/a.md', 'folder')).toBe(false)
    expect(isRecentEntry('/elsewhere/b.md', 'file')).toBe(false)
  })

  it('rejects every path when the history is empty or missing', () => {
    expect(isRecentEntry('/anything.md', 'file')).toBe(false)
    expect(isRecentEntry('/anything', 'folder')).toBe(false)
  })
})
