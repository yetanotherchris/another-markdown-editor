import type { WindowState } from './windowStateFile'

/**
 * Pure, electron-free display-fit rules for spec 011 (T003) — FR-006/FR-007.
 * Electron's `screen` module is not imported here: callers (windowState.ts)
 * pass plain `{ x, y, width, height }` work-areas from `screen.getAllDisplays()`
 * so every clamping rule is unit-testable without mocking Electron.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The pre-feature default size (FR-006 "sensible default position and size"). */
export const DEFAULT_WINDOW = { width: 1200, height: 800 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function displayContainsCenter(display: Rect, bounds: Rect): boolean {
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  return cx >= display.x && cx <= display.x + display.width &&
    cy >= display.y && cy <= display.y + display.height
}

/**
 * Fit `bounds` to be fully visible on an available display (FR-007):
 *
 * 1. pick the display whose work-area contains the rect's centre; if none does
 *    (the saved display is disconnected, or the resolution/arrangement changed),
 *    fall back to the first display (the primary) — FR-007 scenario 1, FR-006;
 * 2. clamp `width`/`height` to that work-area so the window is never larger
 *    than an available display — FR-007 scenario 2;
 * 3. clamp `x`/`y` so the whole rect sits inside the work-area — a partially
 *    off-screen window is pushed back fully on-screen, never left straddling an
 *    edge.
 *
 * Bounds and work-areas are both in DIP, so differing scale factors compare
 * correctly — FR-007 scenario 3.
 */
export function fitWindowToDisplays(bounds: Rect, displays: Rect[]): Rect {
  // Skip zero-area work-areas (a disabled display can still be listed): fitting
  // to one would produce a degenerate 0×0 window.
  const usable = displays.filter((d) => d.width > 0 && d.height > 0)
  if (usable.length === 0) return bounds
  const target = usable.find((d) => displayContainsCenter(d, bounds)) ?? usable[0]
  const width = Math.min(bounds.width, target.width)
  const height = Math.min(bounds.height, target.height)
  const x = clamp(bounds.x, target.x, target.x + target.width - width)
  const y = clamp(bounds.y, target.y, target.y + target.height - height)
  return { x, y, width, height }
}

/** The default position for a fresh window: centred on the given display, and
 *  clamped to fit if the display is smaller than the default size (FR-006 —
 *  a "sensible default" must actually be visible and usable). */
export function centerIn(display: Rect): Rect {
  const width = Math.min(DEFAULT_WINDOW.width, display.width)
  const height = Math.min(DEFAULT_WINDOW.height, display.height)
  return {
    x: display.x + Math.round((display.width - width) / 2),
    y: display.y + Math.round((display.height - height) / 2),
    width,
    height
  }
}

/** Resolve the launch bounds + maximized flag from the saved state. */
export function resolveLaunchState(
  saved: WindowState | null,
  displays: Rect[]
): { bounds: Rect; isMaximized: boolean } {
  const usable = displays.filter((d) => d.width > 0 && d.height > 0)
  if (!saved) {
    const primary = usable[0]
    return {
      bounds: primary ? centerIn(primary) : { x: 0, y: 0, ...DEFAULT_WINDOW },
      isMaximized: false
    }
  }
  // With no usable display, fall back to the centered default rather than
  // trusting a possibly off-screen rect (FR-006/FR-007).
  if (usable.length === 0) {
    return { bounds: { x: 0, y: 0, ...DEFAULT_WINDOW }, isMaximized: saved.isMaximized }
  }
  return { bounds: fitWindowToDisplays(saved, usable), isMaximized: saved.isMaximized }
}
