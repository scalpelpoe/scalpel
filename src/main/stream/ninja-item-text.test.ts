import { stripTradeTokens } from '@shared/game-text'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ net: { request: vi.fn() } }))

import { getPoeVersion, setPoeVersion } from '../game-state'
import { parseItemText } from '../trade/clipboard'
import { _setStatEntriesForTests, matchItemMods } from '../trade/stat-matcher'
import characterJson from './__fixtures__/ninja-character.json'
import { ninjaItemText } from './ninja-item-text'
import { type NinjaItemData, NinjaItemDataSchema, NinjaCharacterSchema } from './sources/ninja-types'

const character = NinjaCharacterSchema.parse(characterJson)
const equipped: NinjaItemData[] = character.items.map((e) => NinjaItemDataSchema.parse(e.itemData))
const RARITY = ['Normal', 'Magic', 'Rare', 'Unique']

const explicitCount = (d: NinjaItemData): number =>
  d.explicitMods.length + d.fracturedMods.length + d.desecratedMods.length + d.craftedMods.length

function defence(d: NinjaItemData, label: string): number {
  const p = d.properties.find((x) => stripTradeTokens(x.name) === label)
  return p ? Number.parseInt(String(p.values[0][0]), 10) : 0
}

let prevVersion: ReturnType<typeof getPoeVersion>
beforeEach(() => {
  prevVersion = getPoeVersion()
  setPoeVersion(2)
})
afterEach(() => {
  _setStatEntriesForTests([])
  setPoeVersion(prevVersion)
})

describe('ninjaItemText on the real character fixture', () => {
  it('has equipped items to check', () => {
    expect(equipped.length).toBeGreaterThan(10)
  })

  it.each(
    equipped.map((d) => [d.inventoryId ?? d.typeLine, d] as const),
  )('round-trips %s through parseItemText', (_slot, d) => {
    const text = ninjaItemText(d)
    expect(text).not.toBeNull()
    const item = parseItemText(text as string)
    expect(item).not.toBeNull()
    expect(item?.rarity).toBe(RARITY[d.frameType ?? 0])
    expect(item?.baseType).toBe(d.typeLine)
    expect(item?.name).toBe(d.name)
    expect(item?.itemLevel).toBe(d.ilvl)
    expect(item?.explicits.length).toBe(explicitCount(d))
    expect(item?.implicits.length).toBe(d.implicitMods.length)
    expect(item?.armour).toBe(defence(d, 'Armour'))
    expect(item?.evasion).toBe(defence(d, 'Evasion Rating'))
    expect(item?.energyShield).toBe(defence(d, 'Energy Shield'))
    expect(item?.ward).toBe(defence(d, 'Runic Ward'))
    expect(item?.corrupted).toBe(d.corrupted === true)
  })

  it('resolves the class of every item in the fixture, flasks and jewels included', () => {
    const all = [...character.flasks, ...character.jewels].map((e) => NinjaItemDataSchema.parse(e.itemData))
    for (const d of [...equipped, ...all]) expect(ninjaItemText(d), d.typeLine).not.toBeNull()
  })

  it('resolves the item class names the clipboard prints', () => {
    const classes = new Map(equipped.map((d) => [d.inventoryId, parseItemText(ninjaItemText(d) as string)?.itemClass]))
    expect(classes.get('Gloves')).toBe('Gloves')
    expect(classes.get('Helm')).toBe('Helmets')
    expect(classes.get('BodyArmour')).toBe('Body Armours')
    expect(classes.get('Boots')).toBe('Boots')
    expect(classes.get('Weapon')).toBe('One Hand Maces')
    expect(classes.get('Weapon2')).toBe('Bows')
    expect(classes.get('Offhand2')).toBe('Quivers')
    expect(classes.get('Ring')).toBe('Rings')
    expect(classes.get('Amulet')).toBe('Amulets')
    expect(classes.get('Belt')).toBe('Belts')
  })

  it('parses weapon damage and speed', () => {
    const mace = equipped.find((d) => d.inventoryId === 'Weapon')
    const bow = equipped.find((d) => d.inventoryId === 'Weapon2')
    const m = parseItemText(ninjaItemText(mace as NinjaItemData) as string)
    const b = parseItemText(ninjaItemText(bow as NinjaItemData) as string)
    expect(m).toMatchObject({ physDamageMin: 54, physDamageMax: 80, attacksPerSecond: 2.2, critChance: 5 })
    expect(b).toMatchObject({ physDamageMin: 180, physDamageMax: 331, attacksPerSecond: 1.3, critChance: 8.58 })
    expect(m?.eleDamageAvg).toBe((67 + 99) / 2 + (4 + 66) / 2)
    expect(b?.eleDamageAvg).toBe((85 + 129) / 2)
  })

  it('keeps socketed rune lines out of the explicits and in runes', () => {
    const boots = equipped.find((d) => d.inventoryId === 'Boots') as NinjaItemData
    const item = parseItemText(ninjaItemText(boots) as string)
    expect(item?.runes).toEqual(['+6% to all Elemental Resistances', '+22% to Cold Resistance'])
    expect(item?.enchants).toEqual(['29% increased Freeze Threshold'])
  })
})

describe('ninjaItemText format', () => {
  it('prints header, augmented properties, requirements, sockets and ilvl like the clipboard', () => {
    const gloves = equipped.find((d) => d.inventoryId === 'Gloves') as NinjaItemData
    const text = ninjaItemText(gloves) as string
    expect(text.split('\n--------\n').slice(0, 5)).toEqual([
      'Item Class: Gloves\nRarity: Rare\nGale Nails\nRuneforged War Wraps',
      'Quality: +20% (augmented)\nEvasion Rating: 91 (augmented)\nEnergy Shield: 28 (augmented)\nRunic Ward: 34 (augmented)',
      'Requires: Level 65, 44 Dex, 44 Int',
      'Sockets: S S ',
      'Item Level: 80',
    ])
    expect(text).toContain('36% increased Projectile Damage (fractured)')
    expect(text).toContain('Adds 9 to 14 Physical Damage to Attacks')
    expect(text).not.toContain('[')
    expect(text).not.toContain('Bonded')
  })

  it('omits the name line for a magic item and for an unidentified rare', () => {
    const flask = ninjaItemText(
      NinjaItemDataSchema.parse({
        typeLine: 'Dense Ultimate Life Flask of the Constant',
        baseType: 'Ultimate Life Flask',
        frameType: 1,
        ilvl: 60,
        name: '',
      }),
    )
    expect(flask?.split('\n').slice(0, 3)).toEqual([
      'Item Class: Life Flasks',
      'Rarity: Magic',
      'Dense Ultimate Life Flask of the Constant',
    ])
    const unid = ninjaItemText(
      NinjaItemDataSchema.parse({ typeLine: 'Gold Ring', frameType: 2, name: 'Blood Band', identified: false }),
    )
    expect(unid).toContain('Rarity: Rare\nGold Ring\n')
    expect(unid).not.toContain('Blood Band')
    expect(unid).toContain('Unidentified')
  })

  it('prints item state sections', () => {
    const text = ninjaItemText(
      NinjaItemDataSchema.parse({
        typeLine: 'Gold Ring',
        frameType: 0,
        corrupted: true,
        doubleCorrupted: true,
        sanctified: true,
      }),
    ) as string
    expect(text).toContain('Sanctified')
    expect(text).toContain('Twice Corrupted')
    expect(parseItemText(text)).toMatchObject({ corrupted: true, twiceCorrupted: true, sanctified: true })
  })

  it('returns null for an unknown base or a non-gear frame', () => {
    expect(ninjaItemText(NinjaItemDataSchema.parse({ typeLine: 'Not A Base', frameType: 2 }))).toBeNull()
    expect(ninjaItemText(NinjaItemDataSchema.parse({ typeLine: 'Gold Ring', frameType: 5 }))).toBeNull()
    expect(ninjaItemText(NinjaItemDataSchema.parse({ typeLine: 'Gold Ring' }))).toBeNull()
  })

  it.each([
    ['Splintered Tower Shield', 'Shields'],
    ['Golden Targe', 'Shields'],
  ])('copies %s as Item Class: %s', (typeLine, itemClass) => {
    const text = ninjaItemText(NinjaItemDataSchema.parse({ typeLine, baseType: typeLine, frameType: 0 }))
    expect(text?.split('\n')[0]).toBe(`Item Class: ${itemClass}`)
  })
})

describe('ninjaItemText vs the real clipboard', () => {
  const STATS = [
    { id: 'explicit.stat_3917489142', text: '#% increased Rarity of Items found', type: 'explicit' },
    { id: 'implicit.stat_3917489142', text: '#% increased Rarity of Items found', type: 'implicit' },
    { id: 'explicit.stat_3299347043', text: '+# to maximum Life', type: 'explicit' },
    { id: 'explicit.stat_3372524247', text: '+#% to Fire Resistance', type: 'explicit' },
  ]
  const ringClipboard = [
    'Item Class: Rings',
    'Rarity: Rare',
    'Blood Band',
    'Gold Ring',
    '--------',
    'Requires: Level 62',
    '--------',
    'Item Level: 83',
    '--------',
    '{ Implicit Modifier }',
    '11(6-15)% increased Rarity of Items found (implicit)',
    '--------',
    '{ Prefix Modifier "Virile" (Tier: 1) -- Life }',
    '+72(70-84) to maximum Life',
    '{ Suffix Modifier "of the Volcano" (Tier: 2) -- Elemental, Fire, Resistance }',
    '+36(31-35)% to Fire Resistance',
  ].join('\n')
  const ringJson = NinjaItemDataSchema.parse({
    name: 'Blood Band',
    typeLine: 'Gold Ring',
    baseType: 'Gold Ring',
    frameType: 2,
    ilvl: 83,
    identified: true,
    requirements: [{ name: 'Level', values: [['62', 0]] }],
    properties: [{ name: 'Ring', values: [] }],
    implicitMods: ['11% increased [ItemRarity|Rarity of Items] found'],
    explicitMods: ['+72 to maximum Life', '+36% to [Resistances|Fire Resistance]'],
  })

  it('gives matchItemMods the same filters as the equivalent Ctrl+C text', () => {
    _setStatEntriesForTests(STATS)
    // The empty-affix pseudos count prefix/suffix slots, which only the advanced
    // copy's "{ Prefix Modifier }" headers reveal; poe.ninja's JSON has no such split.
    const ids = (text: string): string[] => {
      const item = parseItemText(text)
      if (!item) throw new Error('did not parse')
      return matchItemMods(item.explicits, item.implicits, undefined, item, item.advancedMods)
        .map((f) => f.id)
        .filter((id) => !id.startsWith('pseudo.pseudo_number_of_empty_'))
        .sort()
    }
    const fromClipboard = ids(ringClipboard)
    expect(fromClipboard).toContain('explicit.stat_3299347043')
    expect(fromClipboard).toContain('explicit.stat_3372524247')
    expect(ids(ninjaItemText(ringJson) as string)).toEqual(fromClipboard)
  })
})
