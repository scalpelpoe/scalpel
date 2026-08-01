import { describe, expect, it } from 'vitest'
import { itemRegex } from '@shared/data/regex/vendor/item/GeneratedItemMods'
import type { ItemAffixRegex } from '@shared/data/regex/vendor/item/GeneratedItemMods'
import { DEFAULT_ITEMS_STATE, rareModKey, type ItemsState } from '@shared/data/regex/items-state'
import { generateMagicItemRegex, generateRareItemRegex } from './__fixtures__/poere/ItemOuput'
import type { ItemCraftingSettings, RareModSelection, SelectedMagicMod } from './__fixtures__/poere/ItemTypes'
import { buildItemsAffixMap, buildItemsRegex, cleanItemsCategoryName, groupItemsCategories } from './items-engine'

/** Upstream affixMap, built exactly as Item.tsx does (flatMap + reduce). */
const upstreamAffixMap: Record<string, ItemAffixRegex> = Object.entries(itemRegex)
  .flatMap(([basetype, item]) =>
    item.categoryRegex.flatMap((cat) =>
      cat.modifiers.map((mod) => ({ key: `${basetype}-${cat.category}-${mod.desc}`, value: mod })),
    ),
  )
  .reduce<Record<string, ItemAffixRegex>>((acc, { key, value }) => {
    acc[key] = value
    return acc
  }, {})

const affixMap = buildItemsAffixMap(itemRegex)

function state(over: Partial<ItemsState>): ItemsState {
  return { ...structuredClone(DEFAULT_ITEMS_STATE), ...over }
}

/** Map our state onto upstream ItemCraftingSettings. */
function adapt(s: ItemsState): ItemCraftingSettings {
  const itembase = s.itembase ? { baseType: s.itembase.baseType, item: s.itembase.item, rarity: s.rarity } : undefined
  const selectedRareMods: Record<string, RareModSelection> = {}
  for (const [key, sel] of Object.entries(s.selectedRareMods)) {
    selectedRareMods[key] = { itembase: itembase!, selected: true, values: { ...sel.values } }
  }
  const selectedMagicMods: SelectedMagicMod[] = s.selectedMagicMods.map((m) => ({
    basetype: m.basetype,
    category: m.category,
    regex: { name: m.affixName, desc: m.affixDesc },
    affix: m.affix,
    desc: m.affixName,
  }))
  return {
    itembase,
    selectedRareMods,
    selectedMagicMods,
    rareSettings: {
      matchAnyMod: s.rareMatchMode === 'any',
      matchPrefixAndSuffix: s.rareMatchMode === 'prefixSuffix',
    },
    magicSettings: { onlyIfBothPrefixAndSuffix: s.magicBothAffixes, matchOpenAffix: s.magicOpenAffix },
    customText: { value: '', enabled: false },
  }
}

function expectRareParity(s: ItemsState): void {
  expect(buildItemsRegex(affixMap, s)).toBe(generateRareItemRegex(upstreamAffixMap, adapt(s)))
}

function expectMagicParity(s: ItemsState): void {
  expect(buildItemsRegex(affixMap, s)).toBe(generateMagicItemRegex(adapt(s)))
}

/** Deterministic PRNG for the sweep (Date.now/Math.random are banned in tests
 *  that must reproduce; fixed seed). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('affix map', () => {
  it('matches the upstream flatten exactly', () => {
    expect(affixMap).toEqual(upstreamAffixMap)
  })
})

describe('rare parity', () => {
  const daggers = itemRegex.Daggers

  function pickMods(count: number, rand: () => number): Array<{ key: string; mod: ItemAffixRegex }> {
    const all = daggers.categoryRegex.flatMap((cat) =>
      cat.modifiers.map((mod) => ({ key: rareModKey('Daggers', cat.category, mod.desc), mod })),
    )
    const out: Array<{ key: string; mod: ItemAffixRegex }> = []
    for (let i = 0; i < count; i++) out.push(all[Math.floor(rand() * all.length)])
    return out
  }

  it('empty selection produces empty output in every mode', () => {
    for (const mode of ['all', 'any', 'prefixSuffix'] as const) {
      const s = state({ itembase: { baseType: 'Daggers', item: 'Glass Shank' }, rareMatchMode: mode })
      expect(buildItemsRegex(affixMap, s)).toBe('')
      expectRareParity(s)
    }
  })

  it('no base selected produces empty output', () => {
    expect(buildItemsRegex(affixMap, state({}))).toBe('')
  })

  it('single mod, no values, all three modes (prefixSuffix exercises the one-side fallback)', () => {
    const { key } = pickMods(1, mulberry32(7))[0]
    for (const mode of ['all', 'any', 'prefixSuffix'] as const) {
      const s = state({
        itembase: { baseType: 'Daggers', item: 'Glass Shank' },
        rareMatchMode: mode,
        selectedRareMods: { [key]: { values: {} } },
      })
      expectRareParity(s)
    }
  })

  it('values in before/on/after positions substitute number regexes', () => {
    // "Adds # to # Chaos Damage" has before: [0], on: [1] - covers both paths.
    const cat = daggers.categoryRegex.find((c) => c.modifiers.some((m) => m.on.length > 0))
    expect(cat).toBeDefined()
    const mod = cat!.modifiers.find((m) => m.on.length > 0)!
    const key = rareModKey('Daggers', cat!.category, mod.desc)
    for (const values of [{ 0: '5' }, { 1: '12' }, { 0: '5', 1: '12' }, { 0: '', 1: '150' }] as Array<
      Record<number, string>
    >) {
      const s = state({
        itembase: { baseType: 'Daggers', item: 'Glass Shank' },
        selectedRareMods: { [key]: { values } },
      })
      expectRareParity(s)
    }
  })

  it('selections for other classes are filtered out', () => {
    const { key } = pickMods(1, mulberry32(3))[0]
    const bows = itemRegex.Bows.categoryRegex[0]
    const foreignKey = rareModKey('Bows', bows.category, bows.modifiers[0].desc)
    const s = state({
      itembase: { baseType: 'Daggers', item: 'Glass Shank' },
      selectedRareMods: { [key]: { values: {} }, [foreignKey]: { values: {} } },
    })
    expectRareParity(s)
  })

  it('stale keys (not in the dataset) are skipped instead of crashing', () => {
    const s = state({
      itembase: { baseType: 'Daggers', item: 'Glass Shank' },
      selectedRareMods: { 'Daggers-prefix-No Longer Exists': { values: {} } },
    })
    expect(buildItemsRegex(affixMap, s)).toBe('')
  })

  it('seeded random sweep across classes, mods, values, and modes', () => {
    const rand = mulberry32(20260718)
    const classes = Object.keys(itemRegex)
    for (let i = 0; i < 40; i++) {
      const baseType = classes[Math.floor(rand() * classes.length)]
      const all = itemRegex[baseType].categoryRegex.flatMap((cat) =>
        cat.modifiers.map((mod) => ({ key: rareModKey(baseType, cat.category, mod.desc), mod })),
      )
      const count = 1 + Math.floor(rand() * 6)
      const selectedRareMods: ItemsState['selectedRareMods'] = {}
      for (let j = 0; j < count; j++) {
        const { key, mod } = all[Math.floor(rand() * all.length)]
        const values: Record<number, string> = {}
        for (const stat of mod.stats) {
          if (stat.numberIndex === undefined) continue
          const roll = rand()
          if (roll < 0.4) values[stat.numberIndex] = String(1 + Math.floor(rand() * 400))
          else if (roll < 0.5) values[stat.numberIndex] = ''
        }
        selectedRareMods[key] = { values }
      }
      const mode = (['all', 'any', 'prefixSuffix'] as const)[Math.floor(rand() * 3)]
      expectRareParity(state({ itembase: { baseType, item: 'X' }, rareMatchMode: mode, selectedRareMods }))
    }
  })
})

describe('magic parity', () => {
  function magicSelections(baseType: string, count: number, rand: () => number): ItemsState['selectedMagicMods'] {
    const all = itemRegex[baseType].categoryRegex.flatMap((cat) =>
      cat.modifiers.flatMap((mod) =>
        mod.affixes.map((a) => ({
          basetype: baseType,
          category: cat.category,
          affixName: a.name,
          affixDesc: a.desc,
          affix: mod.affixtype,
        })),
      ),
    )
    const out: ItemsState['selectedMagicMods'] = []
    for (let i = 0; i < count; i++) out.push(all[Math.floor(rand() * all.length)])
    return out
  }

  it('all four flag combinations, prefixes and suffixes mixed', () => {
    const rand = mulberry32(99)
    const mods = magicSelections('Daggers', 4, rand)
    for (const magicBothAffixes of [false, true]) {
      for (const magicOpenAffix of [false, true]) {
        expectMagicParity(
          state({
            itembase: { baseType: 'Daggers', item: 'Glass Shank' },
            rarity: 'Magic',
            magicBothAffixes,
            magicOpenAffix,
            selectedMagicMods: mods,
          }),
        )
      }
    }
  })

  it('prefix-only and suffix-only selections in every flag combination', () => {
    const rand = mulberry32(41)
    const mods = magicSelections('Bows', 8, rand)
    const prefixOnly = mods.filter((m) => m.affix === 'PREFIX').slice(0, 2)
    const suffixOnly = mods.filter((m) => m.affix === 'SUFFIX').slice(0, 2)
    for (const selectedMagicMods of [prefixOnly, suffixOnly]) {
      for (const magicBothAffixes of [false, true]) {
        for (const magicOpenAffix of [false, true]) {
          expectMagicParity(
            state({
              itembase: { baseType: 'Bows', item: 'Thicket Bow' },
              rarity: 'Magic',
              magicBothAffixes,
              magicOpenAffix,
              selectedMagicMods,
            }),
          )
        }
      }
    }
  })

  it('no selections: parity in every flag combination (open-affix still emits name anchors)', () => {
    for (const magicBothAffixes of [false, true]) {
      for (const magicOpenAffix of [false, true]) {
        expectMagicParity(
          state({
            itembase: { baseType: 'Daggers', item: 'Glass Shank' },
            rarity: 'Magic',
            magicBothAffixes,
            magicOpenAffix,
          }),
        )
      }
    }
  })

  it('magic mode with an empty item name returns empty (component-level guard, ours only)', () => {
    expect(buildItemsRegex(affixMap, state({ itembase: { baseType: 'Daggers', item: '' }, rarity: 'Magic' }))).toBe('')
  })

  it('seeded random sweep', () => {
    const rand = mulberry32(777)
    const classes = Object.keys(itemRegex)
    for (let i = 0; i < 25; i++) {
      const baseType = classes[Math.floor(rand() * classes.length)]
      expectMagicParity(
        state({
          itembase: { baseType, item: 'Some Item' },
          rarity: 'Magic',
          magicBothAffixes: rand() < 0.5,
          magicOpenAffix: rand() < 0.5,
          selectedMagicMods: magicSelections(baseType, 1 + Math.floor(rand() * 5), rand),
        }),
      )
    }
  })
})

describe('category grouping (GroupUtils port)', () => {
  it('cleanItemsCategoryName maps upstream names', () => {
    expect(cleanItemsCategoryName('prefix')).toBe('Prefix')
    expect(cleanItemsCategoryName('suffix_elder')).toBe('Suffix Elder')
    expect(cleanItemsCategoryName('prefix_basilisk')).toBe('Prefix Hunter')
    expect(cleanItemsCategoryName('suffix_eyrie')).toBe('Suffix Redeemer')
    expect(cleanItemsCategoryName('prefix_adjudicator')).toBe('Prefix Warlord')
    expect(cleanItemsCategoryName('delve_prefix')).toBe('delve_Prefix')
  })

  it('groups prefix/suffix pairs, filters searing_exarch_implicit, sorts base first then influences', () => {
    const groups = groupItemsCategories(itemRegex.Daggers.categoryRegex)
    for (const g of groups) {
      expect(g[0].category).not.toBe('searing_exarch_implicit')
    }
    const keys = groups.map((g) => g[0].category.replace(/(suffix|prefix)_?/, ''))
    const plainIdx = keys.indexOf('')
    const shaperIdx = keys.findIndex((k) => k === 'shaper')
    expect(plainIdx).toBeGreaterThanOrEqual(0)
    if (shaperIdx >= 0) expect(plainIdx).toBeLessThan(shaperIdx)
  })
})
