import type { StatFilter } from '../../trade'
import { PSEUDO_WEIGHT_GROUPS, type PseudoAccumulatorEntry } from '../pseudo'

// Add pseudo stats at the top of the list. Pack the rolled-up total into
// the label the same way defense chips do ("Armour: 450") so the user can
// see what the accumulator summed to without having to look at the value
// chip next to the row.
export function emitPseudoFilters(
  pseudoAccumulator: Record<string, PseudoAccumulatorEntry>,
  pct: number,
): StatFilter[] {
  return (
    Object.entries(pseudoAccumulator)
      // Drop pseudos that didn't reach their quorum -- e.g. consolidated added-ele-
      // damage shows only when 2+ colors contributed; a single-color roll already
      // has its own filter row and the pseudo would just duplicate it.
      .filter(([, data]) => data.count >= data.minCount)
      .map(([id, data]) => {
        // Attribute contributions use a 0.5 multiplier (2 Str = 1 Life, 2 Int = 1 Mana),
        // so the running total can be fractional. Floor at emission rather than per-
        // contribution so two odd-Str sources still pool to the same Life the game
        // would compute (game pools Str first, then halves).
        const total = data.total < 0 ? Math.ceil(data.total) : Math.floor(data.total)
        return {
          id,
          text: `${data.pseudoLabel}: ${total}`,
          value: total,
          min: total < 0 ? Math.ceil(total * (2 - pct)) : Math.floor(total * pct),
          max: null,
          enabled: true,
          type: 'pseudo',
          weightFilters: [...(PSEUDO_WEIGHT_GROUPS[id] ?? [])],
        } satisfies StatFilter
      })
  )
}
