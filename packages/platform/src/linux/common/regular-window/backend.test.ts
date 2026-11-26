import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ attachByTitles: vi.fn() }))

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 2560, height: 1440 } }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  },
  desktopCapturer: { getSources: vi.fn() },
}))
vi.mock('electron-overlay-window', () => ({
  OVERLAY_WINDOW_OPTS: { transparent: true },
  OverlayController: { targetBounds: null, events: { on: vi.fn() }, attachByTitles: mock.attachByTitles },
  waylandClipboard: {
    available: () => false,
    readText: () => '',
    readHTML: () => '',
    writeText: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
  },
}))
vi.mock('electron-overlay-window/dist/wayland/host', () => ({
  WaylandHost: { get: () => null, start: () => null },
}))
vi.mock('../../../common/diagnostics', () => ({ reportBreadcrumb: vi.fn(), reportDiagnostic: vi.fn() }))
vi.mock('../x11-xwayland/dip', () => ({ x11ScreenDip: { rect: (r: unknown) => r } }))
vi.mock('../x11-xwayland/transient', () => ({ linkX11Transient: vi.fn() }))

import { createRegularWindowBackend, regularWindowOptions, unlockRegularWindow } from './backend'
import { REGULAR_WINDOW_HEIGHT, REGULAR_WINDOW_WIDTH } from '../../../common/window-layout'

describe('regular window backend', () => {
  it('tracks the X11 game for focus without binding the window to it', () => {
    const focus = vi.fn()
    const win = { isDestroyed: () => false, focus } as unknown as BrowserWindow
    const { windowTracker } = createRegularWindowBackend()

    windowTracker.adoptOverlay(win)
    windowTracker.attach(win, ['Path of Exile'])
    windowTracker.activateOverlay()

    expect(mock.attachByTitles).toHaveBeenCalledWith(undefined, ['Path of Exile'])
    expect(focus).toHaveBeenCalledOnce()
  })

  it('creates one centered, focusable, fixed-size normal window', () => {
    const opts = regularWindowOptions()
    expect(opts).toMatchObject({
      type: 'normal',
      title: 'Scalpel',
      focusable: true,
      resizable: false,
      maximizable: false,
      width: REGULAR_WINDOW_WIDTH,
      height: REGULAR_WINDOW_HEIGHT,
      minWidth: REGULAR_WINDOW_WIDTH,
      maxWidth: REGULAR_WINDOW_WIDTH,
      minHeight: REGULAR_WINDOW_HEIGHT,
      maxHeight: REGULAR_WINDOW_HEIGHT,
      x: Math.round((2560 - REGULAR_WINDOW_WIDTH) / 2),
      y: Math.round((1440 - REGULAR_WINDOW_HEIGHT) / 2),
    })
  })

  it('unlocks size and always-on-top only after the first map', () => {
    const win = {
      isDestroyed: () => false,
      setMaximumSize: vi.fn(),
      setMinimumSize: vi.fn(),
      setResizable: vi.fn(),
      setAlwaysOnTop: vi.fn(),
    }
    unlockRegularWindow(win as never)
    expect(win.setMaximumSize).toHaveBeenCalledWith(0, 0)
    expect(win.setMinimumSize).toHaveBeenCalledWith(420, 350)
    expect(win.setResizable).toHaveBeenCalledWith(true)
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  })

  it('keeps unlocking resize when one hint is rejected by the compositor', () => {
    const win = {
      isDestroyed: () => false,
      setMaximumSize: vi.fn(() => {
        throw new Error('unsupported')
      }),
      setMinimumSize: vi.fn(),
      setResizable: vi.fn(),
      setAlwaysOnTop: vi.fn(),
    }
    expect(() => unlockRegularWindow(win as never)).not.toThrow()
    expect(win.setResizable).toHaveBeenCalledWith(true)
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  })
})
