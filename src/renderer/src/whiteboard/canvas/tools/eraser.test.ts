import { describe, it, expect } from 'vitest'
import { applyErase, eraseStroke, strokeIntersects } from './eraser'
import type { StrokeElement } from '@shared/whiteboard-types'

const stroke = (points: Array<[number, number]>, id = 'a'): StrokeElement => ({
  id,
  z: 0,
  rotation: 0,
  type: 'stroke',
  variant: 'pen',
  points: points.map(([x, y]) => ({ x, y })),
  color: '#000',
  width: 0.005,
})

const SIZE = { w: 1000, h: 1000 }

describe('strokeIntersects', () => {
  it('hits when eraser tip is on a stroke point', () => {
    const s = stroke([[0.5, 0.5]])
    expect(strokeIntersects(s, { x: 500, y: 500 }, 10, SIZE)).toBe(true)
  })

  it('hits when tip is along a segment between two points', () => {
    const s = stroke([
      [0.0, 0.5],
      [1.0, 0.5],
    ])
    expect(strokeIntersects(s, { x: 500, y: 500 }, 10, SIZE)).toBe(true)
  })

  it('misses when tip is far from the stroke', () => {
    const s = stroke([
      [0.0, 0.0],
      [0.1, 0.1],
    ])
    expect(strokeIntersects(s, { x: 800, y: 800 }, 10, SIZE)).toBe(false)
  })

  it('hit radius accounts for stroke width', () => {
    const fat = { ...stroke([[0.5, 0.5]]), width: 0.05 }
    expect(strokeIntersects(fat, { x: 530, y: 500 }, 10, SIZE)).toBe(true)
    expect(strokeIntersects(fat, { x: 560, y: 500 }, 10, SIZE)).toBe(false)
  })

  it('handles single-point strokes', () => {
    const s = stroke([[0.5, 0.5]])
    expect(strokeIntersects(s, { x: 600, y: 500 }, 5, SIZE)).toBe(false)
    expect(strokeIntersects(s, { x: 502, y: 500 }, 5, SIZE)).toBe(true)
  })

  it('returns false for zero-point strokes', () => {
    expect(strokeIntersects(stroke([]), { x: 0, y: 0 }, 10, SIZE)).toBe(false)
  })
})

describe('eraseStroke', () => {
  it('returns null when nothing is hit', () => {
    const s = stroke([
      [0.0, 0.0],
      [0.1, 0.1],
    ])
    expect(eraseStroke(s, { x: 800, y: 800 }, 10, SIZE)).toBeNull()
  })

  it('trims the affected end of a stroke', () => {
    // 5 points along y=0.5; eraser at far-right kills the last point only.
    const s = stroke([
      [0.0, 0.5],
      [0.25, 0.5],
      [0.5, 0.5],
      [0.75, 0.5],
      [1.0, 0.5],
    ])
    const result = eraseStroke(s, { x: 1000, y: 500 }, 10, SIZE)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    expect(result![0].points).toHaveLength(4)
    expect(result![0].id).toBe(s.id)
  })

  it('splits a stroke when the eraser punches a hole in the middle', () => {
    const s = stroke([
      [0.0, 0.5],
      [0.25, 0.5],
      [0.5, 0.5],
      [0.75, 0.5],
      [1.0, 0.5],
    ])
    const result = eraseStroke(s, { x: 500, y: 500 }, 10, SIZE)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    expect(result![0].id).toBe(s.id)
    expect(result![1].id).not.toBe(s.id)
    // First fragment ends with the points to the left of the hit.
    expect(result![0].points.map((p) => p.x)).toEqual([0.0, 0.25])
    expect(result![1].points.map((p) => p.x)).toEqual([0.75, 1.0])
  })

  it('returns an empty array when every point is erased', () => {
    const s = stroke([
      [0.5, 0.5],
      [0.51, 0.5],
    ])
    expect(eraseStroke(s, { x: 505, y: 500 }, 50, SIZE)).toEqual([])
  })

  it('drops orphan single-point fragments from multi-point strokes', () => {
    // 4 points; eraser kills points 1 and 2 (middle), leaving 0 and 3 as
    // singletons. Both should be discarded.
    const s = stroke([
      [0.1, 0.5],
      [0.45, 0.5],
      [0.55, 0.5],
      [0.9, 0.5],
    ])
    const result = eraseStroke(s, { x: 500, y: 500 }, 60, SIZE)
    expect(result).toEqual([])
  })

  it('keeps a single-point stroke that was never multi-point', () => {
    const s = stroke([[0.5, 0.5]])
    // Eraser far away: nothing hit, returns null
    expect(eraseStroke(s, { x: 0, y: 0 }, 10, SIZE)).toBeNull()
    // Eraser close: the only point dies, returns []
    expect(eraseStroke(s, { x: 500, y: 500 }, 10, SIZE)).toEqual([])
  })
})

describe('applyErase', () => {
  it('returns null when no element changed', () => {
    const els = [stroke([[0.0, 0.0]], 'a'), stroke([[1.0, 1.0]], 'b')]
    expect(applyErase(els, { x: 500, y: 500 }, SIZE, 10)).toBeNull()
  })

  it('returns the new elements list when an element is erased', () => {
    const els = [stroke([[0.5, 0.5]], 'a'), stroke([[0.0, 0.0]], 'b')]
    const result = applyErase(els, { x: 500, y: 500 }, SIZE, 10)
    expect(result).not.toBeNull()
    expect(result!.map((e) => e.id)).toEqual(['b'])
  })

  it('preserves element order; replaces erased element with its fragments inline', () => {
    const els = [
      stroke([[0.0, 0.0]], 'a'),
      stroke(
        [
          [0.0, 0.5],
          [0.25, 0.5],
          [0.5, 0.5],
          [0.75, 0.5],
          [1.0, 0.5],
        ],
        'b',
      ),
      stroke([[1.0, 1.0]], 'c'),
    ]
    const result = applyErase(els, { x: 500, y: 500 }, SIZE, 10)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(4)
    expect(result![0].id).toBe('a')
    // The split element's first fragment keeps id 'b'; the second fragment gets a fresh uuid.
    expect(result![1].id).toBe('b')
    expect(result![2].id).not.toBe('b')
    expect(result![3].id).toBe('c')
  })

  it('deletes a hit shape element entirely', () => {
    const els = [
      stroke([[0.0, 0.0]], 'stroke-a'),
      {
        id: 'shape-b',
        z: 0,
        rotation: 0,
        type: 'shape',
        shape: 'rect',
        bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
        stroke: '#000',
        strokeWidth: 0.0035,
        fill: null,
      } as const,
    ]
    // Eraser tip at the center of the shape's bbox (0.5, 0.5) -> (500, 500) px.
    const result = applyErase(els, { x: 500, y: 500 }, SIZE, 10)
    expect(result).not.toBeNull()
    expect(result!.map((e) => e.id)).toEqual(['stroke-a'])
  })

  it('deletes a hit text element entirely', () => {
    const els = [
      stroke([[0.0, 0.0]], 'stroke-a'),
      {
        id: 'text-b',
        z: 0,
        rotation: 0,
        type: 'text',
        bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.05 },
        text: 'hi',
        color: '#fff',
        fontSize: 0.025,
        fontWeight: 600,
      } as const,
    ]
    const result = applyErase(els, { x: 500, y: 425 }, SIZE, 10)
    expect(result).not.toBeNull()
    expect(result!.map((e) => e.id)).toEqual(['stroke-a'])
  })

  it('does not affect a shape outside the eraser radius', () => {
    const els = [
      {
        id: 'shape-far',
        z: 0,
        rotation: 0,
        type: 'shape',
        shape: 'rect',
        bbox: { x: 0.0, y: 0.0, w: 0.05, h: 0.05 },
        stroke: '#000',
        strokeWidth: 0.0035,
        fill: null,
      } as const,
    ]
    expect(applyErase(els, { x: 500, y: 500 }, SIZE, 10)).toBeNull()
  })
})
