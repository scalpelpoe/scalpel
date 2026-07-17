// src/main/learning/manual-preferences.test.ts
import { describe, it, expect } from 'vitest'
import { defaultPoeItem } from '@shared/poe-item'
import type { PoeItem } from '@shared/types'
import { CounterStore, type LearningPersistence } from './counter-store'
import type { CounterRecord } from './types'
import { OverrideStore, type OverridePersistence } from './override-store'
import { computeLearnedDecisions, captureObservation } from './engine'
import type { StatFilter } from '../trade/trade'
import { overlayManualPreferences, setManualPreference, unsetManualPreference } from './manual-preferences'

function newCounters(): CounterStore {
  let data: Record<string, Record<string, CounterRecord>> = {}
  const p: LearningPersistence = {
    load: () => data,
    save: (d) => {
      data = d
    },
  }
  return new CounterStore(p)
}

function newOverrides(): OverrideStore {
  let data: Record<string, Record<string, boolean>> = {}
  const p: OverridePersistence = {
    load: () => data,
    save: (d) => {
      data = d
    },
  }
  return new OverrideStore(p)
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

const rareBoots = (): PoeItem => defaultPoeItem({ rarity: 'Rare', itemClass: 'Boots', evasion: 300 })

describe('setManualPreference + overlayManualPreferences', () => {
  it('a pin wins over a conflicting statistical decision', () => {
    const counters = newCounters()
    const overrides = newOverrides()
    const item = rareBoots()
    // engine statistically learns "disable" from 3 disabled observations
    for (let i = 0; i < 3; i++)
      captureObservation(item, [chip('explicit.coldres', 'explicit', false)], counters, 1000 + i)
    const learned = computeLearnedDecisions([chip('explicit.coldres', 'explicit', true)], item, 'eager', counters, 2000)
    expect(learned['explicit.coldres']).toBe(false)
    // manual pin says "enable" - pin wins
    setManualPreference(item, 'explicit.coldres', true, overrides)
    expect(overlayManualPreferences(learned, item, overrides)['explicit.coldres']).toBe(true)
  })

  it('pins apply even when the engine contributes nothing (adaptive mode off)', () => {
    const overrides = newOverrides()
    const item = rareBoots()
    setManualPreference(item, 'explicit.life', false, overrides)
    expect(overlayManualPreferences({}, item, overrides)).toEqual({ 'explicit.life': false })
  })

  it('pins on a unique do not leak to other uniques of the same class', () => {
    const overrides = newOverrides()
    const mageblood = defaultPoeItem({ rarity: 'Unique', itemClass: 'Belts', name: 'Mageblood' })
    const headhunter = defaultPoeItem({ rarity: 'Unique', itemClass: 'Belts', name: 'Headhunter' })
    setManualPreference(mageblood, 'explicit.duration', true, overrides)
    expect(overlayManualPreferences({}, mageblood, overrides)).toEqual({ 'explicit.duration': true })
    expect(overlayManualPreferences({}, headhunter, overrides)).toEqual({})
  })
})

describe('unsetManualPreference', () => {
  it('removes the pin', () => {
    const counters = newCounters()
    const overrides = newOverrides()
    const item = rareBoots()
    setManualPreference(item, 'explicit.life', true, overrides)
    unsetManualPreference(item, 'explicit.life', overrides, counters)
    expect(overlayManualPreferences({}, item, overrides)).toEqual({})
  })

  it('forgets the statistical decision so the chip reverts to the shipped default', () => {
    const counters = newCounters()
    const overrides = newOverrides()
    const item = rareBoots()
    for (let i = 0; i < 3; i++)
      captureObservation(item, [chip('explicit.coldres', 'explicit', false)], counters, 1000 + i)
    unsetManualPreference(item, 'explicit.coldres', overrides, counters)
    const after = computeLearnedDecisions([chip('explicit.coldres', 'explicit', true)], item, 'eager', counters, 2000)
    expect('explicit.coldres' in after).toBe(false)
  })

  it('keeps the global rung and other chips intact', () => {
    const counters = newCounters()
    const overrides = newOverrides()
    const item = rareBoots()
    for (let i = 0; i < 3; i++) {
      captureObservation(
        item,
        [chip('explicit.coldres', 'explicit', false), chip('explicit.life', 'explicit', true)],
        counters,
        1000 + i,
      )
    }
    unsetManualPreference(item, 'explicit.coldres', overrides, counters)
    // global rung still carries the forgotten chip's history (cross-item transfer prior)
    expect(counters.sample('g', 'explicit.coldres', 2000).shownWeight).toBeGreaterThan(0)
    // sibling chip's specific-rung data untouched
    expect(counters.sample('Rare|Boots', 'explicit.life', 2000).shownWeight).toBeGreaterThan(0)
  })
})
