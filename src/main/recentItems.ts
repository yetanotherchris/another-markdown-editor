import * as fs from 'fs'
import * as path from 'path'
import { atomicWrite } from './fs/atomicWrite'
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
export const RECENT_ITEMS_LIMIT_PER_KIND = 5

/**
 * Dedupe/remove key for an entry. On Windows the filesystem compares paths
 * case-insensitively, so the key folds case — otherwise `C:\Notes` and
 * `c:\notes` would survive as two entries for one location (FR-006). The fold
 * is win32-only because on macOS/Linux realpath (canonicalPath in the
 * handlers) is what dedupes case-variant spellings of a LIVE target — the key
 * fold only matters for recorded-but-missing paths on case-insensitive mounts.
 */
export function dedupeKey(path_: string, kind: RecentKind): string {
  const normalized = process.platform === 'win32' ? path_.toLowerCase() : path_
  return `${kind}\u0000${normalized}`
}

export function recordRecentItem(items: RecentItem[], item: RecentItem): RecentItem[] {
  const key = dedupeKey(item.path, item.kind)
  const withoutOld = items.filter((existing) => dedupeKey(existing.path, existing.kind) !== key)
  // Per-type cap (FR-012): a new entry may evict the least recent of ITS OWN
  // type, never an entry of the other type.
  const others = withoutOld.filter((existing) => existing.kind !== item.kind)
  const sameKind = withoutOld
    .filter((existing) => existing.kind === item.kind)
    .slice(0, RECENT_ITEMS_LIMIT_PER_KIND - 1)
  // Canonicalize folders-first, matching normalizeRecentItems, so the on-disk
  // order does not flip-flop on every record/load cycle (the menu re-sorts, but
  // a record-then-load would otherwise reshuffle the persisted list each time).
  const merged = [item, ...others, ...sameKind]
  return [
    ...merged.filter((existing) => existing.kind === 'folder'),
    ...merged.filter((existing) => existing.kind === 'file')
  ]
}

export function removeRecentItem(items: RecentItem[], path_: string, kind: RecentKind): RecentItem[] {
  const key = dedupeKey(path_, kind)
  return items.filter((existing) => dedupeKey(existing.path, existing.kind) !== key)
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
  // (a hand-edited config may hold duplicates); cap per type (FR-012) while
  // preserving global recency order within each type.
  const seen = new Set<string>()
  const deduped = valid
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .filter((item) => {
      const key = dedupeKey(item.path, item.kind)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return [
    ...deduped.filter((i) => i.kind === 'folder').slice(0, RECENT_ITEMS_LIMIT_PER_KIND),
    ...deduped.filter((i) => i.kind === 'file').slice(0, RECENT_ITEMS_LIMIT_PER_KIND)
  ]
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

/**
 * Atomic write (temp file in the same directory, then rename — Principle III)
 * via the shared `atomicWrite` helper, with an explicit `0o600` mode so the
 * config (which records absolute paths) is not world-readable on multi-user
 * systems. The parent directory is created on demand; a failure to create it
 * or to write the temp propagates to the caller, which must treat the
 * persistence failure as non-fatal (FR-011).
 *
 * Spec 012 FR-002: settings share this file (`{ recentItems?, settings? }`).
 * A save is a read-modify-write that preserves the `.settings` section, so
 * recording a recent item never clobbers the settings dialog's data.
 */
export function saveRecentItems(filePath: string, items: RecentItem[]): void {
  let existing: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (parsed && typeof parsed === 'object') existing = parsed as Record<string, unknown>
  } catch {
    // Missing or corrupt config — start from a fresh object.
  }
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  atomicWrite(filePath, JSON.stringify({ ...existing, recentItems: items }, null, 2), 0o600)
}
