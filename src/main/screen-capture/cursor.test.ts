import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// getGameCursorPosition needs electron and electron-overlay-window mocked
// (process-boundary mocks); toGameCursor is pure and needs neither.
const mock = vi.hoisted(() => {
  const state = {
    targetHasFocus: false,
    targetBounds: undefined as { x: number; y: number; width: number; height: number } | undefined,
  }
  return {
    state,
    screenToDipRect: vi.fn(),
    getCursorScreenPoint: vi.fn(),
  }
})

vi.mock('electron', () => ({
  screen: {
    screenToDipRect: mock.screenToDipRect,
    getCursorScreenPoint: mock.getCursorScreenPoint,
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

import { getGameCursorPosition, toGameCursor } from './cursor'

describe('toGameCursor', () => {
  const gameSize = { width: 1920, height: 1080 }

  it('returns the cursor relative to the game window origin', () => {
    expect(toGameCursor({ x: 700, y: 400 }, { x: 100, y: 50 }, gameSize)).toEqual({ x: 600, y: 350 })
  })

  it('works when the game window sits at the origin', () => {
    expect(toGameCursor({ x: 10, y: 20 }, { x: 0, y: 0 }, gameSize)).toEqual({ x: 10, y: 20 })
  })

  it('handles a game window on a secondary display at a negative origin', () => {
    expect(toGameCursor({ x: -1500, y: 200 }, { x: -1920, y: 0 }, gameSize)).toEqual({ x: 420, y: 200 })
  })

  it('returns null when the cursor is left of or above the window', () => {
    expect(toGameCursor({ x: 50, y: 400 }, { x: 100, y: 50 }, gameSize)).toBeNull()
    expect(toGameCursor({ x: 700, y: 10 }, { x: 100, y: 50 }, gameSize)).toBeNull()
  })

  it('returns null when the cursor is right of or below the window', () => {
    expect(toGameCursor({ x: 2100, y: 400 }, { x: 100, y: 50 }, gameSize)).toBeNull()
    expect(toGameCursor({ x: 700, y: 1200 }, { x: 100, y: 50 }, gameSize)).toBeNull()
  })

  it('includes the window edges', () => {
    expect(toGameCursor({ x: 100, y: 50 }, { x: 100, y: 50 }, gameSize)).toEqual({ x: 0, y: 0 })
    expect(toGameCursor({ x: 2020, y: 1130 }, { x: 100, y: 50 }, gameSize)).toEqual({ x: 1920, y: 1080 })
  })
})

describe('getGameCursorPosition', () => {
  beforeEach(() => {
    mock.state.targetHasFocus = true
    mock.state.targetBounds = { x: 100, y: 50, width: 1920, height: 1080 }
    // Identity conversion by default: physical == DIP (scale 1.0).
    mock.screenToDipRect.mockImplementation(
      (_win: unknown, rect: { x: number; y: number; width: number; height: number }) => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }),
    )
    mock.getCursorScreenPoint.mockReturnValue({ x: 700, y: 400 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the cursor position at scale 1.0', () => {
    expect(getGameCursorPosition()).toEqual({ x: 600, y: 350 })
    expect(mock.screenToDipRect).toHaveBeenCalledWith(null, { x: 100, y: 50, width: 1920, height: 1080 })
  })

  it('converts a fractional scale (1.25) and sizes the in/out test off the DIP rect, not the physical one', () => {
    // Physical 2400x1350 window at 1.25x scale -> DIP 1920x1080.
    mock.state.targetBounds = { x: 125, y: 62, width: 2400, height: 1350 }
    mock.screenToDipRect.mockImplementation(
      (_win: unknown, rect: { x: number; y: number; width: number; height: number }) => ({
        x: Math.round(rect.x / 1.25),
        y: Math.round(rect.y / 1.25),
        width: Math.round(rect.width / 1.25),
        height: Math.round(rect.height / 1.25),
      }),
    )

    mock.getCursorScreenPoint.mockReturnValue({ x: 700, y: 400 })
    expect(getGameCursorPosition()).toEqual({ x: 600, y: 350 })

    // Relative x=1950 is outside the 1920-wide DIP window but inside the
    // 2400-wide physical one; only null if gameSize came from the DIP rect.
    mock.getCursorScreenPoint.mockReturnValue({ x: 2050, y: 400 })
    expect(getGameCursorPosition()).toBeNull()
  })

  it('converts a fractional scale (1.5) and sizes the in/out test off the DIP rect, not the physical one', () => {
    // Physical 2880x1620 window at 1.5x scale -> DIP 1920x1080.
    mock.state.targetBounds = { x: 150, y: 75, width: 2880, height: 1620 }
    mock.screenToDipRect.mockImplementation(
      (_win: unknown, rect: { x: number; y: number; width: number; height: number }) => ({
        x: Math.round(rect.x / 1.5),
        y: Math.round(rect.y / 1.5),
        width: Math.round(rect.width / 1.5),
        height: Math.round(rect.height / 1.5),
      }),
    )

    mock.getCursorScreenPoint.mockReturnValue({ x: 700, y: 400 })
    expect(getGameCursorPosition()).toEqual({ x: 600, y: 350 })

    // Relative x=1950 is outside the 1920-wide DIP window but inside the
    // 2880-wide physical one; only null if gameSize came from the DIP rect.
    mock.getCursorScreenPoint.mockReturnValue({ x: 2050, y: 400 })
    expect(getGameCursorPosition()).toBeNull()
  })

  it('handles a game window on a secondary display at a negative origin', () => {
    mock.state.targetBounds = { x: -1920, y: 0, width: 1920, height: 1080 }
    mock.getCursorScreenPoint.mockReturnValue({ x: -1500, y: 200 })
    expect(getGameCursorPosition()).toEqual({ x: 420, y: 200 })
  })

  it('deliberately ignores focus: unfocused target with valid bounds and an in-bounds cursor still resolves', () => {
    // Unlike captureGameWindow, a cursor read doesn't need the game window to be
    // focused - it only needs bounds and an in-bounds point. This guards against
    // reinstating a targetHasFocus gate, which flickers around overlay show/hide
    // and made getCursorPosition intermittently return null.
    mock.state.targetHasFocus = false
    expect(getGameCursorPosition()).toEqual({ x: 600, y: 350 })
  })

  it('returns null when targetBounds is absent', () => {
    mock.state.targetBounds = undefined
    expect(getGameCursorPosition()).toBeNull()
  })

  it('returns null when targetBounds has zero width', () => {
    mock.state.targetBounds = { x: 0, y: 0, width: 0, height: 1080 }
    expect(getGameCursorPosition()).toBeNull()
  })

  it('returns null instead of throwing when the underlying electron call throws', () => {
    mock.screenToDipRect.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(getGameCursorPosition()).toBeNull()
  })
})
