import { describe, it, expect } from 'vitest'
import { buildWaystoneRegex, type WaystoneQuantities } from './waystone-engine'
import { generateNumberRegex } from './waystone-number-regex'
import { generateWaystoneRegex } from './__fixtures__/poe2re/WaystoneResult'
import type { SelectOption } from './__fixtures__/poe2re/SelectOption'
import type { Settings } from './__fixtures__/poe2re/Settings'
import { WAYSTONE_MODS } from '@shared/data/regex/waystone-mods'

/**
 * Parity tests against poe2.re's reference implementation. We import poe2.re's
 * `generateWaystoneRegex` (copied verbatim into __fixtures__/poe2re/) and run
 * matched inputs through both engines, asserting the output strings are equal.
 *
 * This is the empirical-validation approach: rather than hand-tracing expected
 * regex outputs, we compare ours to theirs directly. Any future drift caused by
 * upstream changes or our own refactors gets caught here.
 *
 * The parity is deliberately scoped to the path our UI exercises today: prefixes
 * and suffixes are toggled on without per-mod magnitude values (i.e. SelectOption
 * `value` always null). When we add a per-mod value picker, extend these tests to
 * exercise that path too.
 */

// ----- helpers ---------------------------------------------------------------

/** Build a poe2.re-shaped Settings object with overrides. Sensible defaults
 *  match poe2.re's `defaultSettings.waystone` so untouched flags don't perturb
 *  the comparison. */
function makeSettings(overrides: {
  tierMin?: number
  tierMax?: number
  corrupted?: boolean
  uncorrupted?: boolean
  delirious?: boolean
  anyPack?: boolean
  packSize?: number | null
  monsterEffectiveness?: number | null
  monsterRarity?: number | null
  itemRarity?: number | null
  dropChance?: number | null
  prefixSelectType?: 'any' | 'all'
  prefixIds?: number[]
  suffixIds?: number[]
  wantValues?: Record<number, number>
  avoidValues?: Record<number, number>
  round10?: boolean
  over100?: boolean
  customText?: string
}): Settings {
  const allMods = WAYSTONE_MODS
  const prefixes: SelectOption[] = allMods
    .filter((m) => m.affix === 'PREFIX')
    .map((m) => ({
      name: m.text,
      value: overrides.wantValues?.[m.id] ?? null,
      isSelected: (overrides.prefixIds ?? []).includes(m.id),
      ranges: m.ranges,
      regex: m.regex,
    }))
  const suffixes: SelectOption[] = allMods
    .filter((m) => m.affix === 'SUFFIX')
    .map((m) => ({
      name: m.text,
      value: overrides.avoidValues?.[m.id] ?? null,
      isSelected: (overrides.suffixIds ?? []).includes(m.id),
      ranges: m.ranges,
      regex: m.regex,
    }))
  return {
    waystone: {
      resultSettings: { customText: overrides.customText ?? '', autoCopy: false },
      tier: { min: overrides.tierMin ?? 1, max: overrides.tierMax ?? 16 },
      rarity: {
        corrupted: overrides.corrupted ?? false,
        uncorrupted: overrides.uncorrupted ?? false,
      },
      modifier: {
        over100: overrides.over100 ?? false,
        round10: overrides.round10 ?? false,
        // Drop chance moved to the "Quantity & yield" quantifiers; the fixture's legacy
        // dropOverX path is kept off so parity covers only what the engine still emits here.
        dropOverX: false,
        dropOverValue: 100,
        delirious: overrides.delirious ?? false,
        anyPack: overrides.anyPack ?? false,
        prefixSelectType: overrides.prefixSelectType ?? 'any',
        prefixes,
        suffixes,
      },
    },
    vendor: {
      resultSettings: { customText: '', autoCopy: false },
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
    },
    tablet: {
      resultSettings: { customText: '', autoCopy: false },
      rarity: { normal: false, magic: false },
      type: { breach: false, delirium: false, irradiated: false, expedition: false, ritual: false, overseer: false },
      modifier: { usesRemaining: false, numUsesRemaining: 1, affixes: [], affixSelectType: 'any', round10: false },
    },
  }
}

/** Run the equivalent inputs through our engine. */
function ours(overrides: Parameters<typeof makeSettings>[0]): string {
  return buildWaystoneRegex({
    mods: WAYSTONE_MODS,
    tier: { min: overrides.tierMin ?? 1, max: overrides.tierMax ?? 16 },
    rarity: {
      corrupted: overrides.corrupted ?? false,
      uncorrupted: overrides.uncorrupted ?? false,
    },
    qualifiers: {
      delirious: overrides.delirious ?? false,
      anyPack: overrides.anyPack ?? false,
    },
    quantities: {
      packSize: overrides.packSize ?? null,
      monsterEffectiveness: overrides.monsterEffectiveness ?? null,
      monsterRarity: overrides.monsterRarity ?? null,
      itemRarity: overrides.itemRarity ?? null,
      dropChance: overrides.dropChance ?? null,
    },
    selections: {
      want: new Set(overrides.prefixIds ?? []),
      avoid: new Set(overrides.suffixIds ?? []),
      wantMode: overrides.prefixSelectType ?? 'any',
      wantValues: overrides.wantValues ?? {},
      avoidValues: overrides.avoidValues ?? {},
    },
    round10: overrides.round10 ?? false,
    over100: overrides.over100 ?? false,
    customText: overrides.customText,
  })
}

function theirs(overrides: Parameters<typeof makeSettings>[0]): string {
  return generateWaystoneRegex(makeSettings(overrides))
}

// ----- mod id lookups (so test cases stay readable) --------------------------

function findId(textIncludes: string, affix: 'PREFIX' | 'SUFFIX'): number {
  const m = WAYSTONE_MODS.find(
    (mod) => mod.affix === affix && mod.text.toLowerCase().includes(textIncludes.toLowerCase()),
  )
  if (!m) throw new Error(`No ${affix} mod containing "${textIncludes}"`)
  return m.id
}

// Four representative mods for the parity cases: two PREFIX, two SUFFIX. The constant
// names are historical labels -- what matters is the affix, so the cases exercise
// prefix vs suffix handling. (FIRE/ENFEEBLE are prefixes; BLEEDING/STUN are suffixes.)
const FIRE = findId('Extra Fire', 'PREFIX')
const ENFEEBLE = findId('Extra Cold', 'PREFIX')
const BLEEDING = findId('maximum Player Resistances', 'SUFFIX')
const STUN = findId('less effect of Curses', 'SUFFIX')

// ----- parity table ----------------------------------------------------------

interface Case {
  label: string
  args: Parameters<typeof makeSettings>[0]
}

const CASES: Case[] = [
  // Empty / no-op cases
  { label: 'all defaults (no filter)', args: {} },
  { label: 'full tier 1-16 is no-op', args: { tierMin: 1, tierMax: 16 } },
  { label: 'tier 0/0 is no-op', args: { tierMin: 0, tierMax: 0 } },

  // Tier slicing
  { label: 'tier 2-16 (user example)', args: { tierMin: 2, tierMax: 16, prefixIds: [FIRE, ENFEEBLE] } },
  { label: 'tier 1-10 (no over-10 chunk)', args: { tierMin: 1, tierMax: 10 } },
  { label: 'tier 5-10 (single under-10 range)', args: { tierMin: 5, tierMax: 10 } },
  { label: 'tier 12-15 (only over-10 chunk)', args: { tierMin: 12, tierMax: 15 } },
  { label: 'tier 16-16 (single value)', args: { tierMin: 16, tierMax: 16 } },
  { label: 'tier 8-9 (two-value under-10)', args: { tierMin: 8, tierMax: 9 } },
  { label: 'tier 7-13 (spans the boundary)', args: { tierMin: 7, tierMax: 13 } },

  // Rarity
  { label: 'corrupted only', args: { corrupted: true } },
  { label: 'uncorrupted only', args: { uncorrupted: true } },
  { label: 'both rarity (no-op)', args: { corrupted: true, uncorrupted: true } },

  // Prefixes (any vs all)
  { label: 'one prefix any', args: { prefixIds: [FIRE], prefixSelectType: 'any' } },
  { label: 'two prefixes any', args: { prefixIds: [FIRE, ENFEEBLE], prefixSelectType: 'any' } },
  { label: 'one prefix all', args: { prefixIds: [FIRE], prefixSelectType: 'all' } },
  { label: 'two prefixes all', args: { prefixIds: [FIRE, ENFEEBLE], prefixSelectType: 'all' } },

  // Suffixes
  { label: 'one suffix', args: { suffixIds: [BLEEDING] } },
  { label: 'two suffixes', args: { suffixIds: [BLEEDING, STUN] } },

  // Mixed prefix + suffix
  {
    label: 'prefix + suffix any',
    args: { prefixIds: [FIRE], suffixIds: [BLEEDING], prefixSelectType: 'any' },
  },
  {
    label: 'prefix + suffix all',
    args: { prefixIds: [FIRE, ENFEEBLE], suffixIds: [BLEEDING], prefixSelectType: 'all' },
  },

  // goodSpecial qualifiers (any/all variants)
  { label: 'delirious only', args: { delirious: true } },
  { label: 'anyPack only', args: { anyPack: true } },
  {
    label: 'all goodSpecial any',
    args: { delirious: true, anyPack: true, prefixSelectType: 'any' },
  },
  {
    label: 'all goodSpecial all',
    args: { delirious: true, anyPack: true, prefixSelectType: 'all' },
  },
  {
    label: 'goodSpecial + prefix any',
    args: { delirious: true, prefixIds: [FIRE], prefixSelectType: 'any' },
  },
  {
    label: 'goodSpecial + prefix all',
    args: { delirious: true, anyPack: true, prefixIds: [FIRE, ENFEEBLE], prefixSelectType: 'all' },
  },

  // Combined kitchen sink
  {
    label: 'tier + rarity + good + bad + special (any)',
    args: {
      tierMin: 5,
      tierMax: 12,
      corrupted: true,
      delirious: true,
      anyPack: true,
      prefixIds: [FIRE, ENFEEBLE],
      suffixIds: [BLEEDING, STUN],
      prefixSelectType: 'any',
    },
  },
  {
    label: 'tier + rarity + good + bad + special (all)',
    args: {
      tierMin: 4,
      tierMax: 11,
      uncorrupted: true,
      delirious: true,
      prefixIds: [FIRE],
      suffixIds: [BLEEDING],
      prefixSelectType: 'all',
    },
  },

  // Custom text
  { label: 'custom text only', args: { customText: 'foo' } },
  { label: 'custom text + tier', args: { tierMin: 2, tierMax: 16, customText: 'bar' } },

  // Per-mod magnitude values
  { label: 'prefix value 20 (any)', args: { prefixIds: [FIRE], wantValues: { [FIRE]: 20 } } },
  { label: 'prefix value 24 raw', args: { prefixIds: [FIRE], wantValues: { [FIRE]: 24 } } },
  { label: 'prefix value 24 round10', args: { prefixIds: [FIRE], wantValues: { [FIRE]: 24 }, round10: true } },
  { label: 'prefix value 24 over100', args: { prefixIds: [FIRE], wantValues: { [FIRE]: 24 }, over100: true } },
  { label: 'prefix value 150', args: { prefixIds: [FIRE], wantValues: { [FIRE]: 150 } } },
  {
    label: 'two prefixes values (all)',
    args: { prefixIds: [FIRE, ENFEEBLE], wantValues: { [FIRE]: 20, [ENFEEBLE]: 30 }, prefixSelectType: 'all' },
  },
  { label: 'suffix value 30', args: { suffixIds: [BLEEDING], avoidValues: { [BLEEDING]: 30 } } },
  {
    label: 'prefix + suffix values (any) round10',
    args: {
      prefixIds: [FIRE],
      suffixIds: [BLEEDING],
      wantValues: { [FIRE]: 25 },
      avoidValues: { [BLEEDING]: 35 },
      round10: true,
    },
  },
]

describe('waystone-engine: affix-agnostic selection', () => {
  it('SUFFIX mod in want set appears in the positive (non-negated) output', () => {
    const bleedingMod = WAYSTONE_MODS.find((m) => m.id === BLEEDING)!
    const result = buildWaystoneRegex({
      mods: WAYSTONE_MODS,
      tier: { min: 1, max: 16 },
      rarity: { corrupted: false, uncorrupted: false },
      qualifiers: { delirious: false, anyPack: false },
      quantities: {
        packSize: null,
        monsterEffectiveness: null,
        monsterRarity: null,
        itemRarity: null,
        dropChance: null,
      },
      selections: {
        want: new Set([BLEEDING]),
        avoid: new Set(),
        wantMode: 'any',
        wantValues: {},
        avoidValues: {},
      },
      round10: false,
      over100: false,
    })
    // Should appear inside the quoted positive group, not the negated "!..." group.
    expect(result).toContain(`"${bleedingMod.regex}"`)
    expect(result).not.toMatch(new RegExp(`!.*${bleedingMod.regex}`))
  })

  it('PREFIX mod in avoid set appears in the negated "!..." group', () => {
    const fireMod = WAYSTONE_MODS.find((m) => m.id === FIRE)!
    const result = buildWaystoneRegex({
      mods: WAYSTONE_MODS,
      tier: { min: 1, max: 16 },
      rarity: { corrupted: false, uncorrupted: false },
      qualifiers: { delirious: false, anyPack: false },
      quantities: {
        packSize: null,
        monsterEffectiveness: null,
        monsterRarity: null,
        itemRarity: null,
        dropChance: null,
      },
      selections: {
        want: new Set(),
        avoid: new Set([FIRE]),
        wantMode: 'any',
        wantValues: {},
        avoidValues: {},
      },
      round10: false,
      over100: false,
    })
    // Should appear as "!<token>" in the negated group
    expect(result).toContain(`"!${fireMod.regex}"`)
  })
})

describe('waystone-engine: Quantity & yield quantifiers', () => {
  const noQuant: WaystoneQuantities = {
    packSize: null,
    monsterEffectiveness: null,
    monsterRarity: null,
    itemRarity: null,
    dropChance: null,
  }
  const build = (quantities: WaystoneQuantities): string =>
    buildWaystoneRegex({
      mods: WAYSTONE_MODS,
      tier: { min: 1, max: 16 },
      rarity: { corrupted: false, uncorrupted: false },
      qualifiers: { delirious: false, anyPack: false },
      quantities,
      selections: { want: new Set(), avoid: new Set(), wantMode: 'any', wantValues: {}, avoidValues: {} },
      round10: false,
      over100: false,
    })

  it('emits each field with its token + number-regex + %', () => {
    expect(build({ ...noQuant, packSize: 50 })).toBe(`"ack siz.*${generateNumberRegex('50', false, false)}%"`)
    expect(build({ ...noQuant, monsterEffectiveness: 30 })).toBe(
      `"ffectiv.*${generateNumberRegex('30', false, false)}%"`,
    )
    expect(build({ ...noQuant, monsterRarity: 25 })).toBe(`"er rar.*${generateNumberRegex('25', false, false)}%"`)
    expect(build({ ...noQuant, itemRarity: 40 })).toBe(`"m rar.*${generateNumberRegex('40', false, false)}%"`)
    expect(build({ ...noQuant, dropChance: 200 })).toBe(`"p c.*${generateNumberRegex('200', false, false)}%"`)
  })

  it('emits set fields in token order and skips 0/null', () => {
    const out = build({ ...noQuant, packSize: 50, monsterRarity: 25 })
    expect(out).toBe(
      `"ack siz.*${generateNumberRegex('50', false, false)}%" "er rar.*${generateNumberRegex('25', false, false)}%"`,
    )
  })

  it('produces no quantifier parts when all are unset', () => {
    expect(build(noQuant)).toBe('')
  })

  it('honors the over100 toggle (3-digit rolls match a 2-digit threshold)', () => {
    const out = buildWaystoneRegex({
      mods: WAYSTONE_MODS,
      tier: { min: 1, max: 16 },
      rarity: { corrupted: false, uncorrupted: false },
      qualifiers: { delirious: false, anyPack: false },
      quantities: { ...noQuant, monsterRarity: 50 },
      selections: { want: new Set(), avoid: new Set(), wantMode: 'any', wantValues: {}, avoidValues: {} },
      round10: false,
      over100: true,
    })
    expect(out).toBe(`"er rar.*${generateNumberRegex('50', false, true)}%"`)
    // over100=true must widen vs over100=false for a 10-99 threshold.
    expect(generateNumberRegex('50', false, true)).not.toBe(generateNumberRegex('50', false, false))
  })
})

describe('waystone-engine: parity with poe2.re reference implementation', () => {
  for (const c of CASES) {
    it(c.label, () => {
      expect(ours(c.args)).toBe(theirs(c.args))
    })
  }

  it('user-reported case: tier 2-16 + two prefixes matches poe2.re exactly', () => {
    const args = { tierMin: 2, tierMax: 16, prefixIds: [FIRE, ENFEEBLE] }
    // The tier slice is deterministic; the mod tokens come from the selected prefixes in
    // WAYSTONE_MODS order, joined for "any" mode. Derived from the data so the pin
    // survives a waystone data refresh.
    const tokens = WAYSTONE_MODS.filter((m) => m.id === FIRE || m.id === ENFEEBLE)
      .map((m) => m.regex)
      .join('|')
    const expected = `"r [2-9]\\)|1[0123456]\\)" "${tokens}"`
    expect(theirs(args)).toBe(expected)
    expect(ours(args)).toBe(expected)
  })
})
