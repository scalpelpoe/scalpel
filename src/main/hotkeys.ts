import { uIOhook, UiohookKey } from 'uiohook-napi'
import { clipboard, globalShortcut } from 'electron'
import { snapshotClipboard } from './clipboard-preserve'
import { OverlayController } from 'electron-overlay-window'
import { focusGameWindow, getOverlayWindow } from './overlay'

// ─── Accelerator → uiohook keycode mapping ────────────────────────────────────

const LETTER_KEYS: Record<string, number> = Object.fromEntries(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [c, UiohookKey[c as keyof typeof UiohookKey]]),
)

const EXTRA_KEYS: Record<string, number> = {
  F1: UiohookKey.F1,
  F2: UiohookKey.F2,
  F3: UiohookKey.F3,
  F4: UiohookKey.F4,
  F5: UiohookKey.F5,
  F6: UiohookKey.F6,
  F7: UiohookKey.F7,
  F8: UiohookKey.F8,
  F9: UiohookKey.F9,
  F10: UiohookKey.F10,
  F11: UiohookKey.F11,
  F12: UiohookKey.F12,
  Space: UiohookKey.Space,
  Tab: UiohookKey.Tab,
  Escape: UiohookKey.Escape,
  Delete: UiohookKey.Delete,
  Home: UiohookKey.Home,
  End: UiohookKey.End,
  PageUp: UiohookKey.PageUp,
  PageDown: UiohookKey.PageDown,
  '0': UiohookKey['0'],
  '1': UiohookKey['1'],
  '2': UiohookKey['2'],
  '3': UiohookKey['3'],
  '4': UiohookKey['4'],
  '5': UiohookKey['5'],
  '6': UiohookKey['6'],
  '7': UiohookKey['7'],
  '8': UiohookKey['8'],
  '9': UiohookKey['9'],
}

const KEY_MAP = { ...LETTER_KEYS, ...EXTRA_KEYS }

// ─── State ────────────────────────────────────────────────────────────────────

let currentAccelerator: string | null = null
let priceCheckAccelerator: string | null = null
let chatCommandHotkeys: Array<{ accelerator: string; command: string; autoSubmit: boolean }> = []
let appMacroAccelerators: string[] = []
let lastAppMacros: Array<{ action: string; hotkey: string; tag?: string }> = []
let onAppMacro: ((action: string, tag?: string) => void) | null = null
let onTrigger: (() => void) | null = null
let onPriceCheck: (() => void) | null = null
let onEscape: (() => void) | null = null
let hookStarted = false
let injecting = false
let stashScrollEnabled = false

// ─── Public API ───────────────────────────────────────────────────────────────

/** Start the low-level keyboard hook (for Escape only) and register the trigger callback. */
export function startHotkeyListener(handler: () => void): void {
  onTrigger = handler

  // uiohook is only used for Escape (overlay close), stash scroll, and modifier tracking
  initModifierTracking()
  uIOhook.on('keydown', (e) => {
    if (injecting) return
    // Only respond to Escape when PoE or the overlay itself has focus -- otherwise
    // pressing Esc in another app (browser, Discord, etc.) would silently hide the
    // overlay here in the background.
    if (e.keycode === UiohookKey.Escape && onEscape) {
      const overlayWin = getOverlayWindow()
      const overlayFocused = !!overlayWin && !overlayWin.isDestroyed() && overlayWin.isFocused()
      if (OverlayController.targetHasFocus || overlayFocused) onEscape()
    }
  })

  // Stash tab scrolling: Ctrl+scroll outside stash grid -> arrow key taps
  uIOhook.on('wheel', (e) => {
    if (!stashScrollEnabled || !e.ctrlKey || !OverlayController.targetHasFocus) return
    const tb = OverlayController.targetBounds
    if (!tb || !tb.width) return
    // Only act when cursor is inside the PoE window but outside the stash grid area
    if (e.x < tb.x || e.x > tb.x + tb.width || e.y < tb.y || e.y > tb.y + tb.height) return
    if (isStashGridArea(e.x, e.y, tb)) return
    if (e.rotation > 0) {
      uIOhook.keyTap(UiohookKey.ArrowRight)
    } else if (e.rotation < 0) {
      uIOhook.keyTap(UiohookKey.ArrowLeft)
    }
  })

  if (!hookStarted) {
    uIOhook.start()
    hookStarted = true
  }
}

/** Temporarily unregister all global shortcuts so the hotkey recorder can capture keys. */
export function suspendHotkeys(): void {
  globalShortcut.unregisterAll()
}

/** Re-register all global shortcuts after the hotkey recorder finishes. */
export function resumeHotkeys(): void {
  if (currentAccelerator) setHotkey(currentAccelerator)
  if (priceCheckAccelerator) setPriceCheckHotkey(priceCheckAccelerator)
  const cmds = chatCommandHotkeys.map((c) => ({ hotkey: c.accelerator, command: c.command, autoSubmit: c.autoSubmit }))
  setChatCommands(cmds)
  setAppMacros(lastAppMacros)
}

/** Update the active hotkey using globalShortcut (suppresses key from reaching other apps). */
export function setHotkey(accelerator: string): void {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch {}
  }
  currentAccelerator = accelerator
  try {
    globalShortcut.register(accelerator, () => {
      if (!injecting && onTrigger) onTrigger()
    })
  } catch (e) {
    console.error(`[hotkeys] Failed to register hotkey "${accelerator}":`, e)
  }
}

export function setPriceCheckHotkey(accelerator: string): void {
  if (priceCheckAccelerator) {
    try {
      globalShortcut.unregister(priceCheckAccelerator)
    } catch {}
  }
  priceCheckAccelerator = accelerator
  try {
    globalShortcut.register(accelerator, () => {
      if (!injecting && onPriceCheck) onPriceCheck()
    })
  } catch (e) {
    console.error(`[hotkeys] Failed to register price check hotkey "${accelerator}":`, e)
  }
}

export function setPriceCheckHandler(handler: (() => void) | null): void {
  onPriceCheck = handler
}

export function setEscapeHandler(handler: (() => void) | null): void {
  onEscape = handler
}

export function setChatCommands(commands: Array<{ hotkey: string; command: string; autoSubmit?: boolean }>): void {
  // Unregister previous chat command shortcuts
  for (const ch of chatCommandHotkeys) {
    try {
      globalShortcut.unregister(ch.accelerator)
    } catch {}
  }
  chatCommandHotkeys = []

  for (const c of commands) {
    if (!c.hotkey || !c.command) continue
    const autoSubmit = c.autoSubmit !== false
    try {
      globalShortcut.register(c.hotkey, () => {
        if (!injecting) sendChatCommand(c.command, autoSubmit)
      })
      chatCommandHotkeys.push({ accelerator: c.hotkey, command: c.command, autoSubmit })
    } catch (e) {
      console.error(`[hotkeys] Failed to register chat command "${c.hotkey}":`, e)
    }
  }
}

export function setAppMacroHandler(handler: (action: string, tag?: string) => void): void {
  onAppMacro = handler
}

export function setAppMacros(macros: Array<{ action: string; hotkey: string; tag?: string }>): void {
  lastAppMacros = macros
  for (const acc of appMacroAccelerators) {
    try {
      globalShortcut.unregister(acc)
    } catch {}
  }
  appMacroAccelerators = []

  for (const { action, hotkey, tag } of macros) {
    if (!hotkey || !action) continue
    try {
      globalShortcut.register(hotkey, () => {
        if (!injecting && onAppMacro) onAppMacro(action, tag)
      })
      appMacroAccelerators.push(hotkey)
    } catch (e) {
      console.error(`[hotkeys] Failed to register app macro "${action}" (${hotkey}):`, e)
    }
  }
}

/**
 * Paste text into PoE chat via clipboard + uiohook keyTaps.
 * Layout-independent, near-instant.
 */
let chatLocked = false
function pasteToPoEChat(text: string, submit: boolean): Promise<void> {
  if (chatLocked) return Promise.resolve()
  chatLocked = true

  const restoreClip = snapshotClipboard()
  clipboard.writeText(text)
  injecting = true

  // Focus PoE so keystrokes reach the game (only if it doesn't already have focus)
  if (!OverlayController.targetHasFocus) focusGameWindow()

  // All keystrokes fire synchronously so the chat window
  // opens and closes in a single frame, preventing visible flash
  uIOhook.keyTap(UiohookKey.Enter)
  uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
  uIOhook.keyTap(UiohookKey.A)
  uIOhook.keyTap(UiohookKey.V)
  uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
  if (submit) {
    uIOhook.keyTap(UiohookKey.Enter)
  }

  // Restore clipboard and re-register hotkeys after paste completes
  return new Promise((resolve) =>
    setTimeout(() => {
      restoreClip()
      chatLocked = false
      injecting = false
      resolve()
    }, 50),
  )
}

export function sendChatCommand(command: string, autoSubmit = true): Promise<void> {
  // Only release modifiers that are actually held (fewer SendInput calls = less frame lag)
  const held: ModSnapshot = { ...heldModifiers }
  const prevInjecting = injecting
  injecting = true
  if (held.ctrl) uIOhook.keyToggle(held.ctrl, 'up')
  if (held.shift) uIOhook.keyToggle(held.shift, 'up')
  if (held.alt) uIOhook.keyToggle(held.alt, 'up')
  injecting = prevInjecting
  return pasteToPoEChat(command, autoSubmit).then(() => restoreModifiers(held))
}

/** Track physically held modifier keys via uiohook (ignores synthetic key events during injection) */
const heldModifiers = { ctrl: 0 as number, shift: 0 as number, alt: 0 as number }

function initModifierTracking(): void {
  uIOhook.on('keydown', (e) => {
    if (injecting) return
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) heldModifiers.ctrl = e.keycode
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) heldModifiers.shift = e.keycode
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) heldModifiers.alt = e.keycode
  })
  uIOhook.on('keyup', (e) => {
    if (injecting) return
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) heldModifiers.ctrl = 0
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) heldModifiers.shift = 0
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) heldModifiers.alt = 0
  })
}

type ModSnapshot = { ctrl: number; shift: number; alt: number }

/** Re-press the exact modifier keys from a snapshot (using the correct left/right variant) */
function restoreModifiers(snapshot: ModSnapshot): void {
  const prevInjecting = injecting
  injecting = true
  if (snapshot.ctrl) uIOhook.keyToggle(snapshot.ctrl, 'down')
  if (snapshot.shift) uIOhook.keyToggle(snapshot.shift, 'down')
  if (snapshot.alt) uIOhook.keyToggle(snapshot.alt, 'down')
  injecting = prevInjecting
}

export function stopHotkeyListener(): void {
  if (hookStarted) {
    uIOhook.stop()
    hookStarted = false
  }
  globalShortcut.unregisterAll()
}

export function setStashScrollEnabled(enabled: boolean): void {
  stashScrollEnabled = enabled
}

// PoE stash grid area (physical pixels) - if cursor is here, don't intercept scroll
const POE_SIDEBAR_RATIO = 370 / 600
function isStashGridArea(x: number, y: number, tb: { x: number; y: number; width: number; height: number }): boolean {
  const sidebarWidth = tb.height * POE_SIDEBAR_RATIO
  if (x > tb.x + sidebarWidth) return false
  const gridTop = tb.y + (tb.height * 154) / 1600
  const gridBottom = tb.y + (tb.height * 1192) / 1600
  return y > gridTop && y < gridBottom
}

/**
 * Send /reloaditemfilter to PoE's chat to reload the loot filter in-game.
 */
export function sendReloadFilterToPoE(): Promise<void> {
  return pasteToPoEChat('/reloaditemfilter', true)
}

/**
 * Send /itemfilter {name} to PoE's chat to switch the active filter in-game.
 */
export async function sendItemFilterCommand(filterName: string, currentFilter?: string): Promise<void> {
  if (currentFilter) {
    // Switch to the current filter first to force PoE to rescan its filter directory,
    // so it discovers the newly created file before we switch to it
    await pasteToPoEChat(`/itemfilter ${currentFilter}`, true)
    await new Promise((r) => setTimeout(r, 500))
  }
  await pasteToPoEChat(`/itemfilter ${filterName}`, true)
}

// ─── Ctrl+C sender ───────────────────────────────────────────────────────────

/**
 * Send Ctrl+Alt+C to PoE via uiohook (OS-level SendInput).
 * Releases any modifier keys the user is holding from their hotkey combo
 * so PoE receives a clean Ctrl+Alt+C.
 */
export function sendCtrlCToPoE(): Promise<void> {
  injecting = true

  // Instead of releasing all user modifiers (racy to restore), piggyback on
  // whatever the user already holds and only add what's missing for Ctrl+Alt+C.
  const needCtrl = !heldModifiers.ctrl
  const needAlt = !heldModifiers.alt

  // Temporarily release Shift if held (Shift+Ctrl+Alt+C may not register in PoE)
  const heldShift = heldModifiers.shift
  if (heldShift) {
    uIOhook.keyToggle(UiohookKey.Shift, 'up')
    uIOhook.keyToggle(UiohookKey.ShiftRight, 'up')
  }

  if (needCtrl) uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
  if (needAlt) uIOhook.keyToggle(UiohookKey.Alt, 'down')
  uIOhook.keyTap(UiohookKey.C)
  if (needAlt) uIOhook.keyToggle(UiohookKey.Alt, 'up')
  if (needCtrl) uIOhook.keyToggle(UiohookKey.Ctrl, 'up')

  // Re-press Shift immediately if it was held
  if (heldShift) uIOhook.keyToggle(heldShift, 'down')

  return new Promise((resolve) =>
    setTimeout(() => {
      injecting = false
      resolve()
    }, 100),
  )
}
