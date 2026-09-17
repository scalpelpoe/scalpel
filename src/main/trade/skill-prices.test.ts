import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ search: vi.fn(), refresh: vi.fn(), version: 2 }))
vi.mock('../game-state', () => ({ getPoeVersion: () => mocks.version }))
vi.mock('./prices', () => ({ refreshPrices: mocks.refresh, lookupPrice: () => ({ chaosValue: 100 }) }))
vi.mock('./trade', () => ({ searchTrade: mocks.search }))
const listing = (amount: number, currency = 'exalted', level = 20) => ({
  price: { amount, currency },
  itemData: { baseType: 'Hollow Shell', gemLevel: level, quality: 0, corrupted: false },
})
afterEach(() => vi.useRealTimers())
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.version = 2
  mocks.search.mockResolvedValue({ listings: [listing(10)] })
})

it('requests exact-level, zero-quality, uncorrupted gems and estimates comparable listings', async () => {
  mocks.search.mockResolvedValue({
    listings: [listing(1), listing(20), listing(1, 'divine'), listing(5, 'chaos'), listing(2, 'exalted', 19)],
  })
  const { getSkillPrice } = await import('./skill-prices')
  expect(await getSkillPrice('League', 'Hollow Shell', 20)).toMatchObject({
    name: 'Hollow Shell (Level 20)',
    chaosValue: 20,
    divineValue: 0.2,
    sampleSize: 3,
  })
  expect(mocks.search).toHaveBeenCalledWith(
    'League',
    expect.objectContaining({ baseType: 'Hollow Shell', itemClass: 'Skill Gems' }),
    expect.arrayContaining([
      expect.objectContaining({ id: 'misc.gem_level', min: 20, max: 20 }),
      expect.objectContaining({ id: 'misc.quality', min: 0, max: 0 }),
      expect.objectContaining({ id: 'misc.corrupted', chipState: 'no' }),
    ]),
    expect.objectContaining({ collapseListings: true }),
  )
})

it('coalesces concurrent requests and caches by league, name and level', async () => {
  const { getSkillPrice } = await import('./skill-prices')
  await Promise.all([getSkillPrice('A', 'Hollow Shell', 20), getSkillPrice('A', 'Hollow Shell', 20)])
  await getSkillPrice('A', 'Hollow Shell', 20)
  expect(mocks.search).toHaveBeenCalledTimes(1)
  await getSkillPrice('B', 'Hollow Shell', 20)
  await getSkillPrice('A', 'Hollow Shell', 19)
  expect(mocks.search).toHaveBeenCalledTimes(3)
})

it('rejects malformed requests before accessing trade and does not run in PoE1', async () => {
  const { getSkillPrice } = await import('./skill-prices')
  await expect(getSkillPrice('A', 'Hollow Shell', NaN)).rejects.toThrow('Invalid')
  await expect(getSkillPrice('A', 'Bad\nName', 20)).rejects.toThrow('Invalid')
  mocks.version = 1
  expect(await getSkillPrice('A', 'Hollow Shell', 20)).toBeNull()
  expect(mocks.search).not.toHaveBeenCalled()
})

it('caches missing listings but allows retry after transport errors', async () => {
  const { getSkillPrice } = await import('./skill-prices')
  mocks.search.mockRejectedValueOnce(new Error('Rate limited'))
  await expect(getSkillPrice('A', 'Hollow Shell', 20)).rejects.toThrow('Rate limited')
  mocks.search.mockResolvedValue({ listings: [] })
  expect(await getSkillPrice('A', 'Hollow Shell', 20)).toBeNull()
  expect(await getSkillPrice('A', 'Hollow Shell', 20)).toBeNull()
  expect(mocks.search).toHaveBeenCalledTimes(2)
})

it('refreshes a cached quote after five minutes', async () => {
  vi.useFakeTimers()
  const { getSkillPrice } = await import('./skill-prices')
  await getSkillPrice('A', 'Hollow Shell', 20)
  vi.advanceTimersByTime(5 * 60_000 + 1)
  await getSkillPrice('A', 'Hollow Shell', 20)
  expect(mocks.search).toHaveBeenCalledTimes(2)
})
