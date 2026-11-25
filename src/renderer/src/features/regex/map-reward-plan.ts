import { MAP_REWARD_LABELS, type MapMod, type MapRewardId, type MapRewards } from '@shared/data/regex/map-mods'
import type { QualifierValues } from './Qualifiers'

const rewardIds = Object.keys(MAP_REWARD_LABELS) as MapRewardId[]
export const DEFAULT_REWARD_TARGETS = { morecurrency: 90, rarity: 70 }

export function rewardTargets(qualifiers: QualifierValues): MapRewards {
  return Object.fromEntries(rewardIds.filter((id) => (qualifiers[id] ?? 0) > 0).map((id) => [id, qualifiers[id]]))
}

export function formatRewards(rewards: MapRewards = {}, minimum = false): string {
  return rewardIds
    .filter((id) => rewards[id] != null)
    .map((id) => (minimum ? `${MAP_REWARD_LABELS[id]} ≥${rewards[id]}%` : `+${rewards[id]}% ${MAP_REWARD_LABELS[id]}`))
    .join(' · ')
}

/** Each target gets equal weight. A mod earns the fraction of each minimum it covers,
 * capped at one. Ranking only guides review; the regex always tests the map totals. */
export function rankMapRewards(mods: MapMod[], targets: MapRewards) {
  const active = rewardIds.filter((id) => (targets[id] ?? 0) > 0)
  const ranked = mods.map((mod) => ({
    mod,
    score: active.reduce((sum, id) => sum + Math.min(1, (mod.rewards?.[id] ?? 0) / targets[id]!), 0),
  }))
  ranked.sort((a, b) => b.score - a.score || a.mod.text.localeCompare(b.mod.text))
  return [
    {
      key: 'contributors',
      label: 'Contributes to your minimums',
      mods: ranked.filter((r) => r.score > 0).map((r) => r.mod),
    },
    { key: 'other', label: 'Other modifiers', mods: ranked.filter((r) => r.score === 0).map((r) => r.mod) },
  ].filter((group) => group.mods.length)
}
