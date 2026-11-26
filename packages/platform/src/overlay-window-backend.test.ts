import type { BrowserWindow } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import { __resetLinuxGameDisplayModeForTests, getLinuxGameDisplayModeStatus } from './linux/common/game-display-mode'

const mock = vi.hoisted(() => ({
  display: vi.fn(),
  rect: vi.fn(),
  link: vi.fn(),
  capture: vi.fn(),
  on: vi.fn(),
}))
vi.mock('electron-overlay-window', () => ({
  OVERLAY_WINDOW_OPTS: { transparent: true },
  OverlayController: {
    targetBounds: { x: 3840, y: 0, width: 3840, height: 2160 },
    events: { on: mock.on },
  },
}))
// X11 computes DIP from the display scale factor; Windows uses Electron's API.
vi.mock('electron', () => ({
  screen: { getDisplayNearestPoint: mock.display, screenToDipRect: mock.rect },
}))
vi.mock('./linux/common/x11-xwayland/transient', () => ({ linkX11Transient: mock.link }))
vi.mock('./common/electron-capture', () => ({ captureElectronGame: mock.capture }))
import { createOverlayWindowBackend } from './overlay-window-backend'

const handle = Buffer.from([1, 0, 0, 0])
const win = { getNativeWindowHandle: () => handle } as unknown as BrowserWindow

beforeEach(() => {
  vi.clearAllMocks()
  __resetLinuxGameDisplayModeForTests()
})

it('converts an X11 rectangle without a Windows-only API', () => {
  mock.display.mockReturnValue({ scaleFactor: 2 })
  expect(createOverlayWindowBackend('x11').windowTracker.gameBounds()).toEqual({
    x: 1920,
    y: 0,
    width: 1920,
    height: 1080,
  })
  expect(mock.display).toHaveBeenLastCalledWith({ x: 3840, y: 0 })
})

it('preserves unscaled Linux bounds without DIP conversion APIs', () => {
  mock.display.mockReturnValue({ scaleFactor: 1 })
  expect(createOverlayWindowBackend('x11').windowTracker.gameBounds()).toEqual({
    x: 3840,
    y: 0,
    width: 3840,
    height: 2160,
  })
})

it('uses Electron conversion on Windows instead of the X11 scale factor', () => {
  mock.rect.mockReturnValue({ x: 3840, y: 0, width: 1920, height: 1080 })
  expect(createOverlayWindowBackend('windows').windowTracker.gameBounds()).toEqual({
    x: 3840,
    y: 0,
    width: 1920,
    height: 1080,
  })
  expect(mock.rect).toHaveBeenCalledWith(null, { x: 3840, y: 0, width: 3840, height: 2160 })
})

it('links an X11 overlay to the current game but no other native overlay', () => {
  createOverlayWindowBackend('x11').windowTracker.beforeOverlayShow(win, 'Path of Exile 2')
  expect(mock.link).toHaveBeenCalledWith(handle, 'Path of Exile 2')
  mock.link.mockClear()
  createOverlayWindowBackend('windows').windowTracker.beforeOverlayShow(win, 'Path of Exile 2')
  expect(mock.link).not.toHaveBeenCalled()
})

it('keeps the overlay usable when native binding fails', () => {
  mock.link.mockImplementation(() => {
    throw new Error('libxcb unavailable')
  })
  expect(() => createOverlayWindowBackend('x11').windowTracker.beforeOverlayShow(win, 'Path of Exile 2')).not.toThrow()
})

it('leaves overlay window options to the native tracker', () => {
  expect(createOverlayWindowBackend('x11').windowTracker.overlayWindowOptions()).toEqual({ transparent: true })
})

it('captures through Electron, keeping the caller options', async () => {
  await createOverlayWindowBackend('windows').capture.captureGame({ skipFocusGate: true })
  expect(mock.capture).toHaveBeenCalledWith(
    { skipFocusGate: true },
    expect.objectContaining({ point: expect.any(Function) }),
  )
})

it('reports the X11 game mode on attach only for the native X11 backend', () => {
  createOverlayWindowBackend('x11')
  const attach = mock.on.mock.calls.find(([event]) => event === 'attach')?.[1] as (() => void) | undefined
  expect(typeof attach).toBe('function')
  attach?.()
  expect(getLinuxGameDisplayModeStatus()).toMatchObject({ detected: 'x11', source: 'x11-geometry' })

  __resetLinuxGameDisplayModeForTests()
  mock.on.mockClear()
  createOverlayWindowBackend('windows')
  expect(mock.on).not.toHaveBeenCalled()
})
