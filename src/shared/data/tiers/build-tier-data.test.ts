import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, test } from 'vitest'
// CJS module; import its pure exports.
import {
  buildCompact,
  buildDesecrated,
  buildModSources,
  buildStreamTiers,
  familyToSource,
  normKey,
  sha256,
} from '../../../../scripts/build-tier-data.js'

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
    // Flask mods stay out of the price-check dataset; they ship in the stream file.
    const withFlasks = buildCompact(flaskMbb, { ...mods, ...flaskMods }, { ...baseItems, ...flaskBaseItems })
    expect(withFlasks.bases['Thawing Charm']).toBeUndefined()
    expect(withFlasks.mods.some((m) => m.n === 'Drizzling')).toBe(false)
  })
})

const flaskMbb = {
  ...mbb,
  Charms: {
    'utility_flask,flask,default': {
      bases: ['Metadata/Items/Flasks/Charm1'],
      mods: {
        prefix: { CharmGainManaOnUse: { CharmGainManaOnUse2: 1, CharmGainManaOnUse1: 1 } },
        suffix: { FlaskIncreasedMaxCharges: { FlaskExtraCharges2__: 1 } },
      },
      conditional_mods: {},
    },
  },
}
const flaskMods = {
  CharmGainManaOnUse1: {
    name: 'Drizzling',
    required_level: 1,
    groups: ['CharmGainManaOnUse'],
    domain: 'flask',
    stats: [{ id: 'charm_recover_X_mana_when_used', min: 16, max: 24 }],
    text: 'Recover (16-24) Mana when Used',
    generation_type: 'prefix',
  },
  CharmGainManaOnUse2: {
    name: 'Pouring',
    required_level: 20,
    groups: ['CharmGainManaOnUse'],
    domain: 'flask',
    stats: [{ id: 'charm_recover_X_mana_when_used', min: 25, max: 32 }],
    text: 'Recover (25-32) Mana when Used',
    generation_type: 'prefix',
  },
  FlaskExtraCharges2__: {
    name: 'of the Plentiful',
    required_level: 10,
    groups: ['FlaskIncreasedMaxCharges'],
    domain: 'flask',
    stats: [{ id: 'local_max_charges_+%', min: 35, max: 40 }],
    text: '(35-40)% increased Charges',
    generation_type: 'suffix',
  },
  MarksmanInfluenceProjectileDamage2: {
    name: "Kolr's",
    required_level: 65,
    groups: ['ProjectileDamage'],
    domain: 'item',
    stats: [{ id: 'projectile_damage_+%', min: 21, max: 30 }],
    text: '(21-30)% increased Projectile Damage',
    generation_type: 'prefix',
  },
  MarksmanInfluenceProjectileDamage1: {
    name: "Kolr's",
    required_level: 45,
    groups: ['ProjectileDamage'],
    domain: 'item',
    stats: [{ id: 'projectile_damage_+%', min: 11, max: 20 }],
    text: '(11-20)% increased Projectile Damage',
    generation_type: 'prefix',
  },
  SoulInfluenceIncreasedLifePercent: {
    name: 'of the Soul',
    required_level: 65,
    groups: ['MaximumLifeIncreasePercent'],
    domain: 'item',
    stats: [{ id: 'maximum_life_+%', min: 3, max: 5 }],
    text: '(3-5)% increased maximum Life',
    generation_type: 'suffix',
  },
  // Influence-named mods outside the item domain (here area) stay out.
  ShaperInfluenceArea1: {
    name: '',
    required_level: 1,
    groups: ['X'],
    domain: 'area',
    stats: [{ id: 'x', min: 1, max: 1 }],
    text: 'x',
    generation_type: 'unique',
  },
  AbyssModAmuletKurgalSuffixQualityofAllSkills: {
    name: 'of Kurgal',
    required_level: 65,
    groups: ['AbyssQuality'],
    domain: 'desecrated',
    stats: [{ id: 'all_skill_gem_quality_+', min: 3, max: 5 }],
    text: '+(3-5)% to Quality of all Skills',
    generation_type: 'suffix',
  },
}
const flaskBaseItems = {
  'Metadata/Items/Flasks/Charm1': { name: 'Thawing Charm', tags: ['flask'], item_class: 'UtilityFlask' },
}

describe('buildStreamTiers', () => {
  const all = { ...mods, ...flaskMods }
  const out = buildStreamTiers(flaskMbb, all, { ...baseItems, ...flaskBaseItems })
  const names = (indices: number[]) => indices.map((i) => out.mods[i].n)

  it('holds flask and charm pools only, with each mod tagged by its generation type', () => {
    expect(Object.keys(out.bases)).toEqual(['Thawing Charm'])
    const pool = out.pools[out.bases['Thawing Charm']]
    expect(names(pool.CharmGainManaOnUse)).toEqual(['Drizzling', 'Pouring'])
    expect(pool.FlaskIncreasedMaxCharges.map((i: number) => out.mods[i].a)).toEqual(['s'])
    expect(out.mods[pool.CharmGainManaOnUse[0]].a).toBe('p')
  })

  it('ladders rune influences by id family and keys abyss mods by full id', () => {
    expect(names(out.families.MarksmanInfluenceProjectileDamage)).toEqual(["Kolr's", "Kolr's"])
    expect(out.families.MarksmanInfluenceProjectileDamage.map((i: number) => out.mods[i].s[0][1])).toEqual([11, 21])
    expect(names(out.families.SoulInfluenceIncreasedLifePercent)).toEqual(['of the Soul'])
    expect(out.families.ShaperInfluenceArea).toBeUndefined()
    const abyss = out.families.AbyssModAmuletKurgalSuffixQualityofAllSkills
    expect(abyss.map((i: number) => out.mods[i].a)).toEqual(['s'])
    // Ordinary item mods never enter the stream file.
    expect(out.mods.some((m: { n: string }) => m.n === 'Healthy')).toBe(false)
  })
})

describe('committed price-check datasets', () => {
  // Released clients fetch tiers-poe{1,2}.json live from GitHub main; the stream
  // file must never change them. The manifest hash pins the bytes they fetch.
  const dir = resolve(__dirname)
  const manifest = JSON.parse(readFileSync(resolve(dir, 'tier-manifest.json'), 'utf8'))
  for (const game of ['poe1', 'poe2']) {
    it(`tiers-${game}.json matches its manifest hash`, () => {
      expect(sha256(readFileSync(resolve(dir, `tiers-${game}.json`), 'utf8'))).toBe(manifest.perGameHash[game])
    })
  }

  it('the stream dataset carries no base the price-check dataset has', () => {
    const main = JSON.parse(readFileSync(resolve(dir, 'tiers-poe2.json'), 'utf8'))
    const stream = JSON.parse(readFileSync(resolve(dir, 'stream-tiers-poe2.json'), 'utf8'))
    expect(Object.keys(stream.bases).filter((b) => b in main.bases)).toEqual([])
    expect(Object.keys(stream.bases)).toContain('Ultimate Life Flask')
    expect(stream.families.MarksmanInfluenceProjectileDamage.length).toBeGreaterThan(1)
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

describe('buildModSources', () => {
  // Rings host an influence family, so their ordinary affixes are in scope for the
  // collision check. Sentinels host none, so their reuse of a flavour name is ignored.
  const srcMbb = {
    Rings: {
      'ring,default': {
        bases: ['Metadata/Items/Rings/Ring1'],
        mods: {
          prefix: { IncreasedLife: { Plain1: 1 } },
          prefix_shaper: { SocketedGems: { Shaper1: 1 } },
          suffix_adjudicator: { FireResistance: { Warlord1: 1 } },
          delve_suffix: { ColdResistance: { Delve1: 1 } },
        },
        conditional_mods: null,
      },
    },
    Sentinels: {
      'sentinel,default': {
        bases: ['Metadata/Items/Sentinel1'],
        mods: { suffix: { Shrine: { SentinelShrine1: 1 } } },
        conditional_mods: null,
      },
    },
  }
  const stat = [{ id: 'x', min: 1, max: 2 }]
  const srcMods = {
    Plain1: { name: 'Healthy', domain: 'item', generation_type: 'prefix', stats: stat },
    Shaper1: { name: "The Shaper's", domain: 'item', generation_type: 'prefix', stats: stat },
    Warlord1: { name: 'of the Conquest', domain: 'item', generation_type: 'suffix', stats: stat },
    Delve1: { name: 'Subterranean', domain: 'delve', generation_type: 'suffix', stats: stat },
    // Not in mods_by_base at all; identified as temple purely by the Enhanced id.
    IncreasedLifeEnhancedMod: { name: "Guatelitzi's", domain: 'item', generation_type: 'prefix', stats: stat },
    // Sentinels reuse the Warlord suffix name for an unrelated shrine mod. Sentinels
    // host no source family, so this must not poison "of the Conquest".
    SentinelShrine1: { name: 'of the Conquest', domain: 'item', generation_type: 'suffix', stats: stat },
  }

  it('maps influence, delve and temple affix names to their source', () => {
    const out = buildModSources(srcMbb, srcMods)
    expect(out.schemaVersion).toBe(1)
    expect(out.sources).toEqual({
      "The Shaper's": 'shaper',
      'of the Conquest': 'warlord',
      Subterranean: 'delve',
      "Guatelitzi's": 'temple',
    })
  })

  it('scopes to the classes that host a source family, so off-equipment names are ignored', () => {
    const out = buildModSources(srcMbb, srcMods)
    expect(out.classes).toEqual(['Rings'])
    // Present despite the Sentinel mod of the same name.
    expect(out.sources['of the Conquest']).toBe('warlord')
  })

  it('leaves ordinary craftable affixes unbadged', () => {
    expect(buildModSources(srcMbb, srcMods).sources.Healthy).toBeUndefined()
  })

  it('throws when a source name is also an ordinary affix on a badged class', () => {
    // A ring prefix that reuses the Shaper name: on a real ring the badge could not
    // tell them apart, so this must break the build rather than mislabel the row.
    const clash = structuredClone(srcMbb) as Record<
      string,
      Record<string, { mods: Record<string, Record<string, Record<string, number>>> }>
    >
    clash.Rings['ring,default'].mods.prefix.IncreasedLife.Collide1 = 1
    const mods = {
      ...srcMods,
      Collide1: { name: "The Shaper's", domain: 'item', generation_type: 'prefix', stats: stat },
    }
    expect(() => buildModSources(clash, mods)).toThrow(/no longer unambiguous/)
  })

  it('throws when one name claims two different sources', () => {
    const mods = {
      ...srcMods,
      Delve1: { name: "The Shaper's", domain: 'delve', generation_type: 'suffix', stats: stat },
    }
    expect(() => buildModSources(srcMbb, mods)).toThrow(/The Shaper's/)
  })
})

test('familyToSource maps GGG internal conqueror names to their display names', () => {
  expect(familyToSource('prefix_basilisk')).toBe('hunter')
  expect(familyToSource('suffix_eyrie')).toBe('redeemer')
  expect(familyToSource('prefix_adjudicator')).toBe('warlord')
  expect(familyToSource('delve_prefix')).toBe('delve')
  expect(familyToSource('prefix')).toBeNull()
  expect(familyToSource('searing_exarch_implicit')).toBeNull()
})
