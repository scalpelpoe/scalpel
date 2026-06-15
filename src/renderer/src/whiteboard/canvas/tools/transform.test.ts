import { describe, it, expect } from 'vitest'
import { bakeStrokeFromTransformResult, bakeShapeFromTransformResult, bakeTextFromTransformResult } from './transform'
import type { StrokeElement, ShapeElement, TextElement } from '@shared/whiteboard-types'

const SIZE = { w: 1000, h: 1000 }

const stroke: StrokeElement = {
  id: 'a',
  z: 0,
  rotation: 0,
  type: 'stroke',
  variant: 'pen',
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.4 },
  ],
  color: '#ff0000',
  width: 0.005,
}

const shape: ShapeElement = {
  id: 'b',
  z: 0,
  rotation: 0,
  type: 'shape',
  shape: 'rect',
  bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
  stroke: '#00ff00',
  strokeWidth: 0.0035,
  fill: null,
}

const lineShape: ShapeElement = {
  id: 'd',
  z: 0,
  rotation: 0,
  type: 'shape',
  shape: 'line',
  // Signed bbox: line from anchor (500, 300) heading up-left to (400, 200) in pixel space.
  bbox: { x: 0.5, y: 0.3, w: -0.1, h: -0.1 },
  stroke: '#00ff00',
  strokeWidth: 0.0035,
  fill: null,
}

const text: TextElement = {
  id: 'c',
  z: 0,
  rotation: 0,
  type: 'text',
  bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
  text: 'hello',
  color: '#ffffff',
  fontSize: 0.025,
  fontWeight: 600,
}

describe('bakeStrokeFromTransformResult', () => {
  it('writes the new pixel points back as normalized coords', () => {
    const next = bakeStrokeFromTransformResult(stroke, { pointsPx: [200, 400, 600, 800] }, SIZE)
    expect(next.points).toEqual([
      { x: 0.2, y: 0.4 },
      { x: 0.6, y: 0.8 },
    ])
    expect(next.width).toBe(stroke.width)
  })

  it('width stays constant across scaling', () => {
    const next = bakeStrokeFromTransformResult(stroke, { pointsPx: [100, 100, 200, 200] }, SIZE)
    expect(next.width).toBe(stroke.width)
  })
})

describe('bakeShapeFromTransformResult', () => {
  it('pure rotation preserves bbox dimensions and updates rotation', () => {
    // Original rect: bbox (100, 100, 200, 200) in pixels, center (200, 200).
    // Transformer rotates 1 rad around center: positionPx stays at (200, 200), scales = 1.
    const next = bakeShapeFromTransformResult(
      shape,
      { positionPx: { x: 200, y: 200 }, scaleX: 1, scaleY: 1, rotationRad: 1 },
      SIZE,
    )
    expect(next.bbox).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
    expect(next.rotation).toBe(1)
    expect(next.strokeWidth).toBeCloseTo(shape.strokeWidth)
  })

  it('pure scale rebuilds bbox around the new center', () => {
    const next = bakeShapeFromTransformResult(
      shape,
      { positionPx: { x: 200, y: 200 }, scaleX: 2, scaleY: 2, rotationRad: 0 },
      SIZE,
    )
    // 200x200 -> 400x400, centered at (200, 200): top-left becomes (0, 0).
    expect(next.bbox).toEqual({ x: 0, y: 0, w: 0.4, h: 0.4 })
    expect(next.rotation).toBe(0)
  })

  it('strokeWidth stays constant across scaling (visual stays at the stored pixel width)', () => {
    const next = bakeShapeFromTransformResult(
      shape,
      { positionPx: { x: 200, y: 200 }, scaleX: 10, scaleY: 0.1, rotationRad: 0 },
      SIZE,
    )
    expect(next.strokeWidth).toBe(shape.strokeWidth)
  })

  it('preserves signed bbox for line/arrow direction across scaling', () => {
    // Signed bbox: w=-100, h=-100 (line pointing up-left). Center at (450, 250).
    // Scale 2x around center.
    const next = bakeShapeFromTransformResult(
      lineShape,
      { positionPx: { x: 450, y: 250 }, scaleX: 2, scaleY: 2, rotationRad: 0 },
      SIZE,
    )
    // After 2x scale: w=-200, h=-200, x = center.x - w/2 = 450 - (-200)/2 = 550.
    expect(next.bbox.w).toBeCloseTo(-0.2)
    expect(next.bbox.h).toBeCloseTo(-0.2)
    expect(next.bbox.x).toBeCloseTo(0.55)
    expect(next.bbox.y).toBeCloseTo(0.35)
  })

  it('ignores scale sign (flipping shapes is not supported in MVP)', () => {
    const next = bakeShapeFromTransformResult(
      shape,
      { positionPx: { x: 200, y: 200 }, scaleX: -2, scaleY: 2, rotationRad: 0 },
      SIZE,
    )
    expect(next.bbox.w).toBeCloseTo(0.4)
  })
})

describe('bakeTextFromTransformResult', () => {
  it('uses positionPx as the new top-left and scales bbox + fontSize', () => {
    const next = bakeTextFromTransformResult(
      text,
      { positionPx: { x: 200, y: 300 }, scaleX: 1.5, scaleY: 1.5, rotationRad: 0 },
      SIZE,
    )
    expect(next.bbox.x).toBeCloseTo(0.2)
    expect(next.bbox.y).toBeCloseTo(0.3)
    expect(next.bbox.w).toBeCloseTo(0.3)
    expect(next.bbox.h).toBeCloseTo(0.075)
    expect(next.fontSize).toBeCloseTo(text.fontSize * 1.5)
    expect(next.rotation).toBe(0)
  })
})
