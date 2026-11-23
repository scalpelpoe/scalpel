import { expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ bounds: vi.fn(), capture: vi.fn() }))
vi.mock('electron-overlay-window', () => ({ OVERLAY_WINDOW_OPTS: { transparent: true }, OverlayController: {} }))
vi.mock('electron', () => ({}))
vi.mock('./tracker', () => ({
  attachHyprlandOverlay: vi.fn(),
  focusHyprlandPanel: vi.fn(),
  getHyprlandCursorDip: vi.fn(),
  getHyprlandGameBounds: mock.bounds,
  getHyprlandPointerPhysical: vi.fn(),
  hyprlandInputAllowed: vi.fn(),
  nameHyprlandOverlay: vi.fn(),
  warpHyprlandCursor: vi.fn(),
}))
vi.mock('./capture', () => ({ captureHyprlandGame: mock.capture }))
import { createHyprlandBackend } from './backend'

it('uses the same fractional-scale bounds as the Hyprland main overlay', () => {
  mock.bounds.mockReturnValue({ x: 1920, y: 0, width: 1920, height: 1080 })
  expect(createHyprlandBackend().windowTracker.gameBounds()).toEqual({ x: 1920, y: 0, width: 1920, height: 1080 })
})

it('returns null when Hyprland has no attached game', () => {
  mock.bounds.mockReturnValue(null)
  expect(createHyprlandBackend().windowTracker.gameBounds()).toBeNull()
})

it('advertises a floating overlay before its first map', () => {
  expect(createHyprlandBackend().windowTracker.overlayWindowOptions()).toEqual({
    transparent: true,
    type: 'utility',
    title: 'Scalpel Overlay',
  })
})

it('captures through the compositor, keeping the caller options', async () => {
  await createHyprlandBackend().capture.captureGame({ skipFocusGate: true })
  expect(mock.capture).toHaveBeenCalledWith({ skipFocusGate: true })
})
