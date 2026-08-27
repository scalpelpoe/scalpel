import { clipboard, globalShortcut, ipcMain } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import { UiohookKey, uIOhook } from 'uiohook-napi'
import { appMacroEffectiveScope, chatCommandEffectiveScope, type MacroScope, scopeAppliesTo } from '@shared/macro-scope'
import { POE_SIDEBAR_RATIO } from '@shared/poe-geometry'
import { snapshotClipboard } from './clipboard-preserve'
import { type KeyCombo, isElectronRegisterable, parseAccelerator } from './hotkey-accelerator'
import {
  guardNativeListener,
  recordMainBreadcrumb,
  recordMainDiagnostic,
  registerDiagnosticProvider,
} from './diagnostics'
import { getPoeVersion } from './game-state'
import { focusGameWindow, isTypingInOverlay, setOverlayVisibilityListener } from './overlay'
import { advancedCopyTracker } from './trade/advanced-copy'
import { hideFocusedOrAnyVisibleSecondaryOverlay, isAnyScalpelBrowserWindowFocused } from './windowing'

// ─── State ────────────────────────────────────────────────────────────────────

let currentAccelerator: string | null = null
let priceCheckAccelerator: string | null = null
let launcherAccelerator: string | null = null
let triggerCombo: KeyCombo | null = null
let priceCheckCombo: KeyCombo | null = null
let launcherCombo: KeyCombo | null = null
type ChatCommandConfig = { hotkey: string; command: string; autoSubmit?: boolean; scope?: MacroScope }
type AppMacroConfig = { action: string; hotkey: string; tag?: string; presetId?: string; scope?: MacroScope }
type ScopedHotkeyCategory = 'chat-command' | 'app-macro'

let configuredChatCommands: ChatCommandConfig[] = []
let configuredAppMacros: AppMacroConfig[] = []
let registeredChatAccelerators: string[] = []
let appMacroAccelerators: string[] = []
let applicableChatCommandCount = 0
let applicableAppMacroCount = 0
let failedScopedRegistrations: Array<{ category: ScopedHotkeyCategory; accelerator: string }> = []
let onAppMacro: ((action: string, tag?: string, presetId?: string) => void) | null = null
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
let onLauncher: (() => void) | null = null
let onEscape: (() => void) | null = null
let hookStarted = false
let hookSuspended = false
let injecting = false
let stashScrollEnabled = false
let stashScrollModifier: 'Ctrl' | 'Shift' | 'Alt' = 'Ctrl'
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
let lastLauncherFireAt = 0
let lastEscapeFireAt = 0

// Escape is also registered as a real globalShortcut (not just the uiohook
// fallback below) while the main overlay is visible, so the OS consumes the
// key before PoE sees it - see fireEscape/syncEscapeShortcut.
let escapeShortcutRegistered = false
let overlayVisibleForEscape = false

function matchesCombo(
  e: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  c: KeyCombo,
): boolean {
  return e.keycode === c.keycode && e.ctrlKey === c.ctrl && e.shiftKey === c.shift && e.altKey === c.alt
}

/** PoE2 binds W/A/S/D to movement, so a hotkey that shares one of those keys
 *  (the defaults are Ctrl+D and Ctrl+A) makes the character lurch:
 *  globalShortcut doesn't reliably swallow the keydown before it reaches the
 *  game, and the game keeps moving until it sees a keyup. Inject a keyup for the
 *  non-modifier key the instant the hotkey fires so movement stops immediately.
 *  Modifiers are left held - they don't move the character, they're tracked by
 *  heldModifiers, and the follow-up copy relies on them. Mirrors Exiled-
 *  Exchange-2's keepModKeys release. */
function releaseHotkeyKey(combo: KeyCombo | null): void {
  if (!combo) return
  uIOhook.keyToggle(combo.keycode, 'up')
}

function fireTrigger(): void {
  if (injecting || isTypingInOverlay() || !hotkeyContextIsActive()) return
  const now = Date.now()
  if (now - lastTriggerFireAt < DEDUPE_MS) return
  lastTriggerFireAt = now
  releaseHotkeyKey(triggerCombo)
  if (onTrigger) onTrigger()
}

function firePriceCheck(): void {
  if (injecting || isTypingInOverlay() || !hotkeyContextIsActive()) return
  const now = Date.now()
  if (now - lastPriceCheckFireAt < DEDUPE_MS) return
  lastPriceCheckFireAt = now
  releaseHotkeyKey(priceCheckCombo)
  if (onPriceCheck) onPriceCheck()
}

function fireLauncher(): void {
  if (injecting || isTypingInOverlay() || !hotkeyContextIsActive()) return
  const now = Date.now()
  if (now - lastLauncherFireAt < DEDUPE_MS) return
  lastLauncherFireAt = now
  releaseHotkeyKey(launcherCombo)
  if (onLauncher) onLauncher()
}

/** Shared entry point for both Escape delivery paths (the globalShortcut
 *  registered by syncEscapeShortcut, and the uiohook fallback keydown branch
 *  below). Both can deliver for the same physical press - see DEDUPE_MS. */
function fireEscape(): void {
  if (injecting || isTypingInOverlay() || !hotkeyContextIsActive()) return
  const now = Date.now()
  if (now - lastEscapeFireAt < DEDUPE_MS) return
  lastEscapeFireAt = now
  // Secondary overlays (cheat sheets etc.) own Esc when visible - same
  // precedence as the existing uiohook branch.
  if (hideFocusedOrAnyVisibleSecondaryOverlay()) return
  if (onEscape) onEscape()
}

/** Register/unregister the Escape globalShortcut so the OS consumes the key
 *  before PoE sees it, exactly while the main overlay is visible, the
 *  attached game has focus, hotkeys aren't suspended, and a handler is set.
 *  Safe to call from anywhere - it's a no-op when the desired state already
 *  matches the registered state. */
function syncEscapeShortcut(): void {
  const desired = !!onEscape && overlayVisibleForEscape && OverlayController.targetHasFocus && suspendDepth === 0
  if (desired === escapeShortcutRegistered) return
  if (desired) {
    try {
      const ok = globalShortcut.register('Escape', () => fireEscape())
      escapeShortcutRegistered = ok
    } catch (e) {
      console.error('[hotkeys] Failed to register Escape shortcut:', e)
    }
  } else {
    try {
      globalShortcut.unregister('Escape')
    } catch {}
    escapeShortcutRegistered = false
  }
}

// ─── uiohook action bindings (international / OEM keys) ─────────────────────────
//
// Chat commands, app macros, and secondary-overlay hotkeys normally register
// only through globalShortcut. globalShortcut cannot bind international/OEM keys
// (a Danish "æ", a German "ö", a bare ";", etc.), so for those accelerators we
// match the press kernel-side via uiohook instead - the same fallback the trigger
// and price-check hotkeys already rely on. Electron-bindable accelerators keep
// the globalShortcut-only path, so there is no double fire. Cleared on suspend
// and rebuilt by resumeHotkeys via the set*() calls.
type HookKeyEvent = { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

interface ActionBinding {
  combo: KeyCombo
  fire: () => void
  lastFireAt: number
}
let chatActionBindings: ActionBinding[] = []
let macroActionBindings: ActionBinding[] = []
let overlayActionBindings: ActionBinding[] = []

function clearActionBindings(): void {
  chatActionBindings = []
  macroActionBindings = []
  overlayActionBindings = []
}

function fireMatchingActionBindings(e: HookKeyEvent): void {
  const now = Date.now()
  for (const list of [chatActionBindings, macroActionBindings, overlayActionBindings]) {
    for (const b of list) {
      if (!matchesCombo(e, b.combo)) continue
      if (now - b.lastFireAt < DEDUPE_MS) continue
      b.lastFireAt = now
      b.fire()
    }
  }
}

// The action bodies below are shared by the globalShortcut callback (Electron-
// bindable keys) and the uiohook binding (international/OEM keys) so the guards
// stay identical across both delivery paths.
function runChatCommand(entry: ChatCommandConfig, autoSubmit: boolean, combo: KeyCombo | null): void {
  if (
    injecting ||
    isTypingInOverlay() ||
    !hotkeyContextIsActive() ||
    !scopeAppliesTo(chatCommandEffectiveScope(entry), getPoeVersion())
  )
    return
  releaseHotkeyKey(combo)
  // Fire-and-forget: a paste that never got focus (or the clipboard) rejects
  // rather than injecting, and that is a diagnostic, not a crash.
  sendChatCommand(entry.command, autoSubmit).catch((e) => recordMainDiagnostic('chat-command', e))
}

function runAppMacro(entry: AppMacroConfig, combo: KeyCombo | null): void {
  if (
    injecting ||
    isTypingInOverlay() ||
    !onAppMacro ||
    !hotkeyContextIsActive() ||
    !scopeAppliesTo(appMacroEffectiveScope(entry), getPoeVersion())
  )
    return
  releaseHotkeyKey(combo)
  onAppMacro(entry.action, entry.tag, entry.presetId)
}

function runSecondaryOverlay(handler: () => void, combo: KeyCombo | null): void {
  if (isTypingInOverlay() || !hotkeyContextIsActive()) return
  releaseHotkeyKey(combo)
  handler()
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Start the low-level keyboard hook and register the trigger callback. */
export function startHotkeyListener(handler: () => void): void {
  onTrigger = handler

  // Escape's globalShortcut is only valid while the game has focus (see
  // syncEscapeShortcut). Re-sync on every focus/blur so it registers/unregisters
  // in step with the attached game gaining/losing OS focus.
  OverlayController.events.on(
    'focus',
    guardNativeListener('escape-sync-focus', () => syncEscapeShortcut()),
  )
  OverlayController.events.on(
    'blur',
    guardNativeListener('escape-sync-blur', () => syncEscapeShortcut()),
  )
  // Track main-overlay visibility so syncEscapeShortcut can gate on it too.
  setOverlayVisibilityListener((visible) => {
    overlayVisibleForEscape = visible
    syncEscapeShortcut()
  })

  // uiohook is only used for Escape (overlay close), stash scroll, and modifier tracking
  initModifierTracking()
  uIOhook.on(
    'keydown',
    guardNativeListener('keydown-main', (e) => {
      if (injecting) return
      // uiohook fallback for Escape: the globalShortcut registered by
      // syncEscapeShortcut consumes the key when it's active, but uiohook still
      // sees every press regardless (kernel-level hook), and this is the only
      // path at all when the shortcut isn't registered (overlay hidden, game
      // unfocused, etc.). fireEscape() dedupes double-delivery and holds the
      // secondary-overlay precedence + PoE/overlay focus gate.
      if (e.keycode === UiohookKey.Escape) {
        fireEscape()
      }
      // Trigger + price-check also use uIOhook so bindings still work when
      // globalShortcut cannot deliver. Their shared fire functions enforce the
      // same foreground-context rule as the Electron callbacks.
      if (triggerCombo && matchesCombo(e, triggerCombo)) fireTrigger()
      if (priceCheckCombo && matchesCombo(e, priceCheckCombo)) firePriceCheck()
      if (launcherCombo && matchesCombo(e, launcherCombo)) fireLauncher()
      // Chat commands / app macros / secondary overlays bound to international or
      // OEM keys globalShortcut cannot register (see ActionBinding above).
      fireMatchingActionBindings(e)
    }),
  )

  // Stash tab scrolling: ModKey+scroll outside stash grid -> arrow key taps
  uIOhook.on(
    'wheel',
    guardNativeListener('wheel', (e) => {
      const modHeld =
        stashScrollModifier === 'Ctrl' ? e.ctrlKey : stashScrollModifier === 'Shift' ? e.shiftKey : e.altKey
      if (!stashScrollEnabled || !modHeld || !OverlayController.targetHasFocus) return
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

/** Authorize gameplay hotkeys only while focus remains within the attached game
 *  or one of Scalpel's gameplay overlays. Registration follows the same focus
 *  lifecycle, and this dispatch-time check closes uIOhook and transition races. */
function hotkeyContextIsActive(): boolean {
  return suspendDepth === 0 && (OverlayController.targetHasFocus || isAnyScalpelBrowserWindowFocused())
}

/** Temporarily unregister all global shortcuts (recorder, input typing, etc.). */
export function suspendHotkeys(): void {
  suspendDepth++
  if (suspendDepth === 1) {
    globalShortcut.unregisterAll()
    // globalShortcut.unregisterAll() above already wiped Escape's OS-side
    // registration - just reflect that in our own flag. No sync needed: the
    // desired state is false while suspended either way.
    escapeShortcutRegistered = false
    // The uiohook action bindings fire kernel-side regardless of globalShortcut,
    // so clear them too or an international-key hotkey would still fire while the
    // recorder is open / the user is typing in an overlay input. resumeHotkeys
    // rebuilds them via the set*() calls.
    clearActionBindings()
    registeredChatAccelerators = []
    appMacroAccelerators = []
  }
}

/** Re-register all global shortcuts when the last suspender resumes. */
export function resumeHotkeys(): void {
  if (suspendDepth === 0) return
  suspendDepth--
  if (suspendDepth > 0) return
  if (currentAccelerator) setHotkey(currentAccelerator)
  if (priceCheckAccelerator) setPriceCheckHotkey(priceCheckAccelerator)
  if (launcherAccelerator) setLauncherHotkey(launcherAccelerator)
  refreshScopedHotkeys('resume')
  setSecondaryOverlayHotkeys(secondaryOverlayHotkeys)
  syncEscapeShortcut()
}

/** Update the active hotkey. Registered with both globalShortcut (swallows the key
 *  from reaching the focused app when possible) and uIOhook (kernel-level fallback
 *  that still fires when PoE blocks globalShortcut from the non-attached game).
 *  fireTrigger dedupes the two paths. */
export function setHotkey(accelerator: string): void {
  if (currentAccelerator && suspendDepth === 0 && isElectronRegisterable(currentAccelerator)) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch {}
  }
  currentAccelerator = accelerator
  // Combo is consumed by the uIOhook fallback regardless of globalShortcut
  // state, so update it even when suspended.
  triggerCombo = parseAccelerator(accelerator)
  if (suspendDepth > 0) return
  // International/OEM keys can't be bound with globalShortcut; the uIOhook combo
  // above fires them. Skip the register so it doesn't log a spurious failure.
  if (!isElectronRegisterable(accelerator)) return
  try {
    globalShortcut.register(accelerator, () => fireTrigger())
  } catch (e) {
    console.error(`[hotkeys] Failed to register hotkey "${accelerator}":`, e)
  }
}

export function setPriceCheckHotkey(accelerator: string): void {
  if (priceCheckAccelerator && suspendDepth === 0 && isElectronRegisterable(priceCheckAccelerator)) {
    try {
      globalShortcut.unregister(priceCheckAccelerator)
    } catch {}
  }
  priceCheckAccelerator = accelerator
  priceCheckCombo = parseAccelerator(accelerator)
  if (suspendDepth > 0) return
  if (!isElectronRegisterable(accelerator)) return
  try {
    globalShortcut.register(accelerator, () => firePriceCheck())
  } catch (e) {
    console.error(`[hotkeys] Failed to register price check hotkey "${accelerator}":`, e)
  }
}

export function setLauncherHotkey(accelerator: string): void {
  if (launcherAccelerator && suspendDepth === 0 && isElectronRegisterable(launcherAccelerator)) {
    try {
      globalShortcut.unregister(launcherAccelerator)
    } catch {}
  }
  launcherAccelerator = accelerator
  launcherCombo = parseAccelerator(accelerator)
  if (suspendDepth > 0) return
  if (!isElectronRegisterable(accelerator)) return
  try {
    globalShortcut.register(accelerator, () => fireLauncher())
  } catch (e) {
    console.error(`[hotkeys] Failed to register launcher hotkey "${accelerator}":`, e)
  }
}

export function setLauncherHandler(handler: (() => void) | null): void {
  onLauncher = handler
}

export function setPriceCheckHandler(handler: (() => void) | null): void {
  onPriceCheck = handler
}

export function setEscapeHandler(handler: (() => void) | null): void {
  onEscape = handler
  // Order-independent: setEscapeHandler and the overlay-visibility/focus
  // wire-ups can happen in either order at boot, so re-sync here too.
  syncEscapeShortcut()
}

function recordScopedRegistrationFailure(category: ScopedHotkeyCategory, accelerator: string): void {
  failedScopedRegistrations.push({ category, accelerator })
  const safeAccelerator = accelerator.replace(/\s+/g, ' ').slice(0, 100)
  recordMainBreadcrumb(`hotkey registration failed category=${category} accelerator=${safeAccelerator}`)
}

function clearScopedHotkeyRegistrations(): void {
  if (suspendDepth === 0) {
    for (const accelerator of [...registeredChatAccelerators, ...appMacroAccelerators]) {
      try {
        globalShortcut.unregister(accelerator)
      } catch {}
    }
  }
  registeredChatAccelerators = []
  appMacroAccelerators = []
  chatActionBindings = []
  macroActionBindings = []
  failedScopedRegistrations = []
}

/** Rebuild game-scoped chat and app hotkeys as one unit. Complete configured
 *  sources are retained while suspended; OS and uIOhook registration is deferred
 *  until the final resume. */
export function refreshScopedHotkeys(reason?: string): void {
  clearScopedHotkeyRegistrations()

  const version = getPoeVersion()
  applicableChatCommandCount = 0
  applicableAppMacroCount = 0

  for (const c of configuredChatCommands) {
    if (!c.hotkey || !c.command) continue
    if (!scopeAppliesTo(chatCommandEffectiveScope(c), version)) continue
    applicableChatCommandCount++
    if (suspendDepth > 0) continue
    const autoSubmit = c.autoSubmit !== false
    const combo = parseAccelerator(c.hotkey)
    // International/OEM keys can't go through globalShortcut; match them via uiohook.
    if (!isElectronRegisterable(c.hotkey)) {
      if (combo) chatActionBindings.push({ combo, lastFireAt: 0, fire: () => runChatCommand(c, autoSubmit, combo) })
      continue
    }
    try {
      if (globalShortcut.register(c.hotkey, () => runChatCommand(c, autoSubmit, combo))) {
        registeredChatAccelerators.push(c.hotkey)
      } else {
        recordScopedRegistrationFailure('chat-command', c.hotkey)
      }
    } catch (e) {
      console.error(`[hotkeys] Failed to register chat command "${c.hotkey}":`, e)
      recordScopedRegistrationFailure('chat-command', c.hotkey)
      recordMainDiagnostic('hotkey-register:chat-command', e)
    }
  }

  for (const m of configuredAppMacros) {
    if (!m.hotkey || !m.action) continue
    if (!scopeAppliesTo(appMacroEffectiveScope(m), version)) continue
    applicableAppMacroCount++
    if (suspendDepth > 0) continue
    const combo = parseAccelerator(m.hotkey)
    // International/OEM keys can't go through globalShortcut; match them via uiohook.
    if (!isElectronRegisterable(m.hotkey)) {
      if (combo) macroActionBindings.push({ combo, lastFireAt: 0, fire: () => runAppMacro(m, combo) })
      continue
    }
    try {
      if (globalShortcut.register(m.hotkey, () => runAppMacro(m, combo))) {
        appMacroAccelerators.push(m.hotkey)
      } else {
        recordScopedRegistrationFailure('app-macro', m.hotkey)
      }
    } catch (e) {
      console.error(`[hotkeys] Failed to register app macro "${m.action}" (${m.hotkey}):`, e)
      recordScopedRegistrationFailure('app-macro', m.hotkey)
      recordMainDiagnostic('hotkey-register:app-macro', e)
    }
  }

  if (reason) {
    recordMainBreadcrumb(
      `scoped hotkeys refreshed reason=${reason} game=poe${version} suspended=${suspendDepth > 0} ` +
        `chat=${configuredChatCommands.length}/${applicableChatCommandCount}/${registeredChatAccelerators.length}/${chatActionBindings.length} ` +
        `app=${configuredAppMacros.length}/${applicableAppMacroCount}/${appMacroAccelerators.length}/${macroActionBindings.length} ` +
        `failed=${failedScopedRegistrations.length}`,
    )
  }
}

export function setChatCommands(commands: ChatCommandConfig[]): void {
  configuredChatCommands = [...commands]
  refreshScopedHotkeys()
}

export function setAppMacroHandler(handler: (action: string, tag?: string, presetId?: string) => void): void {
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
  overlayActionBindings = []
  if (suspendDepth > 0) return
  for (const { accelerator, handler } of hotkeys) {
    if (!accelerator) continue
    const combo = parseAccelerator(accelerator)
    // International/OEM keys can't go through globalShortcut; match them via uiohook.
    if (!isElectronRegisterable(accelerator)) {
      if (combo) overlayActionBindings.push({ combo, lastFireAt: 0, fire: () => runSecondaryOverlay(handler, combo) })
      continue
    }
    try {
      if (globalShortcut.register(accelerator, () => runSecondaryOverlay(handler, combo))) {
        registeredOverlayAccelerators.push(accelerator)
      }
    } catch (e) {
      console.error(`[hotkeys] Failed to register secondary-overlay hotkey "${accelerator}":`, e)
    }
  }
}

export function setAppMacros(macros: AppMacroConfig[]): void {
  configuredAppMacros = [...macros]
  refreshScopedHotkeys()
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

/** How long to wait for PoE to actually reach the foreground. A normal handoff
 *  lands in well under 100ms; past this, assume the game is gone or the OS
 *  refused the request rather than injecting into someone else's window. */
const FOCUS_WAIT_MS = 300
const FOCUS_POLL_MS = 10
/** How long the command stays on the clipboard after the keys are injected.
 *  The client reads the clipboard when it *processes* Ctrl+V, which can be well
 *  after SendInput returns - parsing a reloaded filter alone hitches it past
 *  several frames. Hand the clipboard back too early and the game pastes the
 *  user's own content instead, which the trailing Enter then broadcasts to
 *  chat. 250ms covers a reload hitch; the borrow watchdog covers the rest. */
const CLIPBOARD_HOLD_MS = 250
/** Keys are out and the chat window has closed - let the next flow start. */
const PASTE_SETTLE_MS = 50
const CLIPBOARD_WRITE_TRIES = 3
const CLIPBOARD_WRITE_RETRY_MS = 15

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Resolve once the attached game owns OS focus; throw if it never does.
 *  Injected keys go to whatever window is foreground when the OS routes them,
 *  so firing during the handoff sprays Enter/Ctrl+V/Enter at the window the
 *  user was just in - and burns the clipboard hold before the game can read
 *  the paste. targetHasFocus is the same signal that authorizes every gameplay
 *  hotkey (see hotkeyContextIsActive). */
async function awaitGameFocus(): Promise<void> {
  if (OverlayController.targetHasFocus) return
  focusGameWindow()
  for (let waited = 0; waited < FOCUS_WAIT_MS; waited += FOCUS_POLL_MS) {
    await wait(FOCUS_POLL_MS)
    if (OverlayController.targetHasFocus) return
  }
  throw new Error('PoE did not take focus - chat command not sent')
}

/** Put `text` on the clipboard and prove it landed before anything is injected.
 *  A clipboard manager (Win+V history, Ditto) holding the clipboard open makes
 *  Electron's write a silent no-op; pasting anyway submits whatever the user
 *  had copied. */
async function writeChatText(text: string): Promise<void> {
  // Compared line-ending-insensitively: Windows stores CRLF, and a multi-line
  // macro must not read back as a failed write.
  const normalize = (s: string): string => s.replace(/\r\n/g, '\n')
  for (let attempt = 0; attempt < CLIPBOARD_WRITE_TRIES; attempt++) {
    clipboard.writeText(text)
    if (normalize(clipboard.readText()) === normalize(text)) return
    await wait(CLIPBOARD_WRITE_RETRY_MS)
  }
  throw new Error('clipboard write did not land - chat command not sent')
}

/**
 * Paste text into PoE chat via clipboard + uiohook keyTaps.
 * Layout-independent, near-instant.
 *
 * Both preconditions - game focused, command provably on the clipboard - are
 * confirmed before a single key is injected. The paste ends with Enter, so
 * anything we get wrong is broadcast to chat rather than quietly dropped.
 */
let chatLocked = false
async function pasteToPoEChat(text: string, submit: boolean): Promise<void> {
  if (chatLocked) return
  chatLocked = true

  const restoreClip = snapshotClipboard()

  // Injection is native (uiohook SendInput) and focusing the game reaches into
  // a window that may already be gone, so both can throw. Without this, a throw
  // would strand `chatLocked` true and silently kill every later chat command,
  // filter reload and filter switch for the rest of the session (#562).
  try {
    await awaitGameFocus()

    // Resolve the body and the chat-opening keys first so the clipboard write
    // (and its verification) happens before any key goes out.
    let body = text
    let openChat: () => void
    if (text.startsWith(PLACEHOLDER_LAST)) {
      // Ctrl+Enter pre-fills @<lastwhisperer> in the chat input; paste body after
      body = text.slice(`${PLACEHOLDER_LAST} `.length)
      openChat = () => {
        uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
        uIOhook.keyTap(UiohookKey.Enter)
        uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
      }
    } else if (text.endsWith(PLACEHOLDER_LAST)) {
      // Ctrl+Enter pre-fills @CharName at position 0; Home x2 then Delete strips the @
      body = text.slice(0, -PLACEHOLDER_LAST.length)
      openChat = () => {
        uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
        uIOhook.keyTap(UiohookKey.Enter)
        uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
        uIOhook.keyTap(UiohookKey.Home)
        // press twice to focus input when using controller
        uIOhook.keyTap(UiohookKey.Home)
        uIOhook.keyTap(UiohookKey.Delete)
      }
    } else {
      openChat = () => {
        uIOhook.keyTap(UiohookKey.Enter)
        // PoE auto-clears the input when the text starts with a chat-prefix char
        if (!AUTO_CLEAR.includes(text[0])) {
          uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
          uIOhook.keyTap(UiohookKey.A)
          uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
        }
      }
    }

    await writeChatText(body)

    injecting = true
    // All keystrokes fire synchronously so the chat window
    // opens and closes in a single frame, preventing visible flash
    openChat()

    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.V)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')

    if (submit) {
      uIOhook.keyTap(UiohookKey.Enter)
    }
  } catch (e) {
    restoreClip()
    chatLocked = false
    injecting = false
    recordMainDiagnostic('chat-paste', e)
    throw e
  }

  // Hand the clipboard back on its own timer, decoupled from the promise, so
  // the command outlives a client hitch without holding up the caller (a filter
  // switch pastes twice). Overlapping borrows nest, so a flow that starts
  // inside the hold still restores correctly.
  setTimeout(restoreClip, CLIPBOARD_HOLD_MS).unref?.()

  // Re-register hotkeys once the keys are out
  await wait(PASTE_SETTLE_MS)
  chatLocked = false
  injecting = false
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
  // finally, not then: an aborted paste must still re-press the modifiers the
  // user is physically holding, or the game keeps thinking they let go.
  return pasteToPoEChat(command, autoSubmit).finally(() => restoreModifiers(held))
}

/**
 * Paste a regex into PoE's stash/inventory search (Ctrl+F, Ctrl+V).
 * Same hardening as chat paste: release held modifiers, await game focus,
 * verify the clipboard write, mark injecting so the hook ignores synthetic
 * keys, and settle briefly so a bare F-key hotkey (flask conflict) finishes
 * releasing before Ctrl+F is synthesized.
 */
let regexPasteLocked = false
export async function pasteRegexToPoESearch(regex: string): Promise<void> {
  if (!regex || regexPasteLocked || injecting) return
  regexPasteLocked = true

  const held: ModSnapshot = { ...heldModifiers }
  const prevInjecting = injecting
  injecting = true
  if (held.ctrl) uIOhook.keyToggle(held.ctrl, 'up')
  if (held.shift) uIOhook.keyToggle(held.shift, 'up')
  if (held.alt) uIOhook.keyToggle(held.alt, 'up')
  injecting = prevInjecting

  const restoreClip = snapshotClipboard()
  try {
    // Let the triggering hotkey keyup (and any flask F1–F5 collision) settle.
    await wait(50)
    await awaitGameFocus()
    await writeChatText(regex)

    injecting = true
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.F)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.V)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
  } catch (e) {
    restoreClip()
    regexPasteLocked = false
    injecting = false
    restoreModifiers(held)
    recordMainDiagnostic('regex-paste', e)
    throw e
  }

  setTimeout(restoreClip, CLIPBOARD_HOLD_MS).unref?.()
  await wait(PASTE_SETTLE_MS)
  regexPasteLocked = false
  injecting = false
  restoreModifiers(held)
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
  escapeShortcutRegistered = false
}

export function setStashScrollEnabled(enabled: boolean): void {
  stashScrollEnabled = enabled
}

export function setStashScrollModifier(modifier: 'Ctrl' | 'Shift' | 'Alt'): void {
  stashScrollModifier = modifier
}

// PoE stash grid area (physical pixels) - if cursor is here, don't intercept scroll
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

/** True when this accelerator's non-modifier key is C -- the key the copy
 *  injection taps -- and it goes through globalShortcut (uiohook matchers only
 *  observe; they can't consume). */
function acceleratorTapsC(accelerator: string): boolean {
  return isElectronRegisterable(accelerator) && parseAccelerator(accelerator)?.keycode === UiohookKey.C
}

/**
 * Unregister every OS-registered hotkey whose key is C for the duration of a
 * copy injection. Returns a restore callback, or null when nothing was held.
 *
 * The user may bind Ctrl+C -- PoE's own copy key -- as a hotkey; the collision
 * guard warns but allows it (POE_PROTECTED_HOTKEYS). globalShortcut backs onto
 * RegisterHotKey, which consumes matching keystrokes system-wide *including
 * injected ones*, so with such a binding the injected copy fired the user's
 * hotkey (then dropped by the `injecting` guard) and never reached the game:
 * every capture failed (#601). 1.0.1 escaped by accident -- it always injected
 * Ctrl+Alt+C, which a Ctrl+C registration doesn't match. Released combos are
 * restored through each slot's canonical (re)registration path.
 */
function releaseCKeyedRegistrationsForInjection(): (() => void) | null {
  if (suspendDepth > 0) return null // nothing is OS-registered while suspended
  const restores: Array<() => void> = []

  // Restores re-read the live slot state rather than the released accelerator,
  // so a hotkey changed mid-injection isn't clobbered by its old value.
  if (currentAccelerator && acceleratorTapsC(currentAccelerator)) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch {}
    restores.push(() => {
      if (currentAccelerator) setHotkey(currentAccelerator)
    })
  }
  if (priceCheckAccelerator && acceleratorTapsC(priceCheckAccelerator)) {
    try {
      globalShortcut.unregister(priceCheckAccelerator)
    } catch {}
    restores.push(() => {
      if (priceCheckAccelerator) setPriceCheckHotkey(priceCheckAccelerator)
    })
  }
  const scoped = [...registeredChatAccelerators, ...appMacroAccelerators].filter(acceleratorTapsC)
  if (scoped.length > 0) {
    for (const accelerator of scoped) {
      try {
        globalShortcut.unregister(accelerator)
      } catch {}
    }
    restores.push(() => refreshScopedHotkeys('copy-injection'))
  }
  const overlayScoped = registeredOverlayAccelerators.filter(acceleratorTapsC)
  if (overlayScoped.length > 0) {
    for (const accelerator of overlayScoped) {
      try {
        globalShortcut.unregister(accelerator)
      } catch {}
    }
    restores.push(() => setSecondaryOverlayHotkeys(secondaryOverlayHotkeys))
  }

  if (restores.length === 0) return null
  return () => {
    for (const restore of restores) restore()
  }
}

/**
 * Send Ctrl+C to PoE via uiohook (OS-level SendInput).
 *
 * Both games now emit the advanced item description for a plain Ctrl+C, so Alt
 * (PoE's "show advanced item descriptions" modifier) is no longer held (#560).
 * `withAlt` restores the legacy Ctrl+Alt+C for a client that still needs it --
 * see the advanced-copy tracker, which decides when that is.
 *
 * A user who *holds* Alt as part of their own hotkey is left alone either way:
 * the game seeing Ctrl+Alt+C copies the same advanced text, so there is nothing
 * to fight. A user whose hotkey *is* a C combo is handled by releasing that
 * registration for the injection window -- see
 * releaseCKeyedRegistrationsForInjection (#601).
 */
export async function sendCtrlCToPoE(opts?: { withAlt?: boolean }): Promise<void> {
  injecting = true
  const restoreCKeyedRegistrations = releaseCKeyedRegistrationsForInjection()

  // Instead of releasing all user modifiers (racy to restore), piggyback on
  // whatever the user already holds and only add what's missing.
  const needCtrl = !heldModifiers.ctrl
  const needAlt = opts?.withAlt === true && !heldModifiers.alt

  try {
    // Temporarily release Shift if held. PoE2 ignores the copy when Shift is still
    // down at the moment C is tapped -- most visibly on equipped items, which
    // silently fail and drop through to the slow focus-retry fallback (issue #338).
    // The release must land *before* the tap, and PoE2 drops modifier events that
    // fire too close together (same fragility as the post-tap hold below, ee2 issue
    // #124), so a synchronous Shift-up immediately followed by the tap doesn't take.
    // Give the Shift-up ~30ms to register first. Only paid when Shift is held.
    const heldShift = heldModifiers.shift
    if (heldShift) {
      uIOhook.keyToggle(UiohookKey.Shift, 'up')
      uIOhook.keyToggle(UiohookKey.ShiftRight, 'up')
      await new Promise((r) => setTimeout(r, 30))
    }

    if (needCtrl) uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    if (needAlt) uIOhook.keyToggle(UiohookKey.Alt, 'down')
    uIOhook.keyTap(UiohookKey.C)

    // PoE2 drops modifier keyup events when they fire too soon after the C tap,
    // leaving PoE's view of held modifiers out of sync -- on the Alt path that
    // showed up as the in-game advanced tooltip stuck "Alt-pinned" on the item
    // (most visible when the overlay closes via click-outside, where no focus
    // round-trip resyncs it). Hold the modifiers ~10ms before releasing so PoE
    // registers them in order. Same root cause and fix as Exiled-Exchange-2
    // issue #124.
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        if (needAlt) uIOhook.keyToggle(UiohookKey.Alt, 'up')
        if (needCtrl) uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
        // Re-press Shift immediately if it was held
        if (heldShift) uIOhook.keyToggle(heldShift, 'down')
      }, 10)
      setTimeout(() => {
        injecting = false
        resolve()
      }, 100)
    })
  } finally {
    // Re-register only after the injected tap has cleared the OS input queue --
    // restoring earlier would let our own registration swallow it (#601).
    restoreCKeyedRegistrations?.()
  }
}

function getHotkeyDiagnostics(): Record<string, unknown> {
  return {
    game: getPoeVersion(),
    hookStarted,
    hookSuspended,
    suspendDepth,
    triggerHotkeyConfigured: currentAccelerator !== null,
    priceCheckHotkeyConfigured: priceCheckAccelerator !== null,
    launcherHotkeyConfigured: launcherAccelerator !== null,
    chatCommandConfiguredCount: configuredChatCommands.length,
    chatCommandApplicableCount: applicableChatCommandCount,
    chatCommandHotkeyCount: registeredChatAccelerators.length,
    appMacroConfiguredCount: configuredAppMacros.length,
    appMacroApplicableCount: applicableAppMacroCount,
    appMacroHotkeyCount: appMacroAccelerators.length,
    secondaryOverlayHotkeyCount: secondaryOverlayHotkeys.length,
    // uiohook-matched bindings for international/OEM keys globalShortcut can't bind.
    chatActionBindingCount: chatActionBindings.length,
    macroActionBindingCount: macroActionBindings.length,
    overlayActionBindingCount: overlayActionBindings.length,
    failedScopedRegistrations,
    stashScrollEnabled,
    stashScrollModifier,
    // 'alt' means this client only yields advanced item text with Alt held (#560).
    advancedCopyState: advancedCopyTracker.state(),
    lastHookStartError,
    lastHookStopError,
  }
}

registerDiagnosticProvider('hotkeyDiagnostics', getHotkeyDiagnostics)
