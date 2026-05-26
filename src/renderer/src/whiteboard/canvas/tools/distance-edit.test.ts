import { describe, expect, it } from 'vitest'
import type { RadiusRingElement, RulerElement } from '../../../../../shared/whiteboard-types'
import { groundToScreen, screenToGround } from '../poe-projection'
import { applyRingEdit, applyRulerEdit } from './distance-edit'

const size = { w: 1920, h: 1080 }

const baseRing: RadiusRingElement = {
  id: 'r',
  z: 0,
  rotation: 0,
  type: 'radiusRing',
  center: { x: 0, y: 0 },
  radius: 10,
  stroke: '#fff',
  strokeWidth: 0.0035,
  fill: null,
}
const baseRuler: RulerElement = {
  id: 'u',
  z: 0,
  rotation: 0,
  type: 'ruler',
  a: { x: 0, y: 0 },
  b: { x: 20, y: 10 },
  stroke: '#fff',
  strokeWidth: 0.0035,
}

describe('applyRingEdit', () => {
  it('ring-radius sets radius to the ground distance from center', () => {
    const center = screenToGround(1, { x: 0.5, y: 0.5 }, size)!
    const cursor = groundToScreen(1, { x: center.x + 30, y: center.y }, size)!
    const next = applyRingEdit({ ...baseRing, center, radius: 10 }, { kind: 'ring-radius' }, cursor, size, 1)
    expect(next.radius).toBeCloseTo(30, 3)
  })

  it('ring-radius clamps to a minimum', () => {
    const center = screenToGround(1, { x: 0.5, y: 0.5 }, size)!
    const cursor = groundToScreen(1, center, size)!
    const next = applyRingEdit({ ...baseRing, center, radius: 40 }, { kind: 'ring-radius' }, cursor, size, 1)
    expect(next.radius).toBeGreaterThanOrEqual(1)
  })

  it('ring-move translates the center by the cursor ground delta (from start, no drift)', () => {
    const center = screenToGround(1, { x: 0.5, y: 0.5 }, size)!
    const target = { x: center.x + 20, y: center.y - 15 }
    const cursor = groundToScreen(1, target, size)!
    const next = applyRingEdit(
      { ...baseRing, center, radius: 25 },
      { kind: 'ring-move', grabGround: center, startCenter: center },
      cursor,
      size,
      1,
    )
    expect(next.center.x).toBeCloseTo(center.x + 20, 3)
    expect(next.center.y).toBeCloseTo(center.y - 15, 3)
    expect(next.radius).toBe(25)
  })

  it('is a no-op when version is null', () => {
    const next = applyRingEdit(baseRing, { kind: 'ring-radius' }, { x: 0.6, y: 0.5 }, size, null)
    expect(next).toEqual(baseRing)
  })
})

describe('applyRulerEdit', () => {
  it('ruler-a moves endpoint a to the cursor ground point', () => {
    const target = screenToGround(1, { x: 0.4, y: 0.45 }, size)!
    const cursor = groundToScreen(1, target, size)!
    const next = applyRulerEdit(baseRuler, { kind: 'ruler-a' }, cursor, size, 1)
    expect(next.a.x).toBeCloseTo(target.x, 3)
    expect(next.a.y).toBeCloseTo(target.y, 3)
    expect(next.b).toEqual(baseRuler.b)
  })

  it('ruler-move translates both endpoints by the cursor ground delta', () => {
    const grab = screenToGround(1, { x: 0.5, y: 0.5 }, size)!
    const cursor = groundToScreen(1, { x: grab.x + 12, y: grab.y + 8 }, size)!
    const next = applyRulerEdit(
      baseRuler,
      { kind: 'ruler-move', grabGround: grab, startA: baseRuler.a, startB: baseRuler.b },
      cursor,
      size,
      1,
    )
    expect(next.a.x).toBeCloseTo(baseRuler.a.x + 12, 3)
    expect(next.b.y).toBeCloseTo(baseRuler.b.y + 8, 3)
  })
})
