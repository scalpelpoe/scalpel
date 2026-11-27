import { describe, expect, it, vi } from 'vitest'
import type { ExchangeDetails } from '@shared/contracts/exchange'

// Stub `../trade/prices` and `../evaluation` before importing the handler module, same
// as prices.test.ts -- the real `../trade/prices` reads userData at import time and
// `../evaluation` pulls in the overlay/windowing chain, both of which need a real
// electron app. resolveExchangeDetails takes its two dependencies by injection, so none
// of that matters here.
vi.mock('../trade/prices', () => ({
  refreshPrices: vi.fn().mockResolvedValue(undefined),
  lookupPrice: vi.fn(),
  lookupBestUniquePrice: vi.fn(),
  lookupDivCardPrice: vi.fn(),
  lookupScryingOrbPrice: vi.fn(),
  getUniquesByBase: vi.fn(() => ({})),
  getGemNames: vi.fn(() => new Set<string>()),
  getNinjaType: vi.fn(),
  fetchJson: vi.fn(),
}))
vi.mock('../evaluation', () => ({
  evaluateAndSend: vi.fn(),
  preloadPriceCheck: vi.fn(),
  runPriceCheck: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}))

import { resolveExchangeDetails } from './prices'

const DETAILS: ExchangeDetails = {
  name: "Omen of Death's Door",
  pairs: [{ currency: 'chaos', rate: 95.94, volumePerHour: 147098, history: [] }],
}

describe('resolveExchangeDetails', () => {
  it('slugs the name and forwards the ninja type', async () => {
    const fetchDetails = vi.fn().mockResolvedValue(DETAILS)
    const result = await resolveExchangeDetails("Omen of Death's Door", 1, 'Allflame', {
      getNinjaType: () => 'Omen',
      fetchDetails,
    })
    expect(fetchDetails).toHaveBeenCalledWith(1, 'Allflame', 'Omen', 'omen-of-deaths-door')
    expect(result).toBe(DETAILS)
  })

  it('returns null without fetching when the snapshot has no type for the item', async () => {
    const fetchDetails = vi.fn()
    const result = await resolveExchangeDetails('Mystery Item', 1, 'Allflame', {
      getNinjaType: () => undefined,
      fetchDetails,
    })
    expect(result).toBeNull()
    expect(fetchDetails).not.toHaveBeenCalled()
  })

  it('returns null without fetching when there is no league', async () => {
    const fetchDetails = vi.fn()
    const result = await resolveExchangeDetails('Chaos Orb', 1, '', {
      getNinjaType: () => 'Currency',
      fetchDetails,
    })
    expect(result).toBeNull()
    expect(fetchDetails).not.toHaveBeenCalled()
  })
})
