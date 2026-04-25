import { describe, it, expect, vi } from 'vitest'

// trade.ts imports electron's `net` at module scope; mock it out so we can import the
// pure helpers without instantiating the real request stack.
vi.mock('electron', () => ({ net: { request: vi.fn() } }))

import { buildGemTypeField } from './trade'

describe('buildGemTypeField', () => {
  it('returns baseType as a plain string for a regular gem', () => {
    expect(buildGemTypeField('Fireball', false)).toBe('Fireball')
    expect(buildGemTypeField('Fireball', undefined)).toBe('Fireball')
  })

  it('returns discriminator form for a transfigured gem', () => {
    // Spark of Unpredictability is alt_y in TRANSFIGURED_GEM_DISC.
    expect(buildGemTypeField('Spark of Unpredictability', false)).toEqual({
      option: 'Spark',
      discriminator: 'alt_y',
    })
  })

  it('prepends "Vaal " to the option for a Vaal-corrupted transfigured gem', () => {
    // The case that originally prompted the fix: the trade site wants the
    // `option` to be the Vaal base skill, not the transfigured name.
    expect(buildGemTypeField('Spark of Unpredictability', true)).toEqual({
      option: 'Vaal Spark',
      discriminator: 'alt_y',
    })
  })

  it('prepends "Vaal " to baseType for a Vaal-corrupted non-transfigured gem', () => {
    expect(buildGemTypeField('Fireball', true)).toBe('Vaal Fireball')
  })

  it('does not double-prepend "Vaal " when baseType already starts with it', () => {
    expect(buildGemTypeField('Vaal Fireball', true)).toBe('Vaal Fireball')
  })
})
