// src/main/learning/engine.ts
import type { PoeItem } from '../../shared/types'
import type { StatFilter } from '../trade/trade'
import type { AdaptiveMode } from './types'
import { deriveLearningContext, GLOBAL_KEY } from './context-key'
import { CounterStore } from './counter-store'
import { blendEnableRate, decide, type RungSample } from './shrinkage'

/** v1: stat-mod lines only. Property/ternary/min-max chips are phase 2. */
export const LEARNABLE_TYPES = new Set(['explicit', 'implicit', 'pseudo', 'crafted', 'fractured', 'enchant', 'imbued'])

export function isLearnable(f: { type: string }): boolean {
  return LEARNABLE_TYPES.has(f.type)
}

/**
 * Returns the engine's confident enable/disable opinion per learnable chip
 * (chipId -> desired enabled state). Chips with no confident decision are omitted.
 * Pure read - does NOT mutate statFilters. The renderer applies these on top of
 * the (post-base-mode) default and marks chips it actually changes as learned.
 */
export function computeLearnedDecisions(
  statFilters: StatFilter[],
  item: PoeItem,
  mode: AdaptiveMode,
  store: CounterStore,
  now: number,
): Record<string, boolean> {
  const decisions: Record<string, boolean> = {}
  if (mode === 'off') return decisions
  const ctx = deriveLearningContext(item)
  for (const f of statFilters) {
    if (!isLearnable(f)) continue
    const samples: RungSample[] = ctx.rungKeys.map((k) => ({
      ...store.sample(k, f.id, now),
      isGlobal: k === GLOBAL_KEY,
    }))
    // `f.enabled` here is the pre-base-mode (shipped) default and only seeds the
    // shrinkage prior. The renderer compares the decision against the POST-base-mode
    // state to decide what counts as a learned change - the two baselines differ on purpose.
    const blend = blendEnableRate(samples, f.enabled)
    const decision = decide(blend, mode)
    if (decision !== null) decisions[f.id] = decision
  }
  return decisions
}

/** Records one session's final chip states. Runs in ALL modes (including off). */
export function captureObservation(
  item: PoeItem,
  chips: Array<{ id: string; type: string; enabled: boolean }>,
  store: CounterStore,
  now: number,
): void {
  const ctx = deriveLearningContext(item)
  for (const c of chips) {
    if (!isLearnable(c)) continue
    store.recordObservation(ctx.rungKeys, c.id, c.enabled, now)
  }
  store.persist()
}
