// src/main/learning/shrinkage.ts
import type { AdaptiveMode } from './types'

export const PRIOR_STRENGTH = 2
export const SHIPPED_PRIOR_ENABLED = 0.6
export const SHIPPED_PRIOR_DISABLED = 0.4
export const EAGER_PIVOT = 0.5
export const EAGER_MARGIN = 0.05
/** Eager flips a default after this many consistent observations of the item's context.
 *  Set to 2 (not 3) to offset the capture-recording lag: a session's choice isn't reflected
 *  until ~2 re-checks later, so 2 here surfaces around the 3rd-4th re-check of the same item. */
export const EAGER_MIN_OBS = 2
export const CONSERVATIVE_HI = 0.7
export const CONSERVATIVE_LO = 0.3
/** Conservative needs more specific-context evidence before changing a default. */
export const CONSERVATIVE_MIN_OBS = 5

export interface RungSample {
  enabledWeight: number
  shownWeight: number
  isGlobal: boolean
}

export interface Blend {
  rate: number
  /** Decayed observation count of the best-supported specific (non-global) context -
   *  i.e. how many times this kind of item has been seen. Drives the "enough evidence
   *  to act" gate. The global rung still shapes `rate` (soft cross-item transfer) but
   *  does not count here, so a default only changes after the user has seen this kind
   *  of item enough times - not on first sight via transfer alone. */
  specificObs: number
}

/**
 * Recursive empirical-Bayes shrinkage. `samples` are ordered general -> specific.
 * Each rung's posterior becomes the next rung's prior; the shipped default seeds the prior.
 */
export function blendEnableRate(
  samples: RungSample[],
  shippedDefaultEnabled: boolean,
  priorStrength: number = PRIOR_STRENGTH,
): Blend {
  let posterior = shippedDefaultEnabled ? SHIPPED_PRIOR_ENABLED : SHIPPED_PRIOR_DISABLED
  let specificObs = 0
  for (const s of samples) {
    if (s.shownWeight <= 0) continue
    posterior = (priorStrength * posterior + s.enabledWeight) / (priorStrength + s.shownWeight)
    if (!s.isGlobal && s.shownWeight > specificObs) specificObs = s.shownWeight
  }
  return { rate: posterior, specificObs }
}

/** Returns the learned enabled-state, or null when not confident enough for the mode.
 *  `specificObs` is rounded so within-session decay can't nudge "N observations" below N. */
export function decide(blend: Blend, mode: Exclude<AdaptiveMode, 'off'>): boolean | null {
  const obs = Math.round(blend.specificObs)
  if (mode === 'conservative') {
    if (obs < CONSERVATIVE_MIN_OBS) return null
    if (blend.rate >= CONSERVATIVE_HI) return true
    if (blend.rate <= CONSERVATIVE_LO) return false
    return null
  }
  if (obs < EAGER_MIN_OBS) return null
  if (blend.rate >= EAGER_PIVOT + EAGER_MARGIN) return true
  if (blend.rate <= EAGER_PIVOT - EAGER_MARGIN) return false
  return null
}
