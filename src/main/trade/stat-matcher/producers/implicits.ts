import type { StatFilter } from '../../trade'
import { findAdvMod } from '../adv-mods'
import type { MatchContext } from '../context'
import { matchModToStat } from '../mod-matcher'
import { accumulatePseudo, PSEUDO_CONTRIBUTIONS } from '../pseudo'

export function processImplicits(ctx: MatchContext): StatFilter[] {
  const { implicits, itemInfo, advancedMods, isWeapon, pseudoAccumulator } = ctx
  const out: StatFilter[] = []

  for (const mod of implicits) {
    const cleaned = mod.replace(/\s*\(implicit\)\s*$/i, '').trim()
    // Try implicit stats first, then fall back to explicit (non-local, then local) and remap the ID
    const matched =
      matchModToStat(cleaned, false, 'implicit') ??
      (() => {
        const fallback = matchModToStat(cleaned, false, 'explicit') ?? matchModToStat(cleaned, true, 'explicit')
        if (!fallback) return null
        return { ...fallback, statId: `implicit.${fallback.statId.split('.')[1]}` }
      })()
    if (matched) {
      // Skip "X per Y" mods -- they're conditional and shouldn't inflate pseudo totals
      const isPerMod = /\bper\b/i.test(cleaned)
      const pseudoList = PSEUDO_CONTRIBUTIONS[matched.statId]
      if (pseudoList && matched.value != null && !isPerMod) {
        accumulatePseudo(pseudoAccumulator, pseudoList, matched.value, isWeapon)
      }
      // Check if this implicit is from eldritch (Searing Exarch / Eater of Worlds)
      let _isEldritch = false
      if (advancedMods) {
        const advMod = findAdvMod(advancedMods, cleaned, 'implicit')
        if (advMod?.eldritch) _isEldritch = true
      }
      out.push({
        id: matched.statId,
        text: cleaned,
        value: matched.value,
        min: matched.option ? null : matched.value,
        max: null,
        enabled:
          !!itemInfo?.corrupted ||
          !!itemInfo?.synthesised ||
          (!!matched.option && itemInfo?.itemClass !== 'Expedition Logbooks') ||
          itemInfo?.itemClass === 'Maps',
        type: 'implicit',
        option: matched.option,
      })
    }
  }

  return out
}
