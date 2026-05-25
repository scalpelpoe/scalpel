// src/main/learning/decay.ts
import type { CounterRecord } from './types'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** ~7-week half-life: stale meta/builds fade, last league softly carries then fades. */
export const HALF_LIFE_MS = 7 * WEEK_MS

export function decayFactor(dtMs: number, halfLifeMs: number = HALF_LIFE_MS): number {
  if (dtMs <= 0) return 1
  return Math.pow(0.5, dtMs / halfLifeMs)
}

export function mergeObservation(
  rec: CounterRecord | undefined,
  enabled: boolean,
  now: number,
  halfLifeMs: number = HALF_LIFE_MS,
): CounterRecord {
  if (!rec) return { enabledWeight: enabled ? 1 : 0, shownWeight: 1, lastTs: now }
  const f = decayFactor(now - rec.lastTs, halfLifeMs)
  return {
    enabledWeight: rec.enabledWeight * f + (enabled ? 1 : 0),
    shownWeight: rec.shownWeight * f + 1,
    lastTs: now,
  }
}

export function decayedSample(
  rec: CounterRecord | undefined,
  now: number,
  halfLifeMs: number = HALF_LIFE_MS,
): { enabledWeight: number; shownWeight: number } {
  if (!rec) return { enabledWeight: 0, shownWeight: 0 }
  const f = decayFactor(now - rec.lastTs, halfLifeMs)
  return { enabledWeight: rec.enabledWeight * f, shownWeight: rec.shownWeight * f }
}
