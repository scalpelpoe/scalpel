// src/main/learning/engine.test.ts
import { describe, it, expect } from 'vitest'
import { defaultPoeItem } from '../../shared/poe-item'
import { CounterStore, type LearningPersistence } from './counter-store'
import type { CounterRecord } from './types'
import { applyLearnedDefaults, captureObservation, isLearnable } from './engine'
import type { StatFilter } from '../trade/trade'

function newStore(): CounterStore {
  let data: Record<string, Record<string, CounterRecord>> = {}
  const p: LearningPersistence = {
    load: () => data,
    save: (d) => {
      data = d
    },
  }
  return new CounterStore(p)
}

const chip = (id: string, type: string, enabled: boolean): StatFilter => ({
  id,
  type,
  text: id,
  value: null,
  min: null,
  max: null,
  enabled,
})

describe('isLearnable', () => {
  it('accepts stat-mod lines and rejects others', () => {
    expect(isLearnable({ type: 'explicit' })).toBe(true)
    expect(isLearnable({ type: 'pseudo' })).toBe(true)
    expect(isLearnable({ type: 'misc' })).toBe(false)
    expect(isLearnable({ type: 'socket' })).toBe(false)
  })

  it('accepts imbued chips (real emitted type string)', () => {
    expect(isLearnable({ type: 'imbued' })).toBe(true)
    expect(isLearnable({ type: 'imbue' })).toBe(false)
  })
})

describe('captureObservation + applyLearnedDefaults round trip', () => {
  it('learns to disable a chip the user repeatedly turns off (eager)', () => {
    const store = newStore()
    const item = defaultPoeItem({ rarity: 'Rare', itemClass: 'Boots', evasion: 300 })
    // user disabled this explicit 3 times
    for (let i = 0; i < 3; i++) {
      captureObservation(item, [chip('explicit.coldres', 'explicit', false)], store, 1000 + i)
    }
    const filters = [chip('explicit.coldres', 'explicit', true)] // shipped default = enabled
    const learned = applyLearnedDefaults(filters, item, 'eager', store, 2000)
    expect(filters[0].enabled).toBe(false)
    expect(filters[0].learned).toBe(true)
    expect(learned).toEqual(['explicit.coldres'])
  })

  it('does nothing in off mode but still no apply', () => {
    const store = newStore()
    const item = defaultPoeItem({ rarity: 'Rare', itemClass: 'Boots', evasion: 300 })
    for (let i = 0; i < 5; i++) captureObservation(item, [chip('explicit.coldres', 'explicit', false)], store, 1000 + i)
    const filters = [chip('explicit.coldres', 'explicit', true)]
    const learned = applyLearnedDefaults(filters, item, 'off', store, 2000)
    expect(filters[0].enabled).toBe(true)
    expect(learned).toEqual([])
  })

  it('ignores non-learnable chips on both paths', () => {
    const store = newStore()
    const item = defaultPoeItem({ rarity: 'Rare', itemClass: 'Boots', evasion: 300 })
    for (let i = 0; i < 5; i++) captureObservation(item, [chip('misc.corrupted', 'misc', false)], store, 1000 + i)
    const filters = [chip('misc.corrupted', 'misc', true)]
    applyLearnedDefaults(filters, item, 'eager', store, 2000)
    expect(filters[0].enabled).toBe(true) // untouched
    expect(filters[0].learned).toBeUndefined()
  })
})
