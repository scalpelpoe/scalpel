// src/main/learning/non-regression.test.ts
import { describe, it, expect } from 'vitest'
import { defaultPoeItem } from '../../shared/poe-item'
import { CounterStore, type LearningPersistence } from './counter-store'
import type { CounterRecord } from './types'
import { computeLearnedDecisions } from './engine'
import type { StatFilter } from '../trade/trade'

function emptyStore(): CounterStore {
  let data: Record<string, Record<string, CounterRecord>> = {}
  const p: LearningPersistence = {
    load: () => data,
    save: (d) => {
      data = d
    },
  }
  return new CounterStore(p)
}

describe('non-regression', () => {
  it('leaves enabled flags untouched and sets no learned flags when there is no data', () => {
    const item = defaultPoeItem({ rarity: 'Rare', itemClass: 'Body Armours', evasion: 400 })
    const filters: StatFilter[] = [
      { id: 'explicit.life', type: 'explicit', text: 'life', value: 80, min: 72, max: null, enabled: true },
      { id: 'explicit.coldres', type: 'explicit', text: 'cold res', value: 30, min: 27, max: null, enabled: false },
      { id: 'pseudo.totalres', type: 'pseudo', text: 'total res', value: 100, min: 90, max: null, enabled: true },
    ]
    const before = JSON.parse(JSON.stringify(filters))
    expect(computeLearnedDecisions(filters, item, 'eager', emptyStore(), Date.now())).toEqual({})
    expect(filters).toEqual(before)
  })
})
