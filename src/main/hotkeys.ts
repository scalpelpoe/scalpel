import { clipboard, globalShortcut, ipcMain } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import { UiohookKey, uIOhook } from 'uiohook-napi'
import {
  appMacroEffectiveScope,
  chatCommandEffectiveScope,
  type MacroScope,
  scopeAppliesTo,
} from '../shared/macro-scope'
import { snapshotClipboard } from './clipboard-preserve'
import {
  guardNativeListener,
  recordMainBreadcrumb,
  recordMainDiagnostic,
  registerDiagnosticProvider,
} from './diagnostics'
import { getPoeVersion } from './game-state'
import { focusGameWindow, getOverlayWindow, isTypingInOverlay } from './overlay'
import { hideFocusedOrAnyVisibleSecondaryOverlay } from './windowing'

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

interface KeyCombo {
  keycode: number
  ctrl: boolean
  shift: boolean
  alt: boolean
}

let currentAccelerator: string | null = null
let priceCheckAccelerator: string | null = null
let triggerCombo: KeyCombo | null = null
let priceCheckCombo: KeyCombo | null = null
let chatCommandHotkeys: Array<{ accelerator: string; command: string; autoSubmit: boolean; scope?: MacroScope }> = []
let appMacroAccelerators: string[] = []
let lastAppMacros: Array<{ action: string; hotkey: string; tag?: string; scope?: MacroScope }> = []
let onAppMacro: ((action: string, tag?: string) => void) | null = null
// Secondary-overlay hotkeys (cheat-sheets today, more later). Stored as a
// flat list of (accelerator, handler) pairs so each consumer composes its own
// shape (e.g. cheat-sheet sends one for the global toggle and one per
// category) without baking that shape into the hotkey layer.
interface OverlayHotkey {
  accelerator: string
  handler: () => void
}
let secondaryOverlayHotkeys: OverlayHotkey[] = []
let registeredOverlayAccelerators: string[] = []
let onTrigger: (() => void) | null = null
let onPriceCheck: (() => void) | null = null
let onEscape: (() => void) | null = null
let hookStarted = false
let hookSuspended = false
let injecting = false
let stashScrollEnabled = false
let lastHookStartError: string | null = null
let lastHookStopError: string | null = null
let hookResumeTimer: ReturnType<typeof setTimeout> | null = null

/** globalShortcut is suppressed when the non-attached PoE has focus (Windows blocks
 *  hotkey delivery from a game that Electron isn't attached to); uIOhook is a
 *  kernel hook that fires anyway. Registering both means both can deliver for the
 *  same press. This dedupe swallows the second fire within the window. */
const DEDUPE_MS = 100
let lastTriggerFireAt = 0
let lastPriceCheckFireAt = 0

function parseAccelerator(accelerator: string): KeyCombo | null {
  let ctrl = false
  let shift = false
  let alt = false
  let keycode = 0
  for (const part of accelerator.split('+').map((s) => s.trim())) {
    if (part === 'CommandOrControl' || part === 'Control' || part === 'Ctrl' || part === 'Command') ctrl = true
    else if (part === 'Shift') shift = true
    else if (part === 'Alt' || part === 'Option') alt = true
    else if (KEY_MAP[part]) keycode = KEY_MAP[part]
  }
  return keycode ? { keycode, ctrl, shift, alt } : null
}

function matchesCombo(
  e: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  c: KeyCombo,
): boolean {
  return e.keycode === c.keycode && e.ctrlKey === c.ctrl && e.shiftKey === c.shift && e.altKey === c.alt
}

function fireTrigger(): void {
  const now = Date.now()
  if (now - lastTriggerFireAt < DEDUPE_MS) return
  lastTriggerFireAt = now
  if (!injecting && onTrigger) onTrigger()
}

/** True when PoE has foreground focus or one of Scalpel's overlay windows is
 *  focused. Used to gate hotkeys that only make sense in a PoE-adjacent context
 *  (chat commands, Escape-closes-overlay) so they don't fire in a browser or
 *  random app when Scalpel is running in the background. See issues #18, #21. */
function hasPoeOrOverlayFocus(): boolean {
  if (OverlayController.targetHasFocus) return true
  const overlayWin = getOverlayWindow()
  return !!overlayWin && !overlayWin.isDestroyed() && overlayWin.isFocused()
}

function firePriceCheck(): void {
  const now = Date.now()
  if (now - lastPriceCheckFireAt < DEDUPE_MS) return
  lastPriceCheckFireAt = now
  if (!injecting && onPriceCheck) onPriceCheck()
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Start the low-level keyboard hook (for Escape only) and register the trigger callback. */
export function startHotkeyListener(handler: () => void): void {
  onTrigger = handler

  // uiohook is only used for Escape (overlay close), stash scroll, and modifier tracking
  initModifierTracking()
  uIOhook.on(
    'keydown',
    guardNativeListener('keydown-main', (e) => {
      if (injecting) return
      // Only respond to Escape when PoE or the overlay itself has focus -- otherwise
      // pressing Esc in another app (browser, Discord, etc.) would silently hide the
      // overlay here in the background.
      if (e.keycode === UiohookKey.Escape) {
        // Secondary overlays (cheat sheets etc.) own Esc when visible. The
        // renderer keydown listener doesn't fire reliably because Windows
        // often denies focus stealing from PoE, so handle it kernel-side here.
        if (hideFocusedOrAnyVisibleSecondaryOverlay()) return
        // Only respond to Escape when PoE or the overlay itself has focus -- otherwise
        // pressing Esc in another app (browser, Discord, etc.) would silently hide the
        // overlay here in the background.
        if (onEscape && hasPoeOrOverlayFocus()) onEscape()
      }
      // Trigger + price-check via uIOhook so the combo fires in BOTH PoE1 and PoE2,
      // not just whichever game electron-overlay-window is attached to. The handlers
      // themselves (ensureCorrectGameForHotkey) gate on the focused window's title,
      // so presses in non-PoE apps are ignored downstream.
      if (triggerCombo && matchesCombo(e, triggerCombo)) fireTrigger()
      if (priceCheckCombo && matchesCombo(e, priceCheckCombo)) firePriceCheck()
    }),
  )

  // Stash tab scrolling: Ctrl+scroll outside stash grid -> arrow key taps
  uIOhook.on(
    'wheel',
    guardNativeListener('wheel', (e) => {
      if (!stashScrollEnabled || !e.ctrlKey || !OverlayController.targetHasFocus) return
      const tb = OverlayController.targetBounds
      if (!tb?.width) return
      // Only act when cursor is inside the PoE window but outside the stash grid area
      if (e.x < tb.x || e.x > tb.x + tb.width || e.y < tb.y || e.y > tb.y + tb.height) return
      if (isStashGridArea(e.x, e.y, tb)) return
      if (e.rotation > 0) {
        uIOhook.keyTap(UiohookKey.ArrowRight)
      } else if (e.rotation < 0) {
        uIOhook.keyTap(UiohookKey.ArrowLeft)
      }
    }),
  )

  if (!hookStarted) {
    try {
      uIOhook.start()
      hookStarted = true
      lastHookStartError = null
    } catch (e) {
      lastHookStartError = String(e)
      recordMainDiagnostic('uiohook-start', e)
    }

    ipcMain.handle('screen-pick:suspend-hook', () => {
      if (hookSuspended) return
      try {
        uIOhook.stop()
      } catch {}
      hookSuspended = true
      if (hookResumeTimer) clearTimeout(hookResumeTimer)
      // Safety net: if the renderer never sends resume (crash / window closed
      // mid-pick), auto-restart the hook so Escape/hotkeys/scroll can't stay dead.
      hookResumeTimer = setTimeout(() => {
        hookResumeTimer = null
        if (hookSuspended) {
          try {
            uIOhook.start()
            hookSuspended = false
          } catch (e) {
            lastHookStartError = String(e)
            /* best-effort auto-resume */
          }
        }
      }, 60000)
    })
    ipcMain.handle('screen-pick:resume-hook', () => {
      if (hookResumeTimer) {
        clearTimeout(hookResumeTimer)
        hookResumeTimer = null
      }
      if (hookSuspended) {
        try {
          uIOhook.start()
          hookSuspended = false
          lastHookStartError = null
        } catch (e) {
          lastHookStartError = String(e)
          /* best-effort resume */
        }
      }
    })
  }
}

// Refcounted so multiple independent reasons to suspend (hotkey recorder open
// AND user typing in an overlay input, etc.) compose without one popping the
// other's suspension. Each suspend pairs with one resume.
//
// All set*() mutators below MUST treat `suspendDepth > 0` as "store-only, skip
// OS-side globalShortcut.register/unregister". Boot starts with all shortcuts
// suspended until PoE actually gains focus (see index.ts), and the user can
// edit a hotkey via settings while PoE is unfocused. Without the gate, those
// set*() calls hijack the accelerator system-wide (e.g. F5 stops refreshing
// browsers) even though we're nominally suspended. See issues #18, #21.
let suspendDepth = 0

/** Temporarily unregister all global shortcuts (recorder, input typing, etc.). */
export function suspendHotkeys(): void {
  suspendDepth++
  if (suspendDepth === 1) globalShortcut.unregisterAll()
}

/** Re-register all global shortcuts when the last suspender resumes. */
export function resumeHotkeys(): void {
  if (suspendDepth === 0) return
  suspendDepth--
  if (suspendDepth > 0) return
  if (currentAccelerator) setHotkey(currentAccelerator)
  if (priceCheckAccelerator) setPriceCheckHotkey(priceCheckAccelerator)
  const cmds = chatCommandHotkeys.map((c) => ({
    hotkey: c.accelerator,
    command: c.command,
    autoSubmit: c.autoSubmit,
    scope: c.scope,
  }))
  setChatCommands(cmds)
  setAppMacros(lastAppMacros)
  setSecondaryOverlayHotkeys(secondaryOverlayHotkeys)
}

/** Update the active hotkey. Registered with both globalShortcut (swallows the key
 *  from reaching the focused app when possible) and uIOhook (kernel-level fallback
 *  that still fires when PoE blocks globalShortcut from the non-attached game).
 *  fireTrigger dedupes the two paths. */
export function setHotkey(accelerator: string): void {
  if (currentAccelerator && suspendDepth === 0) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch {}
  }
  currentAccelerator = accelerator
  // Combo is consumed by the uIOhook fallback regardless of globalShortcut
  // state, so update it even when suspended.
  triggerCombo = parseAccelerator(accelerator)
  if (suspendDepth > 0) return
  try {
    globalShortcut.register(accelerator, () => fireTrigger())
  } catch (e) {
    console.error(`[hotkeys] Failed to register hotkey "${accelerator}":`, e)
  }
}

export function setPriceCheckHotkey(accelerator: string): void {
  if (priceCheckAccelerator && suspendDepth === 0) {
    try {
      globalShortcut.unregister(priceCheckAccelerator)
    } catch {}
  }
  priceCheckAccelerator = accelerator
  priceCheckCombo = parseAccelerator(accelerator)
  if (suspendDepth > 0) return
  try {
    globalShortcut.register(accelerator, () => firePriceCheck())
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

export function setChatCommands(
  commands: Array<{ hotkey: string; command: string; autoSubmit?: boolean; scope?: MacroScope }>,
): void {
  // Unregister previous chat command shortcuts (no-op when suspended -- nothing
  // is registered with the OS in that state).
  if (suspendDepth === 0) {
    for (const ch of chatCommandHotkeys) {
      try {
        globalShortcut.unregister(ch.accelerator)
      } catch {}
    }
  }
  chatCommandHotkeys = []

  const version = getPoeVersion()
  for (const c of commands) {
    if (!c.hotkey || !c.command) continue
    if (!scopeAppliesTo(chatCommandEffectiveScope(c), version)) continue
    const autoSubmit = c.autoSubmit !== false
    chatCommandHotkeys.push({ accelerator: c.hotkey, command: c.command, autoSubmit, scope: c.scope })
    if (suspendDepth > 0) continue
    try {
      globalShortcut.register(c.hotkey, () => {
        if (injecting || isTypingInOverlay()) return
        // Defense-in-depth focus gate: even with the registration-time suspend
        // check, races between focus events and key delivery could otherwise
        // route a press to the wrong app's keystroke injection. Gate on
        // PoE/overlay focus so unrelated apps see the raw key. Issues #18, #21.
        if (!hasPoeOrOverlayFocus()) return
        sendChatCommand(c.command, autoSubmit)
      })
    } catch (e) {
      console.error(`[hotkeys] Failed to register chat command "${c.hotkey}":`, e)
    }
  }
}

export function setAppMacroHandler(handler: (action: string, tag?: string) => void): void {
  onAppMacro = handler
}

/** Replace the set of secondary-overlay hotkeys (cheat-sheet global + per
 *  category, future overlays' triggers, etc.). Each entry is just an
 *  accelerator + handler pair - this layer doesn't care which overlay it
 *  belongs to. Re-applied automatically by resumeHotkeys. */
export function setSecondaryOverlayHotkeys(hotkeys: OverlayHotkey[]): void {
  secondaryOverlayHotkeys = hotkeys
  if (suspendDepth === 0) {
    for (const acc of registeredOverlayAccelerators) {
      try {
        globalShortcut.unregister(acc)
      } catch {}
    }
  }
  registeredOverlayAccelerators = []
  if (suspendDepth > 0) return
  for (const { accelerator, handler } of hotkeys) {
    if (!accelerator) continue
    try {
      if (
        globalShortcut.register(accelerator, () => {
          if (isTypingInOverlay()) return
          handler()
        })
      ) {
        registeredOverlayAccelerators.push(accelerator)
      }
    } catch (e) {
      console.error(`[hotkeys] Failed to register secondary-overlay hotkey "${accelerator}":`, e)
    }
  }
}

export function setAppMacros(
  macros: Array<{ action: string; hotkey: string; tag?: string; scope?: MacroScope }>,
): void {
  lastAppMacros = macros
  if (suspendDepth === 0) {
    for (const acc of appMacroAccelerators) {
      try {
        globalShortcut.unregister(acc)
      } catch {}
    }
  }
  appMacroAccelerators = []
  if (suspendDepth > 0) return

  const version = getPoeVersion()
  for (const m of macros) {
    if (!m.hotkey || !m.action) continue
    if (!scopeAppliesTo(appMacroEffectiveScope(m), version)) continue
    try {
      globalShortcut.register(m.hotkey, () => {
        if (injecting || isTypingInOverlay() || !onAppMacro) return
        onAppMacro(m.action, m.tag)
      })
      appMacroAccelerators.push(m.hotkey)
    } catch (e) {
      console.error(`[hotkeys] Failed to register app macro "${m.action}" (${m.hotkey}):`, e)
    }
  }
}

const PLACEHOLDER_LAST = '@last'
const AUTO_CLEAR = [
  '#', // Global
  '%', // Party
  '@', // Whisper
  '$', // Trade
  '&', // Guild
  '/', // Command
]

/**
 * Paste text into PoE chat via clipboard + uiohook keyTaps.
 * Layout-independent, near-instant.
 */
let chatLocked = false
function pasteToPoEChat(text: string, submit: boolean): Promise<void> {
  if (chatLocked) return Promise.resolve()
  chatLocked = true

  const restoreClip = snapshotClipboard()
  injecting = true

  // Focus PoE so keystrokes reach the game (only if it doesn't already have focus)
  if (!OverlayController.targetHasFocus) focusGameWindow()

  // All keystrokes fire synchronously so the chat window
  // opens and closes in a single frame, preventing visible flash
  if (text.startsWith(PLACEHOLDER_LAST)) {
    // Ctrl+Enter pre-fills @<lastwhisperer> in the chat input; paste body after
    text = text.slice(`${PLACEHOLDER_LAST} `.length)
    clipboard.writeText(text)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.Enter)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
  } else if (text.endsWith(PLACEHOLDER_LAST)) {
    // Ctrl+Enter pre-fills @CharName at position 0; Home x2 then Delete strips the @
    text = text.slice(0, -PLACEHOLDER_LAST.length)
    clipboard.writeText(text)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.Enter)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
    uIOhook.keyTap(UiohookKey.Home)
    // press twice to focus input when using controller
    uIOhook.keyTap(UiohookKey.Home)
    uIOhook.keyTap(UiohookKey.Delete)
  } else {
    clipboard.writeText(text)
    uIOhook.keyTap(UiohookKey.Enter)
    // PoE auto-clears the input when the text starts with a chat-prefix char
    if (!AUTO_CLEAR.includes(text[0])) {
      uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
      uIOhook.keyTap(UiohookKey.A)
      uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
    }
  }

  uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
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
  uIOhook.on(
    'keydown',
    guardNativeListener('keydown-modifiers', (e) => {
      if (injecting) return
      if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) heldModifiers.ctrl = e.keycode
      if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) heldModifiers.shift = e.keycode
      if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) heldModifiers.alt = e.keycode
    }),
  )
  uIOhook.on(
    'keyup',
    guardNativeListener('keyup', (e) => {
      if (injecting) return
      if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) heldModifiers.ctrl = 0
      if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) heldModifiers.shift = 0
      if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) heldModifiers.alt = 0
    }),
  )
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
    // Breadcrumbs bracket the uiohook worker-thread join (uiohook_worker.c:
    // uv_thread_join). If the log shows "calling" with no "returned", the join
    // wedged and the quit hung here; the try/catch keeps a stop() failure from
    // aborting the process via the tsfn proxy.
    recordMainBreadcrumb('uIOhook.stop() calling')
    try {
      uIOhook.stop()
      lastHookStopError = null
    } catch (e) {
      lastHookStopError = String(e)
      recordMainDiagnostic('uiohook-stop', e)
    }
    recordMainBreadcrumb('uIOhook.stop() returned')
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

function getHotkeyDiagnostics(): Record<string, unknown> {
  return {
    hookStarted,
    hookSuspended,
    suspendDepth,
    triggerHotkeyConfigured: currentAccelerator !== null,
    priceCheckHotkeyConfigured: priceCheckAccelerator !== null,
    chatCommandHotkeyCount: chatCommandHotkeys.length,
    appMacroHotkeyCount: appMacroAccelerators.length,
    secondaryOverlayHotkeyCount: secondaryOverlayHotkeys.length,
    stashScrollEnabled,
    lastHookStartError,
    lastHookStopError,
  }
}

registerDiagnosticProvider('hotkeyDiagnostics', getHotkeyDiagnostics)
