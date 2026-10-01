export interface StatsGateDeps {
  isLoaded: () => boolean
  load: () => Promise<unknown>
  /** Runs once after a load this gate started, if the stats are then loaded. */
  onLoaded: () => void
}

/** Synchronous "are trade stats ready" check. When they aren't, it starts one load
 *  (at most one in flight) and calls `onLoaded` after it, so a publish built without
 *  price checks gets republished with them. Never awaits. */
export function createStatsGate(deps: StatsGateDeps): () => boolean {
  let pending = false
  return () => {
    if (deps.isLoaded()) return true
    if (!pending) {
      pending = true
      deps
        .load()
        .catch(() => {})
        .then(() => {
          if (deps.isLoaded()) deps.onLoaded()
        })
        .catch(() => {})
        .finally(() => {
          pending = false
        })
    }
    return false
  }
}
