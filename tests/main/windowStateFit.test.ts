import { describe, it, expect } from 'vitest'
import {
  fitWindowToDisplays,
  centerIn,
  resolveLaunchState,
  DEFAULT_WINDOW
} from '../../src/main/windowStateFit'
import type { Rect } from '../../src/main/windowStateFit'
import type { WindowState } from '../../src/main/windowStateFile'

/** Primary display work-area (1920×1080 minus a 40px taskbar). */
const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1040 }

/** A secondary display to the right of the primary. */
const SECONDARY: Rect = { x: 1920, y: 0, width: 1920, height: 1040 }

describe('fitWindowToDisplays (FR-007)', () => {
  it('leaves a fully-visible rect unchanged', () => {
    const bounds = { x: 100, y: 100, width: 900, height: 600 }
    expect(fitWindowToDisplays(bounds, [PRIMARY])).toEqual(bounds)
  })

  it('repositions an off-screen rect onto the available display (FR-007 s1)', () => {
    // The saved display is gone — the rect centre is outside every work-area.
    const bounds = { x: 5000, y: 5000, width: 800, height: 600 }
    const fitted = fitWindowToDisplays(bounds, [PRIMARY])
    expect(fitted.x).toBeGreaterThanOrEqual(PRIMARY.x)
    expect(fitted.y).toBeGreaterThanOrEqual(PRIMARY.y)
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(PRIMARY.x + PRIMARY.width)
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(PRIMARY.y + PRIMARY.height)
  })

  it('resizes a rect larger than the display to fit (FR-007 s2)', () => {
    const bounds = { x: 0, y: 0, width: 4000, height: 3000 }
    const fitted = fitWindowToDisplays(bounds, [PRIMARY])
    expect(fitted.width).toBe(PRIMARY.width)
    expect(fitted.height).toBe(PRIMARY.height)
  })

  it('pushes a partially off-screen rect fully on-screen', () => {
    // Bottom-right hangs off the primary.
    const bounds = { x: 1700, y: 900, width: 600, height: 400 }
    const fitted = fitWindowToDisplays(bounds, [PRIMARY])
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(PRIMARY.x + PRIMARY.width)
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(PRIMARY.y + PRIMARY.height)
    expect(fitted.x).toBeGreaterThanOrEqual(PRIMARY.x)
    expect(fitted.y).toBeGreaterThanOrEqual(PRIMARY.y)
  })

  it('keeps a rect that belongs to a still-connected display on that display', () => {
    const bounds = { x: 2000, y: 100, width: 800, height: 600 } // centre inside SECONDARY
    const fitted = fitWindowToDisplays(bounds, [PRIMARY, SECONDARY])
    expect(fitted.x).toBeGreaterThanOrEqual(SECONDARY.x)
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(SECONDARY.x + SECONDARY.width)
  })

  it('falls back to the first display when the rect centre is on no display', () => {
    const bounds = { x: 1920, y: 1040, width: 400, height: 300 } // on the seam corner
    const fitted = fitWindowToDisplays(bounds, [PRIMARY, SECONDARY])
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(PRIMARY.x + PRIMARY.width)
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(PRIMARY.y + PRIMARY.height)
  })

  it('returns the bounds unchanged when there are no displays', () => {
    const bounds = { x: 1, y: 2, width: 300, height: 200 }
    expect(fitWindowToDisplays(bounds, [])).toEqual(bounds)
  })

  it('skips a zero-area work-area and fits to a usable one instead', () => {
    const bounds = { x: 0, y: 0, width: 500, height: 400 }
    const disabled = { x: 0, y: 0, width: 0, height: 0 }
    const primary = { x: 0, y: 0, width: 1920, height: 1040 }
    const fitted = fitWindowToDisplays(bounds, [disabled, primary])
    expect(fitted).toEqual(bounds)
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(primary.width)
  })
})

describe('centerIn (FR-006 default position)', () => {
  it('centres the default window on the display', () => {
    const centered = centerIn(PRIMARY)
    expect(centered.width).toBe(DEFAULT_WINDOW.width)
    expect(centered.height).toBe(DEFAULT_WINDOW.height)
    expect(centered.x).toBe(Math.round((1920 - 1200) / 2))
    expect(centered.y).toBe(Math.round((1040 - 800) / 2))
  })
})

describe('resolveLaunchState (FR-001/FR-005/FR-006)', () => {
  it('uses the centered default when there is no saved state', () => {
    const { bounds, isMaximized } = resolveLaunchState(null, [PRIMARY])
    expect(bounds).toEqual(centerIn(PRIMARY))
    expect(isMaximized).toBe(false)
  })

  it('restores a saved, in-bounds rect and its maximized flag (FR-001/FR-005)', () => {
    const saved: WindowState = { x: 50, y: 60, width: 1000, height: 700, isMaximized: true }
    const { bounds, isMaximized } = resolveLaunchState(saved, [PRIMARY])
    expect(bounds).toEqual({ x: 50, y: 60, width: 1000, height: 700 })
    expect(isMaximized).toBe(true)
  })

  it('clamps an off-screen saved rect (FR-006/FR-007)', () => {
    const saved: WindowState = { x: 99999, y: 99999, width: 1200, height: 800, isMaximized: false }
    const { bounds } = resolveLaunchState(saved, [PRIMARY])
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(PRIMARY.x + PRIMARY.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(PRIMARY.y + PRIMARY.height)
  })

  it('centres on the primary when no displays are reported', () => {
    const { bounds } = resolveLaunchState(null, [])
    expect(bounds).toEqual({ x: 0, y: 0, ...DEFAULT_WINDOW })
  })

  it('falls back to the centered default when only zero-area displays are reported', () => {
    const saved: WindowState = { x: 99999, y: 99999, width: 500, height: 400, isMaximized: false }
    const { bounds } = resolveLaunchState(saved, [{ x: 0, y: 0, width: 0, height: 0 }])
    expect(bounds).toEqual({ x: 0, y: 0, ...DEFAULT_WINDOW })
  })
})
