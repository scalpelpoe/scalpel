import { beforeEach, describe, expect, it, vi } from 'vitest'
const { focusHolder } = vi.hoisted(() => ({ focusHolder: { current: null as unknown } }))
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => focusHolder.current },
  screen: { getDisplayNearestPoint: () => ({ scaleFactor: 1 }) },
}))
import {
  aroundNativeDialog,
  closeAllOverlaysOnPoeExit,
  hideFocusedOrAnyVisibleSecondaryOverlay,
  isAnyScalpelBrowserWindowFocused,
  isAnyScalpelWindowFocused,
  restoreAllOnPoeFocus,
} from './focus'
import { type OverlayState, overlays } from './state'

describe('native-dialog focus', () => {
  it('keeps the logical app active without treating the dialog as a focused BrowserWindow', async () => {
    focusHolder.current = null
    let closeDialog!: () => void
    const dialog = aroundNativeDialog(
      () =>
        new Promise<void>((resolve) => {
          closeDialog = resolve
        }),
    )

    expect(isAnyScalpelWindowFocused()).toBe(true)
    expect(isAnyScalpelBrowserWindowFocused()).toBe(false)

    closeDialog()
    await dialog
    expect(isAnyScalpelWindowFocused()).toBe(false)
  })
})

function fakeState(opts: {
  visible: boolean
  wasVisible?: boolean
  persist?: boolean
  gateShow?: () => boolean
}): OverlayState {
  return {
    spec: { gateShow: opts.gateShow } as unknown as OverlayState['spec'],
    win: {
      isDestroyed: () => false,
      isVisible: () => opts.visible,
      hide: vi.fn(),
      show: vi.fn(),
      moveTop: vi.fn(),
    } as unknown as OverlayState['win'],
    snapGhostActive: false,
    inProgrammaticMove: false,
    programmaticSettleTimer: null,
    isResizing: false,
    wasVisibleBeforeFocusLoss: opts.wasVisible ?? false,
    persistOverOthers: opts.persist ?? false,
  }
}

describe('closeAllOverlaysOnPoeExit', () => {
  beforeEach(() => {
    overlays.clear()
  })

  it('clears the restore flag on every secondary overlay and hides the visible ones', () => {
    const visible = fakeState({ visible: true, wasVisible: true })
    const hidden = fakeState({ visible: false, wasVisible: true })
    overlays.set('visible', visible)
    overlays.set('hidden', hidden)

    closeAllOverlaysOnPoeExit()

    // Visible window must be hidden. The hidden one may or may not have
    // hide() called (it's idempotent in production via the opacity-hide
    // patch); the contract is that the restore flag is cleared on both
    // so a stray focus event doesn't try to restore either one.
    expect(visible.win?.hide).toHaveBeenCalled()
    expect(visible.wasVisibleBeforeFocusLoss).toBe(false)
    expect(hidden.wasVisibleBeforeFocusLoss).toBe(false)
  })

  it('skips destroyed windows without throwing', () => {
    const destroyed: OverlayState = {
      spec: {} as unknown as OverlayState['spec'],
      win: {
        isDestroyed: () => true,
        isVisible: () => true,
        hide: vi.fn(),
      } as unknown as OverlayState['win'],
      snapGhostActive: false,
      inProgrammaticMove: false,
      programmaticSettleTimer: null,
      isResizing: false,
      wasVisibleBeforeFocusLoss: true,
      persistOverOthers: false,
    }
    overlays.set('destroyed', destroyed)

    expect(() => closeAllOverlaysOnPoeExit()).not.toThrow()
    expect(destroyed.win?.hide).not.toHaveBeenCalled()
  })

  it('skips overlays with no window', () => {
    const noWin: OverlayState = {
      spec: {} as unknown as OverlayState['spec'],
      win: null,
      snapGhostActive: false,
      inProgrammaticMove: false,
      programmaticSettleTimer: null,
      isResizing: false,
      wasVisibleBeforeFocusLoss: true,
      persistOverOthers: false,
    }
    overlays.set('nowin', noWin)

    expect(() => closeAllOverlaysOnPoeExit()).not.toThrow()
  })
})

describe('hideFocusedOrAnyVisibleSecondaryOverlay - persistOverOthers', () => {
  beforeEach(() => {
    overlays.clear()
    focusHolder.current = null
  })

  it('does not hide a persistent visible overlay via the any-visible sweep', () => {
    const wb = fakeState({ visible: true, persist: true })
    overlays.set('whiteboard', wb)
    const hid = hideFocusedOrAnyVisibleSecondaryOverlay()
    expect(hid).toBe(false)
    expect(wb.win?.hide).not.toHaveBeenCalled()
  })

  it('still hides a non-persistent visible overlay', () => {
    const cs = fakeState({ visible: true, persist: false })
    overlays.set('cheatsheet', cs)
    const hid = hideFocusedOrAnyVisibleSecondaryOverlay()
    expect(hid).toBe(true)
    expect(cs.win?.hide).toHaveBeenCalled()
  })

  it('hides the non-persistent overlay and leaves the persistent one alone', () => {
    const wb = fakeState({ visible: true, persist: true })
    const cs = fakeState({ visible: true, persist: false })
    overlays.set('whiteboard', wb)
    overlays.set('cheatsheet', cs)
    const hid = hideFocusedOrAnyVisibleSecondaryOverlay()
    expect(hid).toBe(true)
    expect(cs.win?.hide).toHaveBeenCalled()
    expect(wb.win?.hide).not.toHaveBeenCalled()
  })
})

describe('restoreAllOnPoeFocus', () => {
  beforeEach(() => {
    overlays.clear()
    focusHolder.current = null
  })

  it('restores a state with wasVisible=true and no gateShow', () => {
    const cs = fakeState({ visible: false, wasVisible: true })
    overlays.set('cheatsheet', cs)

    restoreAllOnPoeFocus()

    expect(cs.win?.show).toHaveBeenCalled()
    expect(cs.win?.moveTop).toHaveBeenCalled()
  })

  it('skips a state with wasVisible=true and gateShow returning false', () => {
    const pinned = fakeState({ visible: false, wasVisible: true, gateShow: () => false })
    overlays.set('pinned-zone', pinned)

    restoreAllOnPoeFocus()

    expect(pinned.win?.show).not.toHaveBeenCalled()
    expect(pinned.win?.moveTop).not.toHaveBeenCalled()
  })

  it('restores a state with wasVisible=true and gateShow returning true', () => {
    const pinned = fakeState({ visible: false, wasVisible: true, gateShow: () => true })
    overlays.set('pinned-zone', pinned)

    restoreAllOnPoeFocus()

    expect(pinned.win?.show).toHaveBeenCalled()
    expect(pinned.win?.moveTop).toHaveBeenCalled()
  })
})
