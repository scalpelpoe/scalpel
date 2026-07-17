import type { StatFilter } from '../../trade'
import { findAdvMod } from '../adv-mods'
import type { MatchContext } from '../context'
import { matchModToStat } from '../mod-matcher'
import { accumulatePseudo, PSEUDO_CONTRIBUTIONS } from '../pseudo'
import { dropFragmentDuplicates, GEM_LEVEL_MOD } from './explicits'

export function processImplicits(ctx: MatchContext): StatFilter[] {
  const { implicits, itemInfo, advancedMods, isWeapon, isTablet, pseudoAccumulator } = ctx
  const out: StatFilter[] = []

  for (const mod of implicits) {
    let cleaned = mod.replace(/\s*\(implicit\)\s*$/i, '').trim()
    // Try implicit stats first, then fall back to explicit (non-local, then local) and remap the ID
    const matched =
      matchModToStat(cleaned, false, 'implicit') ??
      (() => {
        const fallback = matchModToStat(cleaned, false, 'explicit') ?? matchModToStat(cleaned, true, 'explicit')
        if (!fallback) return null
        return { ...fallback, statId: `implicit.${fallback.statId.split('.')[1]}` }
      })()
    if (matched) {
      const advMod = advancedMods ? findAdvMod(advancedMods, cleaned, 'implicit') : undefined
      // Catalyst quality (and other magnitude sources) scale an implicit's roll the
      // same way they scale affixes; GGG annotates the advanced header with
      // "-- N% Increased", parsed onto the AdvancedMod as magnitudeMultiplier. Mirror
      // the explicit path so the chip shows the real scaled value and the trade
      // search min matches (#477).
      if (advMod?.magnitudeMultiplier && matched.value != null) {
        const oldVal = matched.value
        matched.value = Math.trunc(oldVal * advMod.magnitudeMultiplier)
        cleaned = cleaned.replace(String(Math.abs(oldVal)), String(Math.abs(matched.value)))
      }
      // Skip "X per Y" mods -- they're conditional and shouldn't inflate pseudo totals
      const isPerMod = /\bper\b/i.test(cleaned)
      const pseudoList = PSEUDO_CONTRIBUTIONS[matched.statId]
      if (pseudoList && matched.value != null && !isPerMod) {
        accumulatePseudo(pseudoAccumulator, pseudoList, matched.value, isWeapon)
      }
      // Check if this implicit is from eldritch (Searing Exarch / Eater of Worlds)
      let _isEldritch = false
      if (advMod?.eldritch) _isEldritch = true
      // Gem-level implicits (e.g. corrupted "+1 to Level of all Skill Gems" on
      // amulets) are discrete brackets -- pin max to the exact rolled value so
      // the search doesn't merge with pricier +2 listings.
      const isGemLevelMod = GEM_LEVEL_MOD.test(cleaned)
      out.push({
        id: matched.statId,
        text: cleaned,
        value: matched.value,
        min: matched.option ? null : matched.value,
        max: isGemLevelMod && matched.value != null ? matched.value : null,
        enabled:
          !!itemInfo?.corrupted ||
          !!itemInfo?.synthesised ||
          (!!matched.option && itemInfo?.itemClass !== 'Expedition Logbooks') ||
          itemInfo?.itemClass === 'Maps' ||
          // A tablet's sole implicit ("Adds X to a Map / # uses remaining") is its
          // defining property and what buyers filter on, so default it on with the
          // parsed uses count as the min.
          isTablet,
        type: 'implicit',
        option: matched.option,
        aggregated: matched.aggregated,
      })
    }
  }

  return dropFragmentDuplicates(out)
}
