import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// fetchStats() reaches the network through electron's `net`, and reads
// `app.userAgentFallback` for the request UA. Mock both; the fake request lets
// each test drive the response on its own schedule so we can land a stale
// response after invalidateStatsCache() has bumped the generation.
class FakeResponse {
  private handlers: Record<string, (arg?: unknown) => void> = {}
  on(event: string, cb: (arg?: unknown) => void): this {
    this.handlers[event] = cb
    return this
  }
  emit(body: string): void {
    this.handlers.data?.(Buffer.from(body))
    this.handlers.end?.()
  }
}

class FakeRequest {
  private handlers: Record<string, (arg?: unknown) => void> = {}
  private response = new FakeResponse()
  setHeader = vi.fn()
  end = vi.fn()
  abort = vi.fn()
  on(event: string, cb: (arg?: unknown) => void): this {
    this.handlers[event] = cb
    return this
  }
  /** Drive a successful response with the given body. */
  respond(body: string): void {
    this.handlers.response?.(this.response)
    this.response.emit(body)
  }
}

let lastRequest: FakeRequest | null = null

vi.mock('electron', () => ({
  app: { userAgentFallback: 'Scalpel-Test/1.0' },
  net: {
    request: vi.fn(() => {
      lastRequest = new FakeRequest()
      return lastRequest
    }),
  },
}))

import {
  ensureStatsLoaded,
  getStatEntries,
  getStatsFetched,
  invalidateStatsCache,
  statTextById,
  _setStatEntries,
} from './stats-cache'

const SAMPLE = JSON.stringify({
  result: [
    {
      id: 'explicit',
      label: 'Explicit',
      entries: [{ id: 'explicit.stat_1', text: '#% increased Foo', type: 'explicit' }],
    },
  ],
})

beforeEach(() => {
  invalidateStatsCache()
  lastRequest = null
})

afterEach(() => {
  // Clear any 6h refresh interval the cache armed so it doesn't keep vitest alive.
  invalidateStatsCache()
})

describe('invalidateStatsCache', () => {
  it('clears entries, the fetched flag, and the lazy text map', () => {
    _setStatEntries([{ id: 'explicit.stat_1', text: 'Foo', type: 'explicit' }])
    expect(getStatsFetched()).toBe(true)
    expect(getStatEntries()).toHaveLength(1)
    expect(statTextById('explicit.stat_1')).toBe('Foo')

    invalidateStatsCache()

    expect(getStatsFetched()).toBe(false)
    expect(getStatEntries()).toHaveLength(0)
    expect(statTextById('explicit.stat_1')).toBe('')
  })
})

describe('fetchGeneration stale-response guard', () => {
  it('discards an in-flight result that lands after invalidateStatsCache', async () => {
    const inFlight = ensureStatsLoaded()
    expect(lastRequest).not.toBeNull()

    // A game switch invalidates mid-flight: generation bumps, entries clear.
    invalidateStatsCache()

    // The stale fetch from the previous game now completes.
    lastRequest!.respond(SAMPLE)
    await inFlight

    expect(getStatEntries()).toHaveLength(0)
    expect(getStatsFetched()).toBe(false)
  })

  it('applies a result when no invalidation intervened', async () => {
    const inFlight = ensureStatsLoaded()
    lastRequest!.respond(SAMPLE)
    await inFlight

    expect(getStatsFetched()).toBe(true)
    expect(getStatEntries()).toHaveLength(1)
    expect(getStatEntries()[0]!.id).toBe('explicit.stat_1')
  })
})
