import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  mouse: {} as Record<string, (event: { x: number; y: number }) => void>,
  ipc: {} as Record<string, (...args: any[]) => void>,
  ignore: vi.fn(),
  activate: vi.fn(),
  focus: vi.fn(),
  unmap: vi.fn(),
  allowed: true,
}))
vi.mock('electron', () => ({
  BrowserWindow: class {
    static fromWebContents() {
      return window
    }
    setIgnoreMouseEvents = mock.ignore
    webContents = { send: vi.fn(), id: 1 }
    on = vi.fn()
    loadFile = vi.fn()
    setAlwaysOnTop = vi.fn()
    setOpacity = vi.fn()
    setSkipTaskbar = vi.fn()
    hide = mock.unmap
    showInactive = vi.fn()
    isVisible = () => true
    isDestroyed = () => false
  },
  ipcMain: {
    on: (name: string, cb: any) => {
      mock.ipc[name] = cb
    },
    handle: vi.fn(),
  },
  screen: { getDisplayNearestPoint: () => ({ scaleFactor: 1 }), getPrimaryDisplay: () => ({ scaleFactor: 1 }) },
  webContents: {},
}))
vi.mock('electron-overlay-window', () => ({
  OVERLAY_WINDOW_OPTS: {},
  OverlayController: {
    targetHasFocus: true,
    targetBounds: { x: 0, y: 0, width: 1000, height: 800 },
    events: { on: vi.fn() },
    activateOverlay: mock.activate,
    focusTarget: mock.focus,
  },
}))
vi.mock('uiohook-napi', () => ({
  uIOhook: {
    on: (name: string, cb: any) => {
      mock.mouse[name] = cb
    },
  },
}))
vi.mock('./hyprland', () => ({
  hyprlandOverlayActive: () => true,
  hyprlandInputAllowed: () => mock.allowed,
  nameHyprlandOverlay: vi.fn(),
  attachHyprlandOverlay: vi.fn(),
}))
vi.mock('./diagnostics', () => ({
  guardNativeListener: (_: string, cb: any) => cb,
  registerDiagnosticProvider: vi.fn(),
}))
vi.mock('./client-log', () => ({ startClientLogWatcher: vi.fn() }))
vi.mock('./game-state', () => ({ getPoeVersion: () => 2, setPoeVersion: vi.fn() }))
vi.mock('./tier-data', () => ({ loadTierData: async () => {}, refreshTierData: async () => {} }))
vi.mock('./premium-mods', () => ({ loadPremiumMods: async () => {}, refreshPremiumMods: async () => {} }))
vi.mock('./trade/endgame-filter-support', () => ({
  loadEndgameFilterSupport: async () => {},
  refreshEndgameFilterSupport: async () => {},
}))
vi.mock('./windowing', () => ({
  closeAllOverlaysOnPoeExit: vi.fn(),
  isAnyScalpelWindowFocused: () => false,
  isInsideAnySecondaryOverlay: () => false,
}))
vi.mock('./whiteboard', () => ({ getWhiteboardOverlay: () => null }))

import { createOverlayWindow, hideOverlay, showOverlay, setCloseOnClickOutside } from './overlay'
let window: ReturnType<typeof createOverlayWindow>

describe('Hyprland manual dialog focus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mock.allowed = true
    window = createOverlayWindow(2)
    setCloseOnClickOutside(false)
    showOverlay()
    mock.ipc['report-panel-rect']({ sender: { id: 1 } }, { left: 100, top: 100, width: 200, height: 200 })
  })
  afterEach(() => {
    hideOverlay()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })
  it('explicitly requests focus on open without waiting for mouse movement', () => {
    expect(mock.activate).toHaveBeenCalledOnce()
    expect(mock.ignore).toHaveBeenLastCalledWith(false)
  })
  it('does not release focus when moving outside or dragging past stale panel bounds', async () => {
    mock.mouse.mousemove({ x: 150, y: 150 })
    mock.mouse.mousedown({ x: 150, y: 150 })
    mock.mouse.mousemove({ x: 900, y: 700 })
    await vi.advanceTimersByTimeAsync(100)
    expect(mock.focus).not.toHaveBeenCalled()
    expect(mock.ignore).toHaveBeenLastCalledWith(false)
  })
  it('dismisses on outside click even when the legacy preference is disabled', () => {
    mock.mouse.mousedown({ x: 900, y: 700 })
    expect(mock.focus).toHaveBeenCalledOnce()
    expect(mock.focus.mock.invocationCallOrder[0]).toBeLessThan(mock.ignore.mock.invocationCallOrder.at(-1)!)
    expect(mock.ignore).toHaveBeenLastCalledWith(true)
  })
  it('keeps input while dropdowns unlock and panel reports are refreshed', () => {
    mock.ipc['unlock-interactive']()
    mock.ipc['clear-panel-rect']({ sender: { id: 1 } })
    expect(mock.ignore).toHaveBeenLastCalledWith(false)
    expect(mock.focus).not.toHaveBeenCalled()
  })
  it('does not react to clicks in an unrelated workspace', () => {
    mock.allowed = false
    mock.mouse.mousedown({ x: 900, y: 700 })
    expect(mock.focus).not.toHaveBeenCalled()
  })
  it('does not reactivate a dismissed panel before its renderer clears the old rects', () => {
    hideOverlay()
    expect(mock.unmap).toHaveBeenCalledOnce()
    expect(window.isVisible()).toBe(false)
    mock.activate.mockClear()
    mock.mouse.mousemove({ x: 150, y: 150 })
    expect(mock.activate).not.toHaveBeenCalled()
    expect(mock.ignore).toHaveBeenLastCalledWith(true)
  })
  it('maps the dialog again after a deliberate dismissal', () => {
    hideOverlay()
    showOverlay()
    expect(window.isVisible()).toBe(true)
    expect(mock.activate).toHaveBeenCalledTimes(2)
  })
})
