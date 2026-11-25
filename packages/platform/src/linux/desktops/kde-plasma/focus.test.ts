import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetWaylandFocusCacheForTests,
  currentRecentWindowHints,
  currentWaylandGameFocus,
} from '@platform/linux/common/wayland/focus-cache'
import { publishKWinFocus } from './focus'
import type { KWinSnapshot, KWinWindow } from './session'

const window = (overrides: Partial<KWinWindow> = {}): KWinWindow => ({
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

const snapshot = (active: string | null, windows: KWinWindow[]): KWinSnapshot => ({
  active,
  windows,
  pointer: null,
})

afterEach(() => __resetWaylandFocusCacheForTests())

describe('publishKWinFocus', () => {
  it('publishes a game window with its full identity', () => {
    publishKWinFocus(snapshot('game', [window()]))

    expect(currentWaylandGameFocus()).toMatchObject({
      title: 'Path of Exile',
      appId: 'pathofexilesteam.exe',
      game: true,
      variant: 1,
      source: 'kde-kwin-script',
    })
    expect(currentRecentWindowHints()).toEqual(['Path of Exile|pathofexilesteam.exe'])
  })

  it('keeps the game focus while the Scalpel overlay host is active', () => {
    publishKWinFocus(snapshot('game', [window()]))
    publishKWinFocus(
      snapshot('overlay', [
        window(),
        window({
          id: 'overlay',
          caption: 'Scalpel Overlay',
          resourceClass: 'overlay-wayland-host',
          resourceName: 'overlay-wayland-host',
          desktopFileName: 'overlay-wayland-host',
        }),
      ]),
    )

    expect(currentWaylandGameFocus()).toMatchObject({ game: true, variant: 1 })
    expect(currentRecentWindowHints()).toEqual(['Path of Exile|pathofexilesteam.exe'])
  })

  it('clears focus when no window is active', () => {
    publishKWinFocus(snapshot('game', [window()]))
    publishKWinFocus(snapshot(null, [window()]))
    expect(currentWaylandGameFocus()).toBeNull()
  })
})
