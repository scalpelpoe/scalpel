import { SnapshotItemSchema } from '@scalpel/stream-contract'
import { POE_SIDEBAR_RATIO } from '@shared/poe-geometry'
import { defaultPoeItem } from '@shared/poe-item'
import { describe, expect, it } from 'vitest'
import { parseItemText } from '../trade/clipboard'
import { paperdollSide, slotForItem, snapshotItemFromClipboard } from './clipboard-item'

const ringText = [
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

const icon = 'https://web.poecdn.com/gen/image/ring.png'
const deps = {
  iconFor: (name: string, base: string) => (base === 'Gold Ring' || name === 'Morior Invictus' ? icon : undefined),
  price: () => ({ amount: 2, currency: 'divine' as const }),
}

describe('slotForItem', () => {
  const item = (itemClass: string) => defaultPoeItem({ itemClass }, 2)

  it('maps armour classes directly', () => {
    expect(slotForItem(item('Helmets'), 'left', 1)).toBe('Helm')
    expect(slotForItem(item('Body Armours'), 'right', 1)).toBe('BodyArmour')
    expect(slotForItem(item('Amulets'), 'left', 1)).toBe('Amulet')
  })

  it('uses the paperdoll side for rings and one-handed weapons', () => {
    expect(slotForItem(item('Rings'), 'left', 1)).toBe('Ring')
    expect(slotForItem(item('Rings'), 'right', 1)).toBe('Ring2')
    expect(slotForItem(item('One Hand Maces'), 'left', 1)).toBe('Weapon')
    expect(slotForItem(item('One Hand Maces'), 'right', 1)).toBe('Offhand')
    expect(slotForItem(item('Bows'), 'right', 1)).toBe('Weapon')
  })

  it('follows the active weapon set', () => {
    expect(slotForItem(item('Bows'), 'left', 2)).toBe('Weapon2')
    expect(slotForItem(item('Quivers'), 'right', 2)).toBe('Offhand2')
    expect(slotForItem(item('Shields'), 'right', 1)).toBe('Offhand')
  })

  it('leaves flasks, charms and jewels alone', () => {
    expect(slotForItem(item('Life Flasks'), 'left', 1)).toBeNull()
    expect(slotForItem(item('Charms'), 'left', 1)).toBeNull()
    expect(slotForItem(item('Jewels'), 'left', 1)).toBeNull()
  })
})

describe('paperdollSide', () => {
  it('splits at the centre of the right-hand inventory panel', () => {
    const game = { x: 0, width: 2560, height: 1440 }
    const centre = 2560 - (1440 * POE_SIDEBAR_RATIO) / 2
    expect(paperdollSide(centre - 1, game, POE_SIDEBAR_RATIO)).toBe('left')
    expect(paperdollSide(centre + 1, game, POE_SIDEBAR_RATIO)).toBe('right')
  })
})

describe('snapshotItemFromClipboard', () => {
  it('turns an advanced copy into a contract item with tiers from the headers', () => {
    const parsed = parseItemText(ringText)
    if (!parsed) throw new Error('fixture did not parse')
    const item = snapshotItemFromClipboard(parsed, deps)
    expect(SnapshotItemSchema.safeParse(item).success).toBe(true)
    expect(item).toMatchObject({ name: 'Blood Band', baseType: 'Gold Ring', rarity: 'rare', icon, ilvl: 83 })
    // parseItemText reads PoE1's "Requirements:" block but not PoE2's one-line
    // "Requires: Level 62", so patched PoE2 items carry no requirements.
    expect(Array.isArray(item?.requirements)).toBe(true)
    const explicit = item?.sections.find((s) => s.kind === 'explicit')?.lines ?? []
    expect(explicit.map((l) => l.tier?.label)).toEqual(['P1', 'S2'])
    expect(explicit[0].range).toEqual({ min: 70, max: 84 })
    expect(explicit.every((l) => !l.text.includes('('))).toBe(true)
    expect(item?.sections.find((s) => s.kind === 'implicit')?.lines[0].text).toMatch(/Rarity of Items found/)
    expect(item?.price).toBeNull()
  })

  it('prices uniques and refuses items without art', () => {
    const unique = defaultPoeItem(
      { itemClass: 'Body Armours', rarity: 'Unique', name: 'Morior Invictus', baseType: 'Grand Regalia' },
      2,
    )
    expect(snapshotItemFromClipboard(unique, deps)?.price).toEqual({ amount: 2, currency: 'divine' })
    const unknown = defaultPoeItem({ itemClass: 'Boots', rarity: 'Rare', name: 'X', baseType: 'Unknown Boots' }, 2)
    expect(snapshotItemFromClipboard(unknown, deps)).toBeNull()
  })
})
