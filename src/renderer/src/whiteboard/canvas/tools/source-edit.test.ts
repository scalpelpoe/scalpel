import { describe, it, expect } from 'vitest'
import { moveSource, resizeSourceFromPx, destHeightForSourceAspect } from './source-edit'

const SIZE = { w: 1000, h: 500 }

describe('moveSource', () => {
  it('shifts the source by a pixel delta (normalized)', () => {
    const r = moveSource({ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }, { x: 100, y: 50 }, SIZE)
    expect(r.x).toBeCloseTo(0.3) // 0.2 + 100/1000
    expect(r.y).toBeCloseTo(0.3) // 0.2 + 50/500
    expect(r.w).toBeCloseTo(0.1)
    expect(r.h).toBeCloseTo(0.1)
  })

  it('clamps so the source stays inside [0,1]', () => {
    const r = moveSource({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, { x: 1000, y: 1000 }, SIZE)
    expect(r.x).toBeCloseTo(0.8) // 1 - w
    expect(r.y).toBeCloseTo(0.8)
  })
})

describe('resizeSourceFromPx', () => {
  it('normalizes a pixel rect to a source rect', () => {
    const r = resizeSourceFromPx({ x: 100, y: 50, w: 400, h: 100 }, SIZE)
    expect(r.x).toBeCloseTo(0.1)
    expect(r.y).toBeCloseTo(0.1)
    expect(r.w).toBeCloseTo(0.4)
    expect(r.h).toBeCloseTo(0.2)
  })

  it('clamps a zero/oversized rect into a valid normalized rect', () => {
    const r = resizeSourceFromPx({ x: 0, y: 0, w: 0, h: 5000 }, SIZE)
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeLessThanOrEqual(1)
    expect(r.y + r.h).toBeLessThanOrEqual(1.0001)
  })
})

describe('destHeightForSourceAspect', () => {
  it('returns the dest height that matches the source aspect', () => {
    // source aspect (normalized) 0.2 / 0.1 = 2; bbox.w 0.3 -> bbox.h 0.15
    const h = destHeightForSourceAspect({ x: 0, y: 0, w: 0.3, h: 0.05 }, { x: 0, y: 0, w: 0.2, h: 0.1 })
    expect(h).toBeCloseTo(0.15)
  })

  it('makes the dest pixel-aspect equal the source pixel-aspect', () => {
    const size = { w: 1600, h: 900 }
    const source = { x: 0, y: 0, w: 0.25, h: 0.1 }
    const bbox = { x: 0.5, y: 0.5, w: 0.2, h: 0.4 }
    const h = destHeightForSourceAspect(bbox, source)
    const destAspect = (bbox.w * size.w) / (h * size.h)
    const srcAspect = (source.w * size.w) / (source.h * size.h)
    expect(destAspect).toBeCloseTo(srcAspect)
  })
})
