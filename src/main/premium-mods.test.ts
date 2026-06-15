import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '') },
}))

import { _setPremiumModsForTests, getPremiumMods, applyRemotePremiumMods } from './premium-mods'
import type { PremiumModsData } from '@shared/data/items/premium-mods-types'

const valid: PremiumModsData = { schemaVersion: 2, poe1: {}, poe2: {} }

describe('applyRemotePremiumMods', () => {
  beforeEach(() => _setPremiumModsForTests(null))

  it('adopts data with a compatible schemaVersion', () => {
    applyRemotePremiumMods(valid)
    expect(getPremiumMods()).toBe(valid)
  })

  it('rejects data with an incompatible schemaVersion', () => {
    applyRemotePremiumMods({ ...valid, schemaVersion: 999 } as PremiumModsData)
    expect(getPremiumMods()).toBeNull()
  })

  it('rejects data with schemaVersion 1 (v1 is now outdated)', () => {
    applyRemotePremiumMods({ schemaVersion: 1, poe1: {}, poe2: {} } as unknown as PremiumModsData)
    expect(getPremiumMods()).toBeNull()
  })

  it('rejects malformed data (missing poe1/poe2)', () => {
    applyRemotePremiumMods({ schemaVersion: 2 } as unknown as PremiumModsData)
    expect(getPremiumMods()).toBeNull()
  })

  it('adopts v2 data with object entries and rule sections', () => {
    applyRemotePremiumMods({
      schemaVersion: 2,
      poe1: {
        Voices: {
          mode: 'stat_list',
          confidence: 'verified',
          mods: [{ id: 'explicit.stat_4079888060', direction: 'lower' }],
        },
      },
      poe2: {},
      itemClassRules: [{ game: 'poe2', itemClass: 'Tablet', rarity: 'Unique', mode: 'all_explicits' }],
      factionRules: [
        { game: 'poe2', tag: 'extraction_eligible', uniques: ['Quill Rain'], defaultFilters: { corrupted: false } },
      ],
    })
    expect(getPremiumMods()?.poe1.Voices).toBeTruthy()
  })
})
