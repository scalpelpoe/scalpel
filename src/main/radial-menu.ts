import { IPC_CHANNELS } from '@shared/contracts/ipc'
import {
  clampRadialScale,
  pluginIdFromAction,
  RADIAL_BACKDROP_HALF_PX,
  type RadialBackdropEvent,
  type RadialBackdropResult,
  type RadialOpenPayload,
  type RadialPendingState,
  type RadialSlice,
} from '@shared/contracts/radial'
import { registerOnPoeLeave, registerSecondaryOverlay, type SecondaryOverlay } from './windowing'

export interface RadialMenuDeps {
  getSlices: () => RadialSlice[]
  /** Stored size scale, resolved into the payload at open so the radial window
   *  never has to read settings. Optional: absent leaves the ring at 1. */
  getScale?: () => number | undefined
  /** Developer mode, resolved into the payload at open the same way `scale` is.
   *  Turns on the ring's backdrop tuning panel. Absent = off. */
  isDev?: () => boolean
  /** Live cursor in game CSS px; null = cursor outside the game window. */
  getGameCursor: () => { x: number; y: number } | null
  /** Live cursor in screen DIP px, captured at open as the warp-back target. */
  getScreenCursor: () => { x: number; y: number } | null
  warpTo: (dip: { x: number; y: number }) => void
  focusGame: () => void
  /** Fire after focus settles (real wiring: setTimeout 50ms; tests: sync). */
  defer: (fn: () => void) => void
  fire: {
    filter: () => void
    pricecheck: () => void
    appmacro: (action: string, presetId?: string) => void
    chat: (command: string, autoSubmit: boolean) => void
    cheatsheet: (categoryId?: string) => void
  }
  /** Registered tab icon (SVG markup or data URL) for a plugin, so plugin-backed
   *  slices can draw the plugin's own icon. Optional: absent in tests and in any
   *  wiring that predates the plugin tab registry. */
  getPluginIcon?: (pluginId: string) => string | undefined
  /** Grab the game pixels behind the menu as a small image, for the blurred
   *  backdrop. Called with the RAW open point and a half-extent in game CSS px.
   *  Optional, and allowed to resolve null or reject: the ring falls back to its
   *  plain tinted disc and the user is none the wiser. */
  captureBackdrop?: (center: { x: number; y: number }, half: number) => Promise<RadialBackdropResult>
}

/** Attach the plugin's own tab icon to a plugin-backed slice. Resolved at open
 *  time rather than stored: the registry changes with every install, uninstall
 *  and plugin reload. The prefix knowledge lives in the contract now, so main,
 *  the settings section and the icon defaulting all ask the same question. */
function withPluginIcon(slice: RadialSlice, getIcon?: (pluginId: string) => string | undefined): RadialSlice {
  if (!getIcon) return slice
  const pluginId = pluginIdFromAction(slice.action)
  if (!pluginId) return slice
  const iconSvg = getIcon(pluginId)
  return iconSvg ? { ...slice, iconSvg } : slice
}

let overlay: SecondaryOverlay | null = null
let deps: RadialMenuDeps | null = null
/** Screen-DIP point the cursor warps back to on fire (where the menu opened). */
let warpTarget: { x: number; y: number } | null = null
/** Last open payload, served over RADIAL.PENDING to cover the first-open race
 *  (window created lazily on first show; the OPEN_EVENT send can land while
 *  the renderer is still loading). */
let lastPayload: RadialOpenPayload | null = null
/** The live open's backdrop answer - image or failure - kept for the same race
 *  and cleared on the same paths as lastPayload. It needs the fallback more than
 *  the payload does: the payload is sent the instant the menu opens, while this
 *  lands tens of milliseconds later, right in the middle of the lazy window's
 *  first load. Without it the first menu of a session drew a plain disc whenever
 *  the capture beat the renderer's first paint. */
let lastBackdrop: RadialBackdropEvent | null = null
/** Reentrancy guard: closeRadialMenu hides, the hide fires the spec's
 *  onVisibilityChange, and that calls back in here. */
let closing = false
/** Monotonic open id. Only the backdrop needs it: that capture is async, so a
 *  fast toggle-toggle can land last menu's game pixels under this one. Never
 *  reset - it only ever has to be different from the previous value. */
let openSeq = 0

export function registerRadialMenuOverlay(d: RadialMenuDeps): SecondaryOverlay {
  deps = d
  if (overlay) return overlay
  overlay = registerSecondaryOverlay({
    id: 'radial-menu',
    htmlEntry: 'radial-menu.html',
    interaction: () => 'dialog',
    // Covers the whole game window (like the whiteboard) so the ring can be
    // drawn at any cursor position and any outside click lands on us.
    defaultAnchor: () => ({ fracX: 0, fracY: 0, fracW: 1, fracH: 1 }),
    repositionOnShow: true,
    // Every deliberate hide the windowing system performs on our behalf (the
    // Esc sweep, PoE exiting) must reach the renderer: hides are opacity-only,
    // so an untold renderer keeps a live, mouse-armed ring mounted.
    onVisibilityChange: (visible) => {
      if (!visible) closeRadialMenu()
    },
  })
  // Alt-tabbing out is the one hide that does NOT fire onVisibilityChange - it
  // records the window as restore-on-refocus instead. Closing here both tells
  // the renderer and (via hide()) clears that restore memory, so a menu the
  // user walked away from can never pop back interactive on return.
  registerOnPoeLeave(closeRadialMenu)
  return overlay
}

export function getRadialMenuOverlay(): SecondaryOverlay | null {
  return overlay
}

/** Narrow read: which menu, if any, is open. */
export function getPendingRadialPayload(): RadialOpenPayload | null {
  return lastPayload
}

/** What RADIAL.PENDING answers - both halves of the open in one snapshot, so a
 *  renderer that booted too late to hear either send can still catch up. */
export function getPendingRadialState(): RadialPendingState {
  return { payload: lastPayload, backdrop: lastBackdrop }
}

export function toggleRadialMenu(): void {
  if (!deps || !overlay) return
  if (overlay.isVisible()) {
    cancelRadialMenu()
    return
  }
  const slices = deps.getSlices()
  if (slices.length === 0) return
  const center = deps.getGameCursor()
  if (!center) return
  warpTarget = deps.getScreenCursor()
  if (!warpTarget) return
  const getIcon = deps.getPluginIcon
  const nonce = ++openSeq
  // Belt and braces with the close path: the previous menu's answer is game
  // pixels from wherever the cursor used to be, and it must never be served to
  // this open's pending pull.
  lastBackdrop = null
  lastPayload = {
    center,
    slices: slices.map((s) => withPluginIcon(s, getIcon)),
    scale: clampRadialScale(deps.getScale?.()),
    nonce,
    dev: deps.isDev?.() === true,
  }
  overlay.show()
  overlay.send(IPC_CHANNELS.RADIAL.OPEN_EVENT, lastPayload)
  requestBackdrop(center, nonce)
}

/** Kick off the backdrop grab and forget about it. Deliberately NOT awaited by
 *  the open: a screen capture costs tens of milliseconds and the ring has to be
 *  under the cursor the instant the hotkey lands, so the image catches up a
 *  frame or two later and fades in.
 *
 *  Content protection is the reason this is not a one-liner. The grab is of the
 *  whole SCREEN, and by the time it runs this overlay has been shown and has
 *  painted its own tinted disc right where the crop is centred - so the capture
 *  came back containing the menu, and the renderer then laid a second tint over
 *  the first. Compounded that is ~0.8 panel coverage under the disc, which is
 *  what made the backdrop read as flat grey in game.
 *
 *  A content-protected window is excluded from screen capture (on Windows via
 *  WDA_EXCLUDEFROMCAPTURE, so the capture sees the game *behind* us rather than
 *  a hole), which means the fix does not depend on winning a race with our own
 *  paint. Held for exactly as long as the grab and released in a finally, so a
 *  capture that throws cannot leave the window permanently unrecordable - and
 *  the window is only unrecordable for the ~100ms the grab takes, which no
 *  stream capture will resolve as anything. */
function requestBackdrop(center: { x: number; y: number }, nonce: number): void {
  const capture = deps?.captureBackdrop
  if (!capture) return
  // Non-null in practice - the caller shows the overlay first, and show()
  // creates the window - but a null here just means "no protection available",
  // which is the pre-existing behaviour rather than a reason to skip the grab.
  const win = overlay?.getWindow() ?? null
  const protect = (on: boolean): void => {
    try {
      win?.setContentProtection(on)
    } catch {
      // Not supported everywhere; a captured menu is a cosmetic problem.
    }
  }
  protect(true)
  void capture(center, RADIAL_BACKDROP_HALF_PX)
    .then((res) => {
      // Two ways to go stale, and both matter: a newer open (nonce moved on)
      // and a close (lastPayload cleared). Painting the previous menu's game
      // pixels under this one would be worse than showing no backdrop at all.
      if (!res || nonce !== openSeq || lastPayload === null) return
      // A failure goes down the same channel rather than being swallowed: the
      // ring ignores it, but the developer panel can name the gate that closed
      // instead of leaving every cause looking like "capture: none".
      const event: RadialBackdropEvent = { ...res, nonce }
      // Stored as well as sent, because the send has no queue and this lands
      // during the lazy window's first load. See lastBackdrop.
      lastBackdrop = event
      overlay?.send(IPC_CHANNELS.RADIAL.BACKDROP_EVENT, event)
    })
    .catch(() => {
      // Best-effort by design; the plain disc is the fallback.
    })
    .finally(() => protect(false))
}

/** The single close path: drop the open state, unmount the renderer's view,
 *  hide. Idempotent and safe to call from anywhere, including from inside the
 *  hide it performs. */
function closeRadialMenu(): void {
  if (closing) return
  const wasOpen = lastPayload !== null || warpTarget !== null
  closing = true
  try {
    lastPayload = null
    lastBackdrop = null
    warpTarget = null
    // webContents.send lands even while the window is opacity-hidden, which is
    // exactly why the renderer has to be told at all.
    if (wasOpen) overlay?.send(IPC_CHANNELS.RADIAL.CLOSE_EVENT)
    overlay?.hide()
  } finally {
    closing = false
  }
}

export function cancelRadialMenu(): void {
  closeRadialMenu()
}

export function fireRadialSlice(sliceId: string): void {
  if (!deps || !overlay) return
  const slice = deps.getSlices().find((s) => s.id === sliceId)
  // Read before the close clears it. Clearing on fire is deliberate: the warp
  // point belongs to one open, so a stray second fire can't yank the cursor
  // back to where a menu stood minutes ago.
  const target = warpTarget
  closeRadialMenu()
  if (!slice) return
  deps.focusGame()
  if (target) deps.warpTo(target)
  const d = deps
  const action = slice.action
  d.defer(() => {
    switch (action.kind) {
      case 'filter':
        d.fire.filter()
        break
      case 'pricecheck':
        d.fire.pricecheck()
        break
      case 'appmacro':
        d.fire.appmacro(action.action, action.presetId)
        break
      case 'chat':
        d.fire.chat(action.command, action.autoSubmit)
        break
      case 'cheatsheet':
        d.fire.cheatsheet(action.categoryId)
        break
    }
  })
}
