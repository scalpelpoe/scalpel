import { describe, expect, it } from 'vitest'
import { buildBaseTypeFilter } from './base-type'

describe('buildBaseTypeFilter', () => {
  it('defaults the chip on for charts', () => {
    const chip = buildBaseTypeFilter({
      baseType: 'Coral Forest Chart',
      rarity: 'Magic',
      itemClass: 'Chart',
      quality: 0,
    })[0]

    expect(chip).toMatchObject({ id: 'misc.basetype', text: 'Coral Forest Chart', enabled: true })
  })

  it('still defaults the chip off for an ordinary magic base', () => {
    const chip = buildBaseTypeFilter({
      baseType: 'Vaal Regalia',
      rarity: 'Magic',
      itemClass: 'Body Armours',
      quality: 0,
    })[0]

    expect(chip).toMatchObject({ id: 'misc.basetype', enabled: false })
  })

  it('still defaults the chip on for tablets', () => {
    const chip = buildBaseTypeFilter({
      baseType: 'Breach Precursor Tablet',
      rarity: 'Rare',
      itemClass: 'Tablet',
      quality: 0,
    })[0]

    expect(chip).toMatchObject({ id: 'misc.basetype', enabled: true })
  })
})
