import type { StatFilter } from '../../trade'
import type { MatchContext } from '../context'
import { matchModToStat } from '../mod-matcher'
import { accumulatePseudo, PSEUDO_CONTRIBUTIONS } from '../pseudo'

// PoE2 socketed-rune mods. The clipboard tags them with a trailing " (rune)"
// suffix (stripped upstream in clipboard.ts) and trade2 indexes them under the
// dedicated rune.* stat group -- the same numeric id as the explicit, different
// prefix. They always feed pseudos (Total Elemental Resistance etc.) so the item's
// real totals stay correct; the renderer keeps the rune row visible regardless of
// its enabled state (runes are an intrinsic, shown part of the item like enchants).
export function buildRuneFilters(ctx: MatchContext): StatFilter[] {
  const { itemInfo, pseudoAccumulator, isWeapon } = ctx
  const runes = itemInfo?.runes
  if (!runes || runes.length === 0) return []

  const out: StatFilter[] = []
  for (const rune of runes) {
    const matched = matchModToStat(rune, false, 'rune')
    if (!matched) continue
    // Feed pseudos. Skip attribute-derived contributions (Str -> Life, Int -> Mana):
    // the explicit pipeline defers those until it knows the pseudo has a real
    // contributor on the item, and replicating that across producers is out of
    // scope for v1. Direct mods (resistances, life, mana, added ele damage) fold in.
    const contribs = PSEUDO_CONTRIBUTIONS[matched.statId]?.filter((c) => !c.attributeDerived)
    // A rune whose roll folds into a pseudo (resistances, life, ...) defaults OFF so the
    // search isn't double-constrained by both the rune id and the pseudo -- the same
    // suppression the explicit producer applies. Runes with no pseudo default ON like
    // enchants. Either way the renderer keeps the rune row visible.
    const suppressesSourceRow = !!contribs && contribs.length > 0 && contribs.some((c) => !c.keepSourceRow)
    if (contribs && contribs.length > 0 && matched.value != null) {
      accumulatePseudo(pseudoAccumulator, contribs, matched.value, isWeapon)
    }
    out.push({
      id: matched.statId,
      text: rune,
      value: matched.value,
      min: matched.value,
      max: null,
      enabled: !suppressesSourceRow,
      type: 'rune',
      option: matched.option,
      aggregated: matched.aggregated,
      fixedRoll: true,
    })
  }
  return out
}
