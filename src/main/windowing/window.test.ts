import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mock = vi.hoisted(() => ({ apply: vi.fn(), release: vi.fn(), construct: vi.fn(), hyprland: true }))
vi.mock('../desktop', () => ({ desktop: { applyInteraction: mock.apply, releaseOverlay: mock.release } }))
vi.mock('../hyprland', () => ({ hyprlandOverlayActive: () => mock.hyprland, nameHyprlandOverlay: vi.fn() }))
vi.mock('electron-overlay-window', () => ({ OVERLAY_WINDOW_OPTS: {} }))
vi.mock('../desktop/x11-transient', () => ({ linkX11Transient: vi.fn() }))
vi.mock('../game-state', () => ({ getPoeVersion: () => 2 }))
vi.mock('electron', () => ({
  BrowserWindow: class extends EventEmitter {
    visible = false
    constructor(options: unknown) {
      super()
      mock.construct(options)
    }
    showInactive() {
      this.visible = true
    }
    hide = vi.fn(() => {
      this.visible = false
    })
    isVisible() {
      return this.visible
    }
    setAlwaysOnTop = vi.fn()
    setIgnoreMouseEvents = vi.fn()
    setOpacity = vi.fn()
    getBounds = vi.fn(() => ({ x: 200, y: 300, width: 400, height: 500 }))
    setBounds = vi.fn()
    getNativeWindowHandle = vi.fn(() => Buffer.from([1, 0, 0, 0]))
    moveTop = vi.fn()
    loadFile = vi.fn()
    loadURL = vi.fn()
  },
}))
import { createOverlayWindow } from './window'
import { linkX11Transient } from '../desktop/x11-transient'
import type { OverlayInteraction } from '../desktop'
beforeEach(() => {
  vi.clearAllMocks()
  mock.hyprland = true
})
afterEach(() => vi.unstubAllGlobals())
it('links an X11 overlay to the current game before applying interaction, but skips Hyprland', () => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  mock.hyprland = false
  const win = createOverlayWindow({
    htmlEntry: 'plugin-overlay.html',
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  })
  win.show()
  expect(linkX11Transient).toHaveBeenCalledWith(win.getNativeWindowHandle(), 'Path of Exile 2')
  expect(vi.mocked(linkX11Transient).mock.invocationCallOrder[0]).toBeLessThan(mock.apply.mock.invocationCallOrder[0])
  vi.mocked(linkX11Transient).mockClear()
  mock.hyprland = true
  win.hide()
  win.show()
  expect(linkX11Transient).not.toHaveBeenCalled()
})
it('keeps the overlay usable when native binding fails', () => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  mock.hyprland = false
  const error = new Error('libxcb unavailable')
  vi.mocked(linkX11Transient).mockImplementationOnce(() => {
    throw error
  })
  const win = createOverlayWindow({
    htmlEntry: 'plugin-overlay.html',
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  })
  win.show()
  expect(win.isVisible()).toBe(true)
  expect(mock.apply).toHaveBeenCalledWith(win, 'panel')
})
it.each([true, false])('sets the initial floating window hint only on Hyprland (%s)', (hyprland) => {
  mock.hyprland = hyprland
  createOverlayWindow({ htmlEntry: 'radial-menu.html', bounds: { x: 0, y: 0, width: 100, height: 100 } })
  const options = mock.construct.mock.lastCall![0]
  expect(options.type).toBe(hyprland ? 'utility' : undefined)
  expect(options.title).toBe(hyprland ? 'Scalpel Overlay' : undefined)
})
it('applies dialog ownership on first show and reopen and releases it before hiding', () => {
  const win = createOverlayWindow({
    htmlEntry: 'radial-menu.html',
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    interaction: () => 'dialog',
  })
  win.show()
  expect(mock.apply).toHaveBeenCalledWith(win, 'dialog')
  win.hide()
  expect(mock.release).toHaveBeenCalledWith(win)
  expect(win.isVisible()).toBe(false)
  win.show()
  expect(mock.apply).toHaveBeenCalledTimes(2)
})
it('reads the current whiteboard mode on every show instead of resetting to interactive', () => {
  let mode: OverlayInteraction = 'dialog'
  const win = createOverlayWindow({
    htmlEntry: 'whiteboard.html',
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    interaction: () => mode,
  })
  win.show()
  win.hide()
  mode = 'passthrough'
  win.show()
  expect(mock.apply).toHaveBeenLastCalledWith(win, 'passthrough')
})
it('raises the Linux overlay on first show and reopen without claiming panel focus', () => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  const win = createOverlayWindow({
    htmlEntry: 'plugin-overlay.html',
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  })
  const moveTop = vi.mocked(win.moveTop)
  win.show()
  expect(win.isVisible()).toBe(true)
  expect(moveTop).toHaveBeenCalledTimes(1)
  expect(moveTop.mock.invocationCallOrder[0]).toBeLessThan(mock.apply.mock.invocationCallOrder[0])
  expect(mock.apply).toHaveBeenLastCalledWith(win, 'panel')
  win.hide()
  win.showInactive()
  expect(moveTop).toHaveBeenCalledTimes(2)
})
it.each(['linux', 'win32'])('uses native hiding only on Linux outside Hyprland (%s)', (platform) => {
  vi.stubGlobal('process', { ...process, platform })
  mock.hyprland = false
  const win = createOverlayWindow({
    htmlEntry: 'plugin-overlay.html',
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  })
  // The constructor's native hide is captured by the wrapper. Its observable
  // native visibility remains true on Windows and becomes false on Linux.
  win.show()
  win.hide()
  expect((win as unknown as { visible: boolean }).visible).toBe(platform !== 'linux')
  expect(win.isVisible()).toBe(false)
  expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true)
  expect(mock.release).toHaveBeenCalledWith(win)
  if (platform === 'linux') expect(win.setOpacity).not.toHaveBeenCalledWith(0)
  else expect(win.setOpacity).toHaveBeenCalledWith(0)
  win.show()
  expect(win.isVisible()).toBe(true)
  expect(mock.apply).toHaveBeenLastCalledWith(win, 'panel')
  if (platform === 'linux') expect(win.setBounds).toHaveBeenLastCalledWith(win.getBounds())
  if (platform === 'win32') {
    expect(win.moveTop).not.toHaveBeenCalled()
    expect(win.setBounds).not.toHaveBeenCalled()
    expect(linkX11Transient).not.toHaveBeenCalled()
  }
})
