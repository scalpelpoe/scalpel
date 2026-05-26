import { describe, expect, it } from 'vitest'
import { commitRadius, startRadius, updateRadiusEnd } from './radius'
import { groundDistance, screenToGround } from '../poe-projection'

const size = { w: 1920, h: 1080 }

describe('radius session', () => {
  it('commits a ring whose center and radius match the drag, in world units', () => {
    const centerPx = { x: 0.5 * size.w, y: 0.5 * size.h }
    const edgePx = { x: 0.62 * size.w, y: 0.5 * size.h }
    const s = startRadius({ version: 1, color: '#fff', strokeWidth: 0.0035, anchorPx: centerPx, size })
    updateRadiusEnd(s, edgePx)
    const el = commitRadius(s, size)
    expect(el).not.toBeNull()
    const center = screenToGround(1, { x: 0.5, y: 0.5 }, size)!
    const edge = screenToGround(1, { x: 0.62, y: 0.5 }, size)!
    expect(el!.type).toBe('radiusRing')
    expect(el!.center.x).toBeCloseTo(center.x, 6)
    expect(el!.radius).toBeCloseTo(groundDistance(center, edge), 6)
    expect(el!.fill).toBeNull()
  })

  it('returns null for a too-small ring', () => {
    const centerPx = { x: 960, y: 540 }
    const s = startRadius({ version: 1, color: '#fff', strokeWidth: 0.0035, anchorPx: centerPx, size })
    updateRadiusEnd(s, { x: 962, y: 541 })
    expect(commitRadius(s, size)).toBeNull()
  })

  it('commits for PoE2 as well', () => {
    const s = startRadius({ version: 2, color: '#fff', strokeWidth: 0.0035, anchorPx: { x: 100, y: 100 }, size })
    updateRadiusEnd(s, { x: 400, y: 200 })
    const el = commitRadius(s, size)
    expect(el).not.toBeNull()
    expect(el!.type).toBe('radiusRing')
  })
})
