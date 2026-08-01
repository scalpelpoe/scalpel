import { describe, expect, it } from 'vitest'
import { DEFAULT_BEAST_STATE, sanitizeBeastState, type BeastState } from './beast-state'
import { beastRegex, type BeastRegex } from './vendor/beast/GeneratedBeastRegex'
import {
  beastBudget,
  buildBeastRegex,
  buildBeastRows,
  deriveBeastPresetRegex,
  type BeastPriceLine,
  type PricedBeast,
} from './beast-engine'
import { generateRegex, sortByChaosValue, type BeastPriceRegex } from './__fixtures__/poere/BeastResult'

function state(over: Partial<BeastState> = {}): BeastState {
  return { ...structuredClone(DEFAULT_BEAST_STATE), ...over }
}

/** Our rows, mapped into upstream's shape and put through upstream's own
 *  load-time filter + sort. Upstream drops listingCount <= 5 before it ever
 *  reaches generateRegex; our engine applies the same guard internally. */
function adapt(rows: PricedBeast[]): BeastPriceRegex[] {
  return rows
    .filter((r) => r.listingCount > 5)
    .map((r) => ({
      name: r.name,
      chaosValue: r.chaosValue,
      recipe: r.recipe,
      regex: r.regex,
      numberOfBeasts: r.listingCount,
      harvest: r.harvest,
      redBeast: r.red,
    }))
    .sort(sortByChaosValue)
}

function expectParity(rows: PricedBeast[], s: BeastState): void {
  const mine = buildBeastRegex(rows, s).regex
  const theirs = generateRegex(
    adapt(rows),
    s.includeHarvest,
    s.minChaos ?? undefined,
    s.maxChaos ?? undefined,
    s.menagerieLimit,
    s.redOnly,
  )
  expect(mine).toBe(theirs)
}

const DATA: BeastRegex[] = [
  { beast: 'Alpha', recipe: 'Craft a thing', regex: 'al', harvest: false, red: true },
  { beast: 'Bravo', recipe: '', regex: 'brav', harvest: false, red: false },
  { beast: 'Charlie', recipe: '', regex: 'char', harvest: true, red: true },
  { beast: 'Delta', recipe: '', regex: 'del', harvest: false, red: false },
  { beast: 'Echo', recipe: '', regex: 'ec', harvest: false, red: false },
]

const PRICES: BeastPriceLine[] = [
  { name: 'Alpha', chaosValue: 500, divineValue: 5, listingCount: 100, graph: [0, 1] },
  { name: 'Bravo', chaosValue: 300, listingCount: 100 },
  { name: 'Charlie', chaosValue: 200, listingCount: 100 },
  { name: 'Delta', chaosValue: 100, listingCount: 3 },
  { name: 'Echo', chaosValue: 0, listingCount: 100 },
]

describe('buildBeastRows', () => {
  it('joins prices onto the static data by exact name', () => {
    const rows = buildBeastRows(DATA, PRICES)
    const alpha = rows.find((r) => r.name === 'Alpha')!
    expect(alpha).toMatchObject({
      regex: 'al',
      recipe: 'Craft a thing',
      red: true,
      harvest: false,
      chaosValue: 500,
      divineValue: 5,
      listingCount: 100,
    })
    expect(alpha.graph).toEqual([0, 1])
  })

  it('returns every beast, including unpriced and thin-market ones', () => {
    const rows = buildBeastRows(DATA, PRICES)
    expect(rows).toHaveLength(5)
    expect(rows.find((r) => r.name === 'Echo')!.chaosValue).toBe(0)
    expect(rows.find((r) => r.name === 'Delta')!.listingCount).toBe(3)
  })

  it('zero-fills beasts with no price line', () => {
    const rows = buildBeastRows(DATA, [])
    for (const r of rows) {
      expect(r.chaosValue).toBe(0)
      expect(r.listingCount).toBe(0)
      expect(r.divineValue).toBeUndefined()
    }
  })

  it('sorts by chaos descending, ties broken by name ascending', () => {
    const tied: BeastPriceLine[] = [
      { name: 'Delta', chaosValue: 50, listingCount: 10 },
      { name: 'Bravo', chaosValue: 50, listingCount: 10 },
      { name: 'Alpha', chaosValue: 90, listingCount: 10 },
    ]
    expect(buildBeastRows(DATA, tied).map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie', 'Echo'])
  })
})

describe('beastBudget', () => {
  it('is 100 under the menagerie limit and 250 otherwise', () => {
    expect(beastBudget(state({ menagerieLimit: true }))).toBe(100)
    expect(beastBudget(state())).toBe(250)
  })
})

describe('buildBeastRegex basics', () => {
  const rows = buildBeastRows(DATA, PRICES)

  it('packs priced, liquid, non-harvest beasts by descending value', () => {
    const r = buildBeastRegex(rows, state())
    expect(r.regex).toBe('al|brav')
    expect([...r.included].sort()).toEqual(['Alpha', 'Bravo'])
    expect(r.droppedPins).toEqual([])
  })

  it('includes harvest beasts only when asked', () => {
    expect(buildBeastRegex(rows, state({ includeHarvest: true })).regex).toBe('al|brav|char')
  })

  it('restricts to red beasts', () => {
    expect(buildBeastRegex(rows, state({ redOnly: true })).regex).toBe('al')
    expect(buildBeastRegex(rows, state({ redOnly: true, includeHarvest: true })).regex).toBe('al|char')
  })

  it('drops beasts with no price', () => {
    expect(buildBeastRegex(rows, state()).included.has('Echo')).toBe(false)
  })

  it('drops thin markets at listingCount <= 5', () => {
    expect(buildBeastRegex(rows, state()).included.has('Delta')).toBe(false)
    const liquid = buildBeastRows(DATA, [
      ...PRICES.filter((p) => p.name !== 'Delta'),
      { name: 'Delta', chaosValue: 100, listingCount: 6 },
    ])
    expect(buildBeastRegex(liquid, state()).included.has('Delta')).toBe(true)
  })

  it('applies the chaos bounds', () => {
    expect(buildBeastRegex(rows, state({ minChaos: 400 })).regex).toBe('al')
    expect(buildBeastRegex(rows, state({ maxChaos: 400 })).regex).toBe('brav')
    expect(buildBeastRegex(rows, state({ minChaos: 250, maxChaos: 400 })).regex).toBe('brav')
  })

  it('returns an empty string when nothing qualifies', () => {
    expect(buildBeastRegex(rows, state({ minChaos: 99999 })).regex).toBe('')
  })
})

describe('upstream quirks (preserved deliberately)', () => {
  it('stops at the first overflow instead of skipping to a shorter beast', () => {
    // Under a 100-char menagerie budget: a long second beast overflows, and the
    // short third beast is NOT tried even though it would have fit.
    const data: BeastRegex[] = [
      { beast: 'One', recipe: '', regex: 'a'.repeat(80), harvest: false, red: false },
      { beast: 'Two', recipe: '', regex: 'b'.repeat(40), harvest: false, red: false },
      { beast: 'Three', recipe: '', regex: 'c', harvest: false, red: false },
    ]
    const prices: BeastPriceLine[] = [
      { name: 'One', chaosValue: 300, listingCount: 10 },
      { name: 'Two', chaosValue: 200, listingCount: 10 },
      { name: 'Three', chaosValue: 100, listingCount: 10 },
    ]
    const rows = buildBeastRows(data, prices)
    const r = buildBeastRegex(rows, state({ menagerieLimit: true }))
    expect(r.regex).toBe('a'.repeat(80))
    expect(r.included.has('Three')).toBe(false)
    expectParity(rows, state({ menagerieLimit: true }))
  })

  it('lets an out-of-bounds beast terminate the loop, because length is checked first', () => {
    // "One" is excluded by maxChaos AND overflows the budget on its own. The
    // length check runs first, so it terminates the pack rather than being
    // skipped -- and "Two" and "Three" never get a look, even though both are
    // in bounds and would have fit. Reorder the two checks and this returns
    // "bbbb...|c" instead of "".
    const data: BeastRegex[] = [
      { beast: 'One', recipe: '', regex: 'a'.repeat(100), harvest: false, red: false },
      { beast: 'Two', recipe: '', regex: 'b'.repeat(40), harvest: false, red: false },
      { beast: 'Three', recipe: '', regex: 'c', harvest: false, red: false },
    ]
    const prices: BeastPriceLine[] = [
      { name: 'One', chaosValue: 300, listingCount: 10 },
      { name: 'Two', chaosValue: 200, listingCount: 10 },
      { name: 'Three', chaosValue: 100, listingCount: 10 },
    ]
    const rows = buildBeastRows(data, prices)
    const s = state({ menagerieLimit: true, maxChaos: 250 })
    expect(buildBeastRegex(rows, s).regex).toBe('')
    expectParity(rows, s)
  })

  it('charges the stripped leading pipe against the budget', () => {
    // A single 100-char fragment does not fit a 100-char budget: the check is
    // 0 + 100 + 1 > 100. Usable budget is limit - 1.
    const at100: BeastRegex[] = [{ beast: 'One', recipe: '', regex: 'a'.repeat(100), harvest: false, red: false }]
    const at99: BeastRegex[] = [{ beast: 'One', recipe: '', regex: 'a'.repeat(99), harvest: false, red: false }]
    const price: BeastPriceLine[] = [{ name: 'One', chaosValue: 10, listingCount: 10 }]
    const s = state({ menagerieLimit: true })
    expect(buildBeastRegex(buildBeastRows(at100, price), s).regex).toBe('')
    expect(buildBeastRegex(buildBeastRows(at99, price), s).regex).toBe('a'.repeat(99))
  })
})

describe('parity with poe.re over the real dataset', () => {
  function mulberry32(seed: number): () => number {
    let a = seed
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('matches upstream across 300 random price sets and settings', () => {
    const rand = mulberry32(0xbea57)
    for (let i = 0; i < 300; i++) {
      const prices: BeastPriceLine[] = beastRegex.map((b) => ({
        name: b.beast,
        // Deliberately spans 0 (unpriced) and thin markets so both pre-filters
        // get exercised on every iteration.
        chaosValue: rand() < 0.15 ? 0 : Math.floor(rand() * 5000),
        listingCount: rand() < 0.2 ? Math.floor(rand() * 6) : Math.floor(rand() * 9000),
      }))
      const rows = buildBeastRows(beastRegex, prices)
      const s = state({
        includeHarvest: rand() < 0.5,
        menagerieLimit: rand() < 0.5,
        redOnly: rand() < 0.3,
        minChaos: rand() < 0.4 ? Math.floor(rand() * 500) : null,
        maxChaos: rand() < 0.4 ? Math.floor(rand() * 5000) : null,
      })
      const mine = buildBeastRegex(rows, s).regex
      const theirs = generateRegex(
        adapt(rows),
        s.includeHarvest,
        s.minChaos ?? undefined,
        s.maxChaos ?? undefined,
        s.menagerieLimit,
        s.redOnly,
      )
      expect(mine, `iteration ${i}: ${JSON.stringify(s)}`).toBe(theirs)
    }
  })

  it('produces output within the active budget', () => {
    const prices: BeastPriceLine[] = beastRegex.map((b, i) => ({
      name: b.beast,
      chaosValue: 1000 - i,
      listingCount: 100,
    }))
    const rows = buildBeastRows(beastRegex, prices)
    expect(buildBeastRegex(rows, state({ menagerieLimit: true })).regex.length).toBeLessThan(100)
    expect(buildBeastRegex(rows, state()).regex.length).toBeLessThan(250)
  })
})

describe('pins and mutes (Scalpel extension over poe.re)', () => {
  const rows = buildBeastRows(DATA, PRICES)

  it('emits pinned beasts first, ahead of the auto-pack', () => {
    const r = buildBeastRegex(rows, state({ pinned: ['Bravo'] }))
    expect(r.regex).toBe('brav|al')
  })

  it('orders multiple pins by descending price', () => {
    const r = buildBeastRegex(rows, state({ pinned: ['Bravo', 'Alpha'] }))
    expect(r.regex).toBe('al|brav')
  })

  it('lets a pin bypass every auto-pack filter', () => {
    // Echo is unpriced, Delta is a thin market, Charlie is harvest, none are red.
    const s = state({ redOnly: true, minChaos: 9000, pinned: ['Echo', 'Delta', 'Charlie'] })
    const r = buildBeastRegex(rows, s)
    expect(r.included.has('Echo')).toBe(true)
    expect(r.included.has('Delta')).toBe(true)
    expect(r.included.has('Charlie')).toBe(true)
  })

  it('never emits a muted beast', () => {
    const r = buildBeastRegex(rows, state({ muted: ['Alpha'] }))
    expect(r.regex).toBe('brav')
    expect(r.included.has('Alpha')).toBe(false)
  })

  it('charges pins against the budget before the auto-pack runs', () => {
    // Big is pinned and eats the whole 100-char budget (99 + its pipe), so the
    // far more valuable Small cannot fit even though the auto-pack would have
    // taken it first on price. 95 chars would leave room for "|y" at 98.
    const data: BeastRegex[] = [
      { beast: 'Big', recipe: '', regex: 'x'.repeat(99), harvest: false, red: false },
      { beast: 'Small', recipe: '', regex: 'y', harvest: false, red: false },
    ]
    const prices: BeastPriceLine[] = [
      { name: 'Big', chaosValue: 10, listingCount: 10 },
      { name: 'Small', chaosValue: 900, listingCount: 10 },
    ]
    const rows2 = buildBeastRows(data, prices)
    const r = buildBeastRegex(rows2, state({ menagerieLimit: true, pinned: ['Big'] }))
    expect(r.regex).toBe('x'.repeat(99))
    expect(r.included.has('Small')).toBe(false)
  })

  it('reports a pin that does not fit and keeps trying shorter pins', () => {
    const data: BeastRegex[] = [
      { beast: 'Huge', recipe: '', regex: 'x'.repeat(99), harvest: false, red: false },
      { beast: 'Tiny', recipe: '', regex: 'y', harvest: false, red: false },
    ]
    const prices: BeastPriceLine[] = [
      { name: 'Huge', chaosValue: 900, listingCount: 10 },
      { name: 'Tiny', chaosValue: 10, listingCount: 10 },
    ]
    const rows2 = buildBeastRows(data, prices)
    const r = buildBeastRegex(rows2, state({ menagerieLimit: true, pinned: ['Huge', 'Tiny'] }))
    expect(r.regex).toBe('x'.repeat(99))
    expect(r.droppedPins).toEqual(['Tiny'])
  })

  it('treats a name in both lists as pinned once sanitized', () => {
    const s = sanitizeBeastState({ pinned: ['Alpha'], muted: ['Alpha'] })
    expect(buildBeastRegex(rows, s).included.has('Alpha')).toBe(true)
  })

  it('matches upstream exactly when no pins or mutes are set', () => {
    expectParity(rows, state())
    expectParity(rows, state({ includeHarvest: true, menagerieLimit: true }))
    expectParity(rows, state({ redOnly: true, minChaos: 100, maxChaos: 400 }))
  })
})

describe('price-name aliases', () => {
  it("prices Craicic Croaker from poe.ninja's pre-rename Craicic Chimeral line", () => {
    const rows = buildBeastRows(beastRegex, [
      { name: 'Craicic Chimeral', chaosValue: 2424, divineValue: 3, listingCount: 2724, graph: [0, 5] },
    ])
    const croaker = rows.find((r) => r.name === 'Craicic Croaker')
    expect(croaker, 'upstream dropped Craicic Croaker; retire the alias').toBeDefined()
    expect(croaker!.chaosValue).toBe(2424)
    expect(croaker!.listingCount).toBe(2724)
    expect(croaker!.graph).toEqual([0, 5])
  })

  it('prefers an exact-name line over an alias when poe.ninja catches up', () => {
    const rows = buildBeastRows(beastRegex, [
      { name: 'Craicic Chimeral', chaosValue: 2424, listingCount: 2724 },
      { name: 'Craicic Croaker', chaosValue: 99, listingCount: 10 },
    ])
    expect(rows.find((r) => r.name === 'Craicic Croaker')!.chaosValue).toBe(99)
  })

  it('leaves non-aliased beasts alone', () => {
    const rows = buildBeastRows(beastRegex, [{ name: 'Vivid Vulture', chaosValue: 500, listingCount: 20 }])
    expect(rows.find((r) => r.name === 'Vivid Vulture')!.chaosValue).toBe(500)
    expect(rows.find((r) => r.name === 'Black Mórrigan')!.chaosValue).toBe(0)
  })
})

// Fixture beast is Craicic Maw ("cic m"): harvest false, so it survives the
// default includeHarvest: false state, plain ASCII, and not the aliased beast.
// Do NOT use Vivid Vulture here - it is harvest: true and the auto-pack
// correctly excludes it unless includeHarvest is set.
describe('deriveBeastPresetRegex', () => {
  it('rebuilds the pack from the preset settings against fresh prices', () => {
    const cheap = deriveBeastPresetRegex({ beast: sanitizeBeastState({ menagerieLimit: true }) }, [
      { name: 'Craicic Maw', chaosValue: 5, listingCount: 900 },
    ])
    const pricey = deriveBeastPresetRegex({ beast: sanitizeBeastState({ menagerieLimit: true, minChaos: 100 }) }, [
      { name: 'Craicic Maw', chaosValue: 5, listingCount: 900 },
    ])
    expect(cheap).toBe('cic m')
    // Same preset shape, but the bound now excludes the only priced beast.
    expect(pricey).toBe('')
  })

  it('tracks a price move between two snapshots', () => {
    const settings = { beast: sanitizeBeastState({ minChaos: 100 }) }
    const before = deriveBeastPresetRegex(settings, [{ name: 'Craicic Maw', chaosValue: 5, listingCount: 900 }])
    const after = deriveBeastPresetRegex(settings, [{ name: 'Craicic Maw', chaosValue: 5000, listingCount: 900 }])
    expect(before).toBe('')
    expect(after).toBe('cic m')
  })

  it('treats a missing beast payload as default settings', () => {
    expect(deriveBeastPresetRegex({}, [{ name: 'Craicic Maw', chaosValue: 5, listingCount: 900 }])).toBe('cic m')
  })
})
