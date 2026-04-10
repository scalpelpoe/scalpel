import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { OverlayController, OVERLAY_WINDOW_OPTS } from 'electron-overlay-window'
import { uIOhook } from 'uiohook-napi'

let overlayWindow: BrowserWindow | null = null
let overlayVisible = false
let mouseOverPanel = false
let closeOnClickOutside = false
let interactiveLocked = false
let overlayScale = 1
let panelSide: 'left' | 'right' = 'right'
let lastShowTime = 0

export function setPanelSide(side: 'left' | 'right'): void {
  panelSide = side
  updatePanelRect()
}

export function setCloseOnClickOutside(enabled: boolean): void {
  closeOnClickOutside = enabled
}

/** PoE sidebar is 370px at 800x600 — ratio ≈ 0.6167 of window height */
const POE_SIDEBAR_RATIO = 370 / 600
const PANEL_WIDTH = 540
const PANEL_TOP = 8

// Panel bounds in screen coordinates (updated when game moves/resizes or renderer reports height)
let panelRect = { left: 0, top: 0, right: 0, bottom: 0 }
let reportedPanelHeight = 0
let dragOffsetX = 0
let dragOffsetY = 0

function getScaleFactor(): number {
  return screen.getPrimaryDisplay().scaleFactor
}

function updatePanelRect(): void {
  const tb = OverlayController.targetBounds
  if (!tb || !tb.width) return
  const sf = getScaleFactor()
  const sidebarWidth = Math.round(tb.height * POE_SIDEBAR_RATIO)
  // panelRect is in physical pixels (for uiohook mouse hit testing)
  const physPanelWidth = PANEL_WIDTH * sf * overlayScale
  const physPanelHeight = reportedPanelHeight * sf
  const panelLeft =
    (panelSide === 'left' ? tb.x + sidebarWidth - 1 : tb.x + tb.width - sidebarWidth - physPanelWidth + 1) +
    dragOffsetX * sf
  const top = tb.y + (PANEL_TOP + dragOffsetY) * sf
  panelRect = {
    left: panelLeft,
    top,
    right: panelLeft + physPanelWidth,
    bottom: physPanelHeight > 0 ? top + physPanelHeight : top,
  }
}

ipcMain.on('report-panel-height', (_event, height: number) => {
  reportedPanelHeight = height
  updatePanelRect()
})

ipcMain.on('report-drag-offset', (_event, x: number, y: number) => {
  dragOffsetX = x
  dragOffsetY = y
  updatePanelRect()
})

ipcMain.on('report-panel-side', (_event, side: 'left' | 'right') => {
  panelSide = side
  updatePanelRect()
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
  return x >= panelRect.left && x <= panelRect.right && y >= panelRect.top && y <= panelRect.bottom
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
  if (!isInsidePanel(e.x, e.y)) {
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

export function createOverlayWindow(): BrowserWindow {
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
  let windowShown = false

  let opacityHidden = false

  overlayWindow.hide = () => {
    if (windowShown) {
      if (Date.now() - lastShowTime < 500) return
      overlayWindow!.setOpacity(0)
      overlayWindow!.setIgnoreMouseEvents(true)
      // Keep alwaysOnTop -- don't surrender z-position. The window is invisible
      // (opacity 0) and click-through, so it doesn't interfere with anything.
      // This prevents borderless PoE from grabbing the z-slot when we try to re-show.
      opacityHidden = true
    }
  }
  overlayWindow.showInactive = () => {
    if (!windowShown) {
      origShowInactive()
      windowShown = true
    }
    overlayWindow!.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow!.setOpacity(1)
    opacityHidden = false
  }

  const origIsVisible = overlayWindow.isVisible.bind(overlayWindow)
  overlayWindow.isVisible = () => {
    if (opacityHidden) return false
    return origIsVisible()
  }

  // Attach to the PoE game window — syncs overlay bounds automatically
  OverlayController.attachByTitle(overlayWindow, 'Path of Exile')

  OverlayController.events.on('attach', (ev) => {
    try {
      sendGameBounds(ev.width, ev.height)
      updatePanelRect()
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
    if (overlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.showInactive()
      mouseOverPanel = false
      overlayWindow.setIgnoreMouseEvents(true)
    }
  })
  OverlayController.events.on('moveresize', (ev) => {
    try {
      sendGameBounds(ev.width, ev.height)
      updatePanelRect()
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

export function setOverlayScale(scale: number): void {
  overlayScale = scale
  updatePanelRect()
}

/** Make PoE the OS foreground window so SendInput reaches it, not the overlay. */
export function focusGameWindow(): void {
  OverlayController.focusTarget()
}

/** Check if PoE or the overlay is in a usable state (PoE focused, or overlay visible) */
export function isGameActive(): boolean {
  return OverlayController.targetHasFocus || overlayVisible
}
