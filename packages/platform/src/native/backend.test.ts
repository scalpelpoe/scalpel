import type { BrowserWindow } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ display: vi.fn(), link: vi.fn() }))
vi.mock('electron-overlay-window', () => ({
  OVERLAY_WINDOW_OPTS: { transparent: true },
  OverlayController: { targetBounds: { x: 3840, y: 0, width: 3840, height: 2160 } },
}))
// Electron 32 exposes neither point nor rectangle DIP conversion on Linux.
vi.mock('electron', () => ({ screen: { getDisplayNearestPoint: mock.display } }))
vi.mock('./x11-transient', () => ({ linkX11Transient: mock.link }))
import { createNativeBackend } from './backend'

const handle = Buffer.from([1, 0, 0, 0])
const win = { getNativeWindowHandle: () => handle } as unknown as BrowserWindow

beforeEach(() => vi.clearAllMocks())

it('converts an X11 rectangle without a Windows-only API', () => {
  mock.display.mockReturnValue({ scaleFactor: 2 })
  expect(createNativeBackend('x11').windowTracker.gameBounds()).toEqual({ x: 1920, y: 0, width: 1920, height: 1080 })
  expect(mock.display).toHaveBeenLastCalledWith({ x: 3840, y: 0 })
})

it('preserves unscaled Linux bounds without DIP conversion APIs', () => {
  mock.display.mockReturnValue({ scaleFactor: 1 })
  expect(createNativeBackend('x11').windowTracker.gameBounds()).toEqual({ x: 3840, y: 0, width: 3840, height: 2160 })
})

it('links an X11 overlay to the current game but no other native overlay', () => {
  createNativeBackend('x11').windowTracker.beforeOverlayShow(win, 'Path of Exile 2')
  expect(mock.link).toHaveBeenCalledWith(handle, 'Path of Exile 2')
  mock.link.mockClear()
  createNativeBackend('windows').windowTracker.beforeOverlayShow(win, 'Path of Exile 2')
  expect(mock.link).not.toHaveBeenCalled()
})

it('keeps the overlay usable when native binding fails', () => {
  mock.link.mockImplementation(() => {
    throw new Error('libxcb unavailable')
  })
  expect(() => createNativeBackend('x11').windowTracker.beforeOverlayShow(win, 'Path of Exile 2')).not.toThrow()
})

it('leaves overlay window options to the native tracker', () => {
  expect(createNativeBackend('x11').windowTracker.overlayWindowOptions()).toEqual({ transparent: true })
})
