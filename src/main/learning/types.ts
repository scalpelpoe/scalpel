// src/main/learning/types.ts

export type { AdaptiveMode } from '../../shared/types'

/** A decayed per-(rung, chip) counter. */
export interface CounterRecord {
  /** Decayed sum of observations where the chip was enabled. */
  enabledWeight: number
  /** Decayed sum of all observations where the chip was shown. */
  shownWeight: number
  /** Epoch ms of the last merge, used to decay on next update/read. */
  lastTs: number
}

/** The set of back-off context keys for an item, ordered GENERAL -> SPECIFIC. */
export interface LearningContext {
  rarity: string
  itemClass: string
  relevanceAxis: string | null
  influence: string[]
  uniqueName?: string
  /** Rung keys, general first (global) to specific last. */
  rungKeys: string[]
}
