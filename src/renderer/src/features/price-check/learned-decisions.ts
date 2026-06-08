import type { StatFilter } from './types'

/**
 * Apply the learning engine's decisions as the final layer over the current
 * (post-base-mode) filters. A chip is marked `learned` only when the decision
 * changes its enabled state, so the icon appears only on genuine deviations from
 * the default the user would otherwise see. Defaults to an empty map so a
 * price-check restored across an auto-update from a pre-feature build (no
 * `learnedDecisions` in the saved payload) does not throw.
 */
export function applyLearnedDecisions(filters: StatFilter[], decisions: Record<string, boolean> = {}): StatFilter[] {
  return filters.map((f) => {
    if (!(f.id in decisions)) return f
    const want = decisions[f.id]
    if (want === f.enabled) return f
    return { ...f, enabled: want, learned: true }
  })
}
