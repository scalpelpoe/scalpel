import { describe, expect, it } from 'vitest'
import {
  CAMERA_CONSTANTS,
  groundDistance,
  groundToScreen,
  playfieldRect,
  projectCircle,
  rightmostPx,
  screenToGround,
  unitsToMetres,
} from './poe-projection'

describe('CAMERA_CONSTANTS', () => {
  it('has PoE1 and PoE2 filled', () => {
    expect(CAMERA_CONSTANTS[1]).not.toBeNull()
    expect(CAMERA_CONSTANTS[2]).not.toBeNull()
    expect(CAMERA_CONSTANTS[1]?.metresPerUnit).toBe(0.1)
    expect(CAMERA_CONSTANTS[2]?.metresPerUnit).toBe(0.1)
  })
})

describe('playfieldRect', () => {
  it('uses the full window when aspect <= maxAspect (16:9)', () => {
    const r = playfieldRect(1, { w: 1920, h: 1080 })
    expect(r).toEqual({ left: 0, top: 0, width: 1920, height: 1080 })
  })
  it('clamps and centers an ultrawide window (32:9)', () => {
    const r = playfieldRect(1, { w: 3840, h: 1080 })
    expect(r.width).toBeCloseTo(2592, 5)
    expect(r.left).toBeCloseTo(624, 5)
    expect(r.height).toBe(1080)
  })
})

describe('screenToGround / groundToScreen', () => {
  const size = { w: 1920, h: 1080 }

  it('maps screen center to ground x≈0', () => {
    const g = screenToGround(1, { x: 0.5, y: 0.5 }, size)
    expect(g).not.toBeNull()
    expect(g?.x ?? 999).toBeCloseTo(0, 3)
    expect(g?.y ?? 999).toBeLessThan(0)
  })

  it('round-trips ground -> screen -> ground for several points', () => {
    for (const pt of [
      { x: 0.5, y: 0.5 },
      { x: 0.3, y: 0.4 },
      { x: 0.7, y: 0.6 },
      { x: 0.5, y: 0.35 },
    ]) {
      const g = screenToGround(1, pt, size)
      expect(g).not.toBeNull()
      const back = groundToScreen(1, g!, size)
      expect(back).not.toBeNull()
      expect(back!.x).toBeCloseTo(pt.x, 4)
      expect(back!.y).toBeCloseTo(pt.y, 4)
    }
  })

  it('round-trips for PoE2 as well', () => {
    const g = screenToGround(2, { x: 0.5, y: 0.5 }, size)
    expect(g).not.toBeNull()
    const back = groundToScreen(2, g!, size)
    expect(back).not.toBeNull()
    expect(back!.x).toBeCloseTo(0.5, 4)
    expect(back!.y).toBeCloseTo(0.5, 4)
  })
})

describe('groundDistance', () => {
  it('is plain euclidean in world units', () => {
    expect(groundDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('projectCircle', () => {
  const size = { w: 1920, h: 1080 }
  it('returns the requested segment count for a modest ring near center', () => {
    const center = screenToGround(1, { x: 0.5, y: 0.5 }, size)!
    const pts = projectCircle(1, center, 20, size, 64)
    expect(pts).toHaveLength(64)
  })
  it('projects a ground circle wider than it is tall (isometric foreshortening)', () => {
    const center = screenToGround(1, { x: 0.5, y: 0.5 }, size)!
    const pts = projectCircle(1, center, 20, size, 64)
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const widthN = Math.max(...xs) - Math.min(...xs)
    const heightN = Math.max(...ys) - Math.min(...ys)
    expect(widthN * size.w).toBeGreaterThan(heightN * size.h)
  })
  it('projects a ring for PoE2 too', () => {
    const center = screenToGround(2, { x: 0.5, y: 0.5 }, size)!
    expect(projectCircle(2, center, 20, size, 64)).toHaveLength(64)
  })
})

describe('unitsToMetres', () => {
  it('converts PoE1 units at 0.1 m per unit', () => {
    expect(unitsToMetres(1, 20)).toBeCloseTo(2.0, 6)
  })
  it('converts PoE2 units at 0.1 m per unit', () => {
    expect(unitsToMetres(2, 20)).toBeCloseTo(2.0, 6)
  })
})

describe('rightmostPx', () => {
  it('returns the max-x point in pixels', () => {
    const r = rightmostPx(
      [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.3 },
        { x: 0.3, y: 0.9 },
      ],
      { w: 1000, h: 1000 },
    )
    expect(r).toEqual({ x: 500, y: 300 })
  })
  it('is null for an empty array', () => {
    expect(rightmostPx([], { w: 1000, h: 1000 })).toBeNull()
  })
})
