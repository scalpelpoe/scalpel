import { expect, test } from 'vitest'
import { entryMatchesQuery, groupEntriesByCategory, normSearch, priceBadge } from './economy-prices'

test('priceBadge prefers divine for high values', () => {
  expect(priceBadge({ chaosValue: 40, divineValue: 2.5 })).toBe('2.5 div')
  expect(priceBadge({ chaosValue: 3.2, divineValue: 0.4 })).toBe('3.2 ex')
})

test('normSearch strips punctuation', () => {
  expect(normSearch('Divine Orb')).toBe('divine orb')
})

test('entryMatchesQuery is case-insensitive substring', () => {
  expect(entryMatchesQuery({ name: 'Chaos Orb', category: 'currency', chaosValue: 1 }, 'chaos')).toBe(true)
  expect(entryMatchesQuery({ name: 'Chaos Orb', category: 'currency', chaosValue: 1 }, 'divine')).toBe(false)
})

test('groupEntriesByCategory sorts by value', () => {
  const map = groupEntriesByCategory([
    { name: 'Low', category: 'runes', chaosValue: 1, divineValue: 0.1 },
    { name: 'High', category: 'runes', chaosValue: 50, divineValue: 5 },
  ])
  expect(map.get('runes')?.[0]?.name).toBe('High')
})
