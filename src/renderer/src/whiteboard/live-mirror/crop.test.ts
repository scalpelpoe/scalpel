import { describe, it, expect } from 'vitest'
import { mirrorCss } from './crop'

describe('mirrorCss', () => {
  it('scales the video so the source region fills the dest box', () => {
    const source = { x: 0, y: 0, w: 0.5, h: 0.25 }
    const destPx = { x: 100, y: 200, w: 400, h: 300 }
    const css = mirrorCss(destPx, source)
    expect(css.container).toEqual({ left: 100, top: 200, width: 400, height: 300 })
    expect(css.video.width).toBeCloseTo(800)
    expect(css.video.height).toBeCloseTo(1200)
    expect(css.video.translateX).toBeCloseTo(0)
    expect(css.video.translateY).toBeCloseTo(0)
  })

  it('translates the video to align an offset source region', () => {
    const source = { x: 0.25, y: 0.5, w: 0.25, h: 0.25 }
    const destPx = { x: 0, y: 0, w: 200, h: 200 }
    const css = mirrorCss(destPx, source)
    expect(css.video.width).toBeCloseTo(800)
    expect(css.video.translateX).toBeCloseTo(-200)
    expect(css.video.height).toBeCloseTo(800)
    expect(css.video.translateY).toBeCloseTo(-400)
  })

  it('clamps a degenerate source to avoid divide-by-zero', () => {
    const css = mirrorCss({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 0, h: 0 })
    expect(Number.isFinite(css.video.width)).toBe(true)
    expect(Number.isFinite(css.video.height)).toBe(true)
  })

  it('reduces to the no-frame result when the frame equals the client (borderless)', () => {
    const source = { x: 0.25, y: 0.5, w: 0.25, h: 0.25 }
    const destPx = { x: 0, y: 0, w: 200, h: 200 }
    const frame = { frameW: 1681, frameH: 892, clientW: 1681, clientH: 892 }
    const a = mirrorCss(destPx, source, frame)
    const b = mirrorCss(destPx, source)
    expect(a.video.width).toBeCloseTo(b.video.width)
    expect(a.video.height).toBeCloseTo(b.video.height)
    expect(a.video.translateX).toBeCloseTo(b.video.translateX)
    expect(a.video.translateY).toBeCloseTo(b.video.translateY)
  })

  it('corrects for window chrome so the client origin maps to the window origin', () => {
    // 1px total horizontal chrome (0.5px each side), 32px vertical (31.5px title bar).
    const frame = { frameW: 1682, frameH: 924, clientW: 1681, clientH: 892 }
    const source = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }
    // In-place mirror: dest = source mapped onto the client CSS size (1681x892).
    const destPx = { x: 0.5 * 1681, y: 0.5 * 892, w: 0.1 * 1681, h: 0.1 * 892 }
    const css = mirrorCss(destPx, source, frame)
    expect(css.video.width).toBeCloseTo(1682, 0)
    expect(css.video.height).toBeCloseTo(924, 0)
    // Client top-left (frame px 0.5, 31.5) must render at window (0,0):
    //   windowPos = container.{left|top} + translate + framePxOffset * (videoSize / frameSize)
    const cssPerFrameX = css.video.width / frame.frameW
    const cssPerFrameY = css.video.height / frame.frameH
    const clientOriginX = css.container.left + css.video.translateX + 0.5 * cssPerFrameX
    const clientOriginY = css.container.top + css.video.translateY + (frame.frameH - frame.clientH - 0.5) * cssPerFrameY
    expect(clientOriginX).toBeCloseTo(0, 1)
    expect(clientOriginY).toBeCloseTo(0, 1)
  })
})
