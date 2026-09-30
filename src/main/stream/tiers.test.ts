import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import data from '@shared/data/tiers/tiers-poe2.json'
import type { TierDataset } from '@shared/data/tiers/types'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { NinjaCharacterSchema } from './sources/ninja-types'
import { applyTiers, resolveModTier } from './tiers'

const dataset = data as unknown as TierDataset
const character = NinjaCharacterSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '__fixtures__/ninja-character.json'), 'utf8')),
)

function tieredSnapshot() {
  const normalized = normalizeCharacter(character, { now: new Date('2026-09-29T12:00:00Z'), hideCharacterName: false })
  for (const [item, raw] of normalized.sourceOf) applyTiers(item, raw, dataset)
  return normalized.snapshot
}

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

describe('applyTiers', () => {
  it('badges desecrated ring mods from their rolls', () => {
    const ring = tieredSnapshot().equipment.Ring2
    const lines = ring?.sections.find((s) => s.kind === 'desecrated')?.lines ?? []
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
      .flatMap(
        (i) =>
          i?.sections.filter((s) => s.kind === 'explicit' || s.kind === 'desecrated').flatMap((s) => s.lines) ?? [],
      )
    const tagged = rareLines.filter((l) => l.tier).length
    expect(rareLines.length).toBeGreaterThan(10)
    expect(tagged / rareLines.length).toBeGreaterThan(0.6)
  })
})
