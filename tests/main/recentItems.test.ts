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
  dedupeKey,
  RECENT_ITEMS_LIMIT_PER_KIND
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

  it('caps each type at 5, evicting the least recent of that type only', () => {
    let items: RecentItem[] = []
    for (let i = 0; i < RECENT_ITEMS_LIMIT_PER_KIND + 3; i++) {
      items = recordRecentItem(items, item(`/file-${i}.md`, 'file', i))
    }
    expect(items).toHaveLength(RECENT_ITEMS_LIMIT_PER_KIND)
    // Newest survive; the oldest of the SAME type are evicted.
    expect(items[0].path).toBe(`/file-${RECENT_ITEMS_LIMIT_PER_KIND + 2}.md`)
    expect(items.some(i => i.path === '/file-0.md')).toBe(false)
  })

  it('does not evict the other type when one type hits its cap', () => {
    let items: RecentItem[] = []
    for (let i = 0; i < RECENT_ITEMS_LIMIT_PER_KIND; i++) {
      items = recordRecentItem(items, item(`/folder-${i}`, 'folder', i))
    }
    // 6 files on top of 5 folders: folders stay, 6th file evicts oldest file.
    for (let i = 0; i < RECENT_ITEMS_LIMIT_PER_KIND + 1; i++) {
      items = recordRecentItem(items, item(`/file-${i}.md`, 'file', i))
    }
    expect(items.filter(i => i.kind === 'folder')).toHaveLength(RECENT_ITEMS_LIMIT_PER_KIND)
    expect(items.filter(i => i.kind === 'file')).toHaveLength(RECENT_ITEMS_LIMIT_PER_KIND)
    expect(items.some(i => i.path === '/file-0.md')).toBe(false)
    expect(items.some(i => i.path === '/folder-0')).toBe(true)
  })

  it('canonicalizes folders-first so record and load agree', () => {
    // The persisted order must not flip-flop between [new, …others, …sameKind]
    // after a record and folders-first after a load.
    let items: RecentItem[] = []
    items = recordRecentItem(items, item('/f-a.md', 'file', 1))
    items = recordRecentItem(items, item('/f-b.md', 'file', 2))
    items = recordRecentItem(items, item('/dir-a', 'folder', 3))
    expect(items.map(i => i.kind)).toEqual(['folder', 'file', 'file'])
    // A record that lands the newest entry in a kind keeps the groups stable.
    items = recordRecentItem(items, item('/dir-b', 'folder', 4))
    expect(items.map(i => i.kind)).toEqual(['folder', 'folder', 'file', 'file'])
    expect(items.map(i => i.path)).toEqual(['/dir-b', '/dir-a', '/f-b.md', '/f-a.md'])
  })

  it('folds path case in the dedupe key on win32 only', () => {
    const key = dedupeKey('C:\\Notes', 'file')
    const folded = dedupeKey('c:\\notes', 'file')
    if (process.platform === 'win32') {
      expect(key).toBe(folded)
    } else {
      expect(key).not.toBe(folded)
    }
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

  it('caps the normalized list at 5 per type, folders first', () => {
    const files = Array.from({ length: RECENT_ITEMS_LIMIT_PER_KIND + 3 }, (_, i) => item(`/f-${i}.md`, 'file', i))
    const folders = Array.from({ length: RECENT_ITEMS_LIMIT_PER_KIND + 1 }, (_, i) => item(`/d-${i}`, 'folder', i))
    const result = normalizeRecentItems({ recentItems: [...files, ...folders] })
    expect(result.filter(i => i.kind === 'file')).toHaveLength(RECENT_ITEMS_LIMIT_PER_KIND)
    expect(result.filter(i => i.kind === 'folder')).toHaveLength(RECENT_ITEMS_LIMIT_PER_KIND)
    // Folders come before files; newest first within each group.
    expect(result[0].kind).toBe('folder')
    expect(result[0].path).toBe(`/d-${RECENT_ITEMS_LIMIT_PER_KIND}`)
    expect(result.find(i => i.kind === 'file')!.path).toBe(`/f-${RECENT_ITEMS_LIMIT_PER_KIND + 2}.md`)
    expect(result.some(i => i.path === '/f-0.md')).toBe(false)
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

  it('round-trips a saved list (canonicalized folders-first)', () => {
    const items = [item('/b.md', 'file', 2), item('/a.md', 'folder', 1)]
    saveRecentItems(filePath, items)
    expect(loadRecentItems(filePath)).toEqual([
      item('/a.md', 'folder', 1),
      item('/b.md', 'file', 2)
    ])
  })

  it('record → save → load preserves the on-disk order (no flip-flop)', () => {
    let items: RecentItem[] = []
    items = recordRecentItem(items, item('/f-a.md', 'file', 1))
    items = recordRecentItem(items, item('/dir-a', 'folder', 2))
    saveRecentItems(filePath, items)
    // recordRecentItem already emits folders-first, so load returns the same
    // list instead of reshuffling it.
    expect(loadRecentItems(filePath).map(i => i.kind)).toEqual(['folder', 'file'])
  })

  it('overwrites an existing list', () => {
    saveRecentItems(filePath, [item('/a.md', 'file', 1)])
    saveRecentItems(filePath, [item('/b.md', 'file', 2)])
    expect(loadRecentItems(filePath).map(i => i.path)).toEqual(['/b.md'])
  })

  it('clears the list (Clear Recent Items writes an empty array)', () => {
    saveRecentItems(filePath, [item('/a.md', 'file', 1), item('/b', 'folder', 2)])
    saveRecentItems(filePath, [])
    expect(loadRecentItems(filePath)).toEqual([])
  })

  it('does not leave a temp file behind after a successful write', () => {
    saveRecentItems(filePath, [item('/a.md', 'file', 1)])
    const leftovers = fs.readdirSync(dir).filter(f => f.includes('.tmp-'))
    expect(leftovers).toEqual([])
  })

  it('preserves a pre-existing settings section (spec 012 FR-002, read-modify-write)', () => {
    // The shared config.json holds both stores; recording a recent item must
    // not clobber the settings dialog's data (review #27 coverage gap).
    fs.writeFileSync(filePath, JSON.stringify({
      settings: { sidebarWidth: 30, themeOverride: 'dark', explorerVisible: false, editorFont: 'serif' }
    }), 'utf-8')
    saveRecentItems(filePath, [item('/a.md', 'file', 1)])
    const whole = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(whole.settings).toEqual({
      sidebarWidth: 30, themeOverride: 'dark', explorerVisible: false, editorFont: 'serif'
    })
    expect(loadRecentItems(filePath).map(i => i.path)).toEqual(['/a.md'])
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
