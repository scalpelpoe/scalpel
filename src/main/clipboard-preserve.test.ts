import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory clipboard so we can assert exactly what is left behind.
const clip = { text: '', html: '' }
const clipboardMock = {
  readText: vi.fn(() => clip.text),
  readHTML: vi.fn(() => clip.html),
  writeText: vi.fn((t: string) => {
    clip.text = t
    clip.html = ''
  }),
  write: vi.fn((d: { text?: string; html?: string }) => {
    clip.text = d.text ?? ''
    clip.html = d.html ?? ''
  }),
  clear: vi.fn(() => {
    clip.text = ''
    clip.html = ''
  }),
}

const overlayControllerState = { targetHasFocus: false, events: new EventEmitter(), targetBounds: null }
const focusState = { throwOnFocus: false }

vi.mock('electron', () => ({
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() },
  clipboard: clipboardMock,
  ipcMain: { on: vi.fn(), handle: vi.fn() },
}))
vi.mock('@scalpel/platform', () => ({
  Key: {
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
  },
  platform: () => ({
    input: {
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      keyToggle: vi.fn(),
      keyTap: vi.fn(),
      seesInjectedKeys: true,
      physicallyHeld: () => null,
    },
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
vi.mock('./overlay', () => ({
  isTypingInOverlay: () => false,
  focusGameWindow: vi.fn(() => {
    if (focusState.throwOnFocus) throw new Error('Object has been destroyed')
    // A paste waits for the handoff to land before injecting, so the fake has
    // to complete it.
    overlayControllerState.targetHasFocus = true
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

// Static imports are hoisted above the mock state above, so the module under
// test is pulled in lazily once the mocks are live.
let preserve: typeof import('./clipboard-preserve')
const snapshotClipboard = (): (() => void) => preserve.snapshotClipboard()

async function freshHotkeys(): Promise<typeof import('./hotkeys')> {
  vi.resetModules()
  const hk = await import('./hotkeys')
  // hotkeys.ts and this file must share one borrow registry.
  preserve = await import('./clipboard-preserve')
  return hk
}

beforeEach(async () => {
  clip.text = 'USER-COPIED-TEXT'
  clip.html = ''
  focusState.throwOnFocus = false
  overlayControllerState.targetHasFocus = false
  preserve = await import('./clipboard-preserve')
  preserve.__resetClipboardBorrows()
})

// A borrow is the clipboard held on loan by a flow that needs it as scratch
// space (chat paste, price-check capture, regex paste). Overlapping borrows
// used to each save/restore independently, so the second one would snapshot the
// first one's scratch value and put it back last (#562).
describe('clipboard borrows', () => {
  it('restores the user clipboard after a single borrow', () => {
    const release = snapshotClipboard()
    clipboardMock.writeText('SCRATCH')
    release()
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  it('preserves HTML alongside text', () => {
    clip.text = 'plain'
    clip.html = '<b>plain</b>'
    const release = snapshotClipboard()
    clipboardMock.writeText('SCRATCH')
    release()
    expect(clip).toEqual({ text: 'plain', html: '<b>plain</b>' })
  })

  it('clears when the clipboard started empty', () => {
    clip.text = ''
    const release = snapshotClipboard()
    clipboardMock.writeText('SCRATCH')
    release()
    expect(clip.text).toBe('')
  })

  it('does not let an overlapping borrow restore the first borrow scratch value', () => {
    const releaseA = snapshotClipboard()
    clipboardMock.writeText('/itemfilter MyFilter-local')
    const releaseB = snapshotClipboard() // starts while A holds the clipboard
    releaseA()
    expect(clip.text).toBe('/itemfilter MyFilter-local') // B still has it on loan
    releaseB()
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  it('is order-independent and idempotent', () => {
    const releaseA = snapshotClipboard()
    const releaseB = snapshotClipboard()
    clipboardMock.writeText('SCRATCH')
    releaseB()
    releaseB()
    expect(clip.text).toBe('SCRATCH')
    releaseA()
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })
})

/** A paste keeps the command on the clipboard for CLIPBOARD_HOLD_MS after the
 *  keys go out, so the client can still read it through a reload hitch. The
 *  hold outlives the promise on purpose - wait it out before asserting on what
 *  the user got back. */
const settleHold = (): Promise<void> => new Promise((r) => setTimeout(r, 300))

describe('filter-refresh clipboard round trip', () => {
  it('restores the user clipboard after a filter switch', async () => {
    const { sendItemFilterCommand } = await freshHotkeys()
    await sendItemFilterCommand('MyFilter-local', 'MyFilter')
    await settleHold()
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  it('restores the clipboard when the paste throws', async () => {
    const { sendItemFilterCommand } = await freshHotkeys()
    focusState.throwOnFocus = true
    await sendItemFilterCommand('MyFilter-local', 'MyFilter').catch(() => {})
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })

  it('keeps taking chat commands after a paste throws', async () => {
    const hk = await freshHotkeys()
    focusState.throwOnFocus = true
    await hk.sendItemFilterCommand('MyFilter-local', 'MyFilter').catch(() => {})
    focusState.throwOnFocus = false
    clip.text = 'SECOND-USER-TEXT'
    const writes = clipboardMock.writeText.mock.calls.length
    await hk.sendReloadFilterToPoE()
    expect(clipboardMock.writeText.mock.calls.length).toBeGreaterThan(writes)
    await settleHold()
    expect(clip.text).toBe('SECOND-USER-TEXT')
  })

  // The reported symptom: price-check the moment "check for filter updates"
  // fires and the clipboard is left holding the chat command for good.
  it('survives a price-check landing inside the filter switch', async () => {
    const hk = await freshHotkeys()
    const paste = hk.sendItemFilterCommand('MyFilter-local')
    await new Promise((r) => setTimeout(r, 10))
    const releaseCapture = snapshotClipboard()
    clipboardMock.clear()
    clip.text = 'Item Class: Rings\nRarity: Rare\n'
    await paste
    await new Promise((r) => setTimeout(r, 60))
    releaseCapture()
    await settleHold()
    expect(clip.text).toBe('USER-COPIED-TEXT')
  })
})
