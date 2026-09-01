import { afterEach, describe, expect, it, vi } from 'vitest'

const screenToDipRect = vi.fn((_win: unknown, rect: { x: number; y: number; width: number; height: number }) => ({
  x: Math.round(rect.x / 2),
  y: Math.round(rect.y / 2),
  width: Math.round(rect.width / 2),
  height: Math.round(rect.height / 2),
}))

vi.mock('electron', () => ({
  screen: { screenToDipRect },
}))

describe('toDipRect', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses screenToDipRect on Windows', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const { toDipRect } = await import('./dip-rect')
    expect(toDipRect(null, { x: 100, y: 200, width: 800, height: 600 })).toEqual({
      x: 50,
      y: 100,
      width: 400,
      height: 300,
    })
    expect(screenToDipRect).toHaveBeenCalled()
  })

  it('returns the rect unchanged on Linux (no screenToDipRect call)', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' })
    vi.resetModules()
    const { toDipRect } = await import('./dip-rect')
    const rect = { x: 100, y: 200, width: 800, height: 600 }
    expect(toDipRect(null, rect)).toEqual(rect)
    expect(screenToDipRect).not.toHaveBeenCalled()
  })
})
