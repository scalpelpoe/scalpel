import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POE_NINJA_STASH_OVERVIEW } from '@shared/endpoints'
import { _resetBeastPricesForTests, getBeastPrices } from './beast-prices'

const PAYLOAD = {
  lines: [
    {
      name: 'Vivid Vulture',
      chaosValue: 10989,
      divineValue: 13.6,
      listingCount: 8945,
      sparkLine: { totalChange: 133.1, data: [0, -5.73, null, 24.03] },
    },
    { name: 'Woods Ursa', chaosValue: 2424, divineValue: 3, listingCount: 12, sparkLine: { data: [] } },
  ],
}

beforeEach(() => {
  _resetBeastPricesForTests()
})

describe('getBeastPrices', () => {
  it('requests the stash overview for the given league', async () => {
    const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
    await getBeastPrices('Mirage', fetchJson)
    expect(fetchJson).toHaveBeenCalledWith(`${POE_NINJA_STASH_OVERVIEW}?league=Mirage&type=Beast`)
  })

  it('url-encodes the league name', async () => {
    const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
    await getBeastPrices('Hardcore Mirage', fetchJson)
    expect(fetchJson).toHaveBeenCalledWith(`${POE_NINJA_STASH_OVERVIEW}?league=Hardcore%20Mirage&type=Beast`)
  })

  it('maps sparkLine.data onto graph', async () => {
    const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
    const r = await getBeastPrices('Mirage', fetchJson)
    expect(r.lines[0]).toEqual({
      name: 'Vivid Vulture',
      chaosValue: 10989,
      divineValue: 13.6,
      listingCount: 8945,
      graph: [0, -5.73, null, 24.03],
    })
    expect(r.updatedAt).toBeTypeOf('number')
    expect(r.error).toBeUndefined()
  })

  it('drops an empty sparkline rather than emitting an empty graph', async () => {
    const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
    const r = await getBeastPrices('Mirage', fetchJson)
    expect(r.lines[1].graph).toBeUndefined()
  })

  it('skips malformed lines and zero-fills missing numbers', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      lines: [
        { name: '' },
        { chaosValue: 5 },
        null,
        'nonsense',
        { name: 'Half Priced', chaosValue: 'lots', listingCount: null },
      ],
    })
    const r = await getBeastPrices('Mirage', fetchJson)
    expect(r.lines).toEqual([{ name: 'Half Priced', chaosValue: 0, divineValue: undefined, listingCount: 0 }])
  })

  it('returns empty lines when the payload has no lines array', async () => {
    const fetchJson = vi.fn().mockResolvedValue({})
    const r = await getBeastPrices('Mirage', fetchJson)
    expect(r.lines).toEqual([])
  })

  it('serves the cache inside the TTL without refetching', async () => {
    const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
    await getBeastPrices('Mirage', fetchJson)
    await getBeastPrices('Mirage', fetchJson)
    expect(fetchJson).toHaveBeenCalledTimes(1)
  })

  it('refetches when force is set', async () => {
    const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
    await getBeastPrices('Mirage', fetchJson)
    await getBeastPrices('Mirage', fetchJson, true)
    expect(fetchJson).toHaveBeenCalledTimes(2)
  })

  it('refetches when the league changes', async () => {
    const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
    await getBeastPrices('Mirage', fetchJson)
    await getBeastPrices('Standard', fetchJson)
    expect(fetchJson).toHaveBeenCalledTimes(2)
  })

  it('refetches once the TTL expires', async () => {
    vi.useFakeTimers()
    try {
      const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
      await getBeastPrices('Mirage', fetchJson)
      vi.advanceTimersByTime(10 * 60 * 1000 + 1)
      await getBeastPrices('Mirage', fetchJson)
      expect(fetchJson).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps serving a stale cache when a refresh fails', async () => {
    const ok = vi.fn().mockResolvedValue(PAYLOAD)
    const first = await getBeastPrices('Mirage', ok)
    const bad = vi.fn().mockRejectedValue(new Error('net::ERR_FAILED'))
    const r = await getBeastPrices('Mirage', bad, true)
    expect(r.lines).toEqual(first.lines)
    expect(r.updatedAt).toBe(first.updatedAt)
    expect(r.error).toBeTruthy()
  })

  it('retries on the next call after a failure instead of caching the failure', async () => {
    const bad = vi.fn().mockRejectedValue(new Error('down'))
    await getBeastPrices('Mirage', bad)
    await getBeastPrices('Mirage', bad)
    expect(bad).toHaveBeenCalledTimes(2)
  })

  it('reports an error with no lines when the first fetch fails', async () => {
    const bad = vi.fn().mockRejectedValue(new Error('down'))
    const r = await getBeastPrices('Mirage', bad)
    expect(r.lines).toEqual([])
    expect(r.updatedAt).toBeNull()
    expect(r.error).toBeTruthy()
  })

  it('short-circuits an empty league without hitting the network', async () => {
    const fetchJson = vi.fn()
    const r = await getBeastPrices('', fetchJson)
    expect(fetchJson).not.toHaveBeenCalled()
    expect(r.error).toBeTruthy()
  })

  it('echoes the league back so the UI can label the price source', async () => {
    const fetchJson = vi.fn().mockResolvedValue(PAYLOAD)
    expect((await getBeastPrices('Mirage', fetchJson)).league).toBe('Mirage')
    expect((await getBeastPrices('', fetchJson)).league).toBe('')
  })
})
