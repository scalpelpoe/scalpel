import { getPremiumMods } from '@main/premium-mods'
import { getPoeVersion } from '@main/game-state'
import type { ItemInfo } from '../context'
import type { OverrideModSpec, OverrideMode, UniqueOverride } from '@shared/data/items/premium-mods-types'

/** Normalized result of resolving all applicable override rules for a unique item.
 *  Callers should check for null before using -- null means no override applies. */
export interface ResolvedOverride {
  /** Override pricing mode; null when no mode is specified (faction-only or legacy entry). */
  mode: OverrideMode | null
  /** Trade stat id -> spec map for explicitly listed mods (stat_list mode). */
  mods: Map<string, OverrideModSpec>
  /** Stat ids where a lower roll is better; drawn from the matching class rule. */
  lowerIsBetter: Set<string>
  /** Non-stat trade filters to apply (e.g. misc.corrupted); merged from entry + class rule. */
  nonStatFilters: Set<string>
  /** Trade search defaults to prefill (e.g. corrupted); faction rules merge on top of entry. */
  defaultFilters: { corrupted?: boolean }
}

/** Look up the applicable override layer for a unique item.
 *
 *  Resolution order:
 *  1. Exact unique name in the per-game map.
 *  2. Family prefix: entry with familyMatch=true whose key is a prefix of the item name.
 *  3. Item-class rule matching game + itemClass (+ optional rarity).
 *  4. Faction rules listing the unique by name.
 *
 *  Per-unique entry mode wins over class-rule mode.
 *  Faction defaultFilters merge on top of entry defaultFilters.
 *  Returns null when none of the above produce a result. */
export function resolveUniqueOverride(itemInfo: ItemInfo | undefined): ResolvedOverride | null {
  const data = getPremiumMods()
  if (!data || itemInfo?.rarity !== 'Unique') return null
  const game = getPoeVersion() === 2 ? 'poe2' : 'poe1'
  const name = itemInfo.name
  let entry: UniqueOverride | undefined
  if (name) {
    const byGame = data[game] ?? {}
    const exact = byGame[name]
    if (exact && !Array.isArray(exact)) entry = exact
    if (!entry) {
      for (const [key, value] of Object.entries(byGame)) {
        if (!Array.isArray(value) && value.familyMatch && name.startsWith(key)) {
          entry = value
          break
        }
      }
    }
  }
  const classRule = (data.itemClassRules ?? []).find(
    (r) => r.game === game && r.itemClass === itemInfo.itemClass && (!r.rarity || r.rarity === itemInfo.rarity),
  )
  const factionRules = name ? (data.factionRules ?? []).filter((r) => r.game === game && r.uniques.includes(name)) : []
  if (!entry && !classRule && factionRules.length === 0) return null
  const mods = new Map<string, OverrideModSpec>()
  for (const m of entry?.mods ?? []) mods.set(m.id, m)
  const defaultFilters: { corrupted?: boolean } = { ...entry?.defaultFilters }
  for (const r of factionRules) Object.assign(defaultFilters, r.defaultFilters)
  return {
    mode: entry?.mode ?? classRule?.mode ?? null,
    mods,
    lowerIsBetter: new Set(classRule?.lowerIsBetter ?? []),
    nonStatFilters: new Set([...(entry?.nonStatFilters ?? []), ...(classRule?.nonStatFilters ?? [])]),
    defaultFilters,
  }
}
