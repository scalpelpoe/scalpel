import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  allowed: true,
  focusOverlay: vi.fn(),
  focusTarget: vi.fn(),
  warpTo: vi.fn(),
  screenPoint: vi.fn(),
}))
vi.mock('@scalpel/platform', () => ({
  platform: () => ({
    cursor: { screenPoint: mock.screenPoint, warpTo: mock.warpTo },
    windowTracker: {
      focusOverlay: mock.focusOverlay,
      focusTarget: mock.focusTarget,
      inputAllowed: () => mock.allowed,
    },
  }),
}))
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
  mock.allowed = true
})
it('claims focus for dialogs but leaves normal panels and passthrough annotations distinct', () => {
  const win = window()
  desktop.applyInteraction(win, 'dialog')
  expect(mock.focusOverlay).toHaveBeenCalledWith(win)
  desktop.applyInteraction(win, 'panel')
  expect(mock.focusOverlay).toHaveBeenCalledTimes(1)
  desktop.applyInteraction(win, 'passthrough')
  expect(mock.focusTarget).toHaveBeenCalledOnce()
  expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true })
})
it('never reclaims focus from another application on dialog dismissal', () => {
  mock.allowed = false
  desktop.releaseOverlay(window())
  expect(mock.focusTarget).not.toHaveBeenCalled()
})
it('rejects invalid warp targets', () => {
  desktop.warpCursorTo({ x: Infinity, y: 0 })
  expect(mock.warpTo).not.toHaveBeenCalled()
})
it('reports an unreadable pointer as unknown', () => {
  mock.screenPoint.mockImplementation(() => {
    throw new Error('compositor gone')
  })
  expect(desktop.getCursorScreenPoint()).toBeNull()
})
