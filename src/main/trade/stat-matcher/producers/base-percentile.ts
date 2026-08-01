import { getPoeVersion } from '@main/game-state'
import { getDefenceBounds } from '@shared/data/items/defence-bounds'
import type { StatFilter } from '../../trade'
import { computeBasePercentile } from '../base-percentile'
import type { MatchContext } from '../context'

// Rarities whose base roll is worth filtering on. Uniques are excluded: the
// price check forces Base mode on uniques (which strips non-flagged rows),
// and "percentile of the unique's base" is a niche search.
const ALLOWED_RARITIES = new Set(['Normal', 'Magic', 'Rare'])

// PoE1 base defence percentile chip (issue #467). Default off, except a
// provably perfect base (100%) default-enables - perfect bases carry a
// crafting premium the search should reflect.
export function buildBasePercentileFilter(ctx: MatchContext): StatFilter[] {
  const { itemInfo, defenses } = ctx
  if (!itemInfo || !defenses) return []
  if (getPoeVersion() !== 1) return []
  if (!ALLOWED_RARITIES.has(itemInfo.rarity)) return []
  // Unidentified display semantics for hidden local mods are unverified; a
  // wrong guess would clamp to a false 100 and default-enable a wrong filter.
  if (itemInfo.identified === false) return []
  const bounds = getDefenceBounds(itemInfo.baseType)
  if (!bounds) return []

  const pct = computeBasePercentile({
    bounds,
    defenses,
    quality: itemInfo.quality,
    modLines: [...ctx.implicits, ...ctx.explicits],
  })
  if (pct == null) return []

  // The display can collide two neighbouring rolls; lo/hi carry that honestly.
  // Default-enable only a (near-)certain perfect base: hi 100 with at most one
  // percentile of uncertainty. min is lo so an enabled search never excludes
  // the item's own twins.
  const { lo, hi } = pct
  return [
    {
      id: 'defence.base_percentile',
      text: `Base Percentile: ${lo === hi ? `${hi}%` : `${lo}-${hi}%`}`,
      value: hi,
      min: lo,
      max: null,
      enabled: hi === 100 && lo >= 99,
      type: 'defence',
    },
  ]
}
