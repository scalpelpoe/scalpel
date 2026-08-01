import { describe, expect, it, vi } from 'vitest'
import { sanitizeBeastState } from '@shared/data/regex/beast-state'
import type { RegexPreset } from '@shared/types'
import { resolvePresetRegex } from './beast-preset'

function preset(over: Partial<RegexPreset> = {}): RegexPreset {
  return {
    id: 'p1',
    generator: 'beasts',
    avoid: [],
    want: [],
    wantMode: 'any',
    qualifiers: {},
    nightmare: false,
    regex: 'STALE',
    beast: sanitizeBeastState({}),
    ...over,
  }
}

// Craicic Maw is harvest: false, so it survives the default state. Vivid Vulture
// is harvest: true and would be correctly excluded, making every case below read
// as a false negative.
const LINES = [{ name: 'Craicic Maw', chaosValue: 5, listingCount: 900 }]

describe('resolvePresetRegex', () => {
  it('re-derives a Beasts preset from cached prices', () => {
    const warm = vi.fn()
    expect(resolvePresetRegex(preset(), 'Mirage', { peek: () => LINES, warm })).toBe('cic m')
    expect(warm).not.toHaveBeenCalled()
  })

  it('pastes the stored regex and warms the cache when prices are cold', () => {
    const warm = vi.fn()
    expect(resolvePresetRegex(preset(), 'Mirage', { peek: () => null, warm })).toBe('STALE')
    expect(warm).toHaveBeenCalledWith('Mirage')
  })

  it('leaves non-Beasts presets untouched and never warms', () => {
    const warm = vi.fn()
    const peek = vi.fn()
    const p = preset({ generator: 'maps', beast: undefined, regex: 'MAPS' })
    expect(resolvePresetRegex(p, 'Mirage', { peek, warm })).toBe('MAPS')
    expect(peek).not.toHaveBeenCalled()
    expect(warm).not.toHaveBeenCalled()
  })

  it('falls back to the stored regex rather than pasting nothing', () => {
    // Every beast filtered out at current prices - an empty paste would silently
    // wipe the user's search box.
    const p = preset({ beast: sanitizeBeastState({ minChaos: 999999 }) })
    expect(resolvePresetRegex(p, 'Mirage', { peek: () => LINES, warm: vi.fn() })).toBe('STALE')
  })

  it('handles a legacy Beasts preset saved before the beast payload existed', () => {
    const p = preset({ beast: undefined })
    expect(resolvePresetRegex(p, 'Mirage', { peek: () => LINES, warm: vi.fn() })).toBe('STALE')
  })
})
