// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyPalette, applyVars, applyCachedVars, bootstrapTheme, THEME_CACHE_KEY } from './apply-theme'
import { DEFAULT_PALETTE, PRESETS } from '../../../shared/theme/presets'
import { resolveCssVars } from '../../../shared/theme/derive'

const NON_DEFAULT = PRESETS.filter((p) => p.id !== 'default')
const SAMPLE_A = NON_DEFAULT[0]
const SAMPLE_B = NON_DEFAULT[1]
if (!SAMPLE_A || !SAMPLE_B) throw new Error('test requires >=2 non-default presets')

function installLocalStorageMock(): void {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key)
      },
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    },
  })
}

beforeEach(() => {
  installLocalStorageMock()
  localStorage.clear()
  document.documentElement.removeAttribute('style')
})

describe('applyPalette', () => {
  it('sets every resolved var on documentElement and caches it', () => {
    applyPalette(SAMPLE_A.palette)
    const expected = resolveCssVars(SAMPLE_A.palette)
    for (const [k, v] of Object.entries(expected)) {
      expect(document.documentElement.style.getPropertyValue(k)).toBe(v)
    }
    expect(JSON.parse(localStorage.getItem(THEME_CACHE_KEY)!)).toEqual(expected)
  })
})

describe('applyVars', () => {
  it('sets every resolved var on documentElement but does NOT write localStorage', () => {
    applyVars(SAMPLE_A.palette)
    const expected = resolveCssVars(SAMPLE_A.palette)
    for (const [k, v] of Object.entries(expected)) {
      expect(document.documentElement.style.getPropertyValue(k)).toBe(v)
    }
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull()
  })
})

describe('applyCachedVars', () => {
  it('applies a previously cached var map', () => {
    const map = resolveCssVars(DEFAULT_PALETTE)
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(map))
    applyCachedVars()
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(map['--accent'])
  })

  it('no-ops with no cache and bad json', () => {
    expect(() => applyCachedVars()).not.toThrow()
    localStorage.setItem(THEME_CACHE_KEY, 'not json')
    expect(() => applyCachedVars()).not.toThrow()
  })
})

describe('bootstrapTheme', () => {
  it('applies the resolved settings palette and re-applies on setting-updated', async () => {
    let updatedCb: ((key: string, value: unknown) => void) | undefined
    ;(window as unknown as { api: unknown }).api = {
      getSettings: vi.fn().mockResolvedValue({ themeId: SAMPLE_A.id, customThemePalette: null }),
      onSettingUpdated: (cb: (k: string, v: unknown) => void) => {
        updatedCb = cb
        return () => {}
      },
    }

    await bootstrapTheme()
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      resolveCssVars(SAMPLE_A.palette)['--accent'],
    )

    updatedCb!('themeId', SAMPLE_B.id)
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      resolveCssVars(SAMPLE_B.palette)['--accent'],
    )
  })

  it('re-applies on customThemePalette setting-updated', async () => {
    let updatedCb: ((key: string, value: unknown) => void) | undefined
    ;(window as unknown as { api: unknown }).api = {
      getSettings: vi.fn().mockResolvedValue({ themeId: 'custom', customThemePalette: null }),
      onSettingUpdated: (cb: (k: string, v: unknown) => void) => {
        updatedCb = cb
        return () => {}
      },
    }

    await bootstrapTheme()

    const customPalette = { ...DEFAULT_PALETTE, accent: '#ff00ff' }
    updatedCb!('customThemePalette', customPalette)
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(resolveCssVars(customPalette)['--accent'])
  })
})
