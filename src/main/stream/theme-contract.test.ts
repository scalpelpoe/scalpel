import { ThemePaletteSchema, type StreamTheme } from '@scalpel/stream-contract'
import type { ThemePalette } from '@shared/theme/palette'
import { DEFAULT_PALETTE } from '@shared/theme/presets'
import { describe, expect, it } from 'vitest'

// Type-level: both directions must hold, so a key added to either side fails typecheck.
const _toContract: StreamTheme = {} as ThemePalette
const _fromContract: ThemePalette = {} as StreamTheme
void _toContract
void _fromContract

describe('stream contract theme keys', () => {
  it('match ThemePalette exactly', () => {
    expect(Object.keys(ThemePaletteSchema.shape).sort()).toEqual(Object.keys(DEFAULT_PALETTE).sort())
  })
})
