import { describe, it, expect } from 'vitest'
import data from '@shared/data/items/premium-mods.json'
import type { PremiumModsData, UniqueOverrideEntry, UniqueOverride } from '@shared/data/items/premium-mods-types'

const typed = data as unknown as PremiumModsData

const STAT_ID_RE = /^[a-z]+\.[a-z0-9_]+$/

function isUniqueOverride(entry: UniqueOverrideEntry): entry is UniqueOverride {
  return !Array.isArray(entry)
}

describe('premium-mods.json bundled dataset sanity guard', () => {
  it('has schemaVersion 2', () => {
    expect(typed.schemaVersion).toBe(2)
  })

  it('has zero legacy array entries in poe1 and poe2', () => {
    for (const [game, map] of [
      ['poe1', typed.poe1],
      ['poe2', typed.poe2],
    ] as const) {
      for (const [name, entry] of Object.entries(map)) {
        expect(
          Array.isArray(entry),
          `${game}.${name} is a legacy array entry - must be migrated to UniqueOverride`,
        ).toBe(false)
      }
    }
  })

  it('every object entry has a valid mode and confidence:verified', () => {
    const validModes = new Set(['stat_list', 'all_explicits', 'none'])
    for (const [game, map] of [
      ['poe1', typed.poe1],
      ['poe2', typed.poe2],
    ] as const) {
      for (const [name, entry] of Object.entries(map)) {
        if (!isUniqueOverride(entry)) continue
        expect(validModes.has(entry.mode), `${game}.${name}: invalid mode "${entry.mode}"`).toBe(true)
        expect(entry.confidence, `${game}.${name}: confidence must be "verified"`).toBe('verified')
      }
    }
  })

  it('every stat_list entry has a non-empty mods array with valid ids and texts', () => {
    for (const [game, map] of [
      ['poe1', typed.poe1],
      ['poe2', typed.poe2],
    ] as const) {
      for (const [name, entry] of Object.entries(map)) {
        if (!isUniqueOverride(entry) || entry.mode !== 'stat_list') continue
        expect(
          Array.isArray(entry.mods) && entry.mods.length > 0,
          `${game}.${name}: stat_list must have a non-empty mods array`,
        ).toBe(true)
        for (const mod of entry.mods ?? []) {
          expect(
            STAT_ID_RE.test(mod.id),
            `${game}.${name}: mod id "${mod.id}" does not match /^[a-z]+\\.[a-z0-9_]+$/`,
          ).toBe(true)
          if (mod.text !== undefined) {
            expect(mod.text.length > 0, `${game}.${name}: mod id "${mod.id}" has an empty text field`).toBe(true)
          }
        }
      }
    }
  })

  it('every mod direction, when present, is "higher" or "lower"', () => {
    for (const [game, map] of [
      ['poe1', typed.poe1],
      ['poe2', typed.poe2],
    ] as const) {
      for (const [name, entry] of Object.entries(map)) {
        if (!isUniqueOverride(entry) || entry.mode !== 'stat_list') continue
        for (const mod of entry.mods ?? []) {
          if (mod.direction !== undefined) {
            expect(
              mod.direction === 'higher' || mod.direction === 'lower',
              `${game}.${name}: mod "${mod.id}" has invalid direction "${mod.direction}"`,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('every mod tier, when present, is "primary" or "secondary"', () => {
    for (const [game, map] of [
      ['poe1', typed.poe1],
      ['poe2', typed.poe2],
    ] as const) {
      for (const [name, entry] of Object.entries(map)) {
        if (!isUniqueOverride(entry) || entry.mode !== 'stat_list') continue
        for (const mod of entry.mods ?? []) {
          if (mod.tier !== undefined) {
            expect(
              mod.tier === 'primary' || mod.tier === 'secondary',
              `${game}.${name}: mod "${mod.id}" has invalid tier "${mod.tier}"`,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('no duplicate mod ids within any single stat_list entry', () => {
    for (const [game, map] of [
      ['poe1', typed.poe1],
      ['poe2', typed.poe2],
    ] as const) {
      for (const [name, entry] of Object.entries(map)) {
        if (!isUniqueOverride(entry) || entry.mode !== 'stat_list') continue
        const seen = new Set<string>()
        for (const mod of entry.mods ?? []) {
          expect(seen.has(mod.id), `${game}.${name}: duplicate mod id "${mod.id}"`).toBe(false)
          seen.add(mod.id)
        }
      }
    }
  })

  it('itemClassRules: each has game, itemClass, mode all_explicits; lowerIsBetter ids match stat-id pattern', () => {
    for (const rule of typed.itemClassRules ?? []) {
      expect(rule.game === 'poe1' || rule.game === 'poe2').toBe(true)
      expect(typeof rule.itemClass).toBe('string')
      expect(rule.itemClass.length).toBeGreaterThan(0)
      expect(rule.mode).toBe('all_explicits')
      for (const id of rule.lowerIsBetter ?? []) {
        expect(
          STAT_ID_RE.test(id),
          `itemClassRules[${rule.itemClass}]: lowerIsBetter id "${id}" does not match stat-id pattern`,
        ).toBe(true)
      }
    }
  })

  it('factionRules: each has a non-empty uniques array and corrupted:false; no duplicate names within a rule', () => {
    for (const rule of typed.factionRules ?? []) {
      expect(
        Array.isArray(rule.uniques) && rule.uniques.length > 0,
        `factionRule tag "${rule.tag}": uniques must be a non-empty array`,
      ).toBe(true)
      expect(
        rule.defaultFilters.corrupted,
        `factionRule tag "${rule.tag}": defaultFilters.corrupted must be false`,
      ).toBe(false)
      const seen = new Set<string>()
      for (const unique of rule.uniques) {
        expect(seen.has(unique), `factionRule tag "${rule.tag}": duplicate unique name "${unique}"`).toBe(false)
        seen.add(unique)
      }
    }
  })
})
