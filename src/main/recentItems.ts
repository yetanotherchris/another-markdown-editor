import * as fs from 'fs'
import * as path from 'path'
import type { RecentItem, RecentKind } from '../shared/ipc-contract'

/**
 * Pure, electron-free store for the spec-004 recent-items list (research R1/R4).
 *
 * The config file lives at `appData/ame/config.json` (on Linux
 * `~/.config/ame/config.json` per FR-004); this module never resolves that path
 * itself — callers pass the file path in, so it stays unit-testable without
 * mocking Electron.
 *
 * Tolerance (FR-011, spec edges): a missing, unreadable, or malformed config
 * yields the valid entries that can be recovered (or `[]`), never an exception.
 * Entries with a relative path, an unknown kind, or a non-number timestamp are
 * dropped.
 */
export const RECENT_ITEMS_LIMIT = 10

export function recordRecentItem(items: RecentItem[], item: RecentItem): RecentItem[] {
  const withoutOld = items.filter(
    (existing) => !(existing.path === item.path && existing.kind === item.kind)
  )
  return [item, ...withoutOld].slice(0, RECENT_ITEMS_LIMIT)
}

export function removeRecentItem(items: RecentItem[], path_: string, kind: RecentKind): RecentItem[] {
  return items.filter(
    (existing) => !(existing.path === path_ && existing.kind === kind)
  )
}

/** Recover a list from arbitrary loaded JSON, dropping anything malformed. */
export function normalizeRecentItems(raw: unknown): RecentItem[] {
  if (!raw || typeof raw !== 'object') return []
  const arr = (raw as { recentItems?: unknown }).recentItems
  if (!Array.isArray(arr)) return []
  const valid: RecentItem[] = []
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.path !== 'string' || e.path.length === 0) continue
    if (!path.isAbsolute(e.path)) continue
    if (e.kind !== 'file' && e.kind !== 'folder') continue
    if (typeof e.name !== 'string' || e.name.length === 0) continue
    if (typeof e.lastOpenedAt !== 'number' || !Number.isFinite(e.lastOpenedAt)) continue
    valid.push({
      path: e.path,
      kind: e.kind as RecentKind,
      name: e.name,
      lastOpenedAt: e.lastOpenedAt
    })
  }
  // Most-recent-first; dedupe by (path, kind) keeping the most recent copy
  // (a hand-edited config may hold duplicates).
  const seen = new Set<string>()
  return valid
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .filter((item) => {
      const key = `${item.kind}\u0000${item.path}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, RECENT_ITEMS_LIMIT)
}

export function loadRecentItems(filePath: string): RecentItem[] {
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
  return normalizeRecentItems(raw)
}

/** Atomic write: temp file in the same directory, then rename (Principle III). */
export function saveRecentItems(filePath: string, items: RecentItem[]): void {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const tempPath = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now().toString(36)}`)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(tempPath, JSON.stringify({ recentItems: items }, null, 2), 'utf-8')
    fs.renameSync(tempPath, filePath)
  } catch (e: unknown) {
    try { fs.unlinkSync(tempPath) } catch { /* best-effort cleanup */ }
    throw e
  }
}
