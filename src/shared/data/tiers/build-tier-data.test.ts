import { describe, it, expect, test } from 'vitest'
// CJS module; import its pure exports.
import { buildCompact, buildDesecrated, normKey } from '../../../../scripts/build-tier-data.js'

const mbb = {
  Rings: {
    'ring,default': {
      bases: ['Metadata/Items/Rings/Ring1'],
      mods: {
        prefix: { IncreasedLife: { IncreasedLife1: 1, IncreasedLife2: 6 } },
        suffix: { FireResistance: { FireResist1: 1, FireResist2: 12 } },
      },
      conditional_mods: null,
    },
  },
}
const mods = {
  IncreasedLife2: {
    name: 'Healthy',
    required_level: 6,
    groups: ['IncreasedLife'],
    domain: 'item',
    stats: [{ id: 'base_maximum_life', min: 10, max: 19 }],
    text: '+(10-19) to maximum Life',
    generation_type: 'prefix',
  },
  IncreasedLife1: {
    name: 'Hale',
    required_level: 1,
    groups: ['IncreasedLife'],
    domain: 'item',
    stats: [{ id: 'base_maximum_life', min: 3, max: 9 }],
    text: '+(3-9) to maximum Life',
    generation_type: 'prefix',
  },
  FireResist1: {
    name: 'of the Cloud',
    required_level: 1,
    groups: ['FireResistance'],
    domain: 'item',
    stats: [{ id: 'base_fire_damage_resistance_%', min: 6, max: 11 }],
    text: '+(6-11)% to Fire Resistance',
    generation_type: 'suffix',
  },
  FireResist2: {
    name: 'of the Tundra',
    required_level: 12,
    groups: ['FireResistance'],
    domain: 'item',
    stats: [{ id: 'base_fire_damage_resistance_%', min: 12, max: 17 }],
    text: '+(12-17)% to Fire Resistance',
    generation_type: 'suffix',
  },
  // Non-item-domain mod that must be excluded:
  JunkCurrency1: {
    name: 'Junk',
    required_level: 1,
    groups: ['Junk'],
    domain: 'misc',
    stats: [{ id: 'x', min: 1, max: 2 }],
    text: 'junk',
    generation_type: 'prefix',
  },
}
const baseItems = {
  'Metadata/Items/Rings/Ring1': { name: 'Iron Ring', tags: ['ring', 'default'], item_class: 'Ring' },
}

describe('buildCompact', () => {
  it('joins, dedupes, orders tiers ascending by required_level, interns pools, and resolves base display names', () => {
    const out = buildCompact(mbb, mods, baseItems)
    expect(out.schemaVersion).toBe(1)
    const poolIdx = out.bases['Iron Ring']
    expect(poolIdx).toBeTypeOf('number')
    const ironRing = out.pools[poolIdx]
    expect(ironRing).toBeDefined()
    // IncreasedLife ordered worst-first (req_level 1 then 6)
    const lifeTiers = ironRing.IncreasedLife.map((i) => out.mods[i])
    expect(lifeTiers.map((m) => m.l)).toEqual([1, 6])
    expect(lifeTiers[0].n).toBe('Hale')
    expect(lifeTiers[0].s).toEqual([['base_maximum_life', 3, 9]])
    // Fire resistance present as a separate group
    expect(ironRing.FireResistance.map((i) => out.mods[i].l)).toEqual([1, 12])
  })

  it('excludes non-item-domain mods', () => {
    const out = buildCompact(mbb, mods, baseItems)
    expect(out.mods.some((m) => m.n === 'Junk')).toBe(false)
  })
})

test('buildDesecrated ladders a single-stat desecrated mod by normalized key', () => {
  const mods = {
    a: {
      domain: 'desecrated',
      required_level: 65,
      text: '(74-89)% increased [Spell] Damage with [Spell|Spells] that cost Life',
      stats: [{ id: 'x', min: 74, max: 89 }],
    },
    b: {
      domain: 'desecrated',
      required_level: 65,
      text: '(148-178)% increased [Spell] Damage with [Spell|Spells] that cost Life',
      stats: [{ id: 'x', min: 148, max: 178 }],
    },
    c: { domain: 'item', required_level: 1, text: '+(10-14) to maximum Mana', stats: [{ id: 'm', min: 10, max: 14 }] },
  }
  const ds = buildDesecrated(mods)
  const key = normKey('(74-89)% increased [Spell] Damage with [Spell|Spells] that cost Life')
  expect(key).toBe('#% INCREASED SPELL DAMAGE WITH SPELLS THAT COST LIFE')
  const mod = ds.mods.find((m) => m.key === key)
  expect(mod?.tiers).toEqual([
    { min: 74, max: 89, lvl: 65 },
    { min: 148, max: 178, lvl: 65 },
  ])
  expect(ds.mods.some((m) => m.key.includes('MANA'))).toBe(false)
})

test('normKey collapses +N (OCR) and +(N-M) (template) to the same key', () => {
  // The leading + is consumed in both the plain-number and the range form, so an
  // OCR-read "+174 to Spirit" matches the dataset template "+(35-50) to Spirit".
  expect(normKey('+(35-50) to Spirit')).toBe('# TO SPIRIT')
  expect(normKey('+(35-50) to Spirit')).toBe(normKey('+174 to Spirit'))
})

test('buildDesecrated stores positive (absolute) ranges for negative "reduced" mods', () => {
  const mods = {
    r: {
      domain: 'desecrated',
      required_level: 1,
      text: '(25-35)% reduced Effect of Curses on You',
      stats: [{ id: 'curse_effect_+%', min: -35, max: -25 }],
    },
  }
  const ds = buildDesecrated(mods)
  const mod = ds.mods.find((m) => m.key === '#% REDUCED EFFECT OF CURSES ON YOU')
  expect(mod?.tiers).toEqual([{ min: 25, max: 35, lvl: 1 }])
})
