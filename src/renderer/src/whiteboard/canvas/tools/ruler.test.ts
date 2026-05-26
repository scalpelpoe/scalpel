import { describe, expect, it } from 'vitest'
import { commitRuler, startRuler, updateRulerEnd } from './ruler'
import { screenToGround } from '../poe-projection'

const size = { w: 1920, h: 1080 }

describe('ruler session', () => {
  it('commits world coords matching screenToGround of the endpoints', () => {
    const anchorPx = { x: 0.4 * size.w, y: 0.45 * size.h }
    const cursorPx = { x: 0.65 * size.w, y: 0.6 * size.h }
    const s = startRuler({ version: 1, color: '#fff', strokeWidth: 0.0035, anchorPx, size })
    updateRulerEnd(s, cursorPx)
    const el = commitRuler(s, size)
    expect(el).not.toBeNull()
    const a = screenToGround(1, { x: anchorPx.x / size.w, y: anchorPx.y / size.h }, size)!
    const b = screenToGround(1, { x: cursorPx.x / size.w, y: cursorPx.y / size.h }, size)!
    expect(el!.type).toBe('ruler')
    expect(el!.a.x).toBeCloseTo(a.x, 6)
    expect(el!.b.y).toBeCloseTo(b.y, 6)
  })

  it('returns null for a too-short drag', () => {
    const anchorPx = { x: 960, y: 540 }
    const s = startRuler({ version: 1, color: '#fff', strokeWidth: 0.0035, anchorPx, size })
    updateRulerEnd(s, { x: 962, y: 541 })
    expect(commitRuler(s, size)).toBeNull()
  })

  it('commits for PoE2 as well', () => {
    const s = startRuler({ version: 2, color: '#fff', strokeWidth: 0.0035, anchorPx: { x: 100, y: 100 }, size })
    updateRulerEnd(s, { x: 400, y: 400 })
    const el = commitRuler(s, size)
    expect(el).not.toBeNull()
    expect(el!.type).toBe('ruler')
  })
})
