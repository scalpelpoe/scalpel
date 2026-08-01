import { describe, expect, it } from 'vitest'
import { clampRectToScreen, restoreTargetRect } from './cheat-sheet-window'

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 }

describe('clampRectToScreen', () => {
  it('leaves an already on-screen rect unchanged', () => {
    const r = { x: 100, y: 100, width: 460, height: 270 }
    expect(clampRectToScreen(r, SCREEN)).toEqual(r)
  })

  it('pulls a rect back from past the right and bottom edges', () => {
    const r = { x: 1800, y: 1000, width: 460, height: 270 }
    expect(clampRectToScreen(r, SCREEN)).toEqual({ x: 1460, y: 810, width: 460, height: 270 })
  })

  it('pulls a rect back from past the top and left edges', () => {
    const r = { x: -200, y: -150, width: 460, height: 270 }
    expect(clampRectToScreen(r, SCREEN)).toEqual({ x: 0, y: 0, width: 460, height: 270 })
  })

  it('caps a rect larger than the screen and anchors it to the origin', () => {
    const r = { x: -50, y: -50, width: 4000, height: 3000 }
    expect(clampRectToScreen(r, SCREEN)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('respects a non-zero screen origin (secondary monitor)', () => {
    const screen = { x: 1920, y: 0, width: 1920, height: 1080 }
    const r = { x: 1900, y: 900, width: 460, height: 270 }
    expect(clampRectToScreen(r, screen)).toEqual({ x: 1920, y: 810, width: 460, height: 270 })
  })
})

describe('restoreTargetRect', () => {
  it('round-trips an unmoved strip back to the exact pre-minimize rect', () => {
    const preMinimize = { x: 760, y: 564, width: 460, height: 270 }
    const strip = {
      x: preMinimize.x + preMinimize.width - 220,
      y: preMinimize.y + preMinimize.height - 34,
      width: 220,
      height: 34,
    }
    expect(restoreTargetRect(strip, { width: 460, height: 270 }, SCREEN)).toEqual(preMinimize)
  })

  it('grows from the strip current position after it was dragged, preserving the bottom-right corner', () => {
    const strip = { x: 1000, y: 800, width: 220, height: 34 }
    expect(restoreTargetRect(strip, { width: 460, height: 270 }, SCREEN)).toEqual({
      x: 760,
      y: 564,
      width: 460,
      height: 270,
    })
  })

  it('clamps a strip parked near the top edge so the header stays on-screen', () => {
    const strip = { x: 500, y: 10, width: 220, height: 34 }
    expect(restoreTargetRect(strip, { width: 460, height: 270 }, SCREEN)).toEqual({
      x: 260,
      y: 0,
      width: 460,
      height: 270,
    })
  })

  it('clamps a strip parked near the left edge so the header stays on-screen', () => {
    const strip = { x: 5, y: 800, width: 220, height: 34 }
    expect(restoreTargetRect(strip, { width: 460, height: 270 }, SCREEN)).toEqual({
      x: 0,
      y: 564,
      width: 460,
      height: 270,
    })
  })

  it('caps a size larger than the display and anchors it to the origin', () => {
    const strip = { x: 1800, y: 1000, width: 220, height: 34 }
    expect(restoreTargetRect(strip, { width: 4000, height: 3000 }, SCREEN)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    })
  })
})
