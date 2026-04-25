import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { OverlayController, OVERLAY_WINDOW_OPTS } from 'electron-overlay-window'
import { uIOhook } from 'uiohook-napi'

export let poeVersion: 1 | 2 = 1

let overlayWindow: BrowserWindow | null = null
let overlayVisible = false
let mouseOverPanel = false
let closeOnClickOutside = false
let interactiveLocked = false
let lastShowTime = 0
let onGameFocus: (() => void) | null = null
let onGameBlur: (() => void) | null = null

export function setCloseOnClickOutside(enabled: boolean): void {
  closeOnClickOutside = enabled
}

/** PoE sidebar is 370px at 800x600 -- ratio used for gameBounds calculation */
const POE_SIDEBAR_RATIO = 370 / 600

// Panel bounds in physical screen coordinates (for uiohook mouse hit testing).
// Updated by the renderer reporting its actual CSS bounding rects, which we convert
// to physical pixels. A list (not a union) so the empty space under a shorter adjacent
// panel -- e.g. the related-items sister overlay -- stays click-through to PoE.
interface PhysRect {
  left: number
  top: number
  right: number
  bottom: number
}
let panelRects: PhysRect[] = []

function getScaleFactor(): number {
  // Use the display the game is actually on, not the primary display.
  // Multi-monitor setups with different DPIs need the correct scale factor.
  const tb = OverlayController.targetBounds
  if (tb && tb.width) {
    return screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }).scaleFactor
  }
  return screen.getPrimaryDisplay().scaleFactor
}

function updatePanelRectsFromCss(cssRects: Array<{ left: number; top: number; width: number; height: number }>): void {
  const tb = OverlayController.targetBounds
  if (!tb || !tb.width) return
  const sf = getScaleFactor()
  panelRects = cssRects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      left: tb.x + r.left * sf,
      top: tb.y + r.top * sf,
      right: tb.x + (r.left + r.width) * sf,
      bottom: tb.y + (r.top + r.height) * sf,
    }))
}

ipcMain.on('report-panel-rect', (_event, payload: unknown) => {
  // Accept either a single rect (legacy) or an array of rects (main + sister etc.).
  const rects = Array.isArray(payload)
    ? (payload as Array<{ left: number; top: number; width: number; height: number }>)
    : [payload as { left: number; top: number; width: number; height: number }]
  updatePanelRectsFromCss(rects)
})

// Allow renderer to pull initial state on mount (attach events may fire before renderer loads)
ipcMain.handle('get-overlay-state', () => {
  const tb = OverlayController.targetBounds
  const sf = getScaleFactor()
  return {
    poeVersion,
    gameBounds:
      tb && tb.width
        ? {
            gameWidth: Math.round(tb.width / sf),
            gameHeight: Math.round(tb.height / sf),
            sidebarWidth: Math.round((tb.height / sf) * POE_SIDEBAR_RATIO),
          }
        : null,
  }
})

// Lock interactive mode while native select dropdowns are open
ipcMain.on('lock-interactive', () => {
  interactiveLocked = true
  setInteractive(true)
  OverlayController.activateOverlay()
})
ipcMain.on('unlock-interactive', () => {
  interactiveLocked = false
  // Re-evaluate based on current mouse position
  if (!mouseOverPanel) setInteractive(false)
})

function isInsidePanel(x: number, y: number): boolean {
  for (const r of panelRects) {
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true
  }
  return false
}

function setInteractive(interactive: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  try {
    overlayWindow.setIgnoreMouseEvents(!interactive)
  } catch {
    // Window may be in a transitional state
  }
}

// Track mouse position via uiohook to toggle click-through
// Debounce exit to prevent flickering at DPI-scaled boundaries
let exitTimer: ReturnType<typeof setTimeout> | null = null

uIOhook.on('mousemove', (e) => {
  if (!overlayVisible) return
  // If no rects reported yet, renderer hasn't mounted -- skip hit testing
  if (panelRects.length === 0) return
  const inside = isInsidePanel(e.x, e.y)
  if (inside) {
    if (exitTimer) {
      clearTimeout(exitTimer)
      exitTimer = null
    }
    if (!mouseOverPanel) {
      mouseOverPanel = true
      setInteractive(true)
    }
  } else if (mouseOverPanel && !exitTimer) {
    exitTimer = setTimeout(() => {
      exitTimer = null
      mouseOverPanel = false
      if (!interactiveLocked) setInteractive(false)
    }, 50)
  }
})

// Close overlay when clicking outside the panel
// Use mousedown (not click) so the overlay hides immediately on press,
// before PoE grabs focus and causes a flash.
uIOhook.on('mousedown', (e) => {
  if (!overlayVisible) return
  // Only process clicks if the overlay window is actually visible on screen
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible()) return
  if (!isInsidePanel(e.x, e.y)) {
    // A native <select> dropdown is open -- its option list lives outside our reported
    // panel rect, so every click on it looks like a click "outside". Bail so we don't
    // disable interactivity (click-through to PoE) or close the overlay.
    if (interactiveLocked) return
    // Ensure click-through is enabled so the click reaches the game
    if (mouseOverPanel) {
      mouseOverPanel = false
      setInteractive(false)
    }
    if (closeOnClickOutside) {
      hideOverlay()
    }
  }
})

const POE_WINDOW_TITLES: Record<1 | 2, string> = {
  1: 'Path of Exile',
  2: 'Path of Exile 2',
}

export function createOverlayWindow(version: 1 | 2 = 1): BrowserWindow {
  poeVersion = version
  overlayWindow = new BrowserWindow({
    ...OVERLAY_WINDOW_OPTS,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Click-through by default
  overlayWindow.setIgnoreMouseEvents(true)

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // Prevent Windows show/hide animation by using opacity instead of hide/show.
  // electron-overlay-window calls hide()/showInactive() on focus changes, which
  // triggers the OS zoom animation. We intercept to use opacity instead.
  const origShowInactive = overlayWindow.showInactive.bind(overlayWindow)
  let opacityHidden = false

  overlayWindow.hide = () => {
    if (Date.now() - lastShowTime < 100) return

    // Make it invisible and click-through - don't actually hide from OS to avoid animation
    overlayWindow!.setOpacity(0)
    overlayWindow!.setIgnoreMouseEvents(true)

    opacityHidden = true
    if (onGameBlur) setImmediate(onGameBlur)
  }

  overlayWindow.showInactive = () => {
    // Only show the overlay if POE actually has focus (alt-tab fix)
    if (!OverlayController.targetHasFocus) return

    // Restore opacity before showing so it's visible immediately
    overlayWindow!.setOpacity(1)
    opacityHidden = false

    overlayWindow!.setSkipTaskbar(true)
    origShowInactive()

    if (onGameFocus) setImmediate(onGameFocus)
  }

  const origIsVisible = overlayWindow.isVisible.bind(overlayWindow)
  overlayWindow.isVisible = () => {
    if (opacityHidden) return false
    return origIsVisible()
  }

  // Attach to the PoE game window — syncs overlay bounds automatically
  OverlayController.attachByTitle(overlayWindow, POE_WINDOW_TITLES[poeVersion])

  OverlayController.events.on('attach', (ev) => {
    try {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('poe-version', poeVersion)
      }
      sendGameBounds(ev.width, ev.height)
      mouseOverPanel = false
      if (overlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.setIgnoreMouseEvents(true)
        overlayWindow.webContents.send('skip-animation')
      }
    } catch (err) {
      console.error('[overlay] Error in attach handler:', err)
    }
  })
  OverlayController.events.on('focus', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return

    // Only show the overlay if POE actually has focus (not another window)
    // This prevents the overlay from appearing on top of other windows during rapid alt-tab
    if (!OverlayController.targetHasFocus) return

    const tb = OverlayController.targetBounds
    if (tb && tb.width) sendGameBounds(tb.width, tb.height)
    if (overlayVisible) {
      overlayWindow.showInactive()
      mouseOverPanel = false
      overlayWindow.setIgnoreMouseEvents(true)
    }
  })
  OverlayController.events.on('moveresize', (ev) => {
    try {
      sendGameBounds(ev.width, ev.height)
    } catch (err) {
      console.error('[overlay] Error in moveresize handler:', err)
    }
  })

  return overlayWindow
}

function sendGameBounds(physWidth: number, physHeight: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const sf = getScaleFactor()
  const gameWidth = Math.round(physWidth / sf)
  const gameHeight = Math.round(physHeight / sf)
  const sidebarWidth = Math.round(gameHeight * POE_SIDEBAR_RATIO)
  overlayWindow.webContents.send('game-bounds', {
    gameWidth,
    gameHeight,
    sidebarWidth,
  })
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayVisible = true
  lastShowTime = Date.now()
  // Call the overridden showInactive() to properly reset opacityHidden and restore visibility.
  // Direct setOpacity(1) alone doesn't reset the closure flag, so the next hide/show cycle
  // from electron-overlay-window can re-zero the opacity.
  try {
    overlayWindow.showInactive()
  } catch {}
  try {
    const tb = OverlayController.targetBounds
    if (tb && tb.width) sendGameBounds(tb.width, tb.height)
    overlayWindow.webContents.send('poe-version', poeVersion)
  } catch (err) {
    console.error('[overlay] Error in showOverlay:', err)
  }
}

export function hideOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayVisible) return
  overlayVisible = false
  mouseOverPanel = false
  try {
    overlayWindow.setIgnoreMouseEvents(true)
  } catch {}
  // Tell renderer to hide its content (don't call overlayWindow.hide() —
  // OverlayController manages window visibility and would re-show it, causing flicker)
  overlayWindow.webContents.send('overlay-hide')
  OverlayController.focusTarget()
}

/** Send reload command to PoE, then re-apply interactive state so overlay stays usable */
export function reloadFilterInGame(): void {
  import('./hotkeys').then(({ sendReloadFilterToPoE }) => {
    sendReloadFilterToPoE()
      .then(() => {
        if (overlayVisible && overlayWindow && mouseOverPanel) {
          overlayWindow.setIgnoreMouseEvents(false)
        }
      })
      .catch((e) => console.error('[FilterScalpel] reload filter failed:', e))
  })
}

/** Send /itemfilter command to PoE, then re-apply interactive state */
export async function switchFilterInGame(filterName: string, currentFilter?: string): Promise<void> {
  const { sendItemFilterCommand } = await import('./hotkeys')
  await sendItemFilterCommand(filterName, currentFilter)
  if (overlayVisible && overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(false)
    mouseOverPanel = true
  }
}

export function toggleOverlay(): void {
  if (!overlayWindow) return
  if (overlayVisible) {
    hideOverlay()
  } else {
    showOverlay()
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

/** Make PoE the OS foreground window so SendInput reaches it, not the overlay. */
export function setGameFocusHandlers(onFocus: () => void, onBlur: () => void): void {
  onGameFocus = onFocus
  onGameBlur = onBlur
}

export function focusGameWindow(): void {
  OverlayController.focusTarget()
}

/** Check if PoE or the overlay is in a usable state (PoE focused, or overlay visible) */
export function isGameActive(): boolean {
  return OverlayController.targetHasFocus || overlayVisible
}
