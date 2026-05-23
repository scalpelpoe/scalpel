import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeAllOverlaysOnPoeExit } from './focus'
import { type OverlayState, overlays } from './state'

function fakeState(opts: { visible: boolean; wasVisible: boolean }): OverlayState {
  return {
    spec: {} as unknown as OverlayState['spec'],
    win: {
      isDestroyed: () => false,
      isVisible: () => opts.visible,
      hide: vi.fn(),
    } as unknown as OverlayState['win'],
    snapGhostActive: false,
    inProgrammaticMove: false,
    programmaticSettleTimer: null,
    isResizing: false,
    wasVisibleBeforeFocusLoss: opts.wasVisible,
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
    }
    overlays.set('nowin', noWin)

    expect(() => closeAllOverlaysOnPoeExit()).not.toThrow()
  })
})
