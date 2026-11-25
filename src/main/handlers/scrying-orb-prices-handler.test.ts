import { describe, expect, it, vi } from 'vitest'

// Own file, like exchange-details-handler.test.ts: register() wires a filter-load
// listener and a 6h prime interval, which would leak into the call-count
// assertions in prices.test.ts if registered there.
vi.mock('../trade/prices', () => ({
  refreshPrices: vi.fn().mockResolvedValue(undefined),
  lookupPrice: vi.fn(),
  lookupBestUniquePrice: vi.fn(),
  lookupDivCardPrice: vi.fn(),
  lookupScryingOrbPrice: vi.fn((area: string) => (area === 'Dunes' ? { chaosValue: 8 } : undefined)),
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

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import { lookupScryingOrbPrice, refreshPrices } from '../trade/prices'
import { register } from './prices'

type Handler = (event: unknown, areas: string[], league: string) => Promise<Record<string, unknown>>

function scryingHandler(): Handler {
  // Fake timers swallow register()'s 6h setInterval so it can't hold the worker open.
  vi.useFakeTimers()
  try {
    register({ get: () => 'Covens' } as unknown as Parameters<typeof register>[0])
  } finally {
    vi.useRealTimers()
  }
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    (c) => c[0] === IPC_CHANNELS.PRICES.BATCH_LOOKUP_SCRYING_ORB,
  )
  if (!call) throw new Error('scrying orb handler not registered')
  return call[1] as Handler
}

describe('batch-lookup-scrying-orb-prices', () => {
  it('refreshes the league, then maps each area to its ninja price or null', async () => {
    const result = await scryingHandler()({}, ['Dunes', 'Colonnade'], 'Covens')
    expect(refreshPrices).toHaveBeenCalledWith('Covens')
    expect(lookupScryingOrbPrice).toHaveBeenCalledWith('Dunes')
    expect(result).toEqual({ Dunes: { chaosValue: 8 }, Colonnade: null })
  })
})
