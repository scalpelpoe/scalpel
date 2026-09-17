import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...a: unknown[]) => unknown>()
const listeners = new Map<string, (...a: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
    on: (ch: string, fn: (...a: unknown[]) => unknown) => listeners.set(ch, fn),
  },
}))

const refreshPrices = vi.fn(async () => {})
const invalidatePriceCache = vi.fn()
const getPriceEntries = vi.fn(() => ({
  prices: [{ name: 'Divine Orb', category: 'currency', chaosValue: 200 }],
  updatedAt: 1,
}))
const unsubSpy = vi.fn()
const subscribePriceUpdates = vi.fn(() => unsubSpy)

vi.mock('../trade/prices', () => ({ refreshPrices, invalidatePriceCache, getPriceEntries, subscribePriceUpdates }))
vi.mock('../profiles/profile-settings', () => ({ getProfileBackedSetting: () => 'Standard' }))
vi.mock('../trade/skill-prices', () => ({ getSkillPrice: vi.fn(async () => null) }))

describe('plugin price handlers', () => {
  it('routes skill lookups through the active profile league', async () => {
    const { getSkillPrice } = await import('../trade/skill-prices')
    const { registerPluginPriceHandlers } = await import('./plugin-prices')
    registerPluginPriceHandlers({} as never)
    await handlers.get('plugins:skill-price')!({}, 'Hollow Shell', 20)
    expect(getSkillPrice).toHaveBeenCalledWith('Standard', 'Hollow Shell', 20)
  })
  beforeEach(() => {
    handlers.clear()
    listeners.clear()
    vi.clearAllMocks()
  })

  it('registers get / refresh / watch / unwatch channels', async () => {
    const { registerPluginPriceHandlers } = await import('./plugin-prices')
    registerPluginPriceHandlers({} as never)
    expect([...handlers.keys()]).toEqual(expect.arrayContaining(['plugins:prices-get', 'plugins:prices-refresh']))
    expect([...listeners.keys()]).toEqual(expect.arrayContaining(['plugins:prices-watch', 'plugins:prices-unwatch']))
  })

  it('get refreshes then returns filtered entries', async () => {
    const { registerPluginPriceHandlers } = await import('./plugin-prices')
    registerPluginPriceHandlers({} as never)
    const result = await handlers.get('plugins:prices-get')!({}, { category: 'currency' })
    expect(refreshPrices).toHaveBeenCalledWith('Standard')
    expect(getPriceEntries).toHaveBeenCalledWith('currency')
    expect(result).toMatchObject({ updatedAt: 1 })
  })

  it('refresh invalidates then refreshes', async () => {
    const { registerPluginPriceHandlers } = await import('./plugin-prices')
    registerPluginPriceHandlers({} as never)
    await handlers.get('plugins:prices-refresh')!({})
    expect(invalidatePriceCache).toHaveBeenCalled()
    expect(refreshPrices).toHaveBeenCalledWith('Standard')
  })

  it('tears down the price listener when the last subscriber unwatches', async () => {
    const { registerPluginPriceHandlers } = await import('./plugin-prices')
    registerPluginPriceHandlers({} as never)
    const fakeWc = { once: vi.fn(), isDestroyed: () => false }
    listeners.get('plugins:prices-watch')!({ sender: fakeWc })
    expect(subscribePriceUpdates).toHaveBeenCalledTimes(1)
    listeners.get('plugins:prices-unwatch')!({ sender: fakeWc })
    expect(unsubSpy).toHaveBeenCalledTimes(1)
  })
})
