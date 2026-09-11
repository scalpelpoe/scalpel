import { afterEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ active: vi.fn(), bounds: vi.fn(), point: vi.fn(), display: vi.fn() }))
vi.mock('../hyprland', () => ({ hyprlandOverlayActive: mock.active, getHyprlandGameBounds: mock.bounds }))
vi.mock('electron-overlay-window', () => ({
  OverlayController: { targetBounds: { x: 3840, y: 0, width: 3840, height: 2160 } },
}))
// Deliberately no screenToDipRect: Electron does not expose it on Linux.
vi.mock('electron', () => ({ screen: { screenToDipPoint: mock.point, getDisplayNearestPoint: mock.display } }))
import { gameDipBounds } from './geometry'
afterEach(() => vi.unstubAllGlobals())
it('uses the same fractional-scale bounds as the Hyprland main overlay', () => {
  mock.active.mockReturnValue(true)
  mock.bounds.mockReturnValue({ x: 1920, y: 0, width: 1920, height: 1080 })
  expect(gameDipBounds(null)).toEqual({ x: 1920, y: 0, width: 1920, height: 1080 })
})
it('returns null when Hyprland has no attached game', () => {
  mock.active.mockReturnValue(true)
  mock.bounds.mockReturnValue(null)
  expect(gameDipBounds(null)).toBeNull()
})
it('converts an X11 rectangle without a Windows-only API', () => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  mock.active.mockReturnValue(false)
  mock.point.mockReturnValue({ x: 1920, y: 0 })
  mock.display.mockReturnValue({ scaleFactor: 2 })
  expect(gameDipBounds(null)).toEqual({ x: 1920, y: 0, width: 1920, height: 1080 })
})
