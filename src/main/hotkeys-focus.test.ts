import { beforeEach, describe, expect, it, vi } from 'vitest'

// Covers the async foreground-focus gate (hasPoeOrOverlayFocus) and the
// contextual hotkey paths that consult it: chat commands, app macros,
// secondary overlays, and the ungated trigger/price-check delegation.
// Escape delivery (globalShortcut sync + uiohook fallback + dedupe) lives in
// hotkeys.test.ts, whose resetModules-per-test harness can reset the
// module-level dedupe stamp; this file's static-import harness cannot.

const mock = vi.hoisted(() => {
  const state = {
    focusedVersion: null as 1 | 2 | null,
    scalpelFocused: false,
    typingInOverlay: false,
    targetHasFocus: false,
  }
  const registered = new Map<string, () => void>()
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
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    keyToggle: vi.fn(),
    keyTap: vi.fn(),
  }
  return { state, registered, keycodes, uIOhook }
})

vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() },
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

vi.mock('./game-detector', () => ({
  detectFocusedPoeVersion: vi.fn(async () => mock.state.focusedVersion),
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
  hasPoeOrOverlayFocus,
  setAppMacroHandler,
  setAppMacros,
  setChatCommands,
  setHotkey,
  setPriceCheckHandler,
  setPriceCheckHotkey,
  setSecondaryOverlayHotkeys,
  startHotkeyListener,
} from './hotkeys'

async function flushHotkey(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  mock.state.focusedVersion = null
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

describe('hasPoeOrOverlayFocus', () => {
  it('rejects stale overlay target focus when the foreground title is not PoE', async () => {
    mock.state.targetHasFocus = true

    await expect(hasPoeOrOverlayFocus()).resolves.toBe(false)
  })

  it('allows exact PoE foreground titles reported by the detector', async () => {
    mock.state.focusedVersion = 1
    await expect(hasPoeOrOverlayFocus()).resolves.toBe(true)

    mock.state.focusedVersion = 2
    await expect(hasPoeOrOverlayFocus()).resolves.toBe(true)
  })

  it('allows Scalpel-owned focused windows even when no PoE title is focused', async () => {
    mock.state.scalpelFocused = true

    await expect(hasPoeOrOverlayFocus()).resolves.toBe(true)
  })
})

describe('contextual hotkey handlers', () => {
  it('does not run app macros or release keys from an unrelated foreground app', async () => {
    const handler = vi.fn()
    setAppMacroHandler(handler)
    setAppMacros([{ action: 'tag-item', hotkey: 'Ctrl+M', tag: 'map', presetId: 'preset-1' }])

    mock.registered.get('Ctrl+M')?.()
    await flushHotkey()

    expect(handler).not.toHaveBeenCalled()
    expect(mock.uIOhook.keyToggle).not.toHaveBeenCalled()
  })

  it('runs app macros when an exact PoE title is focused', async () => {
    const handler = vi.fn()
    mock.state.focusedVersion = 2
    setAppMacroHandler(handler)
    setAppMacros([{ action: 'tag-item', hotkey: 'Ctrl+M', tag: 'map', presetId: 'preset-1' }])

    mock.registered.get('Ctrl+M')?.()
    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith('tag-item', 'map', 'preset-1'))
  })

  it('runs secondary overlay hotkeys while a Scalpel window is focused', async () => {
    const handler = vi.fn()
    mock.state.scalpelFocused = true
    setSecondaryOverlayHotkeys([{ accelerator: 'Ctrl+H', handler }])

    mock.registered.get('Ctrl+H')?.()
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())
  })

  it('does not run secondary overlay hotkeys from an unrelated foreground app', async () => {
    const handler = vi.fn()
    setSecondaryOverlayHotkeys([{ accelerator: 'Ctrl+H', handler }])

    mock.registered.get('Ctrl+H')?.()
    await flushHotkey()

    expect(handler).not.toHaveBeenCalled()
    expect(mock.uIOhook.keyToggle).not.toHaveBeenCalled()
  })

  it('does not inject chat commands from an unrelated foreground app', async () => {
    setChatCommands([{ hotkey: 'Ctrl+L', command: '/hideout' }])

    mock.registered.get('Ctrl+L')?.()
    await flushHotkey()

    expect(mock.uIOhook.keyToggle).not.toHaveBeenCalled()
    expect(mock.uIOhook.keyTap).not.toHaveBeenCalled()
  })

  it('releases trigger and price-check keys and delegates to their handlers', async () => {
    // fireTrigger/firePriceCheck deliberately do NOT gate on focus here: their
    // handlers (createHotkeyHandler/createPriceCheckHandler) run
    // ensureCorrectGameForHotkey, which is the single focus authority for these
    // two paths. So at this layer we only assert key-release + delegation.
    const trigger = vi.fn()
    const price = vi.fn()
    startHotkeyListener(trigger)
    setHotkey('Ctrl+D')
    setPriceCheckHandler(price)
    setPriceCheckHotkey('Ctrl+P')

    mock.registered.get('Ctrl+D')?.()
    mock.registered.get('Ctrl+P')?.()
    await flushHotkey()

    expect(trigger).toHaveBeenCalledOnce()
    expect(price).toHaveBeenCalledOnce()
    expect(mock.uIOhook.keyToggle).toHaveBeenCalledWith(mock.keycodes.D, 'up')
    expect(mock.uIOhook.keyToggle).toHaveBeenCalledWith(mock.keycodes.P, 'up')
  })
})
