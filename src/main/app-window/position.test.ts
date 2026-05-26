import { describe, expect, it } from 'vitest'
import { validateWindowPosition } from './position'

interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

describe('validateWindowPosition', () => {
  it('returns the input position when it fits on the primary display', () => {
    const workAreas: WorkArea[] = [{ x: 0, y: 0, width: 2560, height: 1440 }]
    const result = validateWindowPosition({ x: 100, y: 100, width: 520, height: 550 }, workAreas)
    expect(result).toEqual({ x: 100, y: 100 })
  })

  it('returns the input position when on a secondary display with negative coords', () => {
    const workAreas: WorkArea[] = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: -1920, y: 0, width: 1920, height: 1080 },
    ]
    const result = validateWindowPosition({ x: -1500, y: 100, width: 520, height: 550 }, workAreas)
    expect(result).toEqual({ x: -1500, y: 100 })
  })

  it('clamps to the nearest display when the stored position is completely off-screen', () => {
    // Single monitor at (0,0), stored position is far to the right where no
    // monitor exists anymore (the user detached a second screen).
    const workAreas: WorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    // Window was at x=3000 on a monitor that's now gone.
    const result = validateWindowPosition({ x: 3000, y: 200, width: 520, height: 550 }, workAreas)
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.x + 520).toBeLessThanOrEqual(1920)
    expect(result.y).toBeGreaterThanOrEqual(0)
    expect(result.y + 550).toBeLessThanOrEqual(1080)
  })

  it('clamps when the window sits in a deadzone between two L-shaped monitors', () => {
    // Two monitors side by side but vertically offset (L-shaped).
    const workAreas: WorkArea[] = [
      { x: 0, y: 0, width: 1920, height: 1080 }, // primary
      { x: 1920, y: 300, width: 1920, height: 1080 }, // secondary
    ]
    // Window at the gap: (1900, 50) on primary, but y=50 is outside the
    // secondary's y range (which starts at 300). The window straddles the gap.
    const result = validateWindowPosition({ x: 1900, y: 50, width: 520, height: 550 }, workAreas)
    // Should clamp either to primary or secondary work area.
    expect(result.x).toBeGreaterThanOrEqual(-0)
    // Verify the clamped position fits on some display.
    const fitsSomewhere = workAreas.some(
      (wa) =>
        result.x >= wa.x && result.y >= wa.y && result.x + 520 <= wa.x + wa.width && result.y + 550 <= wa.y + wa.height,
    )
    expect(fitsSomewhere).toBe(true)
  })

  it('preserves the position when the titlebar is draggable even if partially off-screen', () => {
    // Window mostly to the right but titlebar (top ~32px) is still visible.
    const workAreas: WorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    // X=1800, 520 wide => right edge at 2320 which is off-screen.
    // But left 120px + titlebar region intersect the work area.
    const result = validateWindowPosition({ x: 1800, y: 50, width: 520, height: 550 }, workAreas)
    expect(result).toEqual({ x: 1800, y: 50 })
  })

  it('clamps when the titlebar is nearly invisible (only 1px draggable)', () => {
    // Window at y=-31 with a 32px titlebar means only 1px of the titlebar is
    // visible — not enough for the user to grab and drag it back.
    const workAreas: WorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    const result = validateWindowPosition({ x: 100, y: -31, width: 520, height: 550 }, workAreas)
    // Should clamp so that the titlebar is accessible.
    expect(result.x).toBe(100)
    expect(result.y).toBeGreaterThanOrEqual(0)
  })

  it('clamps when the window is entirely outside every work area', () => {
    const workAreas: WorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    const result = validateWindowPosition({ x: -9999, y: 5000, width: 520, height: 550 }, workAreas)
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.y).toBeGreaterThanOrEqual(0)
    expect(result.x + 520).toBeLessThanOrEqual(1920)
    expect(result.y + 550).toBeLessThanOrEqual(1080)
  })

  it('clamps a window that is larger than the work area', () => {
    const workAreas: WorkArea[] = [{ x: 0, y: 0, width: 800, height: 600 }]
    const result = validateWindowPosition({ x: 500, y: 500, width: 1200, height: 900 }, workAreas)
    // The clamp positions x as max(0, min(500, 800-1200=-400)) = max(0, -400) = 0
    // y: max(0, min(500, 600-900=-300)) = max(0, -300) = 0
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('selects the display whose work area contains the stored center point', () => {
    const workAreas: WorkArea[] = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ]
    // Center at ~(2180, 275) falls on the second display.
    const result = validateWindowPosition({ x: 1920, y: 50, width: 520, height: 550 }, workAreas)
    expect(result.x).toBeGreaterThanOrEqual(1920)
  })

  it('falls back to nearest display when center is in a deadzone', () => {
    const workAreas: WorkArea[] = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 2200, y: 0, width: 1920, height: 1080 }, // gap between 1920-2200
    ]
    // Window at x=2000, w=100 falls entirely in the gap (1920..2200). No overlap.
    // Center ~(2050, 475). Nearest display by distance: left edge of display 2 is
    // at 2200 (distance 150 from center-x=2050), right edge of display 1 is at
    // 1920 (distance 130). Display 1 is closer by x-distance.
    const result = validateWindowPosition({ x: 2000, y: 200, width: 100, height: 550 }, workAreas)
    // Clamped to display 1 (closer), so x should be between 0 and 1920-100=1820.
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.x).toBeLessThanOrEqual(1820)
    expect(result.y).toBe(200)
  })
})
