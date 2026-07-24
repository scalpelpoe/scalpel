import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Covers the shared synchronous foreground-context gate and every hotkey
// category that consults it.
// Escape delivery (globalShortcut sync + uiohook fallback + dedupe) lives in
// hotkeys.test.ts, whose resetModules-per-test harness can reset the
// module-level dedupe stamp; this file's static-import harness cannot.

const mock = vi.hoisted(() => {
  const state = {
    scalpelFocused: false,
    typingInOverlay: false,
    targetHasFocus: false,
  }
  const registered = new Map<string, () => void>()
  const listeners: Record<string, Array<(event: never) => void>> = {}
  const keycodes: Record<string, number> = {}
  for (const [index, letter] of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').entries()) keycodes[letter] = 65 + index
  Object.assign(keycodes, {
    Ctrl: 1001,
    CtrlRight: 1002,
    Shift: 1003,
    ShiftRight: 1004,
    Alt: 1005,
    AltRight: 1006,
    Enter: 13,
    Escape: 27,
    ArrowRight: 39,
    ArrowLeft: 37,
    Space: 32,
    Tab: 9,
    Delete: 46,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34,
    F1: 112,
    F2: 113,
    F3: 114,
    F4: 115,
    F5: 116,
    F6: 117,
    F7: 118,
    F8: 119,
    F9: 120,
    F10: 121,
    F11: 122,
    F12: 123,
    '0': 48,
    '1': 49,
    '2': 50,
    '3': 51,
    '4': 52,
    '5': 53,
    '6': 54,
    '7': 55,
    '8': 56,
    '9': 57,
  })
  const uIOhook = {
    on: vi.fn((event: string, handler: (event: never) => void) => {
      ;(listeners[event] ??= []).push(handler)
    }),
    start: vi.fn(),
    stop: vi.fn(),
    keyToggle: vi.fn(),
    keyTap: vi.fn(),
  }
  const trigger = vi.fn()
  return { state, registered, listeners, keycodes, uIOhook, trigger }
})

vi.mock('electron', () => ({
  clipboard: {
    readText: vi.fn(() => ''),
    readHTML: vi.fn(() => ''),
    writeText: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
  },
  globalShortcut: {
    register: vi.fn((accelerator: string, cb: () => void) => {
      mock.registered.set(accelerator, cb)
      return true
    }),
    unregister: vi.fn((accelerator: string) => {
      mock.registered.delete(accelerator)
    }),
    unregisterAll: vi.fn(() => {
      mock.registered.clear()
    }),
  },
  ipcMain: { handle: vi.fn() },
}))

vi.mock('electron-overlay-window', () => ({
  OverlayController: {
    get targetHasFocus() {
      return mock.state.targetHasFocus
    },
    targetBounds: null,
    events: { on: vi.fn() },
  },
}))

vi.mock('uiohook-napi', () => ({
  UiohookKey: mock.keycodes,
  uIOhook: mock.uIOhook,
}))

vi.mock('./diagnostics', () => ({
  guardNativeListener: vi.fn((_label: string, fn: unknown) => fn),
  recordMainBreadcrumb: vi.fn(),
  recordMainDiagnostic: vi.fn(),
  registerDiagnosticProvider: vi.fn(),
}))

vi.mock('./game-state', () => ({
  getPoeVersion: vi.fn(() => 1),
}))

vi.mock('./overlay', () => ({
  focusGameWindow: vi.fn(),
  isTypingInOverlay: vi.fn(() => mock.state.typingInOverlay),
  setOverlayVisibilityListener: vi.fn(),
}))

vi.mock('./windowing', () => ({
  hideFocusedOrAnyVisibleSecondaryOverlay: vi.fn(() => false),
  isAnyScalpelBrowserWindowFocused: vi.fn(() => mock.state.scalpelFocused),
}))

import {
  resumeHotkeys,
  setAppMacroHandler,
  setAppMacros,
  setChatCommands,
  setHotkey,
  setPriceCheckHandler,
  setPriceCheckHotkey,
  setSecondaryOverlayHotkeys,
  startHotkeyListener,
  suspendHotkeys,
} from './hotkeys'

function emitKeydown(event: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): void {
  for (const handler of mock.listeners.keydown ?? []) handler(event as never)
}

startHotkeyListener(() => mock.trigger())

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  mock.state.scalpelFocused = false
  mock.state.typingInOverlay = false
  mock.state.targetHasFocus = false
  mock.registered.clear()
  vi.clearAllMocks()
  setAppMacros([])
  setSecondaryOverlayHotkeys([])
  setChatCommands([])
  setPriceCheckHandler(null)
})

describe('contextual hotkey handlers', () => {
  it('does not run app macros or release keys from an unrelated foreground app', () => {
    const handler = vi.fn()
    setAppMacroHandler(handler)
    setAppMacros([{ action: 'tag-item', hotkey: 'Ctrl+M', tag: 'map', presetId: 'preset-1' }])

    mock.registered.get('Ctrl+M')?.()

    expect(handler).not.toHaveBeenCalled()
    expect(mock.uIOhook.keyToggle).not.toHaveBeenCalled()
  })

  it('runs F-key app macros while PoE is focused', () => {
    const handler = vi.fn()
    mock.state.targetHasFocus = true
    setAppMacroHandler(handler)
    setAppMacros([{ action: 'toggleRegexRemote', hotkey: 'F8' }])

    mock.registered.get('F8')?.()

    expect(handler).toHaveBeenCalledWith('toggleRegexRemote', undefined, undefined)
  })

  it('runs app macros while a Scalpel gameplay window is focused', () => {
    const handler = vi.fn()
    mock.state.scalpelFocused = true
    setAppMacroHandler(handler)
    setAppMacros([{ action: 'closeOverlay', hotkey: 'F8' }])

    mock.registered.get('F8')?.()

    expect(handler).toHaveBeenCalledWith('closeOverlay', undefined, undefined)
  })

  it('runs secondary overlay hotkeys while a Scalpel gameplay window is focused', () => {
    const handler = vi.fn()
    mock.state.scalpelFocused = true
    setSecondaryOverlayHotkeys([{ accelerator: 'Ctrl+H', handler }])

    mock.registered.get('Ctrl+H')?.()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not run secondary overlay hotkeys from an unrelated foreground app', () => {
    const handler = vi.fn()
    setSecondaryOverlayHotkeys([{ accelerator: 'Ctrl+H', handler }])

    mock.registered.get('Ctrl+H')?.()

    expect(handler).not.toHaveBeenCalled()
    expect(mock.uIOhook.keyToggle).not.toHaveBeenCalled()
  })

  it('does not inject chat commands from an unrelated foreground app', () => {
    setChatCommands([{ hotkey: 'Ctrl+L', command: '/hideout' }])

    mock.registered.get('Ctrl+L')?.()

    expect(mock.uIOhook.keyToggle).not.toHaveBeenCalled()
    expect(mock.uIOhook.keyTap).not.toHaveBeenCalled()
  })

  it('runs chat commands while PoE is focused without requiring overlay visibility', async () => {
    vi.useFakeTimers()
    mock.state.targetHasFocus = true
    setChatCommands([{ hotkey: 'F5', command: '/hideout' }])

    mock.registered.get('F5')?.()

    expect(mock.uIOhook.keyTap).toHaveBeenCalledWith(mock.keycodes.Enter)
    vi.advanceTimersByTime(51)
    await Promise.resolve()
    vi.useRealTimers()
  })

  it('gates trigger and price-check handlers and key release on foreground context', () => {
    const price = vi.fn()
    setHotkey('Ctrl+D')
    setPriceCheckHandler(price)
    setPriceCheckHotkey('Ctrl+P')

    mock.registered.get('Ctrl+D')?.()
    mock.registered.get('Ctrl+P')?.()

    expect(mock.trigger).not.toHaveBeenCalled()
    expect(price).not.toHaveBeenCalled()
    expect(mock.uIOhook.keyToggle).not.toHaveBeenCalled()

    mock.state.targetHasFocus = true
    mock.registered.get('Ctrl+D')?.()
    mock.registered.get('Ctrl+P')?.()

    expect(mock.trigger).toHaveBeenCalledOnce()
    expect(price).toHaveBeenCalledOnce()
    expect(mock.uIOhook.keyToggle).toHaveBeenCalledWith(mock.keycodes.D, 'up')
    expect(mock.uIOhook.keyToggle).toHaveBeenCalledWith(mock.keycodes.P, 'up')
  })

  it('rejects trigger and price-check delivery while typing in an overlay', () => {
    const price = vi.fn()
    mock.state.targetHasFocus = true
    mock.state.typingInOverlay = true
    setHotkey('Ctrl+D')
    setPriceCheckHandler(price)
    setPriceCheckHotkey('Ctrl+P')

    mock.registered.get('Ctrl+D')?.()
    mock.registered.get('Ctrl+P')?.()

    expect(mock.trigger).not.toHaveBeenCalled()
    expect(price).not.toHaveBeenCalled()
    expect(mock.uIOhook.keyToggle).not.toHaveBeenCalled()
  })

  it('applies the same focus rule to uIOhook trigger and price-check delivery', () => {
    vi.useFakeTimers()
    const price = vi.fn()
    setHotkey('Ctrl+D')
    setPriceCheckHandler(price)
    setPriceCheckHotkey('Ctrl+P')

    const triggerEvent = { keycode: mock.keycodes.D, ctrlKey: true, shiftKey: false, altKey: false }
    const priceEvent = { keycode: mock.keycodes.P, ctrlKey: true, shiftKey: false, altKey: false }
    emitKeydown(triggerEvent)
    emitKeydown(priceEvent)
    expect(mock.trigger).not.toHaveBeenCalled()
    expect(price).not.toHaveBeenCalled()

    mock.state.targetHasFocus = true
    vi.advanceTimersByTime(101)
    emitKeydown(triggerEvent)
    emitKeydown(priceEvent)
    expect(mock.trigger).toHaveBeenCalledOnce()
    expect(price).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('suspends uIOhook delivery even when PoE remains focused', () => {
    mock.state.targetHasFocus = true
    setHotkey('Ctrl+D')
    suspendHotkeys()

    emitKeydown({ keycode: mock.keycodes.D, ctrlKey: true, shiftKey: false, altKey: false })
    expect(mock.trigger).not.toHaveBeenCalled()

    resumeHotkeys()
  })
})
