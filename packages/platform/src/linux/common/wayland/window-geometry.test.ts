import { describe, expect, it } from 'vitest'
import type { WaylandOutput } from 'electron-overlay-window/dist/wayland/host'
import { mapX11BoundsToLogical } from './window-geometry'

const output: WaylandOutput = {
  name: 'DP-1',
  description: 'Test output',
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  scale: 2,
}

describe('mapX11BoundsToLogical', () => {
  it('snaps a fullscreen XWayland window to the output rectangle', () => {
    expect(mapX11BoundsToLogical({ x: 0, y: 0, width: 3840, height: 2160 }, [output])).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    })
  })

  it('converts physical windowed bounds into logical DIP', () => {
    expect(mapX11BoundsToLogical({ x: 1000, y: 1000, width: 800, height: 600 }, [output])).toEqual({
      x: 500,
      y: 500,
      width: 400,
      height: 300,
    })
  })

  it('keeps logical windowed bounds unchanged', () => {
    expect(mapX11BoundsToLogical({ x: 100, y: 100, width: 400, height: 300 }, [output])).toEqual({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    })
  })

  it('falls back to rounded bounds without outputs', () => {
    expect(mapX11BoundsToLogical({ x: 10.4, y: 20.6, width: 300.2, height: 200.5 }, [])).toEqual({
      x: 10,
      y: 21,
      width: 300,
      height: 201,
    })
  })
})
