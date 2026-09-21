import { describe, expect, it } from 'vitest'
import iconsPoe2 from '@scalpel/item-data/poe2.json'
import classesPoe2 from './items/item-classes-poe2.json'
import uniquesPoe2 from './items/unique-info-poe2.json'
import bulkPoe2 from './trade/bulk-exchange-ids-poe2.json'

// Standing regression audit for GGG item renames/removals. Each patch that
// renames or removes items, append the retired names here -- the audit then
// guarantees they never silently reappear in PoE2 data, and that the renamed
// forms and newly-recognized bases are actually present.

// Names GGG renamed away from or removed. Must NOT appear in any PoE2 data file.
// (Excludes "Temple Precursor Tablet": GGG's RotA post both retired and
// re-listed it as new, so its eventual presence is legitimate.)
const RETIRED_NAMES = [
  'Vaal Infuser',
  'Verisium Cuffs',
  'Gladiatoral Helm',
  'Shock Conduction I',
  'Breach Precursor Tablet',
  'Delirium Precursor Tablet',
  'Ritual Precursor Tablet',
  'Overseer Precursor Tablet',
  'Abyss Precursor Tablet',
  'Irradiated Precursor Tablet',
  'Omen of Recombination',
  'Expedition Precursor Tablet',
]

// The renamed-to forms that must be present (icon map tracks all of them).
const RENAMED_TO = [
  "Vaal Armourer's Infuser",
  'Kalguuran Cuffs',
  'Cassis Helm',
  'Breach Tablet',
  'Delirium Tablet',
  'Ritual Tablet',
  'Overseer Tablet',
  'Abyss Tablet',
]

// Equipment bases seeded from GGG's list -> must be recognized under their class.
const SEEDED_BASES: Record<string, string[]> = {
  Rings: [
    'Two-Stone Ring',
    'Biostatic Ring',
    'Vitalic Ring',
    'Mnemonic Ring',
    'Kinetic Ring',
    'Oneiric Ring',
    'Grasping Ring',
  ],
  Amulets: [
    'Veridical Chain',
    'Lament Amulet',
    'Portent Amulet',
    'Absent Amulet',
    'Corona Amulet',
    'Distorted Amulet',
    'Twisted Amulet',
  ],
  'Two Hand Maces': ['Aberrant Sledge'],
  Quarterstaves: ['Warding Quarterstaff'],
  Bows: ['Heartwood Shortbow'],
  Crossbows: ['Trarthan Cannon'],
  Wands: ['Twisted Wand', 'Runic Fork'],
  Staves: ['Perching Staff'],
  Helmets: ['Ancient Visor', 'Tenebrous Crown'],
  Boots: ['Ancient Leggings'],
  Gloves: ['Ancient Gauntlets'],
  'Body Armours': ['Ornate Ringmail', 'Ancient Mail', 'Grasping Mail', 'Primal Markings'],
  Belts: ['Stalking Belt', 'Invoking Belt', 'Sinew Belt', 'Forking Belt'],
  Shields: ['Glacial Fortress', 'Venerable Defender'],
}

type ClassMap = Record<string, { bases: { name: string }[] }>

// Every item name the PoE2 data tracks: icon/bulk/unique keys + class base names.
function trackedNames(): Set<string> {
  const s = new Set<string>()
  for (const k of Object.keys(iconsPoe2 as Record<string, unknown>)) s.add(k)
  for (const k of Object.keys(bulkPoe2 as Record<string, unknown>)) s.add(k)
  for (const k of Object.keys(uniquesPoe2 as Record<string, unknown>)) s.add(k)
  for (const cls of Object.values(classesPoe2 as ClassMap)) for (const b of cls.bases) s.add(b.name)
  return s
}

describe('RotA data integrity', () => {
  const tracked = trackedNames()

  it.each(RETIRED_NAMES)('retired name "%s" is absent from all PoE2 data', (name) => {
    expect(tracked.has(name)).toBe(false)
  })

  it.each(RENAMED_TO)('renamed-to "%s" is present in the icon map', (name) => {
    expect(name in (iconsPoe2 as Record<string, unknown>)).toBe(true)
  })

  it.each(Object.entries(SEEDED_BASES))('seeded bases for class %s are recognized', (cls, bases) => {
    const known = new Set((classesPoe2 as ClassMap)[cls].bases.map((b) => b.name))
    for (const b of bases) expect(known.has(b)).toBe(true)
  })
})
