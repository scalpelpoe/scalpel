import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Process-boundary mocks: captureGameWindow talks to electron's screen and
 *  desktopCapturer, plus electron-overlay-window's live target state. Everything
 *  it computes from them is arithmetic, which is what these tests are about. */
const mock = vi.hoisted(() => {
  const state = {
    targetHasFocus: true,
    targetBounds: { x: 0, y: 0, width: 192, height: 108 } as
      | { x: number; y: number; width: number; height: number }
      | undefined,
  }
  return { state, getSources: vi.fn(), getDisplayNearestPoint: vi.fn(), screenToDipPoint: vi.fn() }
})

vi.mock('electron', () => ({
  desktopCapturer: { getSources: mock.getSources },
  screen: {
    getDisplayNearestPoint: mock.getDisplayNearestPoint,
    screenToDipPoint: mock.screenToDipPoint,
  },
}))

vi.mock('electron-overlay-window', () => ({
  OverlayController: {
    get targetHasFocus() {
      return mock.state.targetHasFocus
    },
    get targetBounds() {
      return mock.state.targetBounds
    },
  },
}))

vi.mock('../hyprland', () => ({ hyprlandOverlayActive: () => false }))

import { captureGameWindow, captureGameWindowResult } from './capture'

/** A screen source whose thumbnail is `w`x`h` of opaque BGRA. */
function source(w: number, h: number, displayId = '1'): unknown {
  return {
    display_id: displayId,
    thumbnail: {
      getSize: () => ({ width: w, height: h }),
      toBitmap: () => Buffer.alloc(w * h * 4, 0x40),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.state.targetHasFocus = true
  mock.state.targetBounds = { x: 0, y: 0, width: 192, height: 108 }
  mock.getDisplayNearestPoint.mockReturnValue({
    id: 1,
    scaleFactor: 1,
    size: { width: 192, height: 108 },
    bounds: { x: 0, y: 0, width: 192, height: 108 },
  })
  mock.screenToDipPoint.mockImplementation((p: { x: number; y: number }) => p)
  mock.getSources.mockResolvedValue([source(192, 108)])
})

describe('captureGameWindow', () => {
  it('returns the game window rect as a BGRA frame', async () => {
    const frame = await captureGameWindow()
    expect(frame).toMatchObject({ width: 192, height: 108, gameSize: { width: 192, height: 108 }, scale: 1 })
  })

  it('refuses to grab pixels while the game is not the focused window', async () => {
    mock.state.targetHasFocus = false
    expect(await captureGameWindow()).toBeNull()
    // The gate is the privacy invariant for every ambient caller (panel
    // detection polls, the plugin capture API): no frame while the user is off
    // in another app. It must stay the default.
    expect(await captureGameWindowResult()).toEqual({ frame: null, failure: 'focus' })
  })

  it('grabs anyway when the caller opts out of the focus gate', async () => {
    // OverlayController.targetHasFocus flickers around overlay window show/hide
    // - see the comment on getGameCursorPosition, which dropped the same gate
    // for the same reason. A caller that has ALREADY established focus (the
    // radial menu, whose hotkey only fires in the game's own context) must be
    // able to say so instead of re-asking a flag that is mid-flicker.
    mock.state.targetHasFocus = false
    const frame = await captureGameWindow({ skipFocusGate: true })
    expect(frame).toMatchObject({ width: 192, height: 108 })
  })

  it('reports which gate closed, so a silent null is diagnosable', async () => {
    mock.state.targetBounds = undefined
    expect(await captureGameWindowResult()).toEqual({ frame: null, failure: 'bounds' })

    mock.state.targetBounds = { x: 0, y: 0, width: 192, height: 108 }
    mock.getSources.mockResolvedValue([])
    expect(await captureGameWindowResult()).toEqual({ frame: null, failure: 'no-source' })

    mock.getSources.mockResolvedValue([source(0, 0)])
    expect(await captureGameWindowResult()).toEqual({ frame: null, failure: 'empty-frame' })

    // Game window off the right edge of the display it was matched to: the
    // rect clamps to nothing, which is a geometry disagreement rather than a
    // missing frame.
    mock.getSources.mockResolvedValue([source(192, 108)])
    mock.state.targetBounds = { x: 400, y: 0, width: 192, height: 108 }
    expect(await captureGameWindowResult()).toEqual({ frame: null, failure: 'geometry' })

    mock.getSources.mockRejectedValue(new Error('capturer exploded'))
    mock.state.targetBounds = { x: 0, y: 0, width: 192, height: 108 }
    expect(await captureGameWindowResult()).toEqual({ frame: null, failure: 'error' })
  })

  it('falls back to the first source when no display_id matches', async () => {
    // Windows screen sources routinely report an empty display_id, so the
    // fallback is the normal path rather than the exceptional one.
    mock.getSources.mockResolvedValue([source(192, 108, '')])
    expect(await captureGameWindow()).toMatchObject({ width: 192, height: 108 })
  })
})
