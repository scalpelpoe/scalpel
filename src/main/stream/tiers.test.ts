import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type SnapshotItem, validateSnapshot } from '@scalpel/stream-contract'
import streamData from '@shared/data/tiers/stream-tiers-poe2.json'
import data from '@shared/data/tiers/tiers-poe2.json'
import type { StreamTierDataset, TierDataset } from '@shared/data/tiers/types'
import { describe, expect, it } from 'vitest'
import { enrichCharacter } from './enrich'
import { normalizeCharacter } from './normalize'
import { NinjaCharacterSchema } from './sources/ninja-types'
import type { NinjaItemData } from './sources/ninja-types'
import { applyTiers, resolveModTier } from './tiers'

const dataset = data as unknown as TierDataset
const stream = streamData as unknown as StreamTierDataset
const character = NinjaCharacterSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '__fixtures__/ninja-character.json'), 'utf8')),
)

function tieredSnapshot(tierData: TierDataset | null = dataset, streamTierData: StreamTierDataset | null = stream) {
  const normalized = normalizeCharacter(character, { now: new Date('2026-09-29T12:00:00Z'), hideCharacterName: false })
  enrichCharacter(normalized, { tierData, streamTierData, uniquePrice: () => undefined })
  return normalized.snapshot
}

/** A one-line Gold Ring with the given mods and properties, tiered in place. */
function tagSynthetic(text: string, mods: NinjaItemData['mods'], properties: NinjaItemData['properties']) {
  const item = {
    rarity: 'rare',
    baseType: 'Gold Ring',
    sections: [{ kind: 'explicit', lines: [{ text }] }],
  } as unknown as SnapshotItem
  applyTiers(item, { properties, mods } as unknown as NinjaItemData, dataset)
  return item.sections[0].lines[0]
}

const explicitLines = (item: SnapshotItem | undefined) =>
  item?.sections.filter((s) => s.kind === 'explicit').flatMap((s) => s.lines) ?? []
const lineWith = (item: SnapshotItem | undefined, needle: string) =>
  explicitLines(item).find((l) => l.text.includes(needle))

describe('resolveModTier', () => {
  it('counts only named tiers and reads suffixes from "of" names', () => {
    // FireResist7 rolls into "of Magma" (36-40), the 7th of 8 named fire tiers.
    expect(
      resolveModTier(dataset, 'Gold Ring', { id: 'FireResist7', stats: { 'base_fire_damage_resistance_%': 40 } }),
    ).toEqual({
      num: 2,
      affix: 'suffix',
      label: 'S2',
      range: { min: 36, max: 40 },
    })
  })

  it('uses the mod id to pick between groups that share a stat', () => {
    // Rarity exists as both a prefix and a suffix group; 17 fits a tier in each.
    expect(
      resolveModTier(dataset, 'Gold Ring', {
        id: 'ItemFoundRarityIncreasePrefix3',
        stats: { 'base_item_found_rarity_+%': 17 },
      }),
    ).toMatchObject({ affix: 'prefix', label: 'P1' })
  })

  it('returns null for unknown bases and rolls outside every tier', () => {
    expect(
      resolveModTier(dataset, 'Not A Base', { id: 'FireResist7', stats: { 'base_fire_damage_resistance_%': 40 } }),
    ).toBeNull()
    expect(
      resolveModTier(dataset, 'Gold Ring', { id: 'FireResist7', stats: { 'base_fire_damage_resistance_%': 400 } }),
    ).toBeNull()
  })
})

describe('resolveModTier with the stream dataset', () => {
  const resolveIn = (base: string, id: string, stats: Record<string, number>) =>
    resolveModTier(dataset, base, { id, stats }, stream)?.label

  it('badges flask and charm affixes from their own pools', () => {
    expect(
      resolveIn('Ultimate Life Flask', 'FlaskIncreasedRecoverySpeed1', { 'local_flask_recovery_speed_+%': 43 }),
    ).toBe('P6')
    // ChargesAdded and MaxCharges share every range; the stat id tells them apart.
    expect(
      resolveIn('Ultimate Life Flask', 'FlaskChargesAddedIncreasePercent1', { 'local_charges_added_+%': 29 }),
    ).toBe('S6')
    // The trailing underscores don't hide the id index.
    expect(resolveIn('Thawing Charm', 'FlaskExtraCharges2__', { 'local_max_charges_+%': 38 })).toBe('S5')
    expect(resolveIn('Thawing Charm', 'CharmGainManaOnUse1', { charm_recover_X_mana_when_used: 18 })).toBe('P8')
  })

  it('ladders rune influences on their own family, not the ordinary group', () => {
    expect(
      resolveIn('Runeforged War Wraps', 'MarksmanInfluenceProjectileDamage3', { 'projectile_damage_+%': 36 }),
    ).toBe('P1')
    expect(
      resolveIn('Runeforged War Wraps', 'MarksmanInfluenceProjectileSkills2', { 'projectile_skill_gem_level_+': 2 }),
    ).toBe('S1')
    // An influence roll outside its own ladder gets nothing, never an ordinary tier.
    expect(
      resolveIn('Runeforged War Wraps', 'MarksmanInfluenceProjectileDamage3', { 'projectile_damage_+%': 999 }),
    ).toBeUndefined()
  })

  it('takes the abyss affix from the data whenever the family exists', () => {
    // Generation type says suffix; the id token says Prefix. Stats that match no entry
    // still read the family's affix rather than the token.
    expect(
      resolveModTier(
        dataset,
        'Emerald',
        { id: 'AbyssModRadiusJewelPrefixManaCostEfficiency', stats: { x: 1 } },
        stream,
      ),
    ).toEqual({ num: 1, affix: 'suffix', label: 'S1' })
  })

  it('badges abyss mods tier 1 with the generation-type affix', () => {
    const id = 'AbyssModAmuletKurgalSuffixQualityofAllSkills'
    expect(resolveModTier(dataset, 'Absent Amulet', { id, stats: { 'all_skill_gem_quality_+': 4 } }, stream)).toEqual({
      num: 1,
      affix: 'suffix',
      label: 'S1',
      range: { min: 3, max: 5 },
    })
    // Without data (or for an id the data lacks) the id's Prefix/Suffix token decides.
    expect(resolveModTier(dataset, 'Absent Amulet', { id, stats: { 'all_skill_gem_quality_+': 4 } })).toEqual({
      num: 1,
      affix: 'suffix',
      label: 'S1',
    })
    expect(
      resolveModTier(dataset, 'Absent Amulet', { id: 'AbyssModAmuletUlamanPrefixSomethingNew', stats: { x: 1 } }),
    ).toMatchObject({ label: 'P1' })
  })

  it('breaks overlapping influence rungs by id index, never by first fit', () => {
    // TimeInfluenceDodgeRoll rungs are [3,4] and [4,5]: a 4 fits both.
    const roll = { dodge_roll_base_travel_distance: 4 }
    expect(resolveIn('Runeforged War Wraps', 'TimeInfluenceDodgeRoll2', roll)).toBe('P1')
    expect(resolveIn('Runeforged War Wraps', 'TimeInfluenceDodgeRoll1', roll)).toBe('P2')
    // A single fit needs no index.
    expect(resolveIn('Runeforged War Wraps', 'TimeInfluenceDodgeRoll2', { dodge_roll_base_travel_distance: 5 })).toBe(
      'P1',
    )
  })

  it('leaves price-check bases on the main pool', () => {
    expect(resolveIn('Gold Ring', 'FireResist7', { 'base_fire_damage_resistance_%': 40 })).toBe('S2')
  })
})

describe('applyTiers', () => {
  it('badges desecrated ring mods from their rolls', () => {
    const ring = tieredSnapshot().equipment.Ring2
    const lines = explicitLines(ring)
    const byText = (needle: string) => lines.find((l) => l.text.includes(needle))
    expect(byText('Fire Resistance')?.tier?.label).toBe('S2')
    expect(byText('Lightning Resistance')?.tier?.label).toBe('S4')
    expect(byText('Cold Resistance')?.tier?.label).toBe('S4')
    expect(byText('Rarity')?.tier?.label).toBe('P1')
    expect(byText('Adds 19 to 28 Fire')?.tier?.affix).toBe('prefix')
    expect(byText('Fire Resistance')?.range).toEqual({ min: 36, max: 40 })
  })

  it('never badges uniques or implicits', () => {
    const snapshot = tieredSnapshot()
    const uniques = [...Object.values(snapshot.equipment), ...snapshot.flasks, ...snapshot.charms].filter(
      (i) => i?.rarity === 'unique',
    )
    expect(uniques.length).toBeGreaterThan(0)
    for (const item of uniques) expect(item?.sections.flatMap((s) => s.lines).some((l) => l.tier)).toBe(false)
    const implicitLines = Object.values(snapshot.equipment).flatMap(
      (i) => i?.sections.filter((s) => s.kind === 'implicit').flatMap((s) => s.lines) ?? [],
    )
    expect(implicitLines.some((l) => l.tier)).toBe(false)
  })

  it('badges most explicit lines on rares', () => {
    const snapshot = tieredSnapshot()
    const rareLines = Object.values(snapshot.equipment)
      .filter((i) => i?.rarity === 'rare')
      .flatMap((i) => i?.sections.filter((s) => s.kind === 'explicit').flatMap((s) => s.lines) ?? [])
    const tagged = rareLines.filter((l) => l.tier).length
    expect(rareLines.length).toBeGreaterThan(10)
    expect(tagged / rareLines.length).toBeGreaterThan(0.6)
  })

  it('reads catalyst-scaled values against the raw roll', () => {
    // Topaz Ring with 20% lightning quality: LightningResist7 rolled 36, shows 43.
    const ring = tieredSnapshot().equipment.Ring
    const expected = resolveModTier(dataset, 'Topaz Ring', {
      id: 'LightningResist7',
      stats: { 'base_lightning_damage_resistance_%': 36 },
    })
    expect(expected).not.toBeNull()
    const line = lineWith(ring, '+43% to Lightning Resistance')
    expect(line?.tier?.label).toBe(expected?.label)
    // The badge's range stays in unmodified roll space.
    expect(line?.range).toEqual(expected?.range)
    expect(lineWith(ring, '+19% to all Elemental Resistances')?.tier).toBeDefined()
    expect(lineWith(ring, 'Adds 1 to 48 Lightning damage')?.tier?.affix).toBe('prefix')
  })

  it('ignores a plain Quality property', () => {
    // Gale Nails has +20% [Quality] (scales defences); its untouched rolls still tag.
    const gloves = tieredSnapshot().equipment.Gloves
    expect(lineWith(gloves, 'Adds 9 to 14 Physical')?.tier?.label).toBe('P4')
    // A value only a 20% scaling explains (36 -> 43) must not tag under plain Quality.
    const fire = { explicit: [{ id: 'FireResist7', stats: { 'base_fire_damage_resistance_%': 36 } }] }
    expect(
      tagSynthetic('+43% to Fire Resistance', fire, [{ name: 'Quality', values: [['+20%', 1]] }]).tier,
    ).toBeUndefined()
    expect(
      tagSynthetic('+43% to Fire Resistance', fire, [{ name: 'Quality (Elemental Modifiers)', values: [['+20%', 1]] }])
        .tier?.label,
    ).toBe('S2')
  })

  it('prefers a raw roll that explains the line over a colliding scaled one', () => {
    // FireResist7 rolled 36 prints 36 exactly; FireResist5's 30 scales to 36 under 20%.
    const line = tagSynthetic(
      '+36% to Fire Resistance',
      {
        explicit: [
          { id: 'FireResist5', stats: { 'base_fire_damage_resistance_%': 30 } },
          { id: 'FireResist7', stats: { 'base_fire_damage_resistance_%': 36 } },
        ],
      },
      [{ name: 'Quality (Elemental Modifiers)', values: [['+20%', 1]] }],
    )
    expect(line.tier?.label).toBe('S2')
  })

  it('badges a merged crafted+explicit line with the explicit tier', () => {
    const mace = tieredSnapshot().equipment.Weapon
    const expected = resolveModTier(dataset, 'Flanged Mace', {
      id: 'LocalIncreasedAttackSpeed7',
      stats: { 'local_attack_speed_+%': 24 },
    })
    expect(expected).not.toBeNull()
    const line = lineWith(mace, '32% increased Attack Speed')
    expect(line?.tier).toEqual({ affix: expected?.affix, num: expected?.num, label: expected?.label })
    // 32 is a sum, not a roll in the tier, so no range.
    expect(line?.range).toBeUndefined()
  })

  it('shows local crit chance in percent', () => {
    // LocalCriticalStrikeChance4 stores 358 for +3.58%.
    const bow = tieredSnapshot().equipment.Weapon2
    const line = lineWith(bow, '+3.58% to Critical Hit Chance')
    expect(line?.tier?.label).toBe('S3')
    expect(line?.range).toEqual({ min: 3.11, max: 3.8 })
  })
})

describe('stream dataset invariants', () => {
  type Mod = StreamTierDataset['mods'][number]
  const statKey = (m: Mod) =>
    m.s
      .map(([id]) => id)
      .sort()
      .join('|')
  const overlaps = (a: Mod, b: Mod) =>
    statKey(a) === statKey(b) &&
    a.s.every(([id, lo, hi]) => {
      const o = b.s.find(([bid]) => bid === id)
      return !!o && Math.max(Math.min(lo, hi), Math.min(o[1], o[2])) <= Math.min(Math.max(lo, hi), Math.max(o[1], o[2]))
    })
  const named = (ladder: number[]) => ladder.map((i) => stream.mods[i]).filter((m) => m.n)

  it('no pool has two groups whose named rungs share stat ids and overlap', () => {
    const clashes: string[] = []
    stream.pools.forEach((pool, p) => {
      const groups = Object.entries(pool)
      for (let a = 0; a < groups.length; a++)
        for (let b = a + 1; b < groups.length; b++)
          for (const x of named(groups[a][1]))
            for (const y of named(groups[b][1]))
              if (overlaps(x, y)) clashes.push(`pool ${p}: ${groups[a][0]} / ${groups[b][0]}`)
    })
    expect(clashes).toEqual([])
  })

  it('every family with overlapping rungs is one the id index resolves', () => {
    // Families whose RePoE ids number the rungs 1..n in ladder order (checked against
    // mods.json), so resolveInLadder's id-index tie-break picks the right one.
    const KNOWN_INDEXED = ['TimeInfluenceDodgeRoll']
    const overlapping = Object.entries(stream.families)
      .filter(([, ladder]) => {
        const rungs = named(ladder)
        return rungs.some((x, i) => rungs.slice(i + 1).some((y) => overlaps(x, y)))
      })
      .map(([family]) => family)
    expect(overlapping.sort()).toEqual(KNOWN_INDEXED)
  })
})

describe('stream-only coverage on the fixture', () => {
  it('badges the Gale Nails Marksman lines', () => {
    const gloves = tieredSnapshot().equipment.Gloves
    expect(lineWith(gloves, 'Projectile Damage')?.tier?.label).toBe('P1')
    expect(lineWith(gloves, 'Level of all Projectile Skills')?.tier?.label).toBe('S1')
    expect(lineWith(gloves, 'Surpassing chance to fire an additional Projectile')?.tier?.label).toBe('S1')
  })

  it('badges flask and charm affixes', () => {
    const snapshot = tieredSnapshot()
    const magic = [...snapshot.flasks, ...snapshot.charms].filter((i) => i?.rarity === 'magic')
    const labels = magic.flatMap((i) => explicitLines(i ?? undefined).map((l) => l.tier?.label))
    expect(labels.sort()).toEqual(['P6', 'P8', 'S5', 'S6'])
  })

  it('badges the amulet abyss line tier 1', () => {
    const amulet = tieredSnapshot().equipment.Amulet
    expect(lineWith(amulet, 'Quality of all Skills')?.tier).toEqual({ affix: 'suffix', num: 1, label: 'S1' })
  })

  it('leaves those lines untagged without the stream dataset', () => {
    const snapshot = tieredSnapshot(dataset, null)
    expect(lineWith(snapshot.equipment.Gloves, 'Projectile Damage')?.tier).toBeUndefined()
    const magic = [...snapshot.flasks, ...snapshot.charms].filter((i) => i?.rarity === 'magic')
    expect(magic.flatMap((i) => explicitLines(i ?? undefined)).some((l) => l.tier)).toBe(false)
  })
})

describe('desecrated placement', () => {
  it('puts a desecrated suffix last in the explicit block', () => {
    const helm = tieredSnapshot().equipment.Helm
    expect(helm?.sections.some((s) => s.kind === 'desecrated')).toBe(false)
    const lines = explicitLines(helm)
    expect(lines.at(-1)?.text).toBe('27% increased Critical Hit Chance')
    expect(lines.at(-1)?.tier?.affix).toBe('suffix')
  })

  it('keeps unbadged desecrated lines inside the explicit block', () => {
    for (const tierData of [dataset, null]) {
      const gloves = tieredSnapshot(tierData).equipment.Gloves
      expect(gloves?.sections.some((s) => s.kind === 'desecrated')).toBe(false)
      expect(explicitLines(gloves).at(-1)?.text).toBe('+64% Surpassing chance to fire an additional Projectile')
    }
  })

  it('slots a desecrated prefix after the last prefix', () => {
    const ring = tieredSnapshot().equipment.Ring
    const texts = explicitLines(ring).map((l) => l.text)
    // Ring prefixes: phys, fire, then the desecrated lightning; suffixes follow.
    expect(texts.indexOf('Adds 1 to 48 Lightning damage to Attacks')).toBe(2)
    expect(explicitLines(ring).map((l) => l.tier?.affix)).toEqual([
      'prefix',
      'prefix',
      'prefix',
      'suffix',
      'suffix',
      'suffix',
    ])
  })

  it('leaves a valid snapshot with no internal markers', () => {
    for (const tierData of [dataset, null]) {
      const check = validateSnapshot(tieredSnapshot(tierData))
      expect(check.ok, check.ok ? '' : check.issues.join('; ')).toBe(true)
    }
  })
})
