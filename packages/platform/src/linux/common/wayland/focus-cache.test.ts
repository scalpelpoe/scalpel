import { afterEach, describe, expect, it } from 'vitest'
import { __resetWaylandFocusCacheForTests, currentWaylandGameFocus, publishCompositorFocus } from './focus-cache'

afterEach(() => __resetWaylandFocusCacheForTests())

describe('publishCompositorFocus', () => {
  it('accepts a KWin window through class/instance identity when the title is custom', () => {
    publishCompositorFocus({
      title: 'Custom window title',
      appId: null,
      className: 'pathofexile2.exe',
      instance: 'wine64-preloader',
      source: 'kde-kwin-script',
    })

    expect(currentWaylandGameFocus()).toMatchObject({
      game: true,
      variant: 2,
      source: 'kde-kwin-script',
    })
  })

  it('still rejects launcher identities', () => {
    publishCompositorFocus({
      title: 'Path of Exile',
      appId: 'steam',
      className: 'steam',
      instance: 'steam',
      source: 'kde-kwin-script',
    })

    expect(currentWaylandGameFocus()).toMatchObject({ game: false, reason: 'launcher-window' })
  })
})
