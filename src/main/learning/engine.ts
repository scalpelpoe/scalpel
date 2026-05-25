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

/** Mutates statFilters in place; returns the ids of chips whose default it overrode. */
export function applyLearnedDefaults(
  statFilters: StatFilter[],
  item: PoeItem,
  mode: AdaptiveMode,
  store: CounterStore,
  now: number,
): string[] {
  if (mode === 'off') return []
  const ctx = deriveLearningContext(item)
  const learned: string[] = []
  for (const f of statFilters) {
    if (!isLearnable(f)) continue
    const samples: RungSample[] = ctx.rungKeys.map((k) => ({
      ...store.sample(k, f.id, now),
      isGlobal: k === GLOBAL_KEY,
    }))
    const blend = blendEnableRate(samples, f.enabled)
    const decision = decide(blend, mode)
    if (decision !== null && decision !== f.enabled) {
      f.enabled = decision
      f.learned = true
      learned.push(f.id)
    }
  }
  return learned
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
