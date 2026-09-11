import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  hyprland: true,
  allowed: true,
  bounds: vi.fn(),
  cursor: vi.fn(),
  electronCursor: vi.fn(),
  focus: vi.fn(),
  focusGame: vi.fn(),
  warp: vi.fn(),
  windowsWarp: vi.fn(),
  capture: vi.fn(),
  electronCapture: vi.fn(),
}))
vi.mock('../hyprland', () => ({
  hyprlandOverlayActive: () => mock.hyprland,
  hyprlandInputAllowed: () => mock.allowed,
  getHyprlandGameBounds: mock.bounds,
  getHyprlandCursorDip: mock.cursor,
  focusHyprlandPanel: mock.focus,
  warpHyprlandCursor: mock.warp,
}))
vi.mock('electron', () => ({ screen: { getCursorScreenPoint: mock.electronCursor } }))
vi.mock('electron-overlay-window', () => ({ OverlayController: { focusTarget: mock.focusGame } }))
vi.mock('../screen-capture/hyprland-capture', () => ({ captureHyprlandGame: mock.capture }))
vi.mock('./electron-capture', () => ({ captureElectronGame: mock.electronCapture }))
vi.mock('./windows-pointer', () => ({ warpWindowsCursorTo: mock.windowsWarp }))
import { desktop } from './index'
const window = () =>
  ({
    isDestroyed: () => false,
    isVisible: () => true,
    isFocused: () => true,
    focus: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
  }) as unknown as Electron.BrowserWindow
beforeEach(() => {
  vi.clearAllMocks()
  mock.hyprland = true
  mock.allowed = true
})
it('routes geometry, pointer reads, capture and cursor restore to the selected backend', async () => {
  mock.bounds.mockReturnValue({ x: 100, y: 200, width: 1920, height: 1080 })
  mock.cursor.mockReturnValue({ x: 150, y: 250 })
  mock.capture.mockResolvedValue({ frame: null, failure: 'focus' })
  expect(desktop.getGameBounds()?.x).toBe(100)
  expect(desktop.getCursorScreenPoint()).toEqual({ x: 150, y: 250 })
  desktop.warpCursorTo({ x: 150, y: 250 })
  expect(mock.warp).toHaveBeenCalledWith({ x: 150, y: 250 })
  expect(await desktop.captureGame()).toEqual({ frame: null, failure: 'focus' })
  expect(mock.electronCursor).not.toHaveBeenCalled()
  expect(mock.electronCapture).not.toHaveBeenCalled()
  expect(mock.windowsWarp).not.toHaveBeenCalled()
})
it('keeps the existing Electron capture and Windows warp path on other desktops', async () => {
  mock.hyprland = false
  mock.electronCursor.mockReturnValue({ x: 25, y: 50 })
  expect(desktop.getCursorScreenPoint()).toEqual({ x: 25, y: 50 })
  desktop.warpCursorTo({ x: 25, y: 50 })
  await desktop.captureGame({ skipFocusGate: true })
  expect(mock.windowsWarp).toHaveBeenCalledWith({ x: 25, y: 50 })
  expect(mock.electronCapture).toHaveBeenCalledWith({ skipFocusGate: true })
})
it('claims focus for dialogs but leaves normal panels and passthrough annotations distinct', () => {
  const win = window()
  desktop.applyInteraction(win, 'dialog')
  expect(mock.focus).toHaveBeenCalledWith(win)
  desktop.applyInteraction(win, 'panel')
  expect(mock.focus).toHaveBeenCalledTimes(1)
  desktop.applyInteraction(win, 'passthrough')
  expect(mock.focusGame).toHaveBeenCalledOnce()
  expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true })
})
it('never reclaims focus from another application on dialog dismissal', () => {
  mock.allowed = false
  desktop.releaseOverlay(window())
  expect(mock.focusGame).not.toHaveBeenCalled()
})
it('rejects invalid warp targets', () => {
  desktop.warpCursorTo({ x: Infinity, y: 0 })
  expect(mock.warp).not.toHaveBeenCalled()
})
