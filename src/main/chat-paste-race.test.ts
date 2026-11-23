import { EventEmitter } from 'node:events'
import { type MockedFunction, beforeEach, describe, expect, it, vi } from 'vitest'

// A chat paste is three moving parts that have to line up: PoE has to own OS
// focus, our command has to actually be on the clipboard, and it has to stay
// there until the client *processes* Ctrl+V. This file fakes all three so the
// failure the user sees - their own clipboard broadcast to chat - is testable.
const clip = { text: '', html: '' }
const clipboardState = { locked: false }
const clipboardMock = {
  readText: vi.fn(() => clip.text),
  readHTML: vi.fn(() => clip.html),
  // A clipboard manager (Win+V history, Ditto) holding the clipboard open makes
  // Electron's write a silent no-op. `locked` models exactly that.
  writeText: vi.fn((t: string) => {
    if (clipboardState.locked) return
    clip.text = t
    clip.html = ''
  }),
  write: vi.fn((d: { text?: string; html?: string }) => {
    if (clipboardState.locked) return
    clip.text = d.text ?? ''
    clip.html = d.html ?? ''
  }),
  clear: vi.fn(() => {
    if (clipboardState.locked) return
    clip.text = ''
    clip.html = ''
  }),
}

const KEY = { Ctrl: 2, A: 8, V: 7, Enter: 9, Home: 10, Delete: 11 }

/** Fake PoE client: an input queue drained `lagMs` after each injected key. */
const game = {
  lagMs: 5,
  ctrlHeld: false,
  chatOpen: false,
  input: '',
  selectAll: false,
  sent: [] as string[],
}

function queue(fn: () => void): void {
  setTimeout(fn, game.lagMs)
}

function handleKey(code: number): void {
  if (code === KEY.Enter) {
    if (!game.chatOpen) {
      game.chatOpen = true
      game.input = ''
      game.selectAll = false
    } else {
      game.sent.push(game.input)
      game.chatOpen = false
      game.input = ''
    }
    return
  }
  if (!game.chatOpen) return
  if (code === KEY.A && game.ctrlHeld) game.selectAll = true
  if (code === KEY.V && game.ctrlHeld) {
    if (game.selectAll) game.input = ''
    game.selectAll = false
    game.input += clipboardMock.readText()
  }
}

const overlayControllerState = { targetHasFocus: false, events: new EventEmitter(), targetBounds: null }
/** How long the OS takes to hand foreground to PoE. Infinity = it never does
 *  (PoE closed, or the foreground request was refused). */
const focusState = { delayMs: 0 }

vi.mock('electron', () => ({
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() },
  clipboard: clipboardMock,
  ipcMain: { on: vi.fn(), handle: vi.fn() },
}))
vi.mock('@scalpel/platform', () => ({
  platform: () => ({
    traits: { compositorFocus: false },
    windowTracker: {
      get targetHasFocus() {
        return overlayControllerState.targetHasFocus
      },
      targetBounds: null,
      events: overlayControllerState.events,
      inputAllowed: () => true,
    },
  }),
}))
vi.mock('uiohook-napi', () => {
  const UiohookKey = {
    Escape: 1,
    Ctrl: 2,
    CtrlRight: 22,
    Alt: 3,
    AltRight: 33,
    Shift: 4,
    ShiftRight: 5,
    C: 6,
    V: 7,
    A: 8,
    Enter: 9,
    Home: 10,
    Delete: 11,
  }
  const uIOhook = {
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    keyToggle: vi.fn((code: number, dir: 'up' | 'down') => {
      if (code === UiohookKey.Ctrl) queue(() => (game.ctrlHeld = dir === 'down'))
    }),
    keyTap: vi.fn((code: number) => queue(() => handleKey(code))),
  }
  return { UiohookKey, uIOhook }
})
vi.mock('./overlay', () => ({
  isTypingInOverlay: () => false,
  focusGameWindow: vi.fn(() => {
    if (focusState.delayMs === Number.POSITIVE_INFINITY) return
    setTimeout(() => {
      overlayControllerState.targetHasFocus = true
    }, focusState.delayMs)
  }),
  setOverlayVisibilityListener: vi.fn(),
}))
vi.mock('./windowing', () => ({
  hideFocusedOrAnyVisibleSecondaryOverlay: vi.fn(() => false),
  isAnyScalpelBrowserWindowFocused: vi.fn(() => false),
}))
vi.mock('./game-state', () => ({ getPoeVersion: () => 1 }))
vi.mock('./diagnostics', () => ({
  guardNativeListener: (_n: string, fn: unknown) => fn,
  recordMainBreadcrumb: vi.fn(),
  recordMainDiagnostic: vi.fn(),
  registerDiagnosticProvider: vi.fn(),
}))

type Hotkeys = typeof import('./hotkeys')
type Uiohook = typeof import('uiohook-napi')

async function freshHotkeys(): Promise<{ hk: Hotkeys; keyTap: MockedFunction<Uiohook['uIOhook']['keyTap']> }> {
  vi.resetModules()
  const hk = await import('./hotkeys')
  const { uIOhook } = await import('uiohook-napi')
  const preserve = await import('./clipboard-preserve')
  preserve.__resetClipboardBorrows()
  const keyTap = vi.mocked(uIOhook.keyTap)
  keyTap.mockClear()
  return { hk, keyTap }
}

beforeEach(() => {
  clip.text = 'USER-COPIED-TEXT'
  clip.html = ''
  clipboardState.locked = false
  overlayControllerState.targetHasFocus = false
  focusState.delayMs = 0
  game.lagMs = 5
  game.ctrlHeld = false
  game.chatOpen = false
  game.input = ''
  game.selectAll = false
  game.sent = []
})

/** Let the fake client drain its queue and the clipboard hold expire. */
const settle = (ms = 600): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('chat paste', () => {
  it('sends the command when the client keeps up', async () => {
    const { hk } = await freshHotkeys()
    await hk.sendReloadFilterToPoE()
    await settle()
    expect(game.sent).toEqual(['/reloaditemfilter'])
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  // The report: "updating my filters dumps my clipboard into chat". The client
  // reads the clipboard when it processes Ctrl+V, not when SendInput returns,
  // and a filter reload hitches it well past a frame. Restoring on a 50ms timer
  // meant the game pasted the user's own clipboard - and the trailing Enter
  // broadcast it.
  it('sends the command, not the user clipboard, when the client is 80ms behind', async () => {
    const { hk } = await freshHotkeys()
    game.lagMs = 80
    await hk.sendReloadFilterToPoE()
    await settle()
    expect(game.sent).toEqual(['/reloaditemfilter'])
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  it('waits for the focus handoff before injecting', async () => {
    const { hk } = await freshHotkeys()
    focusState.delayMs = 100
    await hk.sendReloadFilterToPoE()
    await settle()
    expect(game.sent).toEqual(['/reloaditemfilter'])
  })

  it('skips the fast path and injects immediately when the game already has focus', async () => {
    const { hk } = await freshHotkeys()
    overlayControllerState.targetHasFocus = true
    focusState.delayMs = Number.POSITIVE_INFINITY
    await hk.sendReloadFilterToPoE()
    await settle()
    expect(game.sent).toEqual(['/reloaditemfilter'])
  })

  // Injected keys land wherever the OS says foreground is. Firing them blind
  // sprayed Enter/Ctrl+V/Enter at whatever the user was in (browser, Discord).
  it('injects nothing when the game never takes focus', async () => {
    const { hk, keyTap } = await freshHotkeys()
    focusState.delayMs = Number.POSITIVE_INFINITY
    await expect(hk.sendReloadFilterToPoE()).rejects.toThrow(/focus/i)
    await settle()
    expect(keyTap).not.toHaveBeenCalled()
    expect(game.sent).toEqual([])
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  // Same rule for the clipboard: if the command is not provably on it, pasting
  // and submitting would broadcast whatever is.
  it('injects nothing when the clipboard write never lands', async () => {
    const { hk, keyTap } = await freshHotkeys()
    clipboardState.locked = true
    await expect(hk.sendReloadFilterToPoE()).rejects.toThrow(/clipboard/i)
    await settle()
    expect(keyTap).not.toHaveBeenCalled()
    expect(game.sent).toEqual([])
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  it('restores the user clipboard once the hold expires', async () => {
    const { hk } = await freshHotkeys()
    await hk.sendReloadFilterToPoE()
    expect(clip.text).toBe('/reloaditemfilter') // still on loan right after the paste
    await settle()
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  it('sends both commands of a filter switch', async () => {
    const { hk } = await freshHotkeys()
    await hk.sendItemFilterCommand('MyFilter-local', 'MyFilter')
    await settle()
    expect(game.sent).toEqual(['/itemfilter MyFilter', '/itemfilter MyFilter-local'])
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })
})
