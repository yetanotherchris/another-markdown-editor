import * as fs from 'fs'
import * as path from 'path'
import { readConfigFile } from './settingsFile'
import { atomicWrite } from './fs/atomicWrite'

/**
 * Pure, electron-free window-state store (spec 011 T002) — mirrors the
 * `recentItems`/`settingsFile` split so the load/save logic is unit-testable
 * without mocking Electron. Callers resolve the file path (windowState.ts) and
 * pass it in; this module never touches `app` or `screen`.
 *
 * Spec 011 FR-003: the window state lives in the SAME per-user configuration
 * file as the recent-items list and settings — `config.json` at `appData/ame`
 * (or the `AME_CONFIG_DIR` test seam). The file shape is
 * `{ recentItems?, settings?, windowState? }`, and every write is a
 * read-modify-write so saving window state never clobbers the other sections
 * (and vice versa).
 *
 * Tolerance (FR-006/FR-009): a missing, unreadable, or malformed window-state
 * section yields `null` (the caller falls back to the default bounds), never an
 * exception. Each field is validated individually so a partially-corrupt object
 * keeps every recoverable value.
 */

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

/** A live window snapshot (FR-008): bounds + maximized flag + minimized flag. */
export interface WindowSnapshot {
  bounds: { x: number; y: number; width: number; height: number }
  isMaximized: boolean
  isMinimized: boolean
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function validateWindowState(raw: unknown): WindowState | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Record<string, unknown>
  const x = isFiniteNumber(parsed.x) ? parsed.x : null
  const y = isFiniteNumber(parsed.y) ? parsed.y : null
  const width = isFiniteNumber(parsed.width) && parsed.width > 0 ? parsed.width : null
  const height = isFiniteNumber(parsed.height) && parsed.height > 0 ? parsed.height : null
  if (x === null || y === null || width === null || height === null) return null
  return {
    x,
    y,
    width,
    height,
    isMaximized: typeof parsed.isMaximized === 'boolean' ? parsed.isMaximized : false
  }
}

export function loadWindowStateFile(filePath: string): WindowState | null {
  return validateWindowState(readConfigFile(filePath).windowState)
}

/**
 * Convert a live window snapshot into a persisted state. Returns `null` when
 * the window is minimized so a minimized window is never persisted (FR-008):
 * its bounds are stale restore-rect values and saving them would make the next
 * launch reopen at a position the user did not choose.
 */
export function snapshotToState(snapshot: WindowSnapshot): WindowState | null {
  if (snapshot.isMinimized) return null
  const { x, y, width, height } = snapshot.bounds
  return { x, y, width, height, isMaximized: snapshot.isMaximized }
}

/**
 * Read-modify-write: load the current config (tolerant → `{}`), merge the
 * `windowState` section, and write the whole file back so `recentItems` and
 * `settings` survive. Atomic (temp + fsync + rename, Principle III) with an
 * explicit `0o600` mode, mirroring writeSettingsFile (review #27 M1/M2: the
 * shared config holds the MRU list of absolute paths and must not be
 * world-readable when first created).
 */
export function writeWindowStateFile(filePath: string, state: WindowState): void {
  const current = readConfigFile(filePath)
  const updated = { ...current, windowState: state }
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  atomicWrite(filePath, JSON.stringify(updated, null, 2), 0o600)
}
