import { getPremiumMods } from '@main/premium-mods'
import { statTextById, _resetStatTextCacheForTests } from '../stats-cache'
import { getPoeVersion } from '@main/game-state'
import type { ItemInfo } from '../context'
import { baseId } from '../stat-id'

// Matches a bare stat id like "explicit.stat_2422708892" (no option suffix).
const STAT_ID_RE = /^[a-z]+\.[a-z0-9_]+$/

export function _resetPremiumMatchCacheForTests(): void {
  _resetStatTextCacheForTests()
}

export function isPremiumMod(itemInfo: ItemInfo | undefined, statId: string): boolean {
  const data = getPremiumMods()
  if (!data) return false
  if (itemInfo?.rarity !== 'Unique' || !itemInfo.name) return false
  const game = getPoeVersion() === 2 ? 'poe2' : 'poe1'
  const entry = data[game]?.[itemInfo.name]
  if (!entry) return false

  // v2 UniqueOverride object - stat_list primary mods are the premium set;
  // secondary mods are shown-but-off (not premium by default).
  if (!Array.isArray(entry)) {
    if (entry.mode !== 'stat_list') return false
    const base = baseId(statId)
    return (entry.mods ?? []).some((spec) => spec.id === base && (spec.tier ?? 'primary') === 'primary')
  }

  // v1 legacy string[] - text or bare stat id entries that are default-ON premium mods.
  if (entry.length === 0) return false
  for (const text of entry) {
    if (STAT_ID_RE.test(text)) {
      // Base-id entry: matches any flattened option variant sharing the same base.
      if (text === baseId(statId)) return true
    } else {
      // Text entry: compare against the resolved canonical text.
      const resolved = statTextById(statId)
      if (resolved && resolved === text) return true
    }
  }
  return false
}
