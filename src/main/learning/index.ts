// src/main/learning/index.ts
import Store from 'electron-store'
import type { AppSettings, PoeItem } from '../../shared/types'
import type { StatFilter } from '../trade/trade'
import type { AdaptiveMode, CounterRecord } from './types'
import { CounterStore, type LearningPersistence } from './counter-store'
import { captureObservation, computeLearnedDecisions } from './engine'

let counterStore: CounterStore | null = null
let settingsRef: Store<AppSettings> | null = null
const sessionItems = new Map<number, PoeItem>()
let sessionSeq = 0
// Cap cached in-flight price-check sessions; covers rapid successive hotkeys without unbounded growth.
const MAX_SESSIONS = 8

function logLearningError(where: string, err: unknown): void {
  if (process.env.SCALPEL_DEBUG_LOG) console.error(`[learning] ${where} failed:`, err)
}

export function initLearning(settings: Store<AppSettings>, version: 1 | 2): void {
  settingsRef = settings
  sessionItems.clear()
  sessionSeq = 0
  const data = new Store<{ buckets: Record<string, Record<string, CounterRecord>> }>({
    name: `scalpel-learning-poe${version}`,
    defaults: { buckets: {} },
  })
  const persistence: LearningPersistence = {
    load: () => data.get('buckets'),
    save: (b) => data.set('buckets', b),
  }
  counterStore = new CounterStore(persistence)
}

export function getMode(): AdaptiveMode {
  return settingsRef?.get('adaptiveDefaultsMode') ?? 'eager'
}

/** Caches the item for the session and returns a session id to echo back on capture. */
export function beginSession(item: PoeItem): number {
  const id = ++sessionSeq
  sessionItems.set(id, item)
  if (sessionItems.size > MAX_SESSIONS) {
    const oldest = sessionItems.keys().next().value
    if (oldest !== undefined) sessionItems.delete(oldest)
  }
  return id
}

/** Returns the engine's confident enable/disable opinions per chip. {} until initLearning, or on error. */
export function decisionsForSession(statFilters: StatFilter[], item: PoeItem): Record<string, boolean> {
  if (!counterStore) return {}
  try {
    return computeLearnedDecisions(statFilters, item, getMode(), counterStore, Date.now())
  } catch (err) {
    logLearningError('decisionsForSession', err)
    return {}
  }
}

export function recordSession(sessionId: number, chips: Array<{ id: string; type: string; enabled: boolean }>): void {
  if (!counterStore) return
  const item = sessionItems.get(sessionId)
  if (!item) return
  try {
    captureObservation(item, chips, counterStore, Date.now()) // captures in all modes incl off
  } catch (err) {
    logLearningError('recordSession', err)
  }
}

export function resetLearning(scope: 'all' | { rarity: string; itemClass: string }): void {
  if (!counterStore) return
  if (scope === 'all') counterStore.reset()
  else counterStore.resetByPrefix(`${scope.rarity}|${scope.itemClass}`)
}
