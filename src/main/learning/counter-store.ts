// src/main/learning/counter-store.ts
import type { CounterRecord } from './types'
import { mergeObservation, decayedSample } from './decay'

export interface LearningPersistence {
  load(): Record<string, Record<string, CounterRecord>>
  save(data: Record<string, Record<string, CounterRecord>>): void
}

type Buckets = Record<string, Record<string, CounterRecord>>

export class CounterStore {
  private buckets: Buckets

  constructor(private readonly persistence: LearningPersistence) {
    this.buckets = persistence.load() ?? {}
  }

  recordObservation(rungKeys: string[], chipId: string, enabled: boolean, now: number): void {
    for (const key of rungKeys) {
      const bucket = (this.buckets[key] ??= {})
      bucket[chipId] = mergeObservation(bucket[chipId], enabled, now)
    }
  }

  sample(rungKey: string, chipId: string, now: number): { enabledWeight: number; shownWeight: number } {
    return decayedSample(this.buckets[rungKey]?.[chipId], now)
  }

  persist(): void {
    this.persistence.save(this.buckets)
  }

  reset(): void {
    this.buckets = {}
    this.persist()
  }

  resetByPrefix(prefix: string): void {
    for (const key of Object.keys(this.buckets)) {
      if (key === prefix || key.startsWith(`${prefix}|`)) delete this.buckets[key]
    }
    this.persist()
  }
}
