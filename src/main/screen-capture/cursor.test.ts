import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ bounds: vi.fn(), cursor: vi.fn() }))
vi.mock('../desktop', () => ({ desktop: { getGameBounds: mock.bounds, getCursorScreenPoint: mock.cursor } }))
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
    vi.resetAllMocks()
    mock.bounds.mockReturnValue({ x: 100, y: 50, width: 1920, height: 1080 })
    mock.cursor.mockReturnValue({ x: 700, y: 400 })
  })
  it('uses the backend DIP rectangle and pointer together', () => {
    expect(getGameCursorPosition()).toEqual({ x: 600, y: 350 })
  })
  it('rejects a pointer outside the logical game, even when inside its physical size', () => {
    mock.cursor.mockReturnValue({ x: 2050, y: 400 })
    expect(getGameCursorPosition()).toBeNull()
  })
  it('handles a secondary display with a negative origin', () => {
    mock.bounds.mockReturnValue({ x: -1920, y: 0, width: 1920, height: 1080 })
    mock.cursor.mockReturnValue({ x: -1500, y: 200 })
    expect(getGameCursorPosition()).toEqual({ x: 420, y: 200 })
  })
  it('fails closed when the game or compositor cursor is unavailable', () => {
    mock.cursor.mockReturnValue(null)
    expect(getGameCursorPosition()).toBeNull()
    mock.cursor.mockReturnValue({ x: 700, y: 400 })
    mock.bounds.mockReturnValue(null)
    expect(getGameCursorPosition()).toBeNull()
  })
  it('contains backend failures', () => {
    mock.bounds.mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(getGameCursorPosition()).toBeNull()
  })
})
