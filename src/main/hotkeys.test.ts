import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ─── Shared mutable mock state ────────────────────────────────────────────────
// Declared at module scope (not inside a vi.mock factory) so it survives
// vi.resetModules() - only the SUT (hotkeys.ts) needs a fresh module instance
// per test, not these process-boundary mocks. Each test resets the relevant
// pieces itself in beforeEach.
//
// This file owns the Escape-delivery behavior (globalShortcut sync + uiohook
// fallback). The async focus gate and the other contextual hotkey paths are
// covered in hotkeys-focus.test.ts, which uses a static-import harness that
// cannot reset the module-level Escape dedupe stamp between tests.

const globalShortcutMock = {
  register: vi.fn((_accelerator: string, _callback: () => void) => true),
  unregister: vi.fn(),
  unregisterAll: vi.fn(),
}

const overlayControllerState: { targetHasFocus: boolean; events: EventEmitter; targetBounds: unknown } = {
  targetHasFocus: false,
  events: new EventEmitter(),
  targetBounds: null,
}

const uiohookState: { listeners: Record<string, Array<(e: unknown) => void>> } = { listeners: {} }

function emitKeydown(e: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): void {
  for (const handler of uiohookState.listeners.keydown ?? []) handler(e)
}

const overlayMockState: {
  isTypingInOverlay: boolean
  visibilityListener: ((visible: boolean) => void) | null
} = {
  isTypingInOverlay: false,
  visibilityListener: null,
}

const windowingMockState = {
  hideFocusedOrAnyVisibleSecondaryOverlay: vi.fn(() => false),
}

// Inputs to the async fire-path focus gate (hasPoeOrOverlayFocus): the exact
// foreground PoE title seen by active-win, and Scalpel-owned window focus.
const focusMockState: { focusedVersion: 1 | 2 | null; scalpelBrowserWindowFocused: boolean } = {
  focusedVersion: null,
  scalpelBrowserWindowFocused: false,
}

vi.mock('electron', () => ({
  globalShortcut: globalShortcutMock,
  clipboard: {
    readText: vi.fn(() => ''),
    readHTML: vi.fn(() => ''),
    writeText: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
  },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
}))

vi.mock('electron-overlay-window', () => ({
  OverlayController: overlayControllerState,
}))

vi.mock('uiohook-napi', () => {
  const UiohookKey = { Escape: 1 }
  const uIOhook = {
    on: (event: string, handler: (e: unknown) => void) => {
      ;(uiohookState.listeners[event] ??= []).push(handler)
    },
    start: vi.fn(),
    stop: vi.fn(),
    keyToggle: vi.fn(),
    keyTap: vi.fn(),
  }
  return { UiohookKey, uIOhook }
})

vi.mock('./overlay', () => ({
  isTypingInOverlay: () => overlayMockState.isTypingInOverlay,
  focusGameWindow: vi.fn(),
  setOverlayVisibilityListener: (cb: ((visible: boolean) => void) | null) => {
    overlayMockState.visibilityListener = cb
  },
}))

vi.mock('./windowing', () => ({
  hideFocusedOrAnyVisibleSecondaryOverlay: () => windowingMockState.hideFocusedOrAnyVisibleSecondaryOverlay(),
  isAnyScalpelBrowserWindowFocused: () => focusMockState.scalpelBrowserWindowFocused,
}))

vi.mock('./game-detector', () => ({
  detectFocusedPoeVersion: vi.fn(async () => focusMockState.focusedVersion),
}))

vi.mock('./diagnostics', () => ({
  guardNativeListener:
    (_label: string, fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) =>
      fn(...args),
  recordMainBreadcrumb: vi.fn(),
  recordMainDiagnostic: vi.fn(),
  registerDiagnosticProvider: vi.fn(),
}))

const ESCAPE_KEYDOWN = { keycode: 1, ctrlKey: false, shiftKey: false, altKey: false }

/** The fire path resolves the async focus gate (hasPoeOrOverlayFocus) through a
 *  few microtasks; flush them so post-gate effects are observable. Promise
 *  microtasks run on await even under fake timers, so this is safe in both. */
async function flushEscapeGate(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

/** Fresh SUT import with all shared mock state reset. Wires up startHotkeyListener
 *  and setEscapeHandler the same way index.ts does at boot, so every test starts
 *  from a known baseline (nothing registered, overlay hidden, game unfocused -
 *  but with the fire-path focus gate seeing PoE in the foreground, since most
 *  tests exercise delivery; unfocused-path tests override focusMockState). */
async function loadHotkeys(onEscape: () => void) {
  vi.resetModules()
  globalShortcutMock.register.mockClear()
  globalShortcutMock.register.mockImplementation(() => true)
  globalShortcutMock.unregister.mockClear()
  globalShortcutMock.unregisterAll.mockClear()
  overlayControllerState.targetHasFocus = false
  overlayControllerState.events.removeAllListeners()
  uiohookState.listeners = {}
  overlayMockState.isTypingInOverlay = false
  overlayMockState.visibilityListener = null
  windowingMockState.hideFocusedOrAnyVisibleSecondaryOverlay.mockReset()
  windowingMockState.hideFocusedOrAnyVisibleSecondaryOverlay.mockReturnValue(false)
  focusMockState.focusedVersion = 1
  focusMockState.scalpelBrowserWindowFocused = false

  const hotkeys = await import('./hotkeys')
  hotkeys.startHotkeyListener(() => {})
  hotkeys.setEscapeHandler(onEscape)
  return hotkeys
}

/** The callback passed to the most recent globalShortcut.register('Escape', cb) call. */
function lastEscapeCallback(): () => void {
  const calls = globalShortcutMock.register.mock.calls.filter((c) => c[0] === 'Escape')
  const cb = calls.at(-1)?.[1] as (() => void) | undefined
  if (!cb) throw new Error('Escape shortcut was never registered')
  return cb
}

describe('Escape globalShortcut sync', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers once when visible + game focus + handler set; repeated syncs do not re-register', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = true

    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(1)
    expect(globalShortcutMock.register).toHaveBeenCalledWith('Escape', expect.any(Function))

    // Repeated sync via another focus event: already registered, no-op.
    overlayControllerState.events.emit('focus')
    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(1)
  })

  it('unregisters on overlay hide and on game blur; re-registers on refocus while still visible', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = true
    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(1)

    // Overlay hidden -> unregistered.
    overlayMockState.visibilityListener?.(false)
    expect(globalShortcutMock.unregister).toHaveBeenCalledWith('Escape')
    globalShortcutMock.unregister.mockClear()

    // Show it again to get back to a registered baseline.
    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(2)

    // Game blur (still visible) -> unregistered.
    overlayControllerState.targetHasFocus = false
    overlayControllerState.events.emit('blur')
    expect(globalShortcutMock.unregister).toHaveBeenCalledWith('Escape')

    // Refocus with overlay still visible -> re-registered.
    overlayControllerState.targetHasFocus = true
    overlayControllerState.events.emit('focus')
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(3)
  })

  it('suspendHotkeys unregisters even while visible+focused; resumeHotkeys re-registers', async () => {
    const onEscape = vi.fn()
    const hotkeys = await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = true
    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(1)

    hotkeys.suspendHotkeys()
    expect(globalShortcutMock.unregisterAll).toHaveBeenCalledTimes(1)

    hotkeys.resumeHotkeys()
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(2)
    expect(globalShortcutMock.register).toHaveBeenLastCalledWith('Escape', expect.any(Function))
  })

  it('secondary-overlay claim takes precedence over onEscape', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = true
    overlayMockState.visibilityListener?.(true)
    const cb = lastEscapeCallback()

    windowingMockState.hideFocusedOrAnyVisibleSecondaryOverlay.mockReturnValue(true)
    cb()
    await flushEscapeGate()
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('calls onEscape when no secondary overlay claims Esc and the focus gate passes', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = true
    overlayMockState.visibilityListener?.(true)
    const cb = lastEscapeCallback()

    windowingMockState.hideFocusedOrAnyVisibleSecondaryOverlay.mockReturnValue(false)
    cb()
    await flushEscapeGate()
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('does not call onEscape when an unrelated app owns the foreground', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    focusMockState.focusedVersion = null
    focusMockState.scalpelBrowserWindowFocused = false

    emitKeydown(ESCAPE_KEYDOWN)
    await flushEscapeGate()
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('reentrant unregister: onEscape hiding the overlay mid-fire does not throw and leaves the shortcut cleanly re-registerable', async () => {
    // Mirrors the real chain: onEscape -> hideOverlay() -> overlay-visibility
    // listener -> syncEscapeShortcut(), reentering the sync state machine while
    // the fire that invoked onEscape is still on the stack.
    const onEscape = vi.fn(() => {
      overlayMockState.visibilityListener?.(false)
    })
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = true
    overlayMockState.visibilityListener?.(true)
    const cb = lastEscapeCallback()

    expect(() => cb()).not.toThrow()
    await flushEscapeGate()
    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(globalShortcutMock.unregister).toHaveBeenCalledWith('Escape')

    // State machine recovers cleanly: overlay shown again with the game still
    // focused re-registers instead of staying stuck unregistered.
    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(2)
  })

  it('dedupes a globalShortcut fire followed by a uiohook keydown within DEDUPE_MS, then fires again after it elapses', async () => {
    vi.useFakeTimers()
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = true
    overlayMockState.visibilityListener?.(true)
    const cb = lastEscapeCallback()

    cb()
    await flushEscapeGate()
    expect(onEscape).toHaveBeenCalledTimes(1)

    // Same physical press also seen by the uiohook fallback within the window - deduped.
    emitKeydown(ESCAPE_KEYDOWN)
    await flushEscapeGate()
    expect(onEscape).toHaveBeenCalledTimes(1)

    // Past the dedupe window, a fresh Esc fires again.
    vi.advanceTimersByTime(101)
    emitKeydown(ESCAPE_KEYDOWN)
    await flushEscapeGate()
    expect(onEscape).toHaveBeenCalledTimes(2)
  })

  it('register returning false leaves escapeShortcutRegistered false; uiohook path still closes', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    globalShortcutMock.register.mockImplementation(() => false)
    overlayControllerState.targetHasFocus = true

    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(1)

    // escapeShortcutRegistered never flipped true: another sync attempt (game
    // refocus) still tries to register instead of treating it as already-registered.
    overlayControllerState.events.emit('focus')
    expect(globalShortcutMock.register).toHaveBeenCalledTimes(2)

    // uiohook fallback is independent of globalShortcut registration succeeding.
    emitKeydown(ESCAPE_KEYDOWN)
    await flushEscapeGate()
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('register throwing does not crash and degrades to the uiohook-only path', async () => {
    const onEscape = vi.fn()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadHotkeys(onEscape)
    globalShortcutMock.register.mockImplementation(() => {
      throw new Error('boom')
    })
    overlayControllerState.targetHasFocus = true

    expect(() => overlayMockState.visibilityListener?.(true)).not.toThrow()
    expect(consoleErrorSpy).toHaveBeenCalled()

    emitKeydown(ESCAPE_KEYDOWN)
    await flushEscapeGate()
    expect(onEscape).toHaveBeenCalledTimes(1)
    consoleErrorSpy.mockRestore()
  })

  it('uiohook-only path: shortcut never registers when the game is unfocused but a Scalpel window is focused', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = false
    focusMockState.focusedVersion = null
    focusMockState.scalpelBrowserWindowFocused = true

    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).not.toHaveBeenCalled()

    emitKeydown(ESCAPE_KEYDOWN)
    await flushEscapeGate()
    expect(onEscape).toHaveBeenCalledTimes(1)
  })
})
