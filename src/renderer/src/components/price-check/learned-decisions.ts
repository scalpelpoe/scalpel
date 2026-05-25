import type { StatFilter } from './types'

/**
 * Apply the learning engine's decisions as the final layer over the current
 * (post-base-mode) filters. A chip is marked `learned` only when the decision
 * changes its enabled state - so the brain icon appears only on genuine
 * deviations from the default the user would otherwise see.
 */
export function applyLearnedDecisions(filters: StatFilter[], decisions: Record<string, boolean>): StatFilter[] {
  return filters.map((f) => {
    if (!(f.id in decisions)) return f
    const want = decisions[f.id]
    if (want === f.enabled) return f
    return { ...f, enabled: want, learned: true }
  })
}
