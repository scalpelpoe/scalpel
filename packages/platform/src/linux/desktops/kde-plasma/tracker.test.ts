import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackerEvent } from 'electron-overlay-window'
import { __resetWaylandFocusCacheForTests } from '@platform/linux/common/wayland/focus-cache'
import type { KWinSession, KWinSnapshot, KWinWindow } from './session'
import { KWinTracker } from './tracker'

const game = (overrides: Partial<KWinWindow> = {}): KWinWindow => ({
  id: 'game',
  caption: 'Path of Exile',
  fullscreen: true,
  x: 0,
  y: 0,
  width: 2560,
  height: 1440,
  resourceClass: 'pathofexilesteam.exe',
  resourceName: 'wine64-preloader',
  desktopFileName: 'pathofexilesteam.exe',
  ...overrides,
})

const other = (overrides: Partial<KWinWindow> = {}): KWinWindow => ({
  id: 'other',
  caption: 'Terminal',
  fullscreen: false,
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  resourceClass: 'konsole',
  resourceName: 'konsole',
  desktopFileName: 'org.kde.konsole',
  ...overrides,
})

const snapshot = (
  windows: KWinWindow[],
  active: string | null,
  pointer: { x: number; y: number } | null = null,
): KWinSnapshot => ({ windows, active, pointer })

let current: KWinTracker | null = null

function createTracker(titles = ['Path of Exile', 'Path of Exile 2']) {
  const events: TrackerEvent[] = []
  const session = { start: vi.fn(), stop: vi.fn() } as unknown as KWinSession
  current = new KWinTracker(titles, (event) => events.push(event), { session })
  return { tracker: current, events, session }
}

afterEach(() => {
  current?.stop()
  current = null
  vi.useRealTimers()
  __resetWaylandFocusCacheForTests()
})

describe('KWinTracker', () => {
  it('attaches to the active game with its exact geometry and title index', () => {
    const { tracker, events } = createTracker()

    tracker.handleSnapshot(snapshot([game()], 'game', { x: 5, y: 6 }))

    expect(events).toEqual([
      {
        type: 'attach',
        x: 0,
        y: 0,
        width: 2560,
        height: 1440,
        titleIndex: 0,
        isFullscreen: true,
        hasAccess: undefined,
      },
      { type: 'focus' },
    ])
    expect(tracker.targetHasFocus).toBe(true)
    expect(tracker.gameHasKeyboardFocus()).toBe(true)
    expect(tracker.pointer()).toEqual({ x: 5, y: 6 })
  })

  it('maps a native PoE2 window to the second title slot', () => {
    const { tracker, events } = createTracker()

    tracker.handleSnapshot(
      snapshot([game({ id: 'poe2', caption: 'Path of Exile 2', desktopFileName: 'pathofexile2.exe' })], 'poe2'),
    )

    expect(events[0]).toMatchObject({ type: 'attach', titleIndex: 1 })
  })

  it('reports geometry and fullscreen changes for the attached window', () => {
    const { tracker, events } = createTracker()
    tracker.handleSnapshot(snapshot([game()], 'game'))
    events.length = 0

    tracker.handleSnapshot(snapshot([game({ x: 10, y: 20, width: 1280, height: 720, fullscreen: false })], 'game'))

    expect(events).toEqual([
      { type: 'moveresize', x: 10, y: 20, width: 1280, height: 720 },
      { type: 'fullscreen', isFullscreen: false },
    ])
  })

  it('updates the pointer without re-emitting window events', () => {
    const { tracker, events } = createTracker()
    tracker.handleSnapshot(snapshot([game()], 'game', { x: 1, y: 2 }))
    events.length = 0

    tracker.handlePointer({ x: 30, y: 40 })

    expect(events).toEqual([])
    expect(tracker.pointer()).toEqual({ x: 30, y: 40 })
  })

  it('detaches when the game window disappears', () => {
    const { tracker, events } = createTracker()
    tracker.handleSnapshot(snapshot([game()], 'game'))
    events.length = 0

    tracker.handleSnapshot(snapshot([], null))

    expect(events).toEqual([{ type: 'blur' }, { type: 'detach' }])
    expect(tracker.targetHasFocus).toBe(false)
    expect(tracker.gameHasKeyboardFocus()).toBe(false)
  })

  it('never attaches to a launcher window even when it is active', () => {
    const { tracker, events } = createTracker()

    tracker.handleSnapshot(
      snapshot(
        [
          game({
            id: 'steam',
            caption: 'Steam',
            resourceClass: 'steam.exe',
            resourceName: 'steam',
            desktopFileName: 'steam.exe',
          }),
        ],
        'steam',
        { x: 1, y: 2 },
      ),
    )

    expect(events).toEqual([])
    expect(tracker.targetHasFocus).toBe(false)
    expect(tracker.pointer()).toBeNull()
  })

  it('treats focus moving to another app as leaving the game after the grace period', async () => {
    vi.useFakeTimers()
    const { tracker, events } = createTracker()
    tracker.handleSnapshot(snapshot([game(), other()], 'game', { x: 1, y: 2 }))
    events.length = 0

    tracker.handleSnapshot(snapshot([game(), other()], 'other', { x: 3, y: 4 }))

    expect(tracker.gameHasKeyboardFocus()).toBe(false)
    expect(tracker.pointer()).toBeNull()
    // The arbiter keeps focus during the grace window so overlay hover works.
    expect(tracker.targetHasFocus).toBe(true)

    await vi.advanceTimersByTimeAsync(100)
    expect(events).toEqual([{ type: 'blur' }])
  })

  it('detaches when the configured titles no longer include the game', () => {
    const { tracker, events } = createTracker()
    tracker.handleSnapshot(snapshot([game()], 'game'))
    events.length = 0

    tracker.setTitles(['Path of Exile 2'])

    expect(events).toEqual([{ type: 'blur' }, { type: 'detach' }])
    expect(tracker.targetHasFocus).toBe(false)
  })

  it('stops the scripting session once', () => {
    const { tracker, session } = createTracker()

    tracker.stop()
    tracker.stop()

    expect(session.stop).toHaveBeenCalledTimes(1)
  })
})
