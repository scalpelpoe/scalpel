import { describe, expect, it } from 'vitest'
import {
  calculateChances,
  calculateMethods,
  DEFAULT_RATES,
  diluteChances,
  getColorChances,
  recolorNotice,
  socketChances,
  whiteSocketChance,
  type RecipeKey,
} from './chromatic-math'

describe('getColorChances', () => {
  it('weights a mono-requirement base toward its attribute', () => {
    // Vaal Regalia, 194 int. 0.9 * (5 + 5 + 194) / (194 + 15 + 5)
    const c = getColorChances(0, 0, 194)
    expect(c.b).toBeCloseTo(0.857943925233645, 12)
    // Off-colours share the remainder: (1 - 0.9) / 2 + 0.9 * (5 / 214)
    expect(c.r).toBeCloseTo(0.0710280373831776, 12)
    expect(c.g).toBeCloseTo(c.r, 12)
    expect(c.w).toBe(0)
    expect(c.r + c.g + c.b).toBeCloseTo(1, 12)
  })

  it('splits the on-colour budget by weight for a dual-requirement base', () => {
    // Carnal Armour, 114 str / 122 dex. On-colours split 0.9 by requirement.
    const c = getColorChances(114, 122, 0)
    expect(c.r).toBeCloseTo(0.9 * (114 / 236), 12)
    expect(c.g).toBeCloseTo(0.9 * (122 / 236), 12)
    expect(c.b).toBeCloseTo(0.1, 12)
  })

  it('splits purely by requirement for a tri-requirement base', () => {
    const c = getColorChances(66, 66, 66)
    expect(c.r).toBeCloseTo(1 / 3, 12)
    expect(c.g).toBeCloseTo(1 / 3, 12)
    expect(c.b).toBeCloseTo(1 / 3, 12)
  })

  it('returns zeroes rather than NaN when the base has no requirements', () => {
    expect(getColorChances(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0, w: 0 })
  })
})

describe('whiteSocketChance', () => {
  it('falls as item level rises', () => {
    expect(whiteSocketChance(86, 20)).toBeCloseTo(0.676, 12)
    expect(whiteSocketChance(100, 30)).toBeCloseTo(0.58075, 12)
    expect(whiteSocketChance(68, 0)).toBeCloseTo(0.7975, 12)
  })

  it('floors the item level term at 1, so ilvl 1 and ilvl 14 agree', () => {
    expect(whiteSocketChance(1, 0)).toBeCloseTo(0.99625, 12)
    expect(whiteSocketChance(14, 0)).toBeCloseTo(whiteSocketChance(1, 0), 12)
  })

  it('caps the quality term at 30, so q30 and q40 agree', () => {
    expect(whiteSocketChance(20, 30)).toBeCloseTo(0.97075, 12)
    expect(whiteSocketChance(20, 40)).toBeCloseTo(whiteSocketChance(20, 30), 12)
  })
})

describe('diluteChances', () => {
  it('scales the colours by the non-white share and sums to one', () => {
    const d = diluteChances(getColorChances(0, 0, 194), 0.676)
    expect(d.b).toBeCloseTo(0.2779738317757, 12)
    expect(d.r).toBeCloseTo(0.02301308411215, 12)
    expect(d.w).toBe(0.676)
    expect(d.r + d.g + d.b + d.w).toBeCloseTo(1, 12)
  })
})

/**
 * Captured from Siveran's shipped calculator (siveran.github.io, bundle.js dated
 * 2026-07-24) driven headlessly in jsdom, reading `Probability.favg` for full float
 * precision rather than the 5-decimal rendered table. `chances` omits any recipe the
 * reference excluded for that input, which the "offers exactly" assertion checks.
 */
const REFERENCE_CASES: {
  note: string
  base: string
  reqs: [number, number, number]
  itemLevel: number
  quality: number
  sockets: number
  want: [number, number, number]
  white: number
  diluted: { r: number; g: number; b: number; w: number }
  chances: Partial<Record<RecipeKey, number>>
}[] = [
  {
    note: 'mono int, 6S, one colour wanted: the chromatic guarantee is active',
    base: 'Vaal Regalia (int only)',
    reqs: [0, 0, 194],
    itemLevel: 86,
    quality: 20,
    sockets: 6,
    want: [0, 0, 1],
    white: 0.676,
    diluted: { r: 0.02301308411215, g: 0.02301308411215, b: 0.2779738317757, w: 0.676 },
    chances: {
      drop: 0.85831703807798,
      chromatic: 0.97451191324173,
      trichrome: 1,
      nonwhite2: 0.9945155715875,
      nonwhite3: 0.99892095826037,
      nonwhite4: 0.99978770238423,
    },
  },
  {
    note: 'mono int, 6S, two colours wanted: the chromatic guarantee is suppressed',
    base: 'Vaal Regalia (int only)',
    reqs: [0, 0, 194],
    itemLevel: 86,
    quality: 20,
    sockets: 6,
    want: [0, 0, 2],
    white: 0.676,
    diluted: { r: 0.02301308411215, g: 0.02301308411215, b: 0.2779738317757, w: 0.676 },
    chances: {
      drop: 0.53103674639835,
      chromatic: 0.53983508446424,
      trichrome: 0.62359202728685,
      nonwhite2: 0.91982361937596,
      nonwhite3: 0.97812416046894,
      nonwhite4: 0.99449557343659,
    },
  },
  {
    note: 'all six sockets one colour; trichrome has no spare socket and drops out',
    base: 'Vaal Regalia (int only)',
    reqs: [0, 0, 194],
    itemLevel: 86,
    quality: 20,
    sockets: 6,
    want: [0, 0, 6],
    white: 0.676,
    diluted: { r: 0.02301308411215, g: 0.02301308411215, b: 0.2779738317757, w: 0.676 },
    chances: {
      drop: 0.0004613425187113,
      chromatic: 0.00047287865712398,
      nonwhite2: 0.0043947427860777,
      nonwhite3: 0.013564020944684,
      nonwhite4: 0.041864262174952,
    },
  },
  {
    note: 'item level floor: ilvl 1 must equal ilvl 14',
    base: 'Vaal Regalia (int only)',
    reqs: [0, 0, 194],
    itemLevel: 1,
    quality: 0,
    sockets: 4,
    want: [2, 0, 0],
    white: 0.99625,
    diluted: { r: 0.00026635514018692, g: 0.00026635514018692, b: 0.0032172897196262, w: 0.99625 },
    chances: {
      drop: 4.2551920667085e-7,
      chromatic: 0.000017543001129439,
      trichrome: 0.00026635514018692,
      nonwhite2: 0.0051153336607283,
      nonwhite3: 0.01446725577024,
      nonwhite4: 0.02747956668559,
    },
  },
  {
    note: 'item level floor: ilvl 1 must equal ilvl 14',
    base: 'Vaal Regalia (int only)',
    reqs: [0, 0, 194],
    itemLevel: 14,
    quality: 0,
    sockets: 4,
    want: [2, 0, 0],
    white: 0.99625,
    diluted: { r: 0.00026635514018692, g: 0.00026635514018692, b: 0.0032172897196262, w: 0.99625 },
    chances: {
      drop: 4.2551920667085e-7,
      chromatic: 0.000017543001129439,
      trichrome: 0.00026635514018692,
      nonwhite2: 0.0051153336607283,
      nonwhite3: 0.01446725577024,
      nonwhite4: 0.02747956668559,
    },
  },
  {
    note: 'quality cap: q30 must equal q40',
    base: 'Vaal Regalia (int only)',
    reqs: [0, 0, 194],
    itemLevel: 20,
    quality: 30,
    sockets: 4,
    want: [2, 0, 0],
    white: 0.97075,
    diluted: { r: 0.0020775700934579, g: 0.0020775700934579, b: 0.025094859813084, w: 0.97075 },
    chances: {
      drop: 0.000025826101565966,
      chromatic: 0.00014336502997891,
      trichrome: 0.0020775700934579,
      nonwhite2: 0.0055964750957421,
      nonwhite3: 0.01480031868451,
      nonwhite4: 0.02747956668559,
    },
  },
  {
    note: 'quality cap: q30 must equal q40',
    base: 'Vaal Regalia (int only)',
    reqs: [0, 0, 194],
    itemLevel: 20,
    quality: 40,
    sockets: 4,
    want: [2, 0, 0],
    white: 0.97075,
    diluted: { r: 0.0020775700934579, g: 0.0020775700934579, b: 0.025094859813084, w: 0.97075 },
    chances: {
      drop: 0.000025826101565966,
      chromatic: 0.00014336502997891,
      trichrome: 0.0020775700934579,
      nonwhite2: 0.0055964750957421,
      nonwhite3: 0.01480031868451,
      nonwhite4: 0.02747956668559,
    },
  },
  {
    note: 'dual requirement base',
    base: 'Carnal Armour (str/dex)',
    reqs: [114, 122, 0],
    itemLevel: 86,
    quality: 20,
    sockets: 4,
    want: [2, 0, 0],
    white: 0.676,
    diluted: { r: 0.14085762711864, g: 0.15074237288136, b: 0.0324, w: 0.676 },
    chances: {
      drop: 0.097868303000456,
      chromatic: 0.10437474617543,
      trichrome: 0.14085762711864,
      nonwhite2: 0.32405029043634,
      nonwhite3: 0.46137254396309,
      nonwhite4: 0.58384158564053,
    },
  },
  {
    note: 'dual req at max ilvl and quality; no spare socket for trichrome',
    base: 'Carnal Armour (str/dex)',
    reqs: [114, 122, 0],
    itemLevel: 100,
    quality: 30,
    sockets: 6,
    want: [4, 0, 2],
    white: 0.58075,
    diluted: { r: 0.18226716101695, g: 0.19505783898305, b: 0.041925, w: 0.58075 },
    chances: {
      drop: 0.000029098534563003,
      chromatic: 0.00002923930937293,
      nonwhite2: 0.00016554839530085,
      nonwhite3: 0.00039486796732463,
      nonwhite4: 0.00094184369069679,
    },
  },
  {
    note: 'tri requirement base; trichrome is a guaranteed hit',
    base: "Atziri's Splendour (tri)",
    reqs: [66, 66, 66],
    itemLevel: 100,
    quality: 30,
    sockets: 4,
    want: [1, 1, 1],
    white: 0.58075,
    diluted: { r: 0.13975, g: 0.13975, b: 0.13975, w: 0.58075 },
    chances: {
      drop: 0.051772589339859,
      chromatic: 0.053075635190505,
      trichrome: 1,
      nonwhite2: 0.18633333333333,
      nonwhite3: 0.31538888888889,
      nonwhite4: 0.44444444444444,
    },
  },
  {
    note: 'trichrome skipped: flexible sockets would go negative',
    base: "Atziri's Splendour (tri)",
    reqs: [66, 66, 66],
    itemLevel: 68,
    quality: 0,
    sockets: 3,
    want: [3, 0, 0],
    white: 0.7975,
    diluted: { r: 0.0675, g: 0.0675, b: 0.0675, w: 0.7975 },
    chances: {
      drop: 0.000307546875,
      chromatic: 0.00043418889182845,
      nonwhite2: 0.0075,
      nonwhite3: 0.037037037037037,
    },
  },
  {
    note: 'mono str, 3S: the 4-non-white recipe does not fit',
    base: 'Astral Plate (str only)',
    reqs: [180, 0, 0],
    itemLevel: 68,
    quality: 0,
    sockets: 3,
    want: [1, 0, 0],
    white: 0.7975,
    diluted: { r: 0.1731375, g: 0.01468125, b: 0.01468125, w: 0.7975 },
    chances: {
      drop: 0.43467279080869,
      chromatic: 0.9231269951944,
      trichrome: 1,
      nonwhite2: 0.9826152159375,
      nonwhite3: 0.996951375,
    },
  },
  {
    note: 'single socket: only natural roll and chromatic survive',
    base: 'Astral Plate (str only)',
    reqs: [180, 0, 0],
    itemLevel: 86,
    quality: 20,
    sockets: 1,
    want: [1, 0, 0],
    white: 0.676,
    diluted: { r: 0.27702, g: 0.02349, b: 0.02349, w: 0.676 },
    chances: { drop: 0.27702, chromatic: 0.8954933654551 },
  },
  {
    note: 'two sockets: of the bench recipes only 2-non-white fits',
    base: "Assassin's Garb (dex only)",
    reqs: [0, 197, 0],
    itemLevel: 86,
    quality: 20,
    sockets: 2,
    want: [1, 1, 0],
    white: 0.676,
    diluted: { r: 0.022918894009217, g: 0.27816221198157, b: 0.022918894009217, w: 0.676 },
    chances: { drop: 0.01275034050755, chromatic: 0.019886020104048, nonwhite2: 0.12145957654654 },
  },
]

const inputOf = (c: (typeof REFERENCE_CASES)[number]) => ({
  reqStr: c.reqs[0],
  reqDex: c.reqs[1],
  reqInt: c.reqs[2],
  itemLevel: c.itemLevel,
  quality: c.quality,
  totalSockets: c.sockets,
  wantR: c.want[0],
  wantG: c.want[1],
  wantB: c.want[2],
})

describe('calculateChances matches the reference calculator', () => {
  for (const c of REFERENCE_CASES) {
    const title = `${c.base} ilvl${c.itemLevel} q${c.quality} ${c.sockets}S want ${c.want[0]}R${c.want[1]}G${c.want[2]}B - ${c.note}`

    it(`${title}: per-socket chances`, () => {
      const s = socketChances(inputOf(c))
      expect(s.r).toBeCloseTo(c.diluted.r, 12)
      expect(s.g).toBeCloseTo(c.diluted.g, 12)
      expect(s.b).toBeCloseTo(c.diluted.b, 12)
      expect(s.w).toBeCloseTo(c.diluted.w, 12)
    })

    it(`${title}: offers exactly the reference's recipes`, () => {
      const keys = calculateChances(inputOf(c)).map((r) => r.recipe.key)
      expect([...keys].sort()).toEqual(Object.keys(c.chances).sort())
    })

    it(`${title}: per-recipe chances`, () => {
      const results = calculateChances(inputOf(c))
      expect(results.length).toBeGreaterThan(0)
      for (const { recipe, chance } of results) {
        const expected = c.chances[recipe.key]
        expect(expected, `no reference value for ${recipe.key}`).toBeDefined()
        expect(chance, recipe.key).toBeCloseTo(expected as number, 12)
      }
    })
  }
})

describe('calculateChances guards', () => {
  const base = {
    reqStr: 0,
    reqDex: 0,
    reqInt: 194,
    itemLevel: 86,
    quality: 20,
    totalSockets: 4,
    wantR: 0,
    wantG: 0,
    wantB: 2,
  }

  it('returns nothing when more colours are wanted than there are sockets', () => {
    expect(calculateChances({ ...base, totalSockets: 1 })).toEqual([])
  })

  it('returns nothing for a socketless item', () => {
    expect(calculateChances({ ...base, totalSockets: 0 })).toEqual([])
  })

  it('returns nothing when the base has no attribute requirements', () => {
    expect(calculateChances({ ...base, reqInt: 0 })).toEqual([])
  })

  it('returns nothing when no colored sockets are wanted', () => {
    expect(calculateChances({ ...base, wantR: 0, wantG: 0, wantB: 0 })).toEqual([])
  })

  it('returns nothing for an unknown item level', () => {
    expect(calculateChances({ ...base, itemLevel: 0 })).toEqual([])
  })
})

describe('calculateMethods', () => {
  // Astral Plate, 3 sockets, one red wanted. Chosen so every recipe except 4-non-white
  // applies: trichrome needs two spare sockets to absorb the green and blue it forces,
  // and this input has exactly that.
  const input = {
    reqStr: 180,
    reqDex: 0,
    reqInt: 0,
    itemLevel: 86,
    quality: 20,
    totalSockets: 3,
    wantR: 1,
    wantG: 0,
    wantB: 0,
  }
  const rates = { chromChaos: 2, omenChaos: 600 }

  it('offers every recipe that fits three sockets', () => {
    expect(
      calculateMethods(input, rates)
        .map((r) => r.key)
        .sort(),
    ).toEqual(['chromatic', 'drop', 'nonwhite2', 'nonwhite3', 'trichrome'].sort())
  })

  it('prices chromatic recipes off the chromatic rate', () => {
    const rows = calculateMethods(input, rates)
    const chrom = rows.find((r) => r.key === 'chromatic')
    expect(chrom).toBeDefined()
    // 1 chromatic per try, so the average count is 1 / chance.
    expect(chrom?.chroms).toBeCloseTo(1 / (chrom?.chance as number), 10)
    expect(chrom?.avgChaos).toBeCloseTo((chrom?.chroms as number) * 2, 10)
    expect(chrom?.omens).toBeNull()
  })

  it('prices the 3-non-white bench recipe at 20 chromatics a try', () => {
    const row = calculateMethods(input, rates).find((r) => r.key === 'nonwhite3')
    expect(row?.chroms).toBeCloseTo(20 / (row?.chance as number), 10)
    expect(row?.avgChaos).toBeCloseTo((row?.chroms as number) * 2, 10)
  })

  it('prices trichromatism off the omen rate, not the chromatic rate', () => {
    const row = calculateMethods(input, rates).find((r) => r.key === 'trichrome')
    expect(row?.chroms).toBeNull()
    expect(row?.omens).toBeCloseTo(1 / (row?.chance as number), 10)
    expect(row?.avgChaos).toBeCloseTo((row?.omens as number) * 600, 10)
  })

  it('leaves the natural roll unpriced', () => {
    const row = calculateMethods(input, rates).find((r) => r.key === 'drop')
    expect(row?.chroms).toBeNull()
    expect(row?.omens).toBeNull()
    expect(row?.avgChaos).toBeNull()
  })

  it('sorts priced rows cheapest first and pins the natural roll last', () => {
    const rows = calculateMethods(input, rates)
    expect(rows[rows.length - 1].key).toBe('drop')
    const priced = rows.filter((r) => r.avgChaos != null).map((r) => r.avgChaos as number)
    expect(priced).toEqual([...priced].sort((a, b) => a - b))
  })

  it('re-ranks when the omen gets expensive', () => {
    const cheapOmen = calculateMethods(input, { chromChaos: 2, omenChaos: 1 })
    const dearOmen = calculateMethods(input, { chromChaos: 2, omenChaos: 100000 })
    expect(cheapOmen[0].key).toBe('trichrome')
    expect(dearOmen[dearOmen.length - 2].key).toBe('trichrome')
  })

  it('carries the forced colours through for the swatch', () => {
    const row = calculateMethods(input, rates).find((r) => r.key === 'trichrome')
    expect(row?.forced).toEqual({ r: 1, g: 1, b: 1 })
    const chrom = calculateMethods(input, rates).find((r) => r.key === 'chromatic')
    expect(chrom?.forced).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('ships usable default rates', () => {
    expect(DEFAULT_RATES.chromChaos).toBeGreaterThan(0)
    expect(DEFAULT_RATES.omenChaos).toBeGreaterThan(0)
  })
})

describe('recolorNotice', () => {
  const ok = {
    reqStr: 180,
    reqDex: 0,
    reqInt: 0,
    itemLevel: 86,
    quality: 20,
    totalSockets: 3,
    wantR: 1,
    wantG: 0,
    wantB: 0,
  }

  it('passes a well-formed item', () => {
    expect(recolorNotice(ok)).toBeNull()
  })

  it('reports a base with no attribute requirements first', () => {
    expect(recolorNotice({ ...ok, reqStr: 0, itemLevel: 0, wantR: 0 })).toBe('no-requirements')
  })

  it('reports a missing item level ahead of an empty colour pick', () => {
    expect(recolorNotice({ ...ok, itemLevel: 0, wantR: 0 })).toBe('no-item-level')
  })

  it('reports an all-white pick', () => {
    expect(recolorNotice({ ...ok, wantR: 0 })).toBe('no-colors')
  })
})
