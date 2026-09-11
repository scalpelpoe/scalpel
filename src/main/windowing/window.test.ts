import { beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mock = vi.hoisted(() => ({ apply: vi.fn(), release: vi.fn() }))
vi.mock('../desktop', () => ({ desktop: { applyInteraction: mock.apply, releaseOverlay: mock.release } }))
vi.mock('../hyprland', () => ({ hyprlandOverlayActive: () => true, nameHyprlandOverlay: vi.fn() }))
vi.mock('electron-overlay-window', () => ({ OVERLAY_WINDOW_OPTS: {} }))
vi.mock('electron', () => ({
  BrowserWindow: class extends EventEmitter {
    visible = false
    constructor() {
      super()
    }
    showInactive() {
      this.visible = true
    }
    hide() {
      this.visible = false
    }
    isVisible() {
      return this.visible
    }
    setAlwaysOnTop = vi.fn()
    setIgnoreMouseEvents = vi.fn()
    setOpacity = vi.fn()
    loadFile = vi.fn()
    loadURL = vi.fn()
  },
}))
import { createOverlayWindow } from './window'
import type { OverlayInteraction } from '../desktop'
beforeEach(() => vi.clearAllMocks())
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
