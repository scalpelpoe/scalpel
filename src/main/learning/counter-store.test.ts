// src/main/learning/counter-store.test.ts
import { describe, it, expect } from 'vitest'
import { CounterStore, type LearningPersistence } from './counter-store'
import type { CounterRecord } from './types'

function fakePersistence(): LearningPersistence & { data: Record<string, Record<string, CounterRecord>> } {
  const state = { data: {} as Record<string, Record<string, CounterRecord>> }
  return {
    data: state.data,
    load: () => state.data,
    save: (d) => {
      state.data = d
    },
  }
}

describe('CounterStore', () => {
  it('records an observation across every supplied rung', () => {
    const store = new CounterStore(fakePersistence())
    store.recordObservation(['g', 'Rare|Boots', 'Rare|Boots|dex'], 'explicit.move', true, 1000)
    expect(store.sample('g', 'explicit.move', 1000)).toEqual({ enabledWeight: 1, shownWeight: 1 })
    expect(store.sample('Rare|Boots|dex', 'explicit.move', 1000)).toEqual({ enabledWeight: 1, shownWeight: 1 })
  })

  it('returns zeroed sample for unseen chip', () => {
    const store = new CounterStore(fakePersistence())
    expect(store.sample('g', 'nope', 1000)).toEqual({ enabledWeight: 0, shownWeight: 0 })
  })

  it('persist writes through and a new store reloads it', () => {
    const p = fakePersistence()
    const a = new CounterStore(p)
    a.recordObservation(['g'], 'explicit.move', true, 1000)
    a.persist()
    const b = new CounterStore(p)
    expect(b.sample('g', 'explicit.move', 1000)).toEqual({ enabledWeight: 1, shownWeight: 1 })
  })

  it('resetByPrefix clears matching buckets only', () => {
    const store = new CounterStore(fakePersistence())
    store.recordObservation(['g', 'Rare|Boots', 'Rare|Boots|dex'], 'explicit.move', true, 1000)
    store.resetByPrefix('Rare|Boots')
    expect(store.sample('Rare|Boots', 'explicit.move', 1000).shownWeight).toBe(0)
    expect(store.sample('Rare|Boots|dex', 'explicit.move', 1000).shownWeight).toBe(0)
    expect(store.sample('g', 'explicit.move', 1000).shownWeight).toBe(1) // global preserved
  })

  it('resetByPrefix does not over-match a sibling whose key shares the prefix string', () => {
    const store = new CounterStore(fakePersistence())
    store.recordObservation(['Rare|Boots'], 'explicit.move', true, 1000)
    store.recordObservation(['Rare|BootsXYZ'], 'explicit.move', true, 1000)
    store.resetByPrefix('Rare|Boots')
    expect(store.sample('Rare|Boots', 'explicit.move', 1000).shownWeight).toBe(0)
    expect(store.sample('Rare|BootsXYZ', 'explicit.move', 1000).shownWeight).toBe(1) // sibling preserved
  })

  it('reset clears everything', () => {
    const store = new CounterStore(fakePersistence())
    store.recordObservation(['g'], 'explicit.move', true, 1000)
    store.reset()
    expect(store.sample('g', 'explicit.move', 1000).shownWeight).toBe(0)
  })
})
