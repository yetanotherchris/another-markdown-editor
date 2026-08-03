import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  recordRecentItem,
  removeRecentItem,
  normalizeRecentItems,
  loadRecentItems,
  saveRecentItems,
  RECENT_ITEMS_LIMIT
} from '../../src/main/recentItems'
import type { RecentItem, RecentKind } from '../../src/shared/ipc-contract'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `ame-recent-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

function item(path_: string, kind: RecentKind, lastOpenedAt: number): RecentItem {
  return {
    path: path_,
    kind,
    name: path.basename(path_),
    lastOpenedAt
  }
}

describe('recordRecentItem', () => {
  it('prepends the new item as the most recent', () => {
    const a = item('/a.md', 'file', 1)
    const b = item('/b.md', 'file', 2)
    expect(recordRecentItem([a], b).map(i => i.path)).toEqual(['/b.md', '/a.md'])
  })

  it('dedupes by (path, kind) and moves the existing entry to the front', () => {
    const a = item('/a.md', 'file', 1)
    const b = item('/b.md', 'file', 2)
    const aAgain = item('/a.md', 'file', 3)
    const result = recordRecentItem([a, b], aAgain)
    expect(result.map(i => i.path)).toEqual(['/a.md', '/b.md'])
    expect(result[0].lastOpenedAt).toBe(3)
    expect(result).toHaveLength(2)
  })

  it('keeps file and folder entries for the same path separate', () => {
    const file = item('/notes', 'file', 1)
    const folder = item('/notes', 'folder', 2)
    const result = recordRecentItem([file], folder)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe('folder')
    expect(result[1].kind).toBe('file')
  })

  it('caps the list at 10, evicting the least recent', () => {
    let items: RecentItem[] = []
    for (let i = 0; i < RECENT_ITEMS_LIMIT + 3; i++) {
      items = recordRecentItem(items, item(`/file-${i}.md`, 'file', i))
    }
    expect(items).toHaveLength(RECENT_ITEMS_LIMIT)
    // Newest three survive; the oldest three are evicted.
    expect(items[0].path).toBe(`/file-${RECENT_ITEMS_LIMIT + 2}.md`)
    expect(items.some(i => i.path === '/file-0.md')).toBe(false)
  })
})

describe('removeRecentItem', () => {
  it('removes exactly the matching entry', () => {
    const a = item('/a.md', 'file', 1)
    const b = item('/b.md', 'file', 2)
    const result = removeRecentItem([a, b], '/a.md', 'file')
    expect(result.map(i => i.path)).toEqual(['/b.md'])
  })

  it('keeps a same-path entry of the other kind', () => {
    const file = item('/notes', 'file', 1)
    const folder = item('/notes', 'folder', 2)
    const result = removeRecentItem([file, folder], '/notes', 'file')
    expect(result.map(i => i.kind)).toEqual(['folder'])
  })

  it('returns the list unchanged when nothing matches', () => {
    const a = item('/a.md', 'file', 1)
    expect(removeRecentItem([a], '/missing.md', 'file')).toHaveLength(1)
  })
})

describe('normalizeRecentItems', () => {
  it('returns an empty list for missing or non-object input', () => {
    expect(normalizeRecentItems(undefined)).toEqual([])
    expect(normalizeRecentItems(null)).toEqual([])
    expect(normalizeRecentItems(42)).toEqual([])
    expect(normalizeRecentItems('nope')).toEqual([])
    expect(normalizeRecentItems({})).toEqual([])
  })

  it('returns an empty list when recentItems is not an array', () => {
    expect(normalizeRecentItems({ recentItems: 'nope' })).toEqual([])
    expect(normalizeRecentItems({ recentItems: { path: '/x.md' } })).toEqual([])
  })

  it('drops malformed entries but keeps valid ones', () => {
    const raw = {
      recentItems: [
        { path: '/ok.md', kind: 'file', name: 'ok.md', lastOpenedAt: 3 },
        { path: 'relative.md', kind: 'file', name: 'relative.md', lastOpenedAt: 5 },
        { path: '/bad-kind.md', kind: 'symlink', name: 'bad.md', lastOpenedAt: 4 },
        { path: '/no-name.md', kind: 'file', lastOpenedAt: 4 },
        { path: '/no-time.md', kind: 'file', name: 'no-time.md' },
        { path: '', kind: 'file', name: 'empty.md', lastOpenedAt: 4 },
        { path: '/nan-time.md', kind: 'file', name: 'nan.md', lastOpenedAt: NaN },
        null,
        'garbage'
      ]
    }
    const result = normalizeRecentItems(raw)
    expect(result.map(i => i.path)).toEqual(['/ok.md'])
  })

  it('sorts most-recent-first', () => {
    const raw = {
      recentItems: [
        item('/old.md', 'file', 1),
        item('/new.md', 'file', 9),
        item('/mid.md', 'file', 5)
      ]
    }
    expect(normalizeRecentItems(raw).map(i => i.path)).toEqual(['/new.md', '/mid.md', '/old.md'])
  })

  it('dedupes a hand-edited duplicate, keeping the most recent', () => {
    const raw = {
      recentItems: [
        item('/a.md', 'file', 1),
        item('/a.md', 'file', 7)
      ]
    }
    const result = normalizeRecentItems(raw)
    expect(result).toHaveLength(1)
    expect(result[0].lastOpenedAt).toBe(7)
  })

  it('caps the normalized list at 10', () => {
    const entries = Array.from({ length: 15 }, (_, i) => item(`/f-${i}.md`, 'file', i))
    const result = normalizeRecentItems({ recentItems: entries })
    expect(result).toHaveLength(RECENT_ITEMS_LIMIT)
    expect(result[0].path).toBe('/f-14.md')
  })
})

describe('loadRecentItems / saveRecentItems', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = createTempDir()
    filePath = path.join(dir, 'config.json')
  })

  afterEach(() => {
    cleanupTempDir(dir)
  })

  it('returns an empty list when the file is missing', () => {
    expect(loadRecentItems(path.join(dir, 'missing.json'))).toEqual([])
  })

  it('returns an empty list when the file is invalid JSON', () => {
    fs.writeFileSync(filePath, 'not json {{{', 'utf-8')
    expect(loadRecentItems(filePath)).toEqual([])
  })

  it('round-trips a saved list', () => {
    const items = [item('/b.md', 'file', 2), item('/a.md', 'folder', 1)]
    saveRecentItems(filePath, items)
    expect(loadRecentItems(filePath)).toEqual(items)
  })

  it('overwrites an existing list', () => {
    saveRecentItems(filePath, [item('/a.md', 'file', 1)])
    saveRecentItems(filePath, [item('/b.md', 'file', 2)])
    expect(loadRecentItems(filePath).map(i => i.path)).toEqual(['/b.md'])
  })

  it('does not leave a temp file behind after a successful write', () => {
    saveRecentItems(filePath, [item('/a.md', 'file', 1)])
    const leftovers = fs.readdirSync(dir).filter(f => f.includes('.tmp-'))
    expect(leftovers).toEqual([])
  })

  it('reports a failed write (e.g. target is a directory) rather than corrupting', () => {
    const badPath = path.join(dir, 'adir')
    fs.mkdirSync(badPath)
    expect(() => saveRecentItems(badPath, [item('/a.md', 'file', 1)])).toThrow()
  })

  it('rejects a relative path entry on load', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ recentItems: [item('rel.md', 'file', 1)] }),
      'utf-8'
    )
    expect(loadRecentItems(filePath)).toEqual([])
  })
})
