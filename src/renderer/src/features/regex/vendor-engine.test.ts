import { describe, it, expect } from 'vitest'
import { buildVendorRegex, buildVendorGroupsRegex, type VendorSettings } from './vendor-engine'
import { DEFAULT_VENDOR_SETTINGS } from '@shared/data/regex/vendor-toggles'
import { generateVendorRegex } from './__fixtures__/poe2re/VendorResult'
import type { Settings } from './__fixtures__/poe2re/Settings'

function emptyVendorSettings(): VendorSettings {
  return {
    itemProperty: { quality: false, sockets: false },
    itemType: { rare: false, magic: false, normal: false },
    resistances: { fire: false, cold: false, lightning: false, chaos: false },
    movementSpeed: { move30: false, move25: false, move20: false, move15: false, move10: false },
    itemMods: {
      physical: false,
      spellDamage: false,
      elemental: false,
      coldDamage: false,
      fireDamage: false,
      lightningDamage: false,
      chaosDamage: false,
      spirit: false,
      rarity: false,
      maxLife: false,
      maxMana: false,
      attackSpeed: false,
      castSpeed: false,
      skillLevel: false,
      skillLevelMinion: false,
      skillLevelMelee: false,
      skillLevelSpell: false,
      skillLevelFire: false,
      skillLevelCold: false,
      skillLevelLightning: false,
      skillLevelPhysical: false,
      skillLevelProjectile: false,
      strength: false,
      intelligence: false,
      dexterity: false,
    },
    itemClass: {
      amulets: false,
      rings: false,
      belts: false,
      daggers: false,
      wands: false,
      oneHandMaces: false,
      sceptres: false,
      bows: false,
      staves: false,
      twoHandMaces: false,
      quarterstaves: false,
      spears: false,
      crossbows: false,
      talisman: false,
      gloves: false,
      boots: false,
      bodyArmours: false,
      helmets: false,
      quivers: false,
      foci: false,
      shields: false,
    },
    itemLevel: { min: 0, max: 0 },
    characterLevel: { min: 0, max: 0 },
  }
}

/** Wrap a VendorSettings into the upstream Settings shape (adds resultSettings +
 *  a stub waystone slice the vendor path never reads). */
function asUpstream(v: VendorSettings, customText = ''): Settings {
  return {
    waystone: {
      resultSettings: { customText: '', autoCopy: false },
      tier: { min: 0, max: 0 },
      rarity: { corrupted: false, uncorrupted: false },
      revives: { min: 0, max: 6 },
      rarityFilter: { normal: false, magic: false, rare: false },
      modifier: {
        over100: false,
        round10: false,
        dropOverX: false,
        dropOverValue: 0,
        delirious: false,
        anyPack: false,
        prefixSelectType: 'any',
        prefixes: [],
        suffixes: [],
      },
    },
    vendor: { ...v, resultSettings: { customText, autoCopy: false } },
    tablet: {
      resultSettings: { customText: '', autoCopy: false },
      rarity: { normal: false, magic: false, rare: false },
      type: {
        irradiated: false,
        ritual: false,
        delirium: false,
        breach: false,
        abyss: false,
        temple: false,
        overseer: false,
      },
      modifier: { usesRemaining: false, numUsesRemaining: 1, affixes: [], affixSelectType: 'any', round10: false },
    },
  }
}

describe('buildVendorRegex parity', () => {
  const cases: Array<{ name: string; mutate: (v: VendorSettings) => void; customText?: string }> = [
    { name: 'empty', mutate: () => {} },
    {
      name: 'quality + sockets',
      mutate: (v) => {
        v.itemProperty.quality = true
        v.itemProperty.sockets = true
      },
    },
    {
      name: 'single rarity',
      mutate: (v) => {
        v.itemType.rare = true
      },
    },
    {
      name: 'two rarities',
      mutate: (v) => {
        v.itemType.rare = true
        v.itemType.magic = true
      },
    },
    {
      name: 'all three rarities (no term)',
      mutate: (v) => {
        v.itemType.rare = true
        v.itemType.magic = true
        v.itemType.normal = true
      },
    },
    {
      name: 'single resistance',
      mutate: (v) => {
        v.resistances.fire = true
      },
    },
    {
      name: 'two resistances',
      mutate: (v) => {
        v.resistances.fire = true
        v.resistances.cold = true
      },
    },
    {
      name: 'all four resistances',
      mutate: (v) => {
        v.resistances.fire = true
        v.resistances.cold = true
        v.resistances.lightning = true
        v.resistances.chaos = true
      },
    },
    {
      name: 'movement single',
      mutate: (v) => {
        v.movementSpeed.move30 = true
      },
    },
    {
      name: 'movement five-tier',
      mutate: (v) => {
        v.movementSpeed.move25 = true
      },
    },
    {
      name: 'movement mixed',
      mutate: (v) => {
        v.movementSpeed.move30 = true
        v.movementSpeed.move25 = true
        v.movementSpeed.move10 = true
      },
    },
    {
      name: 'movement all',
      mutate: (v) => {
        v.movementSpeed.move30 = true
        v.movementSpeed.move25 = true
        v.movementSpeed.move20 = true
        v.movementSpeed.move15 = true
        v.movementSpeed.move10 = true
      },
    },
    {
      name: 'elemental collapse',
      mutate: (v) => {
        v.itemMods.elemental = true
      },
    },
    {
      name: 'ele damage subset',
      mutate: (v) => {
        v.itemMods.coldDamage = true
        v.itemMods.fireDamage = true
      },
    },
    {
      name: 'single ele damage',
      mutate: (v) => {
        v.itemMods.fireDamage = true
      },
    },
    {
      name: 'attributes',
      mutate: (v) => {
        v.itemMods.strength = true
        v.itemMods.dexterity = true
      },
    },
    {
      name: 'skill levels',
      mutate: (v) => {
        v.itemMods.skillLevel = true
        v.itemMods.skillLevelMinion = true
        v.itemMods.skillLevelProjectile = true
      },
    },
    {
      name: 'misc mods',
      mutate: (v) => {
        v.itemMods.physical = true
        v.itemMods.spellDamage = true
        v.itemMods.spirit = true
        v.itemMods.rarity = true
        v.itemMods.maxLife = true
        v.itemMods.maxMana = true
        v.itemMods.attackSpeed = true
        v.itemMods.castSpeed = true
      },
    },
    {
      name: 'single item class',
      mutate: (v) => {
        v.itemClass.amulets = true
      },
    },
    {
      name: 'many item classes',
      mutate: (v) => {
        v.itemClass.amulets = true
        v.itemClass.bows = true
        v.itemClass.gloves = true
      },
    },
    {
      name: 'item level range',
      mutate: (v) => {
        v.itemLevel = { min: 65, max: 84 }
      },
    },
    {
      name: 'item level exact',
      mutate: (v) => {
        v.itemLevel = { min: 82, max: 82 }
      },
    },
    {
      name: 'item level open max',
      mutate: (v) => {
        v.itemLevel = { min: 80, max: 0 }
      },
    },
    {
      name: 'char level range',
      mutate: (v) => {
        v.characterLevel = { min: 1, max: 12 }
      },
    },
    {
      name: 'custom text',
      mutate: (v) => {
        v.itemClass.bows = true
      },
      customText: 'foo bar',
    },
    {
      name: 'kitchen sink',
      mutate: (v) => {
        v.itemProperty.quality = true
        v.itemType.rare = true
        v.resistances.fire = true
        v.resistances.cold = true
        v.movementSpeed.move30 = true
        v.itemMods.elemental = true
        v.itemMods.maxLife = true
        v.itemClass.boots = true
        v.itemLevel = { min: 70, max: 84 }
        v.characterLevel = { min: 60, max: 80 }
      },
      customText: 'mirror',
    },
  ]

  for (const c of cases) {
    it(`matches upstream: ${c.name}`, () => {
      const v = emptyVendorSettings()
      c.mutate(v)
      expect(buildVendorRegex(v, c.customText)).toBe(generateVendorRegex(asUpstream(v, c.customText)))
    })
  }
})

describe('buildVendorRegex specifics', () => {
  it('returns empty string when nothing selected', () => {
    expect(buildVendorRegex(emptyVendorSettings())).toBe('')
  })
  it('wraps terms in quotes joined by pipe', () => {
    const v = emptyVendorSettings()
    v.itemProperty.quality = true
    v.itemProperty.sockets = true
    expect(buildVendorRegex(v)).toBe('"y: \\+|ts: S"')
  })
})

/**
 * Golden strings captured by hand from the LIVE poe2.re/vendor page (not from the
 * verbatim VendorResult.ts fixture). The parity block above proves we match their
 * code; these anchor our output to their actual site output, so a systematic
 * transcription error in the fixture (which would pass parity) gets caught here.
 */
describe('buildVendorRegex golden (live poe2.re/vendor captures)', () => {
  const golden: Array<{ name: string; mutate: (v: VendorSettings) => void; expected: string }> = [
    {
      name: 'quality + sockets',
      mutate: (v) => {
        v.itemProperty.quality = true
        v.itemProperty.sockets = true
      },
      expected: '"y: \\+|ts: S"',
    },
    {
      name: 'fire resistance only',
      mutate: (v) => {
        v.resistances.fire = true
      },
      expected: '"fi.+res"',
    },
    {
      name: 'all four resistances',
      mutate: (v) => {
        v.resistances.fire = true
        v.resistances.cold = true
        v.resistances.lightning = true
        v.resistances.chaos = true
      },
      expected: '"resi"',
    },
    {
      name: 'movement 30 + 25',
      mutate: (v) => {
        v.movementSpeed.move30 = true
        v.movementSpeed.move25 = true
      },
      expected: '"(30|25)% i.+mov"',
    },
    {
      name: 'elemental damage',
      mutate: (v) => {
        v.itemMods.elemental = true
      },
      expected: '"\\d [cfl].+da"',
    },
    {
      name: 'item level 65-84',
      mutate: (v) => {
        v.itemLevel = { min: 65, max: 84 }
      },
      expected: '"m level: (6[5-9]|[7-7]\\d|8[0-4])\\b"',
    },
    {
      name: 'character level 1-12',
      mutate: (v) => {
        v.characterLevel = { min: 1, max: 12 }
      },
      expected: '"s: level ([1-9]|1[0-2])\\b"',
    },
    {
      name: 'kitchen sink',
      mutate: (v) => {
        v.itemProperty.quality = true
        v.itemType.rare = true
        v.resistances.fire = true
        v.resistances.cold = true
        v.movementSpeed.move30 = true
        v.itemMods.elemental = true
        v.itemMods.maxLife = true
        v.itemClass.boots = true
        v.itemLevel = { min: 70, max: 84 }
        v.characterLevel = { min: 60, max: 80 }
      },
      expected:
        '"y: \\+|y: r|m level: (7\\d|8[0-4])\\b|s: level (6\\d|[7-7]\\d|80)\\b|(fi|co).+res|30% i.+mov|\\d [cfl].+da|\\d.+m life|s: boo"',
    },
  ]

  for (const c of golden) {
    it(`matches live output: ${c.name}`, () => {
      const v = emptyVendorSettings()
      c.mutate(v)
      expect(buildVendorRegex(v)).toBe(c.expected)
    })
  }

  it('elemental damage toggle emits a character class (upstream #170)', () => {
    const v = emptyVendorSettings()
    v.itemMods.elemental = true
    expect(buildVendorRegex(v)).toBe('"\\d [cfl].+da"')
  })

  it('max life token requires the m prefix (upstream #164)', () => {
    const v = emptyVendorSettings()
    v.itemMods.maxLife = true
    expect(buildVendorRegex(v)).toBe('"\\d.+m life"')
  })
})

function withFields(...fields: Array<[keyof VendorSettings, string]>): VendorSettings {
  const g = structuredClone(DEFAULT_VENDOR_SETTINGS)
  for (const [grp, f] of fields) (g[grp] as Record<string, boolean>)[f] = true
  return g
}

describe('buildVendorGroupsRegex', () => {
  it('returns empty string for no groups', () => {
    expect(buildVendorGroupsRegex([])).toBe('')
  })

  it('returns empty string when every group is empty', () => {
    expect(
      buildVendorGroupsRegex([structuredClone(DEFAULT_VENDOR_SETTINGS), structuredClone(DEFAULT_VENDOR_SETTINGS)]),
    ).toBe('')
  })

  it('a single group equals the per-group regex', () => {
    const g = withFields(['itemMods', 'maxLife'])
    expect(buildVendorGroupsRegex([g])).toBe(buildVendorRegex(g))
  })

  it('joins multiple non-empty groups with a single space (AND)', () => {
    const g1 = withFields(['itemMods', 'maxLife'])
    const g2 = withFields(['itemClass', 'bows'])
    expect(buildVendorGroupsRegex([g1, g2])).toBe(`${buildVendorRegex(g1)} ${buildVendorRegex(g2)}`)
  })

  it('skips empty groups between non-empty ones', () => {
    const g1 = withFields(['itemMods', 'maxLife'])
    const g2 = withFields(['itemClass', 'bows'])
    const empty = structuredClone(DEFAULT_VENDOR_SETTINGS)
    expect(buildVendorGroupsRegex([g1, empty, g2])).toBe(`${buildVendorRegex(g1)} ${buildVendorRegex(g2)}`)
  })
})
