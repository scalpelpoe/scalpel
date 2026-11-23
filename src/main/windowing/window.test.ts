import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mock = vi.hoisted(() => ({
  apply: vi.fn(),
  release: vi.fn(),
  construct: vi.fn(),
  beforeShow: vi.fn(),
  compositorFocus: true,
}))
vi.mock('../desktop', () => ({ desktop: { applyInteraction: mock.apply, releaseOverlay: mock.release } }))
vi.mock('@scalpel/platform', () => ({
  platform: () => ({
    traits: {
      get compositorFocus() {
        return mock.compositorFocus
      },
    },
    windowTracker: { overlayWindowOptions: () => ({}), adoptOverlay: vi.fn(), beforeOverlayShow: mock.beforeShow },
  }),
}))
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
import type { OverlayInteraction } from '../desktop'
beforeEach(() => {
  vi.clearAllMocks()
  mock.compositorFocus = true
})
afterEach(() => vi.unstubAllGlobals())
it('prepares the overlay for the current game before applying interaction', () => {
  const win = createOverlayWindow({
    htmlEntry: 'plugin-overlay.html',
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  })
  win.show()
  expect(mock.beforeShow).toHaveBeenCalledWith(win, 'Path of Exile 2')
  expect(mock.beforeShow.mock.invocationCallOrder[0]).toBeLessThan(mock.apply.mock.invocationCallOrder[0])
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
it.each(['linux', 'win32'])('uses native hiding only on Linux without compositor focus (%s)', (platform) => {
  vi.stubGlobal('process', { ...process, platform })
  mock.compositorFocus = false
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
  }
})
