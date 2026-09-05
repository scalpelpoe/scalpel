import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ─── Shared mutable mock state ────────────────────────────────────────────────
// Declared at module scope (not inside a vi.mock factory) so it survives
// vi.resetModules() - only the SUT (hotkeys.ts) needs a fresh module instance
// per test, not these process-boundary mocks. Each test resets the relevant
// pieces itself in beforeEach.
//
// This file owns the Escape-delivery behavior (globalShortcut sync + uiohook
// fallback). The shared focus gate and the other contextual hotkey paths are
// covered in hotkeys-focus.test.ts, which uses a static-import harness that
// cannot reset the module-level Escape dedupe stamp between tests.

const activeGlobalShortcuts = new Map<string, () => void>()
const registerGlobalShortcut = (accelerator: string, callback: () => void): boolean => {
  if (activeGlobalShortcuts.has(accelerator)) return false
  activeGlobalShortcuts.set(accelerator, callback)
  return true
}
const globalShortcutMock = {
  register: vi.fn(registerGlobalShortcut),
  unregister: vi.fn((accelerator: string) => activeGlobalShortcuts.delete(accelerator)),
  unregisterAll: vi.fn(() => activeGlobalShortcuts.clear()),
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

// Scalpel-owned gameplay-window focus complements OverlayController target focus.
const focusMockState: { scalpelBrowserWindowFocused: boolean } = {
  scalpelBrowserWindowFocused: false,
}

// Whether the compositor-driven overlay path is in charge. Mocked rather than
// derived from the environment so no test shells out to hyprctl.
const hyprlandMockState = { overlayActive: false }

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
  const UiohookKey = { Escape: 1, Ctrl: 2, Alt: 3, Shift: 4, ShiftRight: 5, C: 6 }
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

vi.mock('./hyprland', () => ({
  hyprlandOverlayActive: () => hyprlandMockState.overlayActive,
  hyprlandInputAllowed: () => true,
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

/** Fresh SUT import with all shared mock state reset. Wires up startHotkeyListener
 *  and setEscapeHandler the same way index.ts does at boot, so every test starts
 *  from a known baseline (nothing registered, overlay hidden, game unfocused -
 *  and tests opt into target or gameplay-overlay focus before delivery. */
async function loadHotkeys(onEscape: () => void) {
  vi.resetModules()
  activeGlobalShortcuts.clear()
  globalShortcutMock.register.mockClear()
  globalShortcutMock.register.mockImplementation(registerGlobalShortcut)
  globalShortcutMock.unregister.mockClear()
  globalShortcutMock.unregisterAll.mockClear()
  overlayControllerState.targetHasFocus = false
  overlayControllerState.events.removeAllListeners()
  uiohookState.listeners = {}
  overlayMockState.isTypingInOverlay = false
  overlayMockState.visibilityListener = null
  windowingMockState.hideFocusedOrAnyVisibleSecondaryOverlay.mockReset()
  windowingMockState.hideFocusedOrAnyVisibleSecondaryOverlay.mockReturnValue(false)
  focusMockState.scalpelBrowserWindowFocused = false
  hyprlandMockState.overlayActive = false

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

describe('Hyprland dialog shortcut dismissal', () => {
  it('uses the close handler instead of starting another filter lookup', async () => {
    const close = vi.fn()
    const hotkeys = await loadHotkeys(close)
    hyprlandMockState.overlayActive = true
    overlayControllerState.targetHasFocus = true
    overlayMockState.visibilityListener?.(true)
    hotkeys.setHotkey('Ctrl+C')
    activeGlobalShortcuts.get('Ctrl+C')?.()
    expect(close).toHaveBeenCalledOnce()
  })
})

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
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('does not call onEscape when an unrelated app owns the foreground', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    focusMockState.scalpelBrowserWindowFocused = false

    emitKeydown(ESCAPE_KEYDOWN)
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('does not call onEscape while typing in an overlay', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = true
    overlayMockState.isTypingInOverlay = true
    overlayMockState.visibilityListener?.(true)

    lastEscapeCallback()()

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
    expect(onEscape).toHaveBeenCalledTimes(1)

    // Same physical press also seen by the uiohook fallback within the window - deduped.
    emitKeydown(ESCAPE_KEYDOWN)
    expect(onEscape).toHaveBeenCalledTimes(1)

    // Past the dedupe window, a fresh Esc fires again.
    vi.advanceTimersByTime(101)
    emitKeydown(ESCAPE_KEYDOWN)
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
    expect(onEscape).toHaveBeenCalledTimes(1)
    consoleErrorSpy.mockRestore()
  })

  it('uiohook-only path: shortcut never registers when the game is unfocused but a Scalpel window is focused', async () => {
    const onEscape = vi.fn()
    await loadHotkeys(onEscape)
    overlayControllerState.targetHasFocus = false
    focusMockState.scalpelBrowserWindowFocused = true

    overlayMockState.visibilityListener?.(true)
    expect(globalShortcutMock.register).not.toHaveBeenCalled()

    emitKeydown(ESCAPE_KEYDOWN)
    expect(onEscape).toHaveBeenCalledTimes(1)
  })
})

describe('scoped hotkey refresh', () => {
  it('rebuilds complete chat and app sources across repeated game switches', async () => {
    const hotkeys = await loadHotkeys(() => {})
    const { setPoeVersion } = await import('./game-state')
    setPoeVersion(2)

    hotkeys.setChatCommands([
      { hotkey: 'Ctrl+H', command: '/hideout' },
      { hotkey: 'Ctrl+M', command: '/menagerie' },
      { hotkey: 'Ctrl+T', command: '/trade', scope: 'poe2' },
    ])
    hotkeys.setAppMacros([
      { hotkey: 'Ctrl+D', action: 'openDust' },
      { hotkey: 'Ctrl+C', action: 'openDivCards' },
      { hotkey: 'Ctrl+S', action: 'openSettings' },
    ])

    const expected = {
      1: ['Ctrl+C', 'Ctrl+D', 'Ctrl+H', 'Ctrl+M', 'Ctrl+S'],
      2: ['Ctrl+H', 'Ctrl+S', 'Ctrl+T'],
    }
    expect([...activeGlobalShortcuts.keys()].sort()).toEqual(expected[2])

    for (const game of [1, 2, 1] as const) {
      setPoeVersion(game)
      hotkeys.refreshScopedHotkeys('test-switch')
      expect([...activeGlobalShortcuts.keys()].sort()).toEqual(expected[game])
    }
  })

  it('retains complete sources while suspended and applies the current game on resume', async () => {
    const hotkeys = await loadHotkeys(() => {})
    const { setPoeVersion } = await import('./game-state')
    setPoeVersion(2)
    hotkeys.setChatCommands([
      { hotkey: 'Ctrl+H', command: '/hideout' },
      { hotkey: 'Ctrl+M', command: '/menagerie' },
      { hotkey: 'Ctrl+T', command: '/trade', scope: 'poe2' },
    ])

    hotkeys.suspendHotkeys()
    setPoeVersion(1)
    hotkeys.refreshScopedHotkeys('test-switch')
    expect(activeGlobalShortcuts.size).toBe(0)

    hotkeys.resumeHotkeys()
    expect([...activeGlobalShortcuts.keys()].sort()).toEqual(['Ctrl+H', 'Ctrl+M'])
  })

  it('unregisters both categories before transferring an accelerator', async () => {
    const handler = vi.fn()
    const hotkeys = await loadHotkeys(() => {})
    const { setPoeVersion } = await import('./game-state')
    setPoeVersion(2)
    hotkeys.setAppMacroHandler(handler)
    hotkeys.setChatCommands([{ hotkey: 'Ctrl+X', command: '/trade', scope: 'poe2' }])
    hotkeys.setAppMacros([{ hotkey: 'Ctrl+X', action: 'openDust' }])
    expect(activeGlobalShortcuts.has('Ctrl+X')).toBe(true)

    setPoeVersion(1)
    hotkeys.refreshScopedHotkeys('test-switch')
    overlayControllerState.targetHasFocus = true
    activeGlobalShortcuts.get('Ctrl+X')?.()

    expect(handler).toHaveBeenCalledWith('openDust', undefined, undefined)
    const { registerDiagnosticProvider } = await import('./diagnostics')
    const provider = vi
      .mocked(registerDiagnosticProvider)
      .mock.calls.filter(([name]) => name === 'hotkeyDiagnostics')
      .at(-1)?.[1]
    expect(provider?.().failedScopedRegistrations).toEqual([])
  })

  it('reports register false without counting it as active', async () => {
    const hotkeys = await loadHotkeys(() => {})
    globalShortcutMock.register.mockImplementation((accelerator, callback) => {
      if (accelerator === 'Ctrl+F' || accelerator === 'Ctrl+G') return false
      return registerGlobalShortcut(accelerator, callback)
    })

    hotkeys.setChatCommands([{ hotkey: 'Ctrl+F', command: '/hideout' }])
    hotkeys.setAppMacros([{ hotkey: 'Ctrl+G', action: 'openSettings' }])

    const { registerDiagnosticProvider } = await import('./diagnostics')
    const provider = vi
      .mocked(registerDiagnosticProvider)
      .mock.calls.filter(([name]) => name === 'hotkeyDiagnostics')
      .at(-1)?.[1]
    expect(provider?.()).toMatchObject({
      chatCommandConfiguredCount: 1,
      chatCommandApplicableCount: 1,
      chatCommandHotkeyCount: 0,
      appMacroConfiguredCount: 1,
      appMacroApplicableCount: 1,
      appMacroHotkeyCount: 0,
      failedScopedRegistrations: [
        { category: 'chat-command', accelerator: 'Ctrl+F' },
        { category: 'app-macro', accelerator: 'Ctrl+G' },
      ],
    })
  })

  it('rejects stale scoped chat and app callbacks after the game changes', async () => {
    const handler = vi.fn()
    const hotkeys = await loadHotkeys(() => {})
    const { setPoeVersion } = await import('./game-state')
    const { uIOhook } = await import('uiohook-napi')
    setPoeVersion(1)
    hotkeys.setAppMacroHandler(handler)
    hotkeys.setChatCommands([{ hotkey: 'Ctrl+M', command: '/menagerie' }])
    hotkeys.setAppMacros([{ hotkey: 'Ctrl+D', action: 'openDust' }])
    const staleChatCallback = activeGlobalShortcuts.get('Ctrl+M')
    const staleAppCallback = activeGlobalShortcuts.get('Ctrl+D')

    overlayControllerState.targetHasFocus = true
    vi.mocked(uIOhook.keyToggle).mockClear()
    setPoeVersion(2)
    staleChatCallback?.()
    staleAppCallback?.()

    expect(handler).not.toHaveBeenCalled()
    expect(uIOhook.keyToggle).not.toHaveBeenCalled()
  })
})

describe('sendCtrlCToPoE', () => {
  /** Keys this call toggled down, in order. */
  async function toggledDownKeys(opts?: { withAlt?: boolean }): Promise<number[]> {
    const hotkeys = await loadHotkeys(() => {})
    const { uIOhook, UiohookKey } = await import('uiohook-napi')
    vi.mocked(uIOhook.keyToggle).mockClear()
    vi.mocked(uIOhook.keyTap).mockClear()

    await hotkeys.sendCtrlCToPoE(opts)

    expect(uIOhook.keyTap).toHaveBeenCalledWith(UiohookKey.C)
    return vi
      .mocked(uIOhook.keyToggle)
      .mock.calls.filter((c) => c[1] === 'down')
      .map((c) => c[0] as number)
  }

  // Both games emit the advanced item description for a plain Ctrl+C now (#560),
  // so Alt - PoE's "show advanced item descriptions" modifier - is not injected.
  it('sends a bare Ctrl+C by default', async () => {
    const { UiohookKey } = await import('uiohook-napi')
    expect(await toggledDownKeys()).toEqual([UiohookKey.Ctrl])
  })

  it('adds Alt only when asked, for a client that still needs it', async () => {
    const { UiohookKey } = await import('uiohook-napi')
    expect(await toggledDownKeys({ withAlt: true })).toEqual([UiohookKey.Ctrl, UiohookKey.Alt])
  })

  it('releases every modifier it pressed', async () => {
    const hotkeys = await loadHotkeys(() => {})
    const { uIOhook, UiohookKey } = await import('uiohook-napi')
    vi.mocked(uIOhook.keyToggle).mockClear()

    await hotkeys.sendCtrlCToPoE({ withAlt: true })

    const ups = vi
      .mocked(uIOhook.keyToggle)
      .mock.calls.filter((c) => c[1] === 'up')
      .map((c) => c[0] as number)
    expect(ups).toEqual([UiohookKey.Alt, UiohookKey.Ctrl])
  })

  // A user may bind Ctrl+C itself as a hotkey (POE_PROTECTED_HOTKEYS warns but
  // allows it). globalShortcut backs onto RegisterHotKey, which consumes
  // matching keystrokes system-wide - injected ones included - so the copy
  // keystroke would fire the user's hotkey instead of reaching PoE and every
  // capture would fail (#601). The registration must be released before the C
  // tap and restored after.
  describe('C-keyed hotkey registrations (#601)', () => {
    /** Wraps the globalShortcut and keyTap mocks to log event order. */
    function trackOrder(): string[] {
      const order: string[] = []
      globalShortcutMock.unregister.mockImplementation((acc: string) => {
        order.push(`unregister:${acc}`)
        return activeGlobalShortcuts.delete(acc)
      })
      globalShortcutMock.register.mockImplementation((acc: string, cb: () => void) => {
        order.push(`register:${acc}`)
        return registerGlobalShortcut(acc, cb)
      })
      return order
    }

    it('releases a Ctrl+C trigger binding before the tap and restores it after', async () => {
      const hotkeys = await loadHotkeys(() => {})
      const { uIOhook } = await import('uiohook-napi')
      hotkeys.setHotkey('Ctrl+C')
      expect(activeGlobalShortcuts.has('Ctrl+C')).toBe(true)

      const order = trackOrder()
      vi.mocked(uIOhook.keyTap).mockImplementation(() => {
        order.push('tap:C')
      })
      await hotkeys.sendCtrlCToPoE()

      const unregisterAt = order.indexOf('unregister:Ctrl+C')
      const tapAt = order.indexOf('tap:C')
      const registerAt = order.indexOf('register:Ctrl+C')
      expect(unregisterAt).toBeGreaterThanOrEqual(0)
      expect(tapAt).toBeGreaterThan(unregisterAt)
      expect(registerAt).toBeGreaterThan(tapAt)
      expect(activeGlobalShortcuts.has('Ctrl+C')).toBe(true)
    })

    it('releases a Ctrl+Alt+C price-check binding too - the alt/probe copy path injects it', async () => {
      const hotkeys = await loadHotkeys(() => {})
      const { uIOhook } = await import('uiohook-napi')
      hotkeys.setPriceCheckHotkey('Ctrl+Alt+C')

      const order = trackOrder()
      vi.mocked(uIOhook.keyTap).mockImplementation(() => {
        order.push('tap:C')
      })
      await hotkeys.sendCtrlCToPoE({ withAlt: true })

      expect(order.indexOf('unregister:Ctrl+Alt+C')).toBeLessThan(order.indexOf('tap:C'))
      expect(order.indexOf('register:Ctrl+Alt+C')).toBeGreaterThan(order.indexOf('tap:C'))
      expect(activeGlobalShortcuts.has('Ctrl+Alt+C')).toBe(true)
    })

    it('releases and restores a C-keyed chat-command binding via the scoped rebuild', async () => {
      const hotkeys = await loadHotkeys(() => {})
      const { setPoeVersion } = await import('./game-state')
      setPoeVersion(1)
      hotkeys.setChatCommands([{ hotkey: 'Ctrl+C', command: '/hideout' }])
      expect(activeGlobalShortcuts.has('Ctrl+C')).toBe(true)

      const order = trackOrder()
      await hotkeys.sendCtrlCToPoE()

      expect(order.indexOf('unregister:Ctrl+C')).toBeGreaterThanOrEqual(0)
      expect(activeGlobalShortcuts.has('Ctrl+C')).toBe(true)
    })

    it('leaves non-C bindings registered during injection', async () => {
      const hotkeys = await loadHotkeys(() => {})
      hotkeys.setHotkey('Ctrl+D')
      hotkeys.setPriceCheckHotkey('F5')
      globalShortcutMock.unregister.mockClear()

      await hotkeys.sendCtrlCToPoE()

      expect(globalShortcutMock.unregister).not.toHaveBeenCalled()
    })
  })
})
