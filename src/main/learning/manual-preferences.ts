// src/main/learning/manual-preferences.ts
import type { PoeItem } from '@shared/types'
import { deriveLearningContext, GLOBAL_KEY, pinScopeKey } from './context-key'
import type { CounterStore } from './counter-store'
import type { OverrideStore } from './override-store'

/** Pins the chip's current enabled state at the item's pin scope. */
export function setManualPreference(item: PoeItem, chipId: string, enabled: boolean, overrides: OverrideStore): void {
  overrides.set(pinScopeKey(item), chipId, enabled)
}

/** Removes any pin for the chip at the item's scope and forgets the chip's
 *  statistical counters at the item's specific rungs. Without the forget, an
 *  eager-mode engine would re-surface the same decision on the next check and
 *  "Unset" would appear to do nothing. The global rung stays - it shapes other
 *  items, and decisions gate on specific-rung evidence anyway. */
export function unsetManualPreference(
  item: PoeItem,
  chipId: string,
  overrides: OverrideStore,
  counters: CounterStore,
): void {
  overrides.unset(pinScopeKey(item), chipId)
  const ctx = deriveLearningContext(item)
  counters.resetChip(
    ctx.rungKeys.filter((k) => k !== GLOBAL_KEY),
    chipId,
  )
}

/** Final decision layer: manual pins overlay (and beat) statistical decisions. */
export function overlayManualPreferences(
  decisions: Record<string, boolean>,
  item: PoeItem,
  overrides: OverrideStore,
): Record<string, boolean> {
  return { ...decisions, ...overrides.forScope(pinScopeKey(item)) }
}
