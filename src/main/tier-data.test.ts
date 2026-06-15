import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '') },
}))

import { _setTierDataForTests, getTierData, applyRemoteTierData } from './tier-data'
import type { TierDataset } from '@shared/data/tiers/types'

const valid: TierDataset = { schemaVersion: 1, mods: [], pools: [], bases: {} }

describe('applyRemoteTierData', () => {
  beforeEach(() => _setTierDataForTests(null))

  it('adopts data with a compatible schemaVersion', () => {
    applyRemoteTierData(valid)
    expect(getTierData()).toBe(valid)
  })

  it('rejects data with an incompatible schemaVersion', () => {
    applyRemoteTierData({ ...valid, schemaVersion: 999 } as TierDataset)
    expect(getTierData()).toBeNull()
  })

  it('rejects malformed data', () => {
    applyRemoteTierData({ schemaVersion: 1 } as unknown as TierDataset)
    expect(getTierData()).toBeNull()
  })
})
