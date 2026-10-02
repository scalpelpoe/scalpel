import { ThemePaletteSchema } from '@scalpel/stream-contract'
import { DEFAULT_PALETTE, PRESETS_BY_ID } from '@shared/theme/presets'
import type { ThemePalette } from '@shared/theme/palette'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamTheme, watchThemeChanges, type ThemeStore } from './theme'

describe('streamTheme', () => {
  it('carries a preset palette', () => {
    expect(streamTheme({ themeId: 'poe2', customThemePalette: null })).toEqual(PRESETS_BY_ID.poe2.palette)
  })

  it('carries the custom palette when themeId is custom', () => {
    const custom: ThemePalette = { ...DEFAULT_PALETTE, accent: '#123456' }
    const t = streamTheme({ themeId: 'custom', customThemePalette: custom })
    expect(t).toEqual(custom)
    expect(ThemePaletteSchema.safeParse(t).success).toBe(true)
  })

  it('falls back to the default for an unknown id', () => {
    expect(streamTheme({ themeId: 'nope', customThemePalette: null })).toEqual(DEFAULT_PALETTE)
  })

  it('every preset validates against the contract', () => {
    for (const p of Object.values(PRESETS_BY_ID)) expect(ThemePaletteSchema.safeParse(p.palette).success).toBe(true)
  })
})

describe('watchThemeChanges', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function fakeStore() {
    const cbs = new Map<string, () => void>()
    const store: ThemeStore = {
      onDidChange: (key, cb) => {
        cbs.set(key, cb)
        return () => cbs.delete(key)
      },
    }
    return { store, fire: (k: string) => cbs.get(k)?.(), cbs }
  }

  it('pushes once, debounced, after a burst of changes', () => {
    const { store, fire } = fakeStore()
    const push = vi.fn()
    watchThemeChanges(store, push, 1000)
    fire('customThemePalette')
    vi.advanceTimersByTime(500)
    fire('customThemePalette')
    fire('themeId')
    vi.advanceTimersByTime(999)
    expect(push).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('ignores changes while inactive and cancels on dispose', () => {
    const { store, fire, cbs } = fakeStore()
    const push = vi.fn()
    let on = false
    const dispose = watchThemeChanges(store, push, 1000, () => on)
    fire('themeId')
    vi.advanceTimersByTime(2000)
    expect(push).not.toHaveBeenCalled()
    on = true
    fire('themeId')
    dispose()
    vi.advanceTimersByTime(2000)
    expect(push).not.toHaveBeenCalled()
    expect(cbs.size).toBe(0)
  })
})
