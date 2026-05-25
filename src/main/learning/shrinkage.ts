// src/main/learning/shrinkage.ts
import type { AdaptiveMode } from './types'

export const PRIOR_STRENGTH = 2
export const SHIPPED_PRIOR_ENABLED = 0.6
export const SHIPPED_PRIOR_DISABLED = 0.4
export const EAGER_PIVOT = 0.5
export const EAGER_MARGIN = 0.05
export const EAGER_MIN_MASS = 2
export const CONSERVATIVE_HI = 0.7
export const CONSERVATIVE_LO = 0.3
export const CONSERVATIVE_MIN_SPECIFIC_MASS = 5

export interface RungSample {
  enabledWeight: number
  shownWeight: number
  isGlobal: boolean
}

export interface Blend {
  rate: number
  totalMass: number
  specificMass: number
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
  let totalMass = 0
  let specificMass = 0
  for (const s of samples) {
    if (s.shownWeight <= 0) continue
    posterior = (priorStrength * posterior + s.enabledWeight) / (priorStrength + s.shownWeight)
    totalMass += s.shownWeight
    if (!s.isGlobal) specificMass += s.shownWeight
  }
  return { rate: posterior, totalMass, specificMass }
}

/** Returns the learned enabled-state, or null when not confident enough for the mode. */
export function decide(blend: Blend, mode: Exclude<AdaptiveMode, 'off'>): boolean | null {
  if (mode === 'conservative') {
    if (blend.specificMass < CONSERVATIVE_MIN_SPECIFIC_MASS) return null
    if (blend.rate >= CONSERVATIVE_HI) return true
    if (blend.rate <= CONSERVATIVE_LO) return false
    return null
  }
  if (blend.totalMass < EAGER_MIN_MASS) return null
  if (blend.rate >= EAGER_PIVOT + EAGER_MARGIN) return true
  if (blend.rate <= EAGER_PIVOT - EAGER_MARGIN) return false
  return null
}
