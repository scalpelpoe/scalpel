import { describe, it, expect } from 'vitest'
import { buildTabletRegex, type TabletBuildArgs } from './tablet-engine'
import { generateTabletRegex } from './__fixtures__/poe2re/TabletResult'
import type { Settings } from './__fixtures__/poe2re/Settings'
import type { SelectOption } from './__fixtures__/poe2re/SelectOption'
import { TABLET_MODS } from '@shared/data/regex/tablet-mods'
import { generateBoundedValueRegex, generateNumberRegex } from './waystone-number-regex'

function emptyArgs(): TabletBuildArgs {
  return {
    mods: TABLET_MODS,
    rarity: { normal: false, magic: false, rare: false },
    type: {
      irradiated: false,
      ritual: false,
      delirium: false,
      breach: false,
      abyss: false,
      temple: false,
      overseer: false,
    },
    uses: { enabled: false, value: 1 },
    selections: { want: new Set<number>(), wantMode: 'any', wantValues: {} },
    round10: false,
    customText: '',
  }
}

/** Build the upstream Settings shape from our args so both engines see identical
 *  data (same affix order = same any-mode join order). */
function asUpstream(a: TabletBuildArgs): Settings {
  const affixes: SelectOption[] = a.mods.map((m) => ({
    name: m.text,
    value: a.selections.wantValues[m.id] ?? null,
    isSelected: a.selections.want.has(m.id),
    ranges: m.ranges,
    regex: m.regex,
  }))
  return {
    waystone: {
      resultSettings: { customText: '', autoCopy: false },
      tier: { min: 0, max: 0 },
      rarity: { corrupted: false, uncorrupted: false },
      revives: { min: 0, max: 6 },
      rarityFilter: { normal: false, magic: false, rare: false },
      modifier: {
        over100: false,
        round10: false,
        dropOverX: false,
        dropOverValue: 0,
        delirious: false,
        anyPack: false,
        prefixSelectType: 'any',
        prefixes: [],
        suffixes: [],
      },
    },
    vendor: undefined as never,
    tablet: {
      resultSettings: { customText: a.customText ?? '', autoCopy: false },
      rarity: a.rarity,
      type: a.type,
      modifier: {
        usesRemaining: a.uses.enabled,
        numUsesRemaining: a.uses.value,
        affixes,
        affixSelectType: a.selections.wantMode,
        round10: a.round10,
      },
    },
  }
}

describe('buildTabletRegex parity', () => {
  const ids = TABLET_MODS.map((m) => m.id)
  const cases: Array<{ name: string; mutate: (a: TabletBuildArgs) => void }> = [
    { name: 'empty', mutate: () => {} },
    {
      name: 'rarity normal',
      mutate: (a) => {
        a.rarity.normal = true
      },
    },
    {
      name: 'rarity all (drop)',
      mutate: (a) => {
        a.rarity.normal = true
        a.rarity.magic = true
        a.rarity.rare = true
      },
    },
    {
      name: 'rarity rare',
      mutate: (a) => {
        a.rarity.rare = true
      },
    },
    {
      name: 'rarity magic + rare',
      mutate: (a) => {
        a.rarity.magic = true
        a.rarity.rare = true
      },
    },
    {
      name: 'type single',
      mutate: (a) => {
        a.type.breach = true
      },
    },
    {
      name: 'type multi',
      mutate: (a) => {
        a.type.breach = true
        a.type.ritual = true
      },
    },
    {
      name: 'type abyss + temple',
      mutate: (a) => {
        a.type.abyss = true
        a.type.temple = true
      },
    },
    {
      name: 'type all (drop)',
      mutate: (a) => {
        a.type.irradiated =
          a.type.ritual =
          a.type.delirium =
          a.type.breach =
          a.type.abyss =
          a.type.temple =
          a.type.overseer =
            true
      },
    },
    {
      name: 'uses min',
      mutate: (a) => {
        a.uses.enabled = true
        a.uses.value = 1
      },
    },
    {
      name: 'uses 9',
      mutate: (a) => {
        a.uses.enabled = true
        a.uses.value = 9
      },
    },
    {
      name: 'uses 14',
      mutate: (a) => {
        a.uses.enabled = true
        a.uses.value = 14
      },
    },
    {
      name: 'affix any',
      mutate: (a) => {
        a.selections.want = new Set([ids[0], ids[1]])
      },
    },
    {
      name: 'affix all',
      mutate: (a) => {
        a.selections.want = new Set([ids[0], ids[1]])
        a.selections.wantMode = 'all'
      },
    },
    {
      // TABLET_MODS[2] carries ranges [[30, 60]]; keep the value in-range so both
      // sides exercise the bounded value(min-max) path. A rangeless mod is not a
      // valid parity case here: upstream's real selectedOptionRegex always reads
      // option.ranges[0][1] and cannot handle a mod without range data (only our
      // engine guards that case) -- see the rangeless-fallback direct unit test below.
      name: 'affix with value (ranged mod emits a bounded range)',
      mutate: (a) => {
        a.selections.want = new Set([ids[2]])
        a.selections.wantValues = { [ids[2]]: 40 }
      },
    },
    {
      name: 'affix value round10 (ranged mod, bounded range)',
      mutate: (a) => {
        a.selections.want = new Set([ids[2]])
        a.selections.wantValues = { [ids[2]]: 45 }
        a.round10 = true
      },
    },
    {
      name: 'custom text',
      mutate: (a) => {
        a.selections.want = new Set([ids[2]])
        a.customText = 'foo'
      },
    },
    {
      name: 'kitchen sink',
      mutate: (a) => {
        a.rarity.magic = true
        a.type.delirium = true
        a.uses.enabled = true
        a.uses.value = 12
        a.selections.want = new Set([ids[0], ids[3]])
        a.customText = 'bar'
      },
    },
  ]
  for (const c of cases) {
    it(`matches upstream: ${c.name}`, () => {
      const a = emptyArgs()
      c.mutate(a)
      expect(buildTabletRegex(a)).toBe(generateTabletRegex(asUpstream(a)))
    })
  }
})

describe('buildTabletRegex: bounded value(min-max) matching', () => {
  it('value-bearing mod emits a bounded range anchored on the range paren', () => {
    const mod = TABLET_MODS.find((m) => m.ranges.length > 0)!
    const a = emptyArgs()
    a.selections.want = new Set([mod.id])
    a.selections.wantValues = { [mod.id]: mod.ranges[0][0] }
    const expectedRange = generateBoundedValueRegex(String(mod.ranges[0][0]), String(mod.ranges[0][1]), false, false)
    expect(buildTabletRegex(a)).toBe(`"${expectedRange}.*${mod.regex}"`)
  })

  it('value on a rangeless mod falls back to the scalar >= regex', () => {
    const mod = TABLET_MODS.find((m) => m.ranges.length === 0)!
    const a = emptyArgs()
    a.selections.want = new Set([mod.id])
    a.selections.wantValues = { [mod.id]: 25 }
    const expectedScalar = generateNumberRegex('25', false, false)
    expect(buildTabletRegex(a)).toBe(`"${expectedScalar}.*${mod.regex}"`)
    expect(buildTabletRegex(a)).not.toContain('\\(')
  })
})

describe('buildTabletRegex specifics', () => {
  it('returns empty string when nothing selected', () => {
    expect(buildTabletRegex(emptyArgs())).toBe('')
  })
  it('uses-remaining n>=10 uses the 1[x-8] branch', () => {
    const a = emptyArgs()
    a.uses.enabled = true
    a.uses.value = 14
    expect(buildTabletRegex(a)).toBe('"(1[4-8]) us"')
  })
  it('emits rare rarity', () => {
    const a = emptyArgs()
    a.rarity.rare = true
    expect(buildTabletRegex(a)).toBe('"y: r"')
  })
  it('emits abyss and temple type tokens', () => {
    const a = emptyArgs()
    a.type.abyss = true
    a.type.temple = true
    expect(buildTabletRegex(a)).toBe('"(byss|empl)"')
  })
})

/**
 * Golden strings captured by hand from the LIVE poe2.re/tablet page (not from the
 * verbatim TabletResult.ts fixture). The parity block proves we match their code;
 * these anchor our output to the actual site, catching a systematic transcription
 * error in the fixture (which would pass parity). The customText case exercises the
 * engine's customText arg, which the TabletGenerator UI does not currently feed.
 *
 * Exception: the two multi-type cases ('"(tual|eac)"', '"(tual|eac|eer)"') were
 * re-derived from upstream's 4.5.2 type-token reorder in TabletResult.ts source,
 * not re-captured live. Re-capture on the next live-site golden refresh.
 */
describe('buildTabletRegex golden (live poe2.re/tablet captures)', () => {
  const golden: Array<{ name: string; mutate: (a: TabletBuildArgs) => void; expected: string }> = [
    {
      name: 'rarity normal',
      mutate: (a) => {
        a.rarity.normal = true
      },
      expected: '"y: n"',
    },
    {
      name: 'rarity magic',
      mutate: (a) => {
        a.rarity.magic = true
      },
      expected: '"y: m"',
    },
    {
      name: 'type breach',
      mutate: (a) => {
        a.type.breach = true
      },
      expected: '"(eac)"',
    },
    {
      name: 'type breach + ritual',
      mutate: (a) => {
        a.type.breach = true
        a.type.ritual = true
      },
      expected: '"(tual|eac)"',
    },
    {
      name: 'type breach + ritual + overseer',
      mutate: (a) => {
        a.type.breach = true
        a.type.ritual = true
        a.type.overseer = true
      },
      expected: '"(tual|eac|eer)"',
    },
    {
      name: 'uses 1',
      mutate: (a) => {
        a.uses.enabled = true
        a.uses.value = 1
      },
      expected: '"([1-9]|1[0-8]) us"',
    },
    {
      name: 'uses 9',
      mutate: (a) => {
        a.uses.enabled = true
        a.uses.value = 9
      },
      expected: '"(9|1[0-8]) us"',
    },
    {
      name: 'uses 14',
      mutate: (a) => {
        a.uses.enabled = true
        a.uses.value = 14
      },
      expected: '"(1[4-8]) us"',
    },
    {
      name: 'rarity magic + custom text',
      mutate: (a) => {
        a.rarity.magic = true
        a.customText = 'mirror'
      },
      expected: '"y: m" mirror',
    },
    {
      name: 'single affix (Abyss Pits twice as likely to have Rewards)',
      mutate: (a) => {
        const mod = TABLET_MODS.find((m) => m.text === 'Abyss Pits in Map are twice as likely to have Rewards')
        if (!mod) throw new Error('expected Abyss Pits affix in TABLET_MODS')
        a.selections.want = new Set([mod.id])
      },
      expected: '"tw"',
    },
  ]

  for (const c of golden) {
    it(`matches live output: ${c.name}`, () => {
      const a = emptyArgs()
      c.mutate(a)
      expect(buildTabletRegex(a)).toBe(c.expected)
    })
  }
})
