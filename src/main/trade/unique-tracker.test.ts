import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetUniqueTrackerCacheForTests,
  buildSeries,
  fetchUniqueTracker,
  type OverviewLine,
  pickLine,
  pickUnlinkedLine,
  resolveUniqueNinjaUrl,
  type UniqueTrackerDeps,
} from './unique-tracker'

const DAY = 86400000
const NOW = Date.parse('2026-11-23T15:00:00Z')
const TODAY = Date.parse('2026-11-23T00:00:00Z')

// Live Covens shape: the 6L line sits at a divine while the unlinked one is 19c.
const SHAV: OverviewLine[] = [
  { id: 1, name: "Shavronne's Wrappings", baseType: "Occultist's Vestment", links: 6, chaosValue: 189.9 },
  { id: 2, name: "Shavronne's Wrappings", baseType: "Occultist's Vestment", links: 5, chaosValue: 20 },
  { id: 3, name: "Shavronne's Wrappings", baseType: "Occultist's Vestment", chaosValue: 19 },
]

const q = (name: string, baseType: string, modText: string[] = []) => ({ name, baseType, modText })

describe('pickUnlinkedLine', () => {
  it('never picks a 5L or 6L line', () => {
    expect(pickUnlinkedLine(SHAV, q("Shavronne's Wrappings", "Occultist's Vestment"))?.id).toBe(3)
  })

  it('returns null when ninja only lists linked copies', () => {
    expect(pickUnlinkedLine(SHAV.slice(0, 2), q("Shavronne's Wrappings", "Occultist's Vestment"))).toBeNull()
  })

  it('keeps Foulborn lines separate by exact name', () => {
    const lines: OverviewLine[] = [
      { id: 10, name: 'Headhunter', baseType: 'Leather Belt', chaosValue: 50000 },
      { id: 11, name: 'Foulborn Headhunter', baseType: 'Leather Belt', variant: 'Culling Strike', chaosValue: 250000 },
    ]
    expect(pickUnlinkedLine(lines, q('Headhunter', 'Leather Belt'))?.id).toBe(10)
    expect(pickUnlinkedLine(lines, q('Foulborn Headhunter', 'Leather Belt'))?.id).toBe(11)
  })

  it('picks the variant whose parts appear in the mod text, fewest unmatched first', () => {
    const lines: OverviewLine[] = [
      {
        id: 1,
        name: 'Foulborn Headhunter',
        baseType: 'Leather Belt',
        variant: 'Culling Strike, Minimap Icons',
        chaosValue: 600000,
      },
      { id: 2, name: 'Foulborn Headhunter', baseType: 'Leather Belt', variant: 'Culling Strike', chaosValue: 250000 },
      { id: 3, name: 'Foulborn Headhunter', baseType: 'Leather Belt', variant: 'Soul Eater', chaosValue: 36000 },
    ]
    const mods = ['+40 to Strength', 'Culling Strike']
    expect(pickUnlinkedLine(lines, q('Foulborn Headhunter', 'Leather Belt', mods))?.id).toBe(2)
  })

  it('maps ninja flask counts onto the Mageblood "Leftmost N" line', () => {
    const lines: OverviewLine[] = [
      { id: 1, name: 'Mageblood', baseType: 'Heavy Belt', variant: '4 Flasks', chaosValue: 47000 },
      { id: 2, name: 'Mageblood', baseType: 'Heavy Belt', variant: '2 Flasks', chaosValue: 19000 },
    ]
    const mods = ['Leftmost 4 Magic Utility Flasks constantly apply their Flask Effects to you']
    expect(pickUnlinkedLine(lines, q('Mageblood', 'Heavy Belt', mods))?.id).toBe(1)
  })

  it('falls back to the cheapest line when nothing in the mod text disambiguates', () => {
    const lines: OverviewLine[] = [
      { id: 1, name: 'Mageblood', baseType: 'Heavy Belt', variant: '4 Flasks', chaosValue: 47000 },
      { id: 2, name: 'Mageblood', baseType: 'Heavy Belt', variant: '2 Flasks', chaosValue: 19000 },
    ]
    expect(pickUnlinkedLine(lines, q('Mageblood', 'Heavy Belt'))?.id).toBe(2)
  })

  it('narrows same-name lines to the item base', () => {
    const lines: OverviewLine[] = [
      { id: 1, name: 'Grand Spectrum', baseType: 'Ruby', chaosValue: 400 },
      { id: 2, name: 'Grand Spectrum', baseType: 'Cobalt Jewel', chaosValue: 300 },
    ]
    expect(pickUnlinkedLine(lines, q('Grand Spectrum', 'Cobalt Jewel'))?.id).toBe(2)
  })
})

describe('buildSeries', () => {
  it('dates points from daysAgo and divides each day by that day’s divine rate', () => {
    const divine = new Map([
      [TODAY - DAY, 200],
      [TODAY, 190],
    ])
    const { chaos, divine: div } = buildSeries(
      [
        { count: 126, value: 380, daysAgo: 0 },
        { count: 100, value: 400, daysAgo: 1 },
        { count: 50, value: 450, daysAgo: 2 },
      ],
      divine,
      190,
      NOW,
    )
    expect(chaos.map((p) => p.t)).toEqual([TODAY - 2 * DAY, TODAY - DAY, TODAY])
    expect(chaos.map((p) => p.volume)).toEqual([50, 100, 126])
    // Day 2 has no divine sample, so it falls back to the current rate.
    expect(div.map((p) => p.rate)).toEqual([450 / 190, 2, 2])
  })

  it('drops points with no usable value', () => {
    const { chaos } = buildSeries([{ value: 0, daysAgo: 0 }, { daysAgo: 1 }, { value: 5 }], new Map(), 190, NOW)
    expect(chaos).toEqual([])
  })
})

describe('fetchUniqueTracker', () => {
  beforeEach(() => _resetUniqueTrackerCacheForTests())

  function deps(lines: OverviewLine[], overrides: Partial<UniqueTrackerDeps> = {}): UniqueTrackerDeps {
    return {
      fetchJson: vi.fn(async (url: string) =>
        url.includes('/overview') ? { lines } : [{ count: 3, value: 400, daysAgo: 0 }],
      ),
      getNinjaType: () => 'UniqueArmour',
      chaosPerDivine: 190,
      divineHistory: async () => [],
      detailsUrl: (type, id) => `ninja/${type}/${id}`,
      now: () => NOW,
      ...overrides,
    }
  }

  it('returns null when the unlinked line is under a divine, even if the 6L is over', async () => {
    const d = deps(SHAV)
    expect(await fetchUniqueTracker('Covens', q("Shavronne's Wrappings", "Occultist's Vestment"), d)).toBeNull()
    // Never asks for history it won't show.
    expect(d.fetchJson).toHaveBeenCalledTimes(1)
  })

  it('returns divine and chaos pairs for an unlinked line worth a divine or more', async () => {
    const lines: OverviewLine[] = [
      { id: 7, name: "Kaom's Heart", baseType: 'Glorious Plate', chaosValue: 380, divineValue: 2 },
    ]
    const d = deps(lines)
    const res = await fetchUniqueTracker('Covens', q("Kaom's Heart", 'Glorious Plate'), d)
    expect(res?.pairs.map((p) => [p.currency, p.rate])).toEqual([
      ['divine', 2],
      ['chaos', 380],
    ])
    expect(d.fetchJson).toHaveBeenCalledWith(expect.stringContaining('/history?league=Covens&type=UniqueArmour&id=7'))
  })

  it('ignores non-unique ninja types', async () => {
    const d = deps([], { getNinjaType: () => 'Currency' })
    expect(await fetchUniqueTracker('Covens', q('Divine Orb', 'Divine Orb'), d)).toBeNull()
    expect(d.fetchJson).not.toHaveBeenCalled()
  })

  it('resolves to null when the fetch throws', async () => {
    const d = deps([], {
      fetchJson: async () => {
        throw new Error('offline')
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await fetchUniqueTracker('Covens', q("Kaom's Heart", 'Glorious Plate'), d)).toBeNull()
  })
})

// Live Covens detailsIds: the derived slug "mageblood-heavy-belt" lands on the
// wrong page; ninja's own id names the flask count.
const MAGEBLOOD: OverviewLine[] = [
  {
    id: 1,
    name: 'Mageblood',
    baseType: 'Heavy Belt',
    variant: '2 Flasks',
    chaosValue: 19000,
    detailsId: 'mageblood-heavy-belt',
  },
  {
    id: 2,
    name: 'Mageblood',
    baseType: 'Heavy Belt',
    variant: '4 Flasks',
    chaosValue: 47000,
    detailsId: 'mageblood-4-flasks-heavy-belt',
  },
]
const LEFTMOST_4 = ['Leftmost 4 Magic Utility Flasks constantly apply their Flask Effects to you']

describe('pickLine link buckets', () => {
  it('picks the 5L or 6L line for a linked item', () => {
    const shav = q("Shavronne's Wrappings", "Occultist's Vestment")
    expect(pickLine(SHAV, shav, 6)?.id).toBe(1)
    expect(pickLine(SHAV, shav, 5)?.id).toBe(2)
    expect(pickLine(SHAV, shav, 4)?.id).toBe(3)
  })
})

describe('resolveUniqueNinjaUrl', () => {
  beforeEach(() => _resetUniqueTrackerCacheForTests())

  function linkDeps(lines: OverviewLine[], type = 'UniqueAccessory') {
    return {
      fetchJson: vi.fn(async () => ({ lines })),
      getNinjaType: () => type,
      detailsUrl: (t: string, id: string) => `ninja/${t}/${id}`,
      now: () => NOW,
    }
  }

  it("links the item's own variant page", async () => {
    const url = await resolveUniqueNinjaUrl('Covens', q('Mageblood', 'Heavy Belt', LEFTMOST_4), linkDeps(MAGEBLOOD))
    expect(url).toBe('ninja/UniqueAccessory/mageblood-4-flasks-heavy-belt')
  })

  it('links the 6L page for a 6-linked item', async () => {
    const lines = SHAV.map((l, i) => ({ ...l, detailsId: ['shav-6l', 'shav-5l', 'shav'][i] }))
    const query = { ...q("Shavronne's Wrappings", "Occultist's Vestment"), linkedSockets: 6 }
    expect(await resolveUniqueNinjaUrl('Covens', query, linkDeps(lines, 'UniqueArmour'))).toBe(
      'ninja/UniqueArmour/shav-6l',
    )
  })

  it('falls back to the unlinked page when ninja has no line at that link count', async () => {
    const query = { ...q('Mageblood', 'Heavy Belt', LEFTMOST_4), linkedSockets: 6 }
    expect(await resolveUniqueNinjaUrl('Covens', query, linkDeps(MAGEBLOOD))).toBe(
      'ninja/UniqueAccessory/mageblood-4-flasks-heavy-belt',
    )
  })

  it('returns null for names ninja does not price as uniques', async () => {
    const d = linkDeps([], 'Currency')
    expect(await resolveUniqueNinjaUrl('Covens', q('Divine Orb', 'Divine Orb'), d)).toBeNull()
    expect(d.fetchJson).not.toHaveBeenCalled()
  })
})

describe('fetchUniqueTracker ninjaUrl', () => {
  beforeEach(() => _resetUniqueTrackerCacheForTests())

  it('links the exact line it charts', async () => {
    const res = await fetchUniqueTracker('Covens', q('Mageblood', 'Heavy Belt', LEFTMOST_4), {
      fetchJson: async (url: string) => (url.includes('/overview') ? { lines: MAGEBLOOD } : []),
      getNinjaType: () => 'UniqueAccessory',
      chaosPerDivine: 190,
      divineHistory: async () => [],
      detailsUrl: (t, id) => `ninja/${t}/${id}`,
      now: () => NOW,
    })
    expect(res?.ninjaUrl).toBe('ninja/UniqueAccessory/mageblood-4-flasks-heavy-belt')
  })
})

// Live Covens shapes for the families whose ninja label never appears verbatim.
describe('pickLine variant families', () => {
  it('matches Foulborn lines on mutated mod text, not the abbreviated label', () => {
    const mut = (text: string) => ({ text })
    const lines: OverviewLine[] = [
      {
        id: 1,
        name: "Foulborn Uul-Netol's Embrace",
        baseType: 'Vaal Axe',
        variant: 'Low Intelligence, Fast Bleed',
        chaosValue: 50,
        detailsId: 'both',
        mutatedModifiers: [
          mut('(20-30)% reduced Intelligence Requirement'),
          mut('Bleeding you inflict deals Damage (10-15)% faster'),
        ],
      },
      {
        id: 2,
        name: "Foulborn Uul-Netol's Embrace",
        baseType: 'Vaal Axe',
        variant: 'Fast Bleed',
        chaosValue: 40,
        detailsId: 'fast-bleed',
        mutatedModifiers: [mut('Bleeding you inflict deals Damage (10-15)% faster')],
      },
    ]
    const mods = ['Bleeding you inflict deals Damage 12% faster']
    expect(pickLine(lines, q("Foulborn Uul-Netol's Embrace", 'Vaal Axe', mods))?.detailsId).toBe('fast-bleed')
  })

  it("rejects an Atziri's Splendour label that claims a defence the item lacks", () => {
    const lines: OverviewLine[] = [
      {
        id: 1,
        name: "Atziri's Splendour",
        baseType: 'Sacrificial Garb',
        variant: 'Armour',
        chaosValue: 10,
        detailsId: 'armour',
      },
      {
        id: 2,
        name: "Atziri's Splendour",
        baseType: 'Sacrificial Garb',
        variant: 'Armour/ES/Life',
        chaosValue: 9,
        detailsId: 'armour-es-life',
      },
      {
        id: 3,
        name: "Atziri's Splendour",
        baseType: 'Sacrificial Garb',
        variant: 'Armour/ES',
        chaosValue: 8,
        detailsId: 'armour-es',
      },
    ]
    const q2 = (mods: string[]) => q("Atziri's Splendour", 'Sacrificial Garb', mods)
    expect(pickLine(lines, q2(['400% increased Armour', '+95 to maximum Life']))?.detailsId).toBe('armour')
    expect(pickLine(lines, q2(['210% increased Armour and Energy Shield', '+95 to maximum Life']))?.detailsId).toBe(
      'armour-es-life',
    )
    expect(
      pickLine(lines, q2(['210% increased Armour and Energy Shield', '+75 to maximum Energy Shield']))?.detailsId,
    ).toBe('armour-es')
  })

  it('maps abyssal socket and Voices passive counts', () => {
    const shroud: OverviewLine[] = [
      {
        id: 1,
        name: 'Shroud of the Lightless',
        baseType: 'Carnal Armour',
        variant: '1 Jewel',
        chaosValue: 568,
        detailsId: 'one',
      },
      {
        id: 2,
        name: 'Shroud of the Lightless',
        baseType: 'Carnal Armour',
        variant: '2 Jewels',
        chaosValue: 7,
        detailsId: 'two',
      },
    ]
    expect(pickLine(shroud, q('Shroud of the Lightless', 'Carnal Armour', ['Has 1 Abyssal Socket']))?.detailsId).toBe(
      'one',
    )

    const voices: OverviewLine[] = [
      { id: 1, name: 'Voices', baseType: 'Large Cluster Jewel', chaosValue: 164778, detailsId: 'one' },
      {
        id: 2,
        name: 'Voices',
        baseType: 'Large Cluster Jewel',
        variant: '3 passives',
        chaosValue: 56290,
        detailsId: 'three',
      },
      {
        id: 3,
        name: 'Voices',
        baseType: 'Large Cluster Jewel',
        variant: '7 passives',
        chaosValue: 3,
        detailsId: 'seven',
      },
    ]
    const v = (n: string) =>
      q('Voices', 'Large Cluster Jewel', [`Adds ${n} Small Passive Skill${n === '1' ? '' : 's'} which grant nothing`])
    expect(pickLine(voices, v('3'))?.detailsId).toBe('three')
    expect(pickLine(voices, v('1'))?.detailsId).toBe('one')
  })
})
