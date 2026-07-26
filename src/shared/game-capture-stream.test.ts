import { describe, expect, it } from 'vitest'
import { clientFrameGeometry, normalizeGameRect } from './game-capture-stream'

describe('clientFrameGeometry', () => {
  it('converts a high-DPI borderless stream into logical game coordinates', () => {
    expect(clientFrameGeometry({ width: 3840, height: 2160 }, { width: 1920, height: 1080 }, 2)).toEqual({
      offsetX: 0,
      offsetY: 0,
      clientWidth: 3840,
      clientHeight: 2160,
      scaleX: 2,
      scaleY: 2,
    })
  })

  it('accounts for a decorated window around the client', () => {
    expect(clientFrameGeometry({ width: 3864, height: 2210 }, { width: 1920, height: 1080 }, 2)).toEqual({
      offsetX: 12,
      offsetY: 38,
      clientWidth: 3840,
      clientHeight: 2160,
      scaleX: 2,
      scaleY: 2,
    })
  })

  it('falls back proportionally for a downscaled source', () => {
    expect(clientFrameGeometry({ width: 1280, height: 720 }, { width: 1920, height: 1080 }, 2)).toEqual({
      offsetX: 0,
      offsetY: 0,
      clientWidth: 1280,
      clientHeight: 720,
      scaleX: 2 / 3,
      scaleY: 2 / 3,
    })
  })
})

describe('normalizeGameRect', () => {
  it('rounds and clamps a requested region to the logical game client', () => {
    expect(normalizeGameRect({ x: -4, y: 147.6, width: 2500, height: 544.7 }, { width: 1920, height: 1080 })).toEqual({
      x: 0,
      y: 148,
      width: 1920,
      height: 545,
    })
  })
})
