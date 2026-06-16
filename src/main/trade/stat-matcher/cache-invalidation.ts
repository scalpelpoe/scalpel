import { resetPseudoMap } from './pseudo'
import { invalidateStatsCache } from './stats-cache'

/** Invalidate all version-dependent stat-matcher caches: stat entries, in-flight
 *  dedup, lazy text map, refresh timer, and the pseudo contribution/weight maps.
 *  Kept in its own file so callers don't pull the full stat-matcher barrel. */
export function invalidateStatMatcherCaches(): void {
  invalidateStatsCache()
  resetPseudoMap()
}
