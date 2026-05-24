import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { OVERLAY_WINDOW_OPTS } from 'electron-overlay-window'
import type { Rect } from './snap-canvas'

interface CreateOptions {
  htmlEntry: string
  bounds: Rect
}

/** Create a BrowserWindow shaped like the main overlay (transparent, frameless,
 *  screen-saver level) and install opacity-based hide/show overrides so toggle
 *  cycles never trigger Windows zoom animation. Returns the window with .show
 *  /.hide /.isVisible already overridden. */
export function createOverlayWindow({ htmlEntry, bounds }: CreateOptions): BrowserWindow {
  const win = new BrowserWindow({
    ...OVERLAY_WINDOW_OPTS,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // 'screen-saver' is the level the main overlay uses (set by electron-overlay-
  // window on attach). It sits above PoE, the taskbar, and other floating
  // windows, and lets the window's full bounds render including the taskbar
  // region (the default 'floating' level silently clips into the work area).
  win.setAlwaysOnTop(true, 'screen-saver')
  installOpacityHideShow(win)
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${htmlEntry}`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${htmlEntry}`))
  }
  return win
}

/** Replace .hide()/.show()/.isVisible() with opacity-based equivalents.
 *  Windows fires a zoom animation on every actual show/hide, so toggling via
 *  opacity gives us an instant, flicker-free cycle. The window stays
 *  registered with the OS the whole time - only the very first show triggers
 *  an animation. Mirrors the main overlay's pattern.
 *
 *  Critically, the show path uses showInactive (not show) so we never steal
 *  OS focus from PoE. Stealing focus would put PoE in the background, and
 *  background PoE doesn't reliably receive held mouse-button state - which
 *  breaks hold-to-move. It also caused a flicker loop with the main overlay
 *  whenever PoE refocused (steal -> PoE blurs -> main overlay hides -> user
 *  clicks PoE -> repeat). The user can still click the overlay to focus it
 *  for interaction; we just don't take focus on our own. */
function installOpacityHideShow(win: BrowserWindow): void {
  const origShowInactive = win.showInactive.bind(win)
  const origIsVisible = win.isVisible.bind(win)
  let opacityHidden = false
  win.hide = (): void => {
    win.setOpacity(0)
    win.setIgnoreMouseEvents(true)
    opacityHidden = true
  }
  win.show = (): void => {
    win.setOpacity(1)
    win.setIgnoreMouseEvents(false)
    opacityHidden = false
    origShowInactive()
  }
  // Mirror: showInactive matches show. Some callers (electron-overlay-window
  // native code) call this directly.
  win.showInactive = win.show
  win.isVisible = (): boolean => {
    if (opacityHidden) return false
    return origIsVisible()
  }
}
