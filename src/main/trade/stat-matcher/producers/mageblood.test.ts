import { beforeEach, describe, expect, it } from 'vitest'
import { setPoeVersion } from '@main/game-state'
import { parseItemText } from '../../clipboard'
import { _setStatEntriesForTests, matchItemMods } from '../index'

// Shape taken from the LIVE trade2 /data/stats (fetched 2026-07-06), not EE2's
// stats.ndjson: each Mage's Legacy is its OWN stat entry with the option baked
// into the id as an "|N" suffix, full text, and NO option field. (Amethyst|1,
// Gold|5, Jade|7, Quicksilver|8, Silver|11, Sulphur|13, Topaz|14 -- subset used below.)
const LEGACY_ENTRIES = [
  { id: 'explicit.stat_264262054|1', text: 'Legacy of Amethyst', type: 'explicit' },
  { id: 'explicit.stat_264262054|5', text: 'Legacy of Gold', type: 'explicit' },
  { id: 'explicit.stat_264262054|7', text: 'Legacy of Jade', type: 'explicit' },
  { id: 'explicit.stat_264262054|8', text: 'Legacy of Quicksilver', type: 'explicit' },
  { id: 'explicit.stat_264262054|11', text: 'Legacy of Silver', type: 'explicit' },
  { id: 'explicit.stat_264262054|13', text: 'Legacy of Sulphur', type: 'explicit' },
  { id: 'explicit.stat_264262054|14', text: 'Legacy of Topaz', type: 'explicit' },
]

const EFFECT_ENTRY = {
  id: 'explicit.stat_3874491706',
  text: "All Mage's Legacies have #% increased effect per duplicate Mage's Legacy you have",
  type: 'explicit',
}

const CHARM_ENTRY = { id: 'implicit.stat_1416292992', text: 'Has # Charm Slot', type: 'implicit' }
const FLASK_RECOVERY_ENTRY = {
  id: 'implicit.stat_462041840',
  text: '#% of Flask Recovery applied Instantly',
  type: 'implicit',
}

const MAGEBLOOD_ITEM_INFO = {
  sockets: '',
  linkedSockets: 0,
  quality: 0,
  itemLevel: 80,
  baseType: 'Utility Belt',
  rarity: 'Unique',
  itemClass: 'Belts',
  name: 'Mageblood',
  gemLevel: 0,
  corrupted: false,
  mirrored: false,
}

const LEGACY_BASE = 'explicit.stat_264262054'

beforeEach(() => {
  setPoeVersion(2)
  _setStatEntriesForTests([...LEGACY_ENTRIES, EFFECT_ENTRY, CHARM_ENTRY, FLASK_RECOVERY_ENTRY])
})

// Explicit lines below are the cleaned form the clipboard parser feeds the matcher
// (cleanAdvancedModLine strips the "(Amethyst-Topaz) -- Unscalable Value" suffix from
// the real advanced copy, leaving "Legacy of Silver").
describe('postProcessMageblood (via matchItemMods end-to-end)', () => {
  it('4 distinct Legacies -> 4 mageblood-legacy chips (suffixed ids), dup N=0 disabled', () => {
    const filters = matchItemMods(
      ['Legacy of Amethyst', 'Legacy of Gold', 'Legacy of Jade', 'Legacy of Topaz'],
      [],
      undefined,
      MAGEBLOOD_ITEM_INFO,
    )

    const legacyChips = filters.filter((f) => f.type === 'mageblood-legacy')
    expect(legacyChips).toHaveLength(4)
    expect(legacyChips.map((f) => f.id).sort()).toEqual([
      'explicit.stat_264262054|1',
      'explicit.stat_264262054|14',
      'explicit.stat_264262054|5',
      'explicit.stat_264262054|7',
    ])
    for (const chip of legacyChips) {
      expect(chip.value).toBeNull()
      expect(chip.enabled).toBe(true)
      expect(chip.premium).toBe(true)
    }
    // The raw explicit-typed Legacy chips must not survive alongside the collapsed ones.
    expect(filters.filter((f) => f.id.startsWith(LEGACY_BASE) && f.type === 'explicit')).toHaveLength(0)

    const dupChip = filters.find((f) => f.type === 'mageblood-dup')
    expect(dupChip?.value).toBe(0)
    expect(dupChip?.min).toBe(0)
    expect(dupChip?.enabled).toBe(false)
  })

  it('the reported item (Silver, Quicksilver, Sulphur x2) -> 3 distinct chips, dup N=1', () => {
    const filters = matchItemMods(
      ['Legacy of Silver', 'Legacy of Quicksilver', 'Legacy of Sulphur', 'Legacy of Sulphur'],
      [],
      undefined,
      MAGEBLOOD_ITEM_INFO,
    )

    const legacyChips = filters.filter((f) => f.type === 'mageblood-legacy')
    expect(legacyChips.map((f) => f.id).sort()).toEqual([
      'explicit.stat_264262054|11',
      'explicit.stat_264262054|13',
      'explicit.stat_264262054|8',
    ])

    const dupChip = filters.find((f) => f.type === 'mageblood-dup')
    expect(dupChip?.value).toBe(1)
    expect(dupChip?.enabled).toBe(true)
    // premium so the Duplicates constraint survives the unique's Base-mode pass.
    expect(dupChip?.premium).toBe(true)
  })

  it('Topaz x3 + Gold x1 (2 distinct) -> dup N=2', () => {
    const filters = matchItemMods(
      ['Legacy of Topaz', 'Legacy of Topaz', 'Legacy of Topaz', 'Legacy of Gold'],
      [],
      undefined,
      MAGEBLOOD_ITEM_INFO,
    )
    const legacyChips = filters.filter((f) => f.type === 'mageblood-legacy')
    expect(legacyChips.map((f) => f.id).sort()).toEqual(['explicit.stat_264262054|14', 'explicit.stat_264262054|5'])
    expect(filters.find((f) => f.type === 'mageblood-dup')?.value).toBe(2)
  })

  it('single Legacy x4 -> 1 chip, dup N=3', () => {
    const filters = matchItemMods(
      ['Legacy of Topaz', 'Legacy of Topaz', 'Legacy of Topaz', 'Legacy of Topaz'],
      [],
      undefined,
      MAGEBLOOD_ITEM_INFO,
    )
    const legacyChips = filters.filter((f) => f.type === 'mageblood-legacy')
    expect(legacyChips).toHaveLength(1)
    expect(legacyChips[0].id).toBe('explicit.stat_264262054|14')
    expect(filters.find((f) => f.type === 'mageblood-dup')?.value).toBe(3)
  })

  it('force-enables the effect chip and the charm-slot chip when present', () => {
    const filters = matchItemMods(
      [
        'Legacy of Amethyst',
        'Legacy of Gold',
        'Legacy of Jade',
        'Legacy of Topaz',
        "All Mage's Legacies have 47% increased effect per duplicate Mage's Legacy you have",
      ],
      ['Has 2 Charm Slots'], // real clipboard is plural; text-variants folds it to the singular stat
      undefined,
      MAGEBLOOD_ITEM_INFO,
    )

    const effectChip = filters.find((f) => f.id === 'explicit.stat_3874491706')
    expect(effectChip?.enabled).toBe(true)
    expect(effectChip?.premium).toBe(true)

    const charmChip = filters.find((f) => f.id === 'implicit.stat_1416292992')
    expect(charmChip?.enabled).toBe(true)
    expect(charmChip?.premium).toBe(true)
  })

  it('leaves filters unchanged for a non-Mageblood unique', () => {
    const filters = matchItemMods(['Legacy of Topaz'], [], undefined, { ...MAGEBLOOD_ITEM_INFO, name: 'Headhunter' })
    expect(filters.some((f) => f.type === 'mageblood-legacy')).toBe(false)
    expect(filters.some((f) => f.type === 'mageblood-dup')).toBe(false)
  })

  it('leaves filters unchanged on PoE1', () => {
    setPoeVersion(1)
    const filters = matchItemMods(['Legacy of Topaz'], [], undefined, MAGEBLOOD_ITEM_INFO)
    expect(filters.some((f) => f.type === 'mageblood-legacy')).toBe(false)
    expect(filters.some((f) => f.type === 'mageblood-dup')).toBe(false)
  })

  // End-to-end from the exact reported advanced (Ctrl+Alt+C) clipboard: proves the
  // real path (em-dash header parsing, "(Amethyst-Topaz) -- Unscalable Value" cleanup,
  // advanced-block routing into explicits) yields the collapsed chips + Duplicates: 1.
  it('parses the reported advanced clipboard end-to-end -> 3 Legacies, dup N=1', () => {
    const EM = String.fromCharCode(0x2014) // em-dash, as the game emits it in advanced copies
    const clipboard = [
      'Item Class: Belts',
      'Rarity: Unique',
      'Mageblood',
      'Utility Belt',
      '--------',
      'Requires: Level 55',
      '--------',
      'Item Level: 80',
      '--------',
      '{ Implicit Modifier }',
      '20% of Flask Recovery applied Instantly',
      `{ Implicit Modifier ${EM} Charm }`,
      'Has 2(1-3) Charm Slots',
      '--------',
      '{ Unique Modifier }',
      `Legacy of Silver(Amethyst-Topaz) ${EM} Unscalable Value`,
      '{ Unique Modifier }',
      `Legacy of Quicksilver(Amethyst-Topaz) ${EM} Unscalable Value`,
      '{ Unique Modifier }',
      `Legacy of Sulphur(Amethyst-Topaz) ${EM} Unscalable Value`,
      '{ Unique Modifier }',
      `Legacy of Sulphur(Amethyst-Topaz) ${EM} Unscalable Value`,
      '{ Unique Modifier }',
      "All Mage's Legacies have 47(25-50)% increased effect per duplicate Mage's Legacy you have",
      '--------',
      'Rivers of power coursed through their veins.',
    ].join('\n')

    const item = parseItemText(clipboard)
    expect(item?.name).toBe('Mageblood')
    const filters = matchItemMods(
      item!.explicits,
      item!.implicits,
      undefined,
      {
        ...MAGEBLOOD_ITEM_INFO,
        name: item!.name,
        rarity: item!.rarity,
        itemClass: item!.itemClass,
        baseType: item!.baseType,
      },
      item!.advancedMods,
    )

    const legacyChips = filters.filter((f) => f.type === 'mageblood-legacy')
    expect(legacyChips.map((f) => f.id).sort()).toEqual([
      'explicit.stat_264262054|11',
      'explicit.stat_264262054|13',
      'explicit.stat_264262054|8',
    ])
    const dupChip = filters.find((f) => f.type === 'mageblood-dup')
    expect(dupChip?.value).toBe(1)
    expect(dupChip?.enabled).toBe(true)
  })
})
