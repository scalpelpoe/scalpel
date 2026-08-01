import { describe, it, expect } from 'vitest'
import { startMirror, updateMirrorEnd, commitMirror } from './mirror'

const SIZE = { w: 1000, h: 500 }

describe('commitMirror', () => {
  it('returns a liveMirror with equal normalized source and dest from the drag rect', () => {
    const s = startMirror({ anchorPx: { x: 100, y: 50 } })
    updateMirrorEnd(s, { x: 300, y: 150 })
    const el = commitMirror(s, SIZE)
    expect(el).not.toBeNull()
    if (!el) return
    expect(el.type).toBe('liveMirror')
    expect(el.source).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
    expect(el.bbox).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
  })

  it('returns null for a sub-threshold drag', () => {
    const s = startMirror({ anchorPx: { x: 10, y: 10 } })
    updateMirrorEnd(s, { x: 12, y: 12 })
    expect(commitMirror(s, SIZE)).toBeNull()
  })
})
