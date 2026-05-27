import { join } from 'node:path'
import { BrowserWindow, ipcMain, screen, webContents } from 'electron'
import { OVERLAY_WINDOW_OPTS, OverlayController } from 'electron-overlay-window'
import { uIOhook } from 'uiohook-napi'
import { startClientLogWatcher } from './client-log'
import { guardNativeListener, registerDiagnosticProvider } from './diagnostics'
import { getPoeVersion, setPoeVersion } from './game-state'
import { closeAllOverlaysOnPoeExit, isAnyScalpelWindowFocused, isInsideAnySecondaryOverlay } from './windowing'

let overlayWindow: BrowserWindow | null = null
let overlayVisible = false
let mouseOverPanel = false
let closeOnClickOutside = false
let interactiveLocked = false
let lastShowTime = 0
let lastAttachAt = 0
let lastDetachAt = 0
let lastMoveResizeAt = 0
let lastOverlayError: string | null = null
let onGameFocus: (() => void) | null = null
let onGameBlur: (() => void) | null = null

export function setCloseOnClickOutside(enabled: boolean): void {
  closeOnClickOutside = enabled
}

/** PoE sidebar is 370px at 800x600 -- ratio used for gameBounds calculation */
const POE_SIDEBAR_RATIO = 370 / 600

// Panel bounds in physical screen coordinates (for uiohook mouse hit testing).
// Updated by the renderer reporting its actual CSS bounding rects, which we convert
// to physical pixels. Keyed by sender webContents ID so multiple windows (main overlay,
// whiteboard toolbar, etc.) can each report their own rects without overwriting each other.
interface PhysRect {
  left: number
  top: number
  right: number
  bottom: number
}

interface PanelEntry {
  win: BrowserWindow
  rects: PhysRect[]
}
const panelRectsBySender = new Map<number, PanelEntry>()

function flatPanelRects(): PhysRect[] {
  const out: PhysRect[] = []
  for (const entry of panelRectsBySender.values()) out.push(...entry.rects)
  return out
}

/** Return the window that owns the topmost rect containing (x, y), or null. */
function windowAtPoint(x: number, y: number): BrowserWindow | null {
  for (const entry of panelRectsBySender.values()) {
    for (const r of entry.rects) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return entry.win.isDestroyed() ? null : entry.win
      }
    }
  }
  return null
}

function getScaleFactor(): number {
  // Use the display the game is actually on, not the primary display.
  // Multi-monitor setups with different DPIs need the correct scale factor.
  const tb = OverlayController.targetBounds
  if (tb?.width) {
    return screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }).scaleFactor
  }
  return screen.getPrimaryDisplay().scaleFactor
}

ipcMain.on('report-panel-rect', (event, payload: unknown) => {
  // Accept either a single rect (legacy) or an array of rects (main + sister etc.).
  const rects = Array.isArray(payload)
    ? (payload as Array<{ left: number; top: number; width: number; height: number }>)
    : [payload as { left: number; top: number; width: number; height: number }]
  const tb = OverlayController.targetBounds
  if (!tb?.width) return
  const sf = getScaleFactor()
  const phys = rects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      left: tb.x + r.left * sf,
      top: tb.y + r.top * sf,
      right: tb.x + (r.left + r.width) * sf,
      bottom: tb.y + (r.top + r.height) * sf,
    }))
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  panelRectsBySender.set(event.sender.id, { win, rects: phys })
})

ipcMain.on('clear-panel-rect', (event) => {
  const entry = panelRectsBySender.get(event.sender.id)
  panelRectsBySender.delete(event.sender.id)
  // Restore click-through on the window we just dropped rects for, in case
  // it was the currently-interactive one (cursor sat over its toolbar at
  // unmount time).
  if (entry && !entry.win.isDestroyed()) {
    try {
      entry.win.setIgnoreMouseEvents(true)
    } catch {}
  }
  if (currentInteractiveWindow === entry?.win) currentInteractiveWindow = null
})

// Allow renderer to pull initial state on mount (attach events may fire before renderer loads)
ipcMain.handle('get-overlay-state', () => {
  const tb = OverlayController.targetBounds
  const sf = getScaleFactor()
  return {
    poeVersion: getPoeVersion(),
    gameBounds: tb?.width
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
  for (const r of flatPanelRects()) {
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true
  }
  return false
}

/** Window currently flipped to interactive by the cursor-over-rect handler.
 *  null when the cursor is in click-through territory. */
let currentInteractiveWindow: BrowserWindow | null = null

/** Make `win` interactive (or all windows click-through if `win` is null).
 *  Setting a different window to interactive automatically reverts the prior
 *  one to click-through, so we never end up with two windows competing. */
function setInteractiveWindow(win: BrowserWindow | null): void {
  if (currentInteractiveWindow === win) return
  // Revert prior window to click-through.
  const prev = currentInteractiveWindow
  if (prev && !prev.isDestroyed()) {
    try {
      prev.setIgnoreMouseEvents(true)
    } catch {}
  }
  currentInteractiveWindow = win
  if (win && !win.isDestroyed()) {
    try {
      win.setIgnoreMouseEvents(false)
    } catch {}
    // X11: toggling the input shape (setIgnoreMouseEvents) is enough on Windows,
    // but an unfocused always-on-top overlay on X11 still won't receive pointer
    // button events -- it has to take native input focus. electron-overlay-window
    // exposes activateOverlay() for exactly this (it runs the native lib.activateOverlay()
    // on Linux). Only the attached main overlay can be activated this way, so secondary
    // windows (whiteboard, cheat sheets) fall outside this path. See issue #30.
    if (process.platform === 'linux' && win === overlayWindow) {
      try {
        OverlayController.activateOverlay()
      } catch {}
    }
  } else if (process.platform === 'linux' && prev === overlayWindow) {
    // Cursor left the main overlay: hand native input focus back to PoE so the
    // game keeps receiving input (mirrors the focusTarget() handoff hideOverlay uses).
    try {
      OverlayController.focusTarget()
    } catch {}
  }
}

/** Compatibility shim used by the lock-interactive IPC and other paths that
 *  only care about the main overlay window. */
function setInteractive(interactive: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  try {
    overlayWindow.setIgnoreMouseEvents(!interactive)
  } catch {
    // Window may be in a transitional state
  }
  if (interactive) currentInteractiveWindow = overlayWindow
  else if (currentInteractiveWindow === overlayWindow) currentInteractiveWindow = null
}

// Track mouse position via uiohook to toggle click-through
// Debounce exit to prevent flickering at DPI-scaled boundaries
let exitTimer: ReturnType<typeof setTimeout> | null = null

uIOhook.on(
  'mousemove',
  guardNativeListener('mousemove', (e) => {
    // No rects reported yet -- skip hit testing. (Whiteboard registers its own
    // rects independently of the main overlay's `overlayVisible` flag.)
    if (panelRectsBySender.size === 0) return
    const winUnder = windowAtPoint(e.x, e.y)
    if (winUnder) {
      if (exitTimer) {
        clearTimeout(exitTimer)
        exitTimer = null
      }
      if (currentInteractiveWindow !== winUnder) {
        mouseOverPanel = true
        setInteractiveWindow(winUnder)
      }
    } else if (currentInteractiveWindow && !exitTimer) {
      exitTimer = setTimeout(() => {
        exitTimer = null
        mouseOverPanel = false
        if (!interactiveLocked) setInteractiveWindow(null)
      }, 50)
    }
  }),
)

// Close overlay when clicking outside the panel
// Use mousedown (not click) so the overlay hides immediately on press,
// before PoE grabs focus and causes a flash.
uIOhook.on(
  'mousedown',
  guardNativeListener('mousedown-overlay', (e) => {
    if (!overlayVisible) return
    // Only process clicks if the overlay window is actually visible on screen
    if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible()) return
    if (!isInsidePanel(e.x, e.y)) {
      // A click on any visible Scalpel secondary overlay (cheat sheets etc.) is
      // an interaction with our app, not a "click outside" - don't hide.
      if (isInsideAnySecondaryOverlay(e.x, e.y)) return
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
  }),
)

const POE_WINDOW_TITLES: Record<1 | 2, string> = {
  1: 'Path of Exile',
  2: 'Path of Exile 2',
}

export function createOverlayWindow(version: 1 | 2 = 1): BrowserWindow {
  setPoeVersion(version)
  overlayWindow = new BrowserWindow({
    ...OVERLAY_WINDOW_OPTS,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    overlayWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
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

    // electron-overlay-window's native code calls .hide() on PoE blur. Skip
    // the hide when focus actually moved to another Scalpel window (cheat
    // sheets etc.) - that's an in-app interaction, not "user left the app".
    if (isAnyScalpelWindowFocused()) return

    // Make it invisible and click-through - don't actually hide from OS to avoid animation
    overlayWindow?.setOpacity(0)
    overlayWindow?.setIgnoreMouseEvents(true)

    opacityHidden = true
    if (onGameBlur) setImmediate(onGameBlur)
  }

  overlayWindow.showInactive = () => {
    // Only show the overlay if POE actually has focus (alt-tab fix)
    if (!OverlayController.targetHasFocus) return

    // Restore opacity before showing so it's visible immediately
    overlayWindow?.setOpacity(1)
    opacityHidden = false

    overlayWindow?.setSkipTaskbar(true)
    origShowInactive()

    if (onGameFocus) setImmediate(onGameFocus)
  }

  const origIsVisible = overlayWindow.isVisible.bind(overlayWindow)
  overlayWindow.isVisible = () => {
    if (opacityHidden) return false
    return origIsVisible()
  }

  // Attach to the PoE game window — syncs overlay bounds automatically
  OverlayController.attachByTitle(overlayWindow, POE_WINDOW_TITLES[getPoeVersion()])

  OverlayController.events.on('attach', (ev) => {
    lastAttachAt = Date.now()
    try {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('poe-version', getPoeVersion())
        startClientLogWatcher(overlayWindow)
      }
      sendGameBounds(ev.width, ev.height)
      mouseOverPanel = false
      if (overlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.setIgnoreMouseEvents(true)
        if (currentInteractiveWindow === overlayWindow) currentInteractiveWindow = null
        overlayWindow.webContents.send('skip-animation')
      }
    } catch (err) {
      lastOverlayError = String(err)
      console.error('[overlay] Error in attach handler:', err)
    }
  })
  OverlayController.events.on('detach', () => {
    lastDetachAt = Date.now()
    try {
      // PoE window was destroyed (player quit / crashed). The library
      // already hides the main overlay's BrowserWindow; we still need to
      // clear our renderer-side overlay state and hide every secondary
      // overlay using the same paths the Esc handler uses.
      hideOverlay()
      closeAllOverlaysOnPoeExit()
    } catch (err) {
      lastOverlayError = String(err)
      console.error('[overlay] Error in detach handler:', err)
    }
  })
  OverlayController.events.on(
    'focus',
    guardNativeListener('overlay-focus', () => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return

      // Only show the overlay if POE actually has focus (not another window)
      // This prevents the overlay from appearing on top of other windows during rapid alt-tab
      if (!OverlayController.targetHasFocus) return

      const tb = OverlayController.targetBounds
      if (tb?.width) sendGameBounds(tb.width, tb.height)
      if (overlayVisible) {
        // Patched showInactive() fires onGameFocus internally, which resumes
        // hotkeys and restores any hidden secondary overlays.
        overlayWindow.showInactive()
        mouseOverPanel = false
        overlayWindow.setIgnoreMouseEvents(true)
        if (currentInteractiveWindow === overlayWindow) currentInteractiveWindow = null
      } else if (onGameFocus) {
        // Main overlay is closed but PoE just refocused -- still need to resume
        // hotkeys and restore secondary overlays (cheat sheets, etc.) that were
        // hidden when the user clicked away. Without this branch, the path that
        // normally drives onGameFocus (showInactive above) doesn't fire when only
        // a secondary overlay was up, leaving it hidden and hotkeys suspended
        // until the user manually alt-tabs.
        setImmediate(onGameFocus)
      }
    }),
  )
  OverlayController.events.on('moveresize', (ev) => {
    lastMoveResizeAt = Date.now()
    try {
      sendGameBounds(ev.width, ev.height)
    } catch (err) {
      lastOverlayError = String(err)
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
  // Mutual exclusion: hide the whiteboard before showing the main overlay.
  import('./whiteboard').then(({ getWhiteboardOverlay }) => {
    getWhiteboardOverlay()?.hide()
  })
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
    if (tb?.width) sendGameBounds(tb.width, tb.height)
    overlayWindow.webContents.send('poe-version', getPoeVersion())
  } catch (err) {
    lastOverlayError = String(err)
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

// Tracks which Scalpel windows currently have an editable element
// (input/textarea/contenteditable) focused. Pushed from each renderer on
// focusin/focusout (keyed by sender webContents id) so the hotkey gate can
// avoid firing when the user is typing in any of our surfaces -- main overlay,
// whiteboard text editor, etc. Otherwise single-key hotkeys would be unusable
// in any text field.
const inputFocusedWebContents = new Set<number>()
// WC ids we've already attached a `destroyed` cleanup listener to. Without
// this guard, every focus/blur/focus cycle on the same renderer would attach
// a new `once('destroyed')` listener (since `once` only auto-removes when the
// event actually fires), tripping Node's MaxListenersExceededWarning after
// roughly 11 cycles.
const hookedWcIds = new Set<number>()

export function setWindowInputFocused(webContentsId: number, focused: boolean): void {
  if (focused) {
    if (!inputFocusedWebContents.has(webContentsId)) {
      inputFocusedWebContents.add(webContentsId)
      // If the renderer dies mid-focus (window force-closed during text edit),
      // its `focusout` never fires - drain the id when the webContents goes
      // away so the Set doesn't accumulate ghost entries.
      if (!hookedWcIds.has(webContentsId)) {
        const wc = webContents.fromId(webContentsId)
        if (wc) {
          hookedWcIds.add(webContentsId)
          wc.once('destroyed', () => {
            inputFocusedWebContents.delete(webContentsId)
            hookedWcIds.delete(webContentsId)
          })
        }
      }
    }
  } else {
    inputFocusedWebContents.delete(webContentsId)
  }
}

/** True when a Scalpel window has OS focus AND its renderer has reported an
 *  editable element as the active element. Hotkey handlers use this to swallow
 *  presses that would otherwise stomp the user's typing. */
export function isTypingInOverlay(): boolean {
  const focused = BrowserWindow.getFocusedWindow()
  if (!focused || focused.isDestroyed()) return false
  return inputFocusedWebContents.has(focused.webContents.id)
}

function getOverlayDiagnostics(): Record<string, unknown> {
  const tb = OverlayController.targetBounds
  const sf = ((): number => {
    try {
      if (tb?.width) {
        return screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }).scaleFactor
      }
      return screen.getPrimaryDisplay().scaleFactor
    } catch {
      return 1
    }
  })()
  return {
    overlayWindowCreated: overlayWindow !== null,
    overlayVisible,
    targetHasFocus: OverlayController.targetHasFocus,
    targetBounds: tb?.width ? { width: tb.width, height: tb.height } : null,
    targetDisplayScaleFactor: sf,
    attachedPoeVersion: getPoeVersion(),
    lastAttachAt: lastAttachAt || null,
    lastDetachAt: lastDetachAt || null,
    lastMoveResizeAt: lastMoveResizeAt || null,
    lastOverlayError,
    panelRectCount: panelRectsBySender.size,
    currentInteractiveWindowPresent: currentInteractiveWindow !== null,
  }
}

registerDiagnosticProvider('overlayDiagnostics', getOverlayDiagnostics)
