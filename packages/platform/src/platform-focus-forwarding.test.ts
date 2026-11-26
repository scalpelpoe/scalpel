import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

/** A native-Wayland regular window has no X11 tracker connection. Calling the
 *  electron-overlay-window controller's focus/activate/title methods there
 *  dereferences a null xcb connection and crashes the process (SIGSEGV), so the
 *  facade must route them through the selected backend. */
const mock = vi.hoisted(() => ({
  controller: {
    events: { on: vi.fn() },
    targetHasFocus: true,
    focusTarget: vi.fn(),
    activateOverlay: vi.fn(),
    setTargetTitles: vi.fn(),
  },
  backend: {
    focusTarget: vi.fn(),
    activateOverlay: vi.fn(),
    setTargetTitles: vi.fn(),
    setInputRects: vi.fn(),
  },
  regularWindow: true,
}))

vi.mock('electron-overlay-window', () => ({ OverlayController: mock.controller }))
// The stubbed Linux platform would make koffi look for its Linux binary on
// other hosts; no test here calls into it.
vi.mock('koffi', () => ({ default: {} }))
vi.mock('./linux/common/layer-shell/windowing', () => ({ linuxRegularWindowMode: () => mock.regularWindow }))
vi.mock('./linux/common/regular-window/backend', () => ({
  createRegularWindowBackend: () => ({
    traits: { compositorFocus: false, windowLocal: true },
    windowTracker: mock.backend,
  }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  vi.stubEnv('HYPRLAND_INSTANCE_SIGNATURE', '')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('exposes windowLocal so host code can take the neutral window-local path', async () => {
  const { platform } = await import('./platform')
  expect(platform().traits.windowLocal).toBe(true)
})

it('routes focus and activation through the backend instead of the X11 controller', async () => {
  const { platform } = await import('./platform')
  const tracker = platform().windowTracker

  tracker.focusTarget()
  tracker.activateOverlay()
  tracker.setTargetTitles(['Path of Exile'])

  expect(mock.backend.focusTarget).toHaveBeenCalledOnce()
  expect(mock.backend.activateOverlay).toHaveBeenCalledOnce()
  expect(mock.backend.setTargetTitles).toHaveBeenCalledWith(['Path of Exile'])
  expect(mock.controller.focusTarget).not.toHaveBeenCalled()
  expect(mock.controller.activateOverlay).not.toHaveBeenCalled()
  expect(mock.controller.setTargetTitles).not.toHaveBeenCalled()
})

it('forwards input regions to the selected backend', async () => {
  const { platform } = await import('./platform')
  const win = {} as BrowserWindow
  const rects = [{ left: 1, top: 2, width: 3, height: 4 }]

  platform().windowTracker.setInputRects(win, rects)

  expect(mock.backend.setInputRects).toHaveBeenCalledWith(win, rects)
})
