import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { recentItemsConfigPath } from './recentItemsPath'
import {
  loadWindowStateFile,
  snapshotToState,
  writeWindowStateFile
} from './windowStateFile'
import type { WindowState } from './windowStateFile'
import { resolveLaunchState } from './windowStateFit'
import type { Rect } from './windowStateFit'

/**
 * Spec 011 Electron wiring (T006): resolves the shared config path, computes
 * the launch bounds from the saved state + available displays, and tracks the
 * main window so position/size/maximized changes persist automatically
 * (FR-001/FR-002/FR-005). The only window-state module that touches Electron;
 * all rules live in the pure `windowStateFile`/`windowStateFit` modules.
 *
 * FR-003: the path is the SAME per-user config file as the recent-items list
 * (`recentItemsConfigPath()`, honouring `AME_CONFIG_DIR`).
 */

function windowStatePath(): string {
  return recentItemsConfigPath()
}

function workAreas(): Rect[] {
  return screen.getAllDisplays().map((d) => d.workArea)
}

/** Load the saved window state (null when missing/malformed — FR-006). */
export function loadWindowState(): WindowState | null {
  return loadWindowStateFile(windowStatePath())
}

/** Launch bounds + maximized flag, clamped to the available displays. */
export function resolveLaunchBounds(): { bounds: Rect; isMaximized: boolean } {
  return resolveLaunchState(loadWindowState(), workAreas())
}

/** The last saved state, so a flush without a new snapshot still writes it. */
let pendingState: WindowState | null = null

let writeTimer: ReturnType<typeof setTimeout> | null = null

function writeState(state: WindowState): void {
  try {
    writeWindowStateFile(windowStatePath(), state)
  } catch {
    // Best-effort (FR-009): a failed write must not block anything.
  }
}

/**
 * Debounced persist (SC-002: within 1 s of a change completing). The window
 * emits many move/resize events per drag; a write per event would thrash the
 * disk and risk overlapping atomic writes.
 */
function scheduleWrite(state: WindowState): void {
  pendingState = state
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    if (pendingState) writeState(pendingState)
  }, 500)
}

/** Drain any pending write immediately (FR-002 on close, FR-009 on quit). */
export function flushWindowState(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  if (pendingState) {
    const state = pendingState
    pendingState = null
    writeState(state)
  }
}

/** Snapshot + persist the window's current state (minimized → skipped, FR-008). */
function capture(win: BrowserWindow): void {
  const state = snapshotToState({
    bounds: win.getNormalBounds(),
    isMaximized: win.isMaximized(),
    isMinimized: win.isMinimized()
  })
  if (state) scheduleWrite(state)
}

/**
 * Attach move/resize/maximize/unmaximize/close tracking to the main window.
 * Every state change fires one of these events and schedules a write via
 * `capture`; `close` drains the pending write immediately so a fast quit
 * cannot lose the last position (FR-002/FR-009). A minimized window is skipped
 * by snapshotToState (FR-008).
 */
export function trackWindowState(win: BrowserWindow): void {
  win.on('move', () => capture(win))
  win.on('resize', () => capture(win))
  win.on('maximize', () => capture(win))
  win.on('unmaximize', () => capture(win))
  win.on('close', () => flushWindowState())
}
