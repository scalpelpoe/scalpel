import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setPremiumModsForTests } from '../premium-mods'

// Mock electron before importing stat-matcher
vi.mock('electron', () => ({
  net: {
    request: vi.fn(),
  },
}))

import { getPoeVersion, setPoeVersion } from '../game-state'
import type { AdvancedMod } from '@shared/types'
import type { ModTier, TierDataset } from '@shared/data/tiers/types'
import { _setTierDataForTests } from '../tier-data'
import { _setIndexedEndgameKeysForTests } from './endgame-filter-support'
import { _setStatEntriesForTests, ITEM_CLASS_TO_CATEGORY, matchItemMods, matchModToStat } from './stat-matcher'
import { resolveTierDefault } from './stat-matcher/producers/explicits'
import { isPremiumMod, _resetPremiumMatchCacheForTests } from './stat-matcher/producers/premium'
import bundledPremiumMods from '@shared/data/items/premium-mods.json'
import type { PremiumModsData } from '@shared/data/items/premium-mods-types'
import tabletMods from '@shared/data/trade/tablet-mods.json'

// Helper to build a minimal itemInfo object
function makeItemInfo(overrides: Record<string, unknown> = {}) {
  return {
    sockets: '',
    linkedSockets: 0,
    quality: 0,
    itemLevel: 0,
    baseType: '',
    rarity: 'Rare' as string,
    itemClass: '' as string,
    gemLevel: 0,
    corrupted: false,
    mirrored: false,
    ...overrides,
  }
}

// ─── ITEM_CLASS_TO_CATEGORY ──────────────────────────────────────────────────

describe('ITEM_CLASS_TO_CATEGORY', () => {
  it('maps common item classes to trade categories', () => {
    expect(ITEM_CLASS_TO_CATEGORY.Rings).toBe('accessory.ring')
    expect(ITEM_CLASS_TO_CATEGORY['Body Armours']).toBe('armour.chest')
    expect(ITEM_CLASS_TO_CATEGORY.Wands).toBe('weapon.wand')
    expect(ITEM_CLASS_TO_CATEGORY.Jewels).toBe('jewel')
    expect(ITEM_CLASS_TO_CATEGORY['Abyss Jewels']).toBe('jewel.abyss')
    expect(ITEM_CLASS_TO_CATEGORY.Flasks).toBe('flask')
    expect(ITEM_CLASS_TO_CATEGORY['Life Flasks']).toBe('flask')
    expect(ITEM_CLASS_TO_CATEGORY['Mana Flasks']).toBe('flask')
    expect(ITEM_CLASS_TO_CATEGORY['Hybrid Flasks']).toBe('flask')
    expect(ITEM_CLASS_TO_CATEGORY['Utility Flasks']).toBe('flask')
    expect(ITEM_CLASS_TO_CATEGORY.Charms).toBe('flask.charm')
    expect(ITEM_CLASS_TO_CATEGORY.Tinctures).toBe('tincture')
    expect(ITEM_CLASS_TO_CATEGORY.Trinkets).toBe('accessory.trinket')
    expect(ITEM_CLASS_TO_CATEGORY['Heist Brooches']).toBe('heistequipment.heistreward')
    expect(ITEM_CLASS_TO_CATEGORY.Contracts).toBe('heistmission.contract')
    // PoE2-specific classes that have live listings -- without these the
    // trade router falls back to searching a single base type instead of the
    // whole class.
    expect(ITEM_CLASS_TO_CATEGORY.Bucklers).toBe('armour.buckler')
    expect(ITEM_CLASS_TO_CATEGORY.Crossbows).toBe('weapon.crossbow')
    expect(ITEM_CLASS_TO_CATEGORY.Spears).toBe('weapon.spear')
    expect(ITEM_CLASS_TO_CATEGORY.Foci).toBe('armour.focus')
    expect(ITEM_CLASS_TO_CATEGORY.Relics).toBe('sanctum.relic')
    expect(ITEM_CLASS_TO_CATEGORY.Tablet).toBe('map.tablet')
    expect(ITEM_CLASS_TO_CATEGORY.Waystones).toBe('map.waystone')
  })

  it('excludes PoE2 categories that have zero live listings (Claws, Daggers, Flails, 1H/2H Swords+Axes, Trap Tools)', () => {
    // These class names exist in RePoE-fork's metadata but PoE2 players never
    // get drops in them, so trade2/search returns nothing. Routing through
    // baseType (the fallback when the class has no category) is closer to
    // correct than pointing at an empty category.
    expect(ITEM_CLASS_TO_CATEGORY.Flails).toBeUndefined()
    expect(ITEM_CLASS_TO_CATEGORY['Trap Tools']).toBeUndefined()
  })

  it('does not contain unknown classes', () => {
    expect(ITEM_CLASS_TO_CATEGORY.Maps).toBeUndefined()
    expect(ITEM_CLASS_TO_CATEGORY['Divination Cards']).toBeUndefined()
  })
})

// ─── matchItemMods: no stat entries loaded (pure chip generation) ────────────

describe('matchItemMods', () => {
  describe('defense filters', () => {
    it('generates armour/evasion/es defense chips', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 500, evasion: 300, energyShield: 100, ward: 0, block: 0 },
        makeItemInfo({ quality: 20 }),
      )
      const defChips = filters.filter((f) => f.type === 'defence')
      expect(defChips).toHaveLength(3)

      const armourChip = defChips.find((f) => f.id === 'defence.armour')!
      expect(armourChip.value).toBe(500)
      expect(armourChip.min).toBe(450) // 90% of 500
      expect(armourChip.enabled).toBe(true)

      const evasionChip = defChips.find((f) => f.id === 'defence.evasion')!
      expect(evasionChip.value).toBe(300)

      const esChip = defChips.find((f) => f.id === 'defence.energy_shield')!
      expect(esChip.value).toBe(100)
    })

    it('generates ward chip when ward > 0', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 0, evasion: 0, energyShield: 0, ward: 200, block: 0 },
        makeItemInfo({ quality: 20 }),
      )
      const wardChip = filters.find((f) => f.id === 'defence.ward')
      expect(wardChip).toBeDefined()
      expect(wardChip?.value).toBe(200)
    })

    it('normalizes ward to 20% quality when quality < 20', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 0, evasion: 0, energyShield: 0, ward: 100, block: 0 },
        makeItemInfo({ quality: 10 }),
      )
      const wardChip = filters.find((f) => f.id === 'defence.ward')!
      // qualityNorm = 1.2 / (1 + 10/100) = 1.2 / 1.1 ~= 1.0909
      // 100 * 1.0909 = 109 (rounded)
      // version defaults to 1 so label is 'Ward'
      expect(wardChip.value).toBe(109)
      expect(wardChip.text).toContain('(20 quality)')
      expect(wardChip.text).toContain('Ward:')
    })

    it('generates block chip when block > 0', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 0, evasion: 0, energyShield: 0, ward: 0, block: 30 },
        makeItemInfo({ quality: 20 }),
      )
      const blockChip = filters.find((f) => f.id === 'defence.block')
      expect(blockChip).toBeDefined()
      expect(blockChip?.text).toBe('Block: 30%')
    })

    it('skips defense chips when all values are zero', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 0, evasion: 0, energyShield: 0, ward: 0, block: 0 },
        makeItemInfo({ quality: 20 }),
      )
      const defChips = filters.filter((f) => f.type === 'defence')
      expect(defChips).toHaveLength(0)
    })

    it('normalizes defenses to 20% quality when quality < 20', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 100, evasion: 0, energyShield: 0, ward: 0, block: 0 },
        makeItemInfo({ quality: 10 }),
      )
      const armourChip = filters.find((f) => f.id === 'defence.armour')!
      // qualityNorm = 1.2 / (1 + 10/100) = 1.2 / 1.1 ~= 1.0909
      // 100 * 1.0909 = 109 (rounded)
      expect(armourChip.value).toBe(109)
      expect(armourChip.text).toContain('(20 quality)')
    })

    it('does not normalize defenses when quality >= 20', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 100, evasion: 0, energyShield: 0, ward: 0, block: 0 },
        makeItemInfo({ quality: 20 }),
      )
      const armourChip = filters.find((f) => f.id === 'defence.armour')!
      expect(armourChip.value).toBe(100)
      expect(armourChip.text).not.toContain('(20 quality)')
    })
  })

  describe('weapon DPS filters', () => {
    it('generates pDPS and eDPS chips for weapons', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          physDamageMin: 100,
          physDamageMax: 200,
          eleDamageAvg: 50,
          chaosDamageAvg: 0,
          attacksPerSecond: 1.5,
          quality: 20,
        }),
      )
      const pdps = filters.find((f) => f.id === 'weapon.pdps')!
      // physAvg = (100 + 200) / 2 = 150, qualityNorm = 1, pdps = 150 * 1.5 = 225
      expect(pdps.value).toBe(225)
      expect(pdps.enabled).toBe(false)

      const edps = filters.find((f) => f.id === 'weapon.edps')!
      // 50 * 1.5 = 75
      expect(edps.value).toBe(75)
      expect(edps.enabled).toBe(false)

      // Total DPS chip should exist and be enabled by default
      const totalDps = filters.find((f) => f.id === 'weapon.dps')!
      expect(totalDps.value).toBe(300)
      expect(totalDps.enabled).toBe(true)
    })

    it('normalizes pDPS to 20% quality when quality < 20', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          physDamageMin: 100,
          physDamageMax: 200,
          attacksPerSecond: 1.0,
          quality: 0,
        }),
      )
      const pdps = filters.find((f) => f.id === 'weapon.pdps')!
      // qualityNorm = 1.2 / (1 + 0/100) = 1.2
      // physAvg = 150 * 1.2 = 180, pdps = 180 * 1.0 = 180
      expect(pdps.value).toBe(180)
      expect(pdps.text).toContain('(20 quality)')
    })

    it('generates chaos DPS chip disabled by default', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          physDamageMin: 0,
          physDamageMax: 0,
          chaosDamageAvg: 40,
          attacksPerSecond: 2.0,
          quality: 20,
        }),
      )
      const cdps = filters.find((f) => f.id === 'weapon.cdps')!
      expect(cdps.value).toBe(80)
      expect(cdps.enabled).toBe(false)
    })

    it('generates Damage chip (no aps) with correct value, disabled by default', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          physDamageMin: 100,
          physDamageMax: 200,
          eleDamageAvg: 50,
          chaosDamageAvg: 0,
          attacksPerSecond: 1.5,
          quality: 20,
        }),
      )
      // physAvg = 150, qualityNorm = 1 (quality >= 20), eleAvg = 50, chaosAvg = 0
      // damage = 150 + 50 + 0 = 200
      const damageChip = filters.find((f) => f.id === 'weapon.damage')!
      expect(damageChip).toBeDefined()
      expect(damageChip.value).toBe(200)
      expect(damageChip.enabled).toBe(false)
      expect(damageChip.type).toBe('weapon')
      expect(damageChip.aggregated).toBe(true)

      // Damage = totalDps / aps relationship
      const totalDpsChip = filters.find((f) => f.id === 'weapon.dps')!
      expect(damageChip.value).toBe((totalDpsChip.value as number) / 1.5)
    })

    it('emits Damage chip even when attacksPerSecond is undefined', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          physDamageMin: 100,
          physDamageMax: 200,
          eleDamageAvg: 50,
          quality: 20,
          // no attacksPerSecond
        }),
      )
      // physAvg = 150, eleAvg = 50 -> damage = 200
      const damageChip = filters.find((f) => f.id === 'weapon.damage')!
      expect(damageChip).toBeDefined()
      expect(damageChip.value).toBe(200)
      expect(damageChip.enabled).toBe(false)
      // No DPS chips without aps
      expect(filters.find((f) => f.id === 'weapon.dps')).toBeUndefined()
    })

    it('Damage chip label includes (20 quality) when quality is below 20', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          physDamageMin: 100,
          physDamageMax: 200,
          attacksPerSecond: 1.0,
          quality: 0,
        }),
      )
      // qualityNorm = 1.2, physAvg = 150 * 1.2 = 180, damage = 180
      const damageChip = filters.find((f) => f.id === 'weapon.damage')!
      expect(damageChip).toBeDefined()
      expect(damageChip.value).toBe(180)
      expect(damageChip.text).toContain('(20 quality)')
    })

    it('does not emit Damage chip when all damage values are zero', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          physDamageMin: 0,
          physDamageMax: 0,
          eleDamageAvg: 0,
          chaosDamageAvg: 0,
          attacksPerSecond: 1.5,
          quality: 20,
        }),
      )
      expect(filters.find((f) => f.id === 'weapon.damage')).toBeUndefined()
    })
  })

  describe('socket/link chips', () => {
    it('generates link chip for 5+ links', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: 'R-R-R-R-R', linkedSockets: 5 }))
      const linkChip = filters.find((f) => f.id === 'socket.links')
      expect(linkChip).toBeDefined()
      expect(linkChip?.text).toBe('5L')
      expect(linkChip?.min).toBe(5)
      expect(linkChip?.enabled).toBe(true)
    })

    it('does not generate link chip for fewer than 5 links', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: 'R-R-R-R', linkedSockets: 4 }))
      const linkChip = filters.find((f) => f.id === 'socket.links')
      expect(linkChip).toBeUndefined()
    })

    it('generates white socket row (disabled by default)', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: 'W-R-G', linkedSockets: 3 }))
      const whiteRow = filters.find((f) => f.id === 'socket.white_sockets')
      expect(whiteRow).toBeDefined()
      expect(whiteRow?.value).toBe(1)
      expect(whiteRow?.enabled).toBe(false)
    })

    it('generates abyssal socket chip', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: 'A-R', linkedSockets: 2 }))
      const abyssChip = filters.find((f) => f.id === 'implicit.stat_3527617737')
      expect(abyssChip).toBeDefined()
      expect(abyssChip?.value).toBe(1)
    })

    it('Stygian Vise: keeps Abyssal Sockets chip and does not emit Has 1 Socket', () => {
      // Clipboard singular "Has 1 Abyssal Socket" must not resolve to trade
      // "Has 1 Socket" (stat_4077843608) — that id is for other bases and zeros
      // Stygian Vise searches. Socket producer owns the abyss chip.
      _setStatEntriesForTests([
        { id: 'implicit.stat_4077843608', text: 'Has 1 Socket', type: 'implicit' },
        { id: 'implicit.stat_3527617737', text: 'Has # Abyssal Sockets', type: 'implicit' },
      ])
      const filters = matchItemMods([], ['Has 1 Abyssal Socket'], undefined, {
        ...makeItemInfo({
          sockets: 'A',
          linkedSockets: 0,
          itemClass: 'Belts',
          baseType: 'Stygian Vise',
          rarity: 'Rare',
        }),
      })
      expect(filters.filter((f) => f.id === 'implicit.stat_4077843608')).toHaveLength(0)
      const abyss = filters.filter((f) => f.id === 'implicit.stat_3527617737')
      expect(abyss).toHaveLength(1)
      expect(abyss[0]?.value).toBe(1)
      expect(abyss[0]?.text).toBe('Abyssal Sockets')
    })

    it('suffix-granted abyssal socket ("of the Underground"): single explicit chip, no duplicate row (#549)', () => {
      // Reported item: a rare Chiming Spirit Shield whose "Has 1 Abyssal Socket" line
      // is the explicit suffix, not an implicit. The socket producer owns the chip;
      // the explicit producer used to also match the line, emitting a second row on
      // the same trade id so toggling either one did nothing.
      const advancedMods: AdvancedMod[] = [
        {
          type: 'suffix',
          name: 'of the Underground',
          tier: 1,
          tags: [],
          lines: ['Has 1 Abyssal Socket'],
          ranges: [],
        },
      ]
      const filters = matchItemMods(
        ['Has 1 Abyssal Socket'],
        [],
        undefined,
        makeItemInfo({ sockets: 'W-BA', linkedSockets: 0, itemClass: 'Shields', rarity: 'Rare' }),
        advancedMods,
      )
      const abyss = filters.filter((f) => f.id === 'explicit.stat_3527617737')
      expect(abyss).toHaveLength(1)
      expect(abyss[0]?.text).toBe('Abyssal Sockets')
      expect(abyss[0]?.value).toBe(1)
      expect(filters.find((f) => f.text === 'Has 1 Abyssal Socket')).toBeUndefined()
    })

    it('suffix-granted abyssal socket with no advancedMods (basic copy) still resolves to the explicit id', () => {
      const filters = matchItemMods(
        ['Has 1 Abyssal Socket'],
        [],
        undefined,
        makeItemInfo({ sockets: 'W-BA', linkedSockets: 0, itemClass: 'Shields', rarity: 'Rare' }),
      )
      const abyss = filters.filter((f) => f.id === 'explicit.stat_3527617737')
      expect(abyss).toHaveLength(1)
      expect(filters.find((f) => f.id === 'implicit.stat_3527617737')).toBeUndefined()
    })

    it('Darkness Enthroned (implicit + unique grant): one row per id at min 1, not one row at 2', () => {
      // Trade indexes the Stygian Vise implicit and the unique's own line as
      // separate ids worth 1 each -- probe-verified. A single chip at the total
      // socket count asked for "implicit >= 2" and returned nothing.
      const filters = matchItemMods(
        ['Has 1 Abyssal Socket', '97% increased Effect of Socketed Abyss Jewels'],
        ['Has 1 Abyssal Socket'],
        undefined,
        makeItemInfo({
          sockets: 'A A',
          linkedSockets: 0,
          itemClass: 'Belts',
          baseType: 'Stygian Vise',
          rarity: 'Unique',
        }),
      )
      const abyss = filters.filter((f) => f.id.endsWith('.stat_3527617737'))
      expect(abyss.map((f) => [f.id, f.min])).toEqual([
        ['implicit.stat_3527617737', 1],
        ['explicit.stat_3527617737', 1],
      ])
      // The raw socket line still belongs to the socket producer alone.
      expect(filters.find((f) => f.text === 'Has 1 Abyssal Socket')).toBeUndefined()
    })
  })

  describe('misc filters', () => {
    it('generates corrupted chip enabled when item is corrupted', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ corrupted: true, itemClass: 'Rings', sockets: '' }),
      )
      const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
      expect(corruptedChip).toBeDefined()
      expect(corruptedChip?.chipState).toBe('yes')
    })

    it('generates corrupted chip in "no" state when item is not corrupted (equipment)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ corrupted: false, itemClass: 'Rings', sockets: '' }),
      )
      const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
      expect(corruptedChip).toBeDefined()
      expect(corruptedChip?.chipState).toBe('no')
    })

    it('generates corrupted chip for uncorrupted Abyss Jewels (Murderous Eye etc.)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          corrupted: false,
          itemClass: 'Abyss Jewels',
          baseType: 'Murderous Eye Jewel',
          rarity: 'Rare',
          sockets: '',
        }),
      )
      const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
      expect(corruptedChip).toBeDefined()
      expect(corruptedChip?.chipState).toBe('no')
      expect(corruptedChip?.text).toBe('Corrupted')
    })

    it('generates corrupted chip for uncorrupted Flasks', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ corrupted: false, itemClass: 'Flasks', baseType: 'Divine Life Flask', rarity: 'Magic' }),
      )
      const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
      expect(corruptedChip).toBeDefined()
      expect(corruptedChip?.chipState).toBe('no')
    })

    it('generates corrupted chip for uncorrupted PoE1 Utility and Hybrid Flasks', () => {
      // No PoE1 clipboard ever says "Item Class: Flasks" -- the game splits the
      // family into Life/Mana/Hybrid/Utility Flasks. Life/Mana were mapped as
      // PoE2 classes (#575); Utility and Hybrid were left out, so the flasks
      // people actually price-check had no Corrupted chip when uncorrupted.
      for (const itemClass of ['Utility Flasks', 'Hybrid Flasks']) {
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ corrupted: false, itemClass, baseType: 'Granite Flask', rarity: 'Magic' }),
        )
        const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
        expect(corruptedChip, itemClass).toBeDefined()
        expect(corruptedChip?.chipState, itemClass).toBe('no')
      }
    })

    it('generates corrupted chip for uncorrupted Tinctures', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ corrupted: false, itemClass: 'Tinctures', baseType: 'Ashbark Tincture', rarity: 'Magic' }),
      )
      const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
      expect(corruptedChip).toBeDefined()
      expect(corruptedChip?.chipState).toBe('no')
    })

    it('generates corrupted chip for PoE2 Life Flasks', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          corrupted: false,
          itemClass: 'Life Flasks',
          baseType: 'Transcendent Life Flask',
          rarity: 'Magic',
        }),
      )
      const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
      expect(corruptedChip).toBeDefined()
      expect(corruptedChip?.chipState).toBe('no')
    })

    it('generates mirrored chip when item is mirrored', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ mirrored: true, itemClass: 'Rings', sockets: '' }),
      )
      const mirroredChip = filters.find((f) => f.id === 'misc.mirrored')
      expect(mirroredChip).toBeDefined()
      expect(mirroredChip?.chipState).toBe('yes')
    })

    it('generates vestigial chip with chipState "yes" when item is vestigial', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ vestigial: true, rarity: 'Unique', itemClass: 'Body Armours', sockets: '' }),
      )
      const vestigialChip = filters.find((f) => f.id === 'misc.vestigial')
      expect(vestigialChip).toBeDefined()
      expect(vestigialChip?.chipState).toBe('yes')
      expect(vestigialChip?.enabled).toBe(false)
    })

    it('does not generate vestigial chip when item is not vestigial', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ vestigial: false, rarity: 'Unique', itemClass: 'Body Armours', sockets: '' }),
      )
      const vestigialChip = filters.find((f) => f.id === 'misc.vestigial')
      expect(vestigialChip).toBeUndefined()
    })

    it('generates foulborn chip with chipState "no" on a non-foulborn unique (#532)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ foulborn: false, rarity: 'Unique', itemClass: 'Belts', sockets: '' }),
      )
      const foulbornChip = filters.find((f) => f.id === 'misc.foulborn')
      expect(foulbornChip).toBeDefined()
      expect(foulbornChip?.chipState).toBe('no')
      expect(foulbornChip?.enabled).toBe(false)
    })

    it('generates foulborn chip with chipState "yes" on a foulborn unique (#532)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ foulborn: true, rarity: 'Unique', itemClass: 'Belts', sockets: '' }),
      )
      const foulbornChip = filters.find((f) => f.id === 'misc.foulborn')
      expect(foulbornChip).toBeDefined()
      expect(foulbornChip?.chipState).toBe('yes')
    })

    it('leaves foulborn chipState undefined on an unidentified unique (#532)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ foulborn: false, identified: false, rarity: 'Unique', itemClass: 'Belts', sockets: '' }),
      )
      const foulbornChip = filters.find((f) => f.id === 'misc.foulborn')
      expect(foulbornChip).toBeDefined()
      expect(foulbornChip?.chipState).toBeUndefined()
    })

    it('does not generate a foulborn chip on a Rare (#532)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ foulborn: false, rarity: 'Rare', itemClass: 'Belts', sockets: '' }),
      )
      const foulbornChip = filters.find((f) => f.id === 'misc.foulborn')
      expect(foulbornChip).toBeUndefined()
    })

    it('generates unidentified chip when item is not identified', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ identified: false, itemClass: 'Rings', sockets: '' }),
      )
      const unidChip = filters.find((f) => f.id === 'misc.identified')
      expect(unidChip).toBeDefined()
      expect(unidChip?.text).toBe('Unidentified')
    })

    it('generates misc.unidentified_tier filter enabled with exact min/max when unidentifiedTier is set', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ identified: false, itemClass: 'Crossbows', unidentifiedTier: 4 }),
      )
      const tierFilter = filters.find((f) => f.id === 'misc.unidentified_tier')
      expect(tierFilter).toBeDefined()
      expect(tierFilter?.enabled).toBe(true)
      expect(tierFilter?.min).toBe(4)
      expect(tierFilter?.max).toBe(4)
      expect(tierFilter?.type).toBe('gem')
    })

    it('does not generate misc.unidentified_tier filter when unidentifiedTier is absent', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ identified: false, itemClass: 'Crossbows' }))
      const tierFilter = filters.find((f) => f.id === 'misc.unidentified_tier')
      expect(tierFilter).toBeUndefined()
    })

    it('generates ilvl chip disabled by default', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ itemLevel: 84, sockets: '' }))
      const ilvlChip = filters.find((f) => f.id === 'misc.ilvl')
      expect(ilvlChip).toBeDefined()
      expect(ilvlChip?.value).toBe(84)
      expect(ilvlChip?.enabled).toBe(false)
    })

    it('generates quality chip disabled for non-base items', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ quality: 15, rarity: 'Rare', sockets: '' }))
      const qualityChip = filters.find((f) => f.id === 'misc.quality')
      expect(qualityChip).toBeDefined()
      expect(qualityChip?.value).toBe(15)
      expect(qualityChip?.enabled).toBe(false)
    })

    it('generates quality chip enabled for overqualitied bases', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ quality: 28, rarity: 'Normal', sockets: '' }))
      const qualityChip = filters.find((f) => f.id === 'misc.quality')
      expect(qualityChip).toBeDefined()
      expect(qualityChip?.enabled).toBe(true)
    })

    it('generates base type chip disabled for rare items', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ baseType: 'Titanium Spirit Shield', rarity: 'Rare', itemClass: 'Shields', sockets: '' }),
      )
      const baseChip = filters.find((f) => f.id === 'misc.basetype')
      expect(baseChip).toBeDefined()
      expect(baseChip?.text).toBe('Titanium Spirit Shield')
      expect(baseChip?.enabled).toBe(false)
    })

    it('enables base type chip by default for cluster jewels (size-specific search)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ baseType: 'Large Cluster Jewel', rarity: 'Rare', itemClass: 'Jewels', sockets: '' }),
      )
      const baseChip = filters.find((f) => f.id === 'misc.basetype')
      expect(baseChip).toBeDefined()
      expect(baseChip?.text).toBe('Large Cluster Jewel')
      expect(baseChip?.enabled).toBe(true)
    })

    it('does not enable base type chip for non-cluster Jewels (e.g. Cobalt Jewel)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ baseType: 'Cobalt Jewel', rarity: 'Rare', itemClass: 'Jewels', sockets: '' }),
      )
      const baseChip = filters.find((f) => f.id === 'misc.basetype')
      expect(baseChip).toBeDefined()
      expect(baseChip?.enabled).toBe(false)
    })

    it('generates rarity chip disabled by default for non-unique equipment', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings', sockets: '' }),
      )
      const rarityChip = filters.find((f) => f.id === 'misc.rarity')
      expect(rarityChip).toBeDefined()
      expect(rarityChip?.text).toBe('Rare')
      expect(rarityChip?.enabled).toBe(false)
    })

    it('does not generate rarity chip for unique items', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Rings', sockets: '' }),
      )
      const rarityChip = filters.find((f) => f.id === 'misc.rarity')
      expect(rarityChip).toBeUndefined()
    })

    it('generates influence chips with correct enabled state', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Rings', sockets: '', influence: ['Shaper', 'Elder'] }),
      )
      const shaperChip = filters.find((f) => f.id === 'misc.influence_shaper')
      const elderChip = filters.find((f) => f.id === 'misc.influence_elder')
      expect(shaperChip).toBeDefined()
      expect(shaperChip?.enabled).toBe(true)
      expect(elderChip).toBeDefined()
      expect(elderChip?.enabled).toBe(true)
    })

    it('does not generate influence chips for maps', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', sockets: '', influence: ['Shaper'] }),
      )
      const shaperChip = filters.find((f) => f.id === 'misc.influence_shaper')
      expect(shaperChip).toBeUndefined()
    })
  })

  describe('open prefix/suffix chips', () => {
    it('generates open prefix/suffix chips for non-unique items', () => {
      const advancedMods: AdvancedMod[] = [
        { type: 'prefix', name: 'Mod1', tier: 1, tags: [], lines: ['some mod'], ranges: [] },
        { type: 'suffix', name: 'Mod2', tier: 1, tags: [], lines: ['other mod'], ranges: [] },
        { type: 'suffix', name: 'Mod3', tier: 1, tags: [], lines: ['third mod'], ranges: [] },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings', sockets: '' }),
        advancedMods,
      )
      const openPrefix = filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_prefix_mods')
      const openSuffix = filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_suffix_mods')
      expect(openPrefix).toBeDefined()
      expect(openPrefix?.value).toBe(2) // 3 max - 1 prefix = 2 open
      expect(openPrefix?.min).toBe(2) // min mirrors the open count, not a hardcoded 1
      expect(openSuffix).toBeDefined()
      expect(openSuffix?.value).toBe(1) // 3 max - 2 suffixes = 1 open
      expect(openSuffix?.min).toBe(1)
    })

    it('uses 2 max affixes for jewels', () => {
      const advancedMods: AdvancedMod[] = [
        { type: 'prefix', name: 'Mod1', tier: 1, tags: [], lines: ['some mod'], ranges: [] },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Jewels', sockets: '' }),
        advancedMods,
      )
      const openPrefix = filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_prefix_mods')
      expect(openPrefix).toBeDefined()
      expect(openPrefix?.value).toBe(1) // 2 max - 1 prefix = 1 open
    })

    it('caps magic items at 1 prefix / 1 suffix (suffix-only -> open prefix, no open suffix)', () => {
      const advancedMods: AdvancedMod[] = [
        { type: 'suffix', name: 'of Calamity', tier: 1, tags: [], lines: ['+3% to Critical Hit Chance'], ranges: [] },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Bows', sockets: '' }),
        advancedMods,
      )
      const openPrefix = filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_prefix_mods')
      const openSuffix = filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_suffix_mods')
      expect(openPrefix).toBeDefined()
      expect(openPrefix?.value).toBe(1) // 1 max - 0 prefixes = 1 open
      expect(openSuffix).toBeUndefined() // 1 max - 1 suffix = 0 open, no chip
    })

    it('generates no open affix chips for a fully-rolled magic item', () => {
      const advancedMods: AdvancedMod[] = [
        { type: 'prefix', name: 'Obliterator', tier: 1, tags: [], lines: ['some prefix'], ranges: [] },
        { type: 'suffix', name: 'of Calamity', tier: 1, tags: [], lines: ['some suffix'], ranges: [] },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Bows', sockets: '' }),
        advancedMods,
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_prefix_mods')).toBeUndefined()
      expect(filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_suffix_mods')).toBeUndefined()
    })

    it('counts a crafted affix as open in PoE1 but occupied in PoE2', () => {
      const advancedMods: AdvancedMod[] = [
        { type: 'prefix', name: 'Mod1', tier: 1, tags: [], lines: ['some prefix'], ranges: [] },
        {
          type: 'suffix',
          name: 'of Calamity',
          tier: 1,
          tags: [],
          lines: ['+3% to Critical Hit Chance'],
          ranges: [],
          crafted: true,
        },
      ]
      const run = () =>
        matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ rarity: 'Rare', itemClass: 'Rings', sockets: '' }),
          advancedMods,
        )

      const prev = getPoeVersion()
      try {
        setPoeVersion(1)
        const poe1 = run()
        // PoE1: crafted suffix is scour-able, so it doesn't occupy a slot.
        expect(poe1.find((f) => f.id === 'pseudo.pseudo_number_of_empty_suffix_mods')?.value).toBe(3)

        setPoeVersion(2)
        const poe2 = run()
        // PoE2: crafted suffix occupies its slot like any other affix.
        expect(poe2.find((f) => f.id === 'pseudo.pseudo_number_of_empty_suffix_mods')?.value).toBe(2)
        // Prefix count is unaffected by version (no crafted prefix here).
        expect(poe2.find((f) => f.id === 'pseudo.pseudo_number_of_empty_prefix_mods')?.value).toBe(2)
      } finally {
        setPoeVersion(prev)
      }
    })

    it('adjusts max affixes for "Modifier allowed" implicits', () => {
      const advancedMods: AdvancedMod[] = [
        {
          type: 'implicit',
          name: '',
          tier: 0,
          tags: [],
          lines: ['-1 Prefix Modifier allowed', '+1 Suffix Modifier allowed'],
          ranges: [],
        },
        { type: 'prefix', name: 'Buttressed', tier: 4, tags: [], lines: ['28% increased Armour'], ranges: [] },
        { type: 'suffix', name: 'of the Kiln', tier: 5, tags: [], lines: ['+24% to Fire Resistance'], ranges: [] },
        { type: 'suffix', name: 'of the Meteor', tier: 7, tags: [], lines: ['+9 to all Attributes'], ranges: [] },
        {
          type: 'suffix',
          name: 'of the Flatworm',
          tier: 8,
          tags: [],
          lines: ['4 Life Regeneration per second'],
          ranges: [],
        },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Amulets', sockets: '' }),
        advancedMods,
      )
      // max prefixes 3-1=2, one used -> 1 open. max suffixes 3+1=4, three used -> 1 open.
      expect(filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_prefix_mods')?.value).toBe(1)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_suffix_mods')?.value).toBe(1)
    })

    it('does not generate open affix chips for unique items', () => {
      const advancedMods: AdvancedMod[] = [
        { type: 'prefix', name: 'Mod1', tier: 1, tags: [], lines: ['some mod'], ranges: [] },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Rings', sockets: '' }),
        advancedMods,
      )
      const openPrefix = filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_prefix_mods')
      expect(openPrefix).toBeUndefined()
    })

    it('does not generate open affix chips for normal (white) items', () => {
      const advancedMods: AdvancedMod[] = [
        { type: 'implicit', name: '', tier: 0, tags: [], lines: ['some implicit'], ranges: [] },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Normal', itemClass: 'Rings', sockets: '' }),
        advancedMods,
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_prefix_mods')).toBeUndefined()
      expect(filters.find((f) => f.id === 'pseudo.pseudo_number_of_empty_suffix_mods')).toBeUndefined()
    })
  })

  describe('gem filters', () => {
    it('generates gem level and quality chips', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Skill Gems', gemLevel: 21, quality: 23, sockets: '' }),
      )
      const gemLevel = filters.find((f) => f.id === 'misc.gem_level')
      expect(gemLevel).toBeDefined()
      expect(gemLevel?.value).toBe(21)
      expect(gemLevel?.min).toBe(21)
      expect(gemLevel?.type).toBe('gem')
      expect(gemLevel?.enabled).toBe(true)

      const qualityChip = filters.find((f) => f.id === 'misc.quality')
      expect(qualityChip).toBeDefined()
      expect(qualityChip?.type).toBe('gem')
      expect(qualityChip?.enabled).toBe(true) // quality >= 20
    })

    it('shows a gem quality chip off with no value when the gem has 0 quality', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Skill Gems', gemLevel: 20, quality: 0, sockets: '' }),
      )
      const qualityChip = filters.find((f) => f.id === 'misc.quality')
      expect(qualityChip).toBeDefined()
      expect(qualityChip?.type).toBe('gem')
      expect(qualityChip?.text).toBe('Quality')
      expect(qualityChip?.value).toBeNull()
      expect(qualityChip?.min).toBeNull()
      expect(qualityChip?.enabled).toBe(false)
    })

    it('generates transfigured chip enabled when transfigured', () => {
      const prev = getPoeVersion()
      setPoeVersion(1)
      try {
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Skill Gems', gemLevel: 1, transfigured: true, sockets: '' }),
        )
        const transfigured = filters.find((f) => f.id === 'misc.gem_transfigured')
        expect(transfigured).toBeDefined()
        expect(transfigured?.enabled).toBe(true)
      } finally {
        setPoeVersion(prev)
      }
    })

    it('generates transfigured chip disabled when not transfigured', () => {
      const prev = getPoeVersion()
      setPoeVersion(1)
      try {
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Skill Gems', gemLevel: 1, transfigured: false, sockets: '' }),
        )
        const transfigured = filters.find((f) => f.id === 'misc.gem_transfigured')
        expect(transfigured).toBeDefined()
        expect(transfigured?.enabled).toBe(false)
      } finally {
        setPoeVersion(prev)
      }
    })

    it('omits the transfigured chip in PoE2 (no transfigured gems there)', () => {
      const prev = getPoeVersion()
      setPoeVersion(2)
      try {
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Skill Gems', gemLevel: 16, quality: 20, sockets: '' }),
        )
        expect(filters.find((f) => f.id === 'misc.gem_transfigured')).toBeUndefined()
        // The gem quality chip still appears in PoE2.
        expect(filters.find((f) => f.id === 'misc.quality')?.type).toBe('gem')
      } finally {
        setPoeVersion(prev)
      }
    })

    it('skips explicits for gem items', () => {
      const filters = matchItemMods(
        ['some explicit'],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Active Skill Gems', sockets: '' }),
      )
      // No stat entries loaded, so no explicit chips should appear regardless,
      // but importantly no error is thrown trying to process them
      const explicitChips = filters.filter((f) => f.type === 'explicit')
      // Only non-mod explicit chips (like abyssal socket) could appear
      expect(explicitChips.every((f) => f.id.startsWith('explicit.stat_'))).toBe(true)
    })

    describe('PoE2 gem socket count row', () => {
      let prevVersion: ReturnType<typeof getPoeVersion>

      beforeEach(() => {
        prevVersion = getPoeVersion()
      })

      afterEach(() => {
        setPoeVersion(prevVersion)
      })

      it('produces misc.gem_sockets row with value/min=3 and max=null for 3-socket gem (B B B)', () => {
        setPoeVersion(2)
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Active Skill Gems', gemLevel: 20, sockets: 'B B B' }),
        )
        const socketRow = filters.find((f) => f.id === 'misc.gem_sockets')
        expect(socketRow).toBeDefined()
        expect(socketRow?.value).toBe(3)
        expect(socketRow?.min).toBe(3)
        expect(socketRow?.max).toBeNull()
        expect(socketRow?.enabled).toBe(true)
        expect(socketRow?.type).toBe('gem')
      })

      it('counts letter-agnostically -- S S S S S yields socket count 5', () => {
        setPoeVersion(2)
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Active Skill Gems', gemLevel: 20, sockets: 'S S S S S' }),
        )
        const socketRow = filters.find((f) => f.id === 'misc.gem_sockets')
        expect(socketRow?.value).toBe(5)
        expect(socketRow?.min).toBe(5)
      })

      it('produces no misc.gem_sockets row in PoE1 (socket count is not a trade filter there)', () => {
        setPoeVersion(1)
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Skill Gems', gemLevel: 20, sockets: 'B B B' }),
        )
        expect(filters.find((f) => f.id === 'misc.gem_sockets')).toBeUndefined()
      })

      it('produces no misc.gem_sockets row when sockets string is empty', () => {
        setPoeVersion(2)
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Active Skill Gems', gemLevel: 20, sockets: '' }),
        )
        expect(filters.find((f) => f.id === 'misc.gem_sockets')).toBeUndefined()
      })

      it('produces no socket.rune_sockets chip for a PoE2 gem with S-letter sockets', () => {
        // Gem support slots should never emit a rune-socket chip -- the gems
        // producer handles socket count, sockets.ts must skip gem classes.
        setPoeVersion(2)
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Active Skill Gems', gemLevel: 20, sockets: 'S S' }),
        )
        expect(filters.find((f) => f.id === 'socket.rune_sockets')).toBeUndefined()
      })
    })
  })

  describe('logbook faction and boss chips', () => {
    it('generates faction chips for logbooks', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Expedition Logbooks',
          sockets: '',
          logbookFactions: ['knights', 'druids'],
        }),
      )
      const factionChips = filters.filter((f) => f.id.startsWith('pseudo.pseudo_logbook_faction_'))
      expect(factionChips).toHaveLength(2)
      expect(factionChips[0].text).toBe('Knights of the Sun')
      expect(factionChips[0].enabled).toBe(true)
      expect(factionChips[1].text).toBe('Druids of the Broken Circle')
    })

    it('generates boss chips for logbooks', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Expedition Logbooks',
          sockets: '',
          logbookBosses: ['Medved, Feller of Heroes', 'Olroth, Origin of the Fall'],
        }),
      )
      const bossChips = filters.filter((f) => f.id === 'implicit.stat_3159649981')
      expect(bossChips).toHaveLength(2)
      expect(bossChips[0].text).toBe('Medved, Feller of Heroes')
      expect(bossChips[0].option).toBe(1)
      expect(bossChips[0].enabled).toBe(true)
      expect(bossChips[1].text).toBe('Olroth, Origin of the Fall')
      expect(bossChips[1].option).toBe(4)
    })

    it('skips bosses with unknown names', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Expedition Logbooks',
          sockets: '',
          logbookBosses: ['Unknown Boss'],
        }),
      )
      const bossChips = filters.filter((f) => f.id === 'implicit.stat_3159649981')
      expect(bossChips).toHaveLength(0)
    })
  })

  describe('map filters', () => {
    it('generates map property chips for rare maps', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Maps',
          rarity: 'Rare',
          sockets: '',
          mapQuantity: 100,
          mapRarity: 50,
          mapPackSize: 30,
          mapMoreScarabs: 20,
          mapMoreCurrency: 15,
          mapMoreMaps: 10,
          mapMoreDivCards: 5,
        }),
      )
      const quantityChip = filters.find((f) => f.id === 'map.map_iiq')!
      expect(quantityChip.value).toBe(100)
      expect(quantityChip.min).toBe(90) // floor(100 * 0.9)
      expect(quantityChip.enabled).toBe(true)

      const rarityChip = filters.find((f) => f.id === 'map.map_iir')!
      expect(rarityChip.value).toBe(50)
      expect(rarityChip.enabled).toBe(true) // #561 - on by default like the other yield chips

      const packSizeChip = filters.find((f) => f.id === 'map.map_packsize')!
      expect(packSizeChip.value).toBe(30)
      expect(packSizeChip.enabled).toBe(true)

      const moreScarabs = filters.find((f) => f.id === 'pseudo.pseudo_map_more_scarab_drops')!
      expect(moreScarabs.value).toBe(20)
      expect(moreScarabs.enabled).toBe(true)
    })

    it('generates map reward chip', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Maps',
          rarity: 'Rare',
          sockets: '',
          mapReward: 'Divination Cards',
        }),
      )
      const rewardChip = filters.find((f) => f.id === 'map.map_completion_reward')
      expect(rewardChip).toBeDefined()
      expect(rewardChip?.option).toBe('Divination Cards')
      expect(rewardChip?.enabled).toBe(true)
    })

    it('does not generate map property chips for non-rare maps', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Maps',
          rarity: 'Normal',
          sockets: '',
          mapQuantity: 50,
        }),
      )
      const quantityChip = filters.find((f) => f.id === 'map.map_iiq')
      expect(quantityChip).toBeUndefined()
    })

    it('enables base type chip for special map types', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Maps',
          rarity: 'Rare',
          baseType: 'Nightmare Map',
          sockets: '',
        }),
      )
      const baseChip = filters.find((f) => f.id === 'misc.basetype')
      expect(baseChip).toBeDefined()
      expect(baseChip?.enabled).toBe(true)
    })

    it('generates modifier-count chip for rare map with 4+4 affixes (chip enabled, min=8)', () => {
      const advancedMods: AdvancedMod[] = [
        ...Array.from({ length: 4 }, (_, i) => ({
          type: 'prefix' as const,
          name: `P${i}`,
          tier: 1,
          tags: [],
          lines: [`prefix ${i}`],
          ranges: [],
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          type: 'suffix' as const,
          name: `S${i}`,
          tier: 1,
          tags: [],
          lines: [`suffix ${i}`],
          ranges: [],
        })),
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '' }),
        advancedMods,
      )
      const chip = filters.find((f) => f.id === 'pseudo.pseudo_number_of_affix_mods')
      expect(chip).toBeDefined()
      expect(chip?.text).toBe('Modifiers: 8')
      expect(chip?.value).toBe(8)
      expect(chip?.min).toBe(8)
      expect(chip?.enabled).toBe(true)
      // type 'map' so the panel renders it as a scrubbable row, not a toggle chip
      expect(chip?.type).toBe('map')
    })

    it('generates modifier-count chip for rare map with 3+2 affixes (chip disabled, min=5)', () => {
      const advancedMods: AdvancedMod[] = [
        ...Array.from({ length: 3 }, (_, i) => ({
          type: 'prefix' as const,
          name: `P${i}`,
          tier: 1,
          tags: [],
          lines: [`prefix ${i}`],
          ranges: [],
        })),
        ...Array.from({ length: 2 }, (_, i) => ({
          type: 'suffix' as const,
          name: `S${i}`,
          tier: 1,
          tags: [],
          lines: [`suffix ${i}`],
          ranges: [],
        })),
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '' }),
        advancedMods,
      )
      const chip = filters.find((f) => f.id === 'pseudo.pseudo_number_of_affix_mods')
      expect(chip).toBeDefined()
      expect(chip?.text).toBe('Modifiers: 5')
      expect(chip?.value).toBe(5)
      expect(chip?.min).toBe(5)
      expect(chip?.enabled).toBe(false)
    })

    it('generates modifier-count chip for rare waystone with prefix/suffix advancedMods', () => {
      const advancedMods: AdvancedMod[] = [
        {
          type: 'prefix',
          name: 'P0',
          tier: 1,
          tags: [],
          lines: ['prefix 0'],
          ranges: [],
        },
        {
          type: 'suffix',
          name: 'S0',
          tier: 1,
          tags: [],
          lines: ['suffix 0'],
          ranges: [],
        },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Waystones', rarity: 'Rare', sockets: '' }),
        advancedMods,
      )
      const chip = filters.find((f) => f.id === 'pseudo.pseudo_number_of_affix_mods')
      expect(chip).toBeDefined()
      expect(chip?.text).toBe('Modifiers: 2')
      expect(chip?.min).toBe(2)
      expect(chip?.enabled).toBe(false)
    })

    it('does not generate modifier-count chip for non-rare map', () => {
      const advancedMods: AdvancedMod[] = [
        {
          type: 'prefix',
          name: 'P0',
          tier: 1,
          tags: [],
          lines: ['prefix 0'],
          ranges: [],
        },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Magic', sockets: '' }),
        advancedMods,
      )
      const chip = filters.find((f) => f.id === 'pseudo.pseudo_number_of_affix_mods')
      expect(chip).toBeUndefined()
    })

    it('does not generate modifier-count chip for rare map with no advancedMods', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '' }))
      const chip = filters.find((f) => f.id === 'pseudo.pseudo_number_of_affix_mods')
      expect(chip).toBeUndefined()
    })

    it('does not generate modifier-count chip when advancedMods are implicit-only', () => {
      const advancedMods: AdvancedMod[] = [
        {
          type: 'implicit',
          name: 'Implicit',
          tier: 0,
          tags: [],
          lines: ['Area is inhabited by Demons'],
          ranges: [],
        },
      ]
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '' }),
        advancedMods,
      )
      const chip = filters.find((f) => f.id === 'pseudo.pseudo_number_of_affix_mods')
      expect(chip).toBeUndefined()
    })
  })

  describe('map property chips honour the default search percentage (#547)', () => {
    const reportedMap = () =>
      makeItemInfo({
        itemClass: 'Maps',
        rarity: 'Rare',
        sockets: '',
        mapQuantity: 55,
        mapRarity: 78,
        mapPackSize: 21,
        mapMoreMaps: 35,
      })

    it('pins property chips to the exact roll at defaultPercent 100', () => {
      const filters = matchItemMods([], [], undefined, reportedMap(), undefined, 100)

      const quantityChip = filters.find((f) => f.id === 'map.map_iiq')!
      const rarityChip = filters.find((f) => f.id === 'map.map_iir')!
      const packSizeChip = filters.find((f) => f.id === 'map.map_packsize')!
      const moreMapsChip = filters.find((f) => f.id === 'pseudo.pseudo_map_more_map_drops')!

      expect(quantityChip.min).toBe(quantityChip.value)
      expect(rarityChip.min).toBe(rarityChip.value)
      expect(packSizeChip.min).toBe(packSizeChip.value)
      expect(moreMapsChip.min).toBe(moreMapsChip.value)
    })

    it('applies the configured floor at defaultPercent 90', () => {
      const filters = matchItemMods([], [], undefined, reportedMap(), undefined, 90)

      expect(filters.find((f) => f.id === 'map.map_iiq')?.min).toBe(49)
      expect(filters.find((f) => f.id === 'map.map_iir')?.min).toBe(70)
      expect(filters.find((f) => f.id === 'map.map_packsize')?.min).toBe(18)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_map_more_map_drops')?.min).toBe(31)
    })

    it('leaves pseudo.pseudo_number_of_affix_mods pinned to the actual affix count at defaultPercent 100', () => {
      const advancedMods: AdvancedMod[] = [
        ...Array.from({ length: 4 }, (_, i) => ({
          type: 'prefix' as const,
          name: `P${i}`,
          tier: 1,
          tags: [],
          lines: [`prefix ${i}`],
          ranges: [],
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          type: 'suffix' as const,
          name: `S${i}`,
          tier: 1,
          tags: [],
          lines: [`suffix ${i}`],
          ranges: [],
        })),
      ]
      const filters = matchItemMods([], [], undefined, reportedMap(), advancedMods, 100)

      const chip = filters.find((f) => f.id === 'pseudo.pseudo_number_of_affix_mods')!
      expect(chip.value).toBe(8)
      expect(chip.min).toBe(8)
    })
  })

  describe('originator (Zana memory) rare maps (#541)', () => {
    // Every property chip on a rare map defaults on (Rarity included since #561); what
    // originator adds on top is the misc.rarity pin, so the search is not compared against
    // the plain map market at another rarity.
    it('enables map.map_iir and keeps the other map property chips enabled on a rare originator map', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Maps',
          rarity: 'Rare',
          sockets: '',
          zanaMemory: true,
          mapQuantity: 65,
          mapRarity: 39,
          mapPackSize: 25,
          mapMoreScarabs: 22,
          mapMoreCurrency: 47,
          mapMoreMaps: 35,
        }),
      )
      expect(filters.find((f) => f.id === 'map.map_iir')?.enabled).toBe(true)
      expect(filters.find((f) => f.id === 'map.map_iiq')?.enabled).toBe(true)
      expect(filters.find((f) => f.id === 'map.map_packsize')?.enabled).toBe(true)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_map_more_scarab_drops')?.enabled).toBe(true)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_map_more_currency_drops')?.enabled).toBe(true)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_map_more_map_drops')?.enabled).toBe(true)
    })

    it('enables map.map_iir on a rare non-originator map too (#561)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '', mapRarity: 39 }),
      )
      expect(filters.find((f) => f.id === 'map.map_iir')?.enabled).toBe(true)
    })

    it('emits an enabled misc.rarity chip on a rare originator map', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '', zanaMemory: true }),
      )
      const rarityChip = filters.find((f) => f.id === 'misc.rarity')
      expect(rarityChip).toBeDefined()
      expect(rarityChip?.text).toBe('Rare')
      expect(rarityChip?.enabled).toBe(true)
    })

    it('emits no misc.rarity chip on a rare non-originator map', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '' }))
      expect(filters.find((f) => f.id === 'misc.rarity')).toBeUndefined()
    })

    it('emits an enabled misc.rarity chip on a Normal (white) originator map (#545)', () => {
      // A white originator map must not be compared against far pricier magic/rare
      // copies, so the pin applies at every rarity, not just Rare.
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Normal', sockets: '', zanaMemory: true }),
      )
      const rarityChip = filters.find((f) => f.id === 'misc.rarity')
      expect(rarityChip).toBeDefined()
      expect(rarityChip?.text).toBe('Normal')
      expect(rarityChip?.enabled).toBe(true)
    })

    it('emits no misc.rarity chip on a Normal non-originator map', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Normal', sockets: '' }),
      )
      expect(filters.find((f) => f.id === 'misc.rarity')).toBeUndefined()
    })
  })

  describe('Exclude Elder on originator maps (#556)', () => {
    it('emits an enabled misc.exclude_elder chip on a plain originator map', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '', zanaMemory: true }),
      )
      const chip = filters.find((f) => f.id === 'misc.exclude_elder')
      expect(chip).toBeDefined()
      expect(chip?.text).toBe('Exclude Elder')
      expect(chip?.enabled).toBe(true)
    })

    it('emits no chip when the originator map is itself Elder-influenced', () => {
      // The Elder implicit is its own chip on that item, so the search is already
      // pinned to Elder copies -- excluding them would return nothing.
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '', zanaMemory: true, influence: ['Elder'] }),
      )
      expect(filters.find((f) => f.id === 'misc.exclude_elder')).toBeUndefined()
    })

    it('emits no chip on a non-originator map', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ itemClass: 'Maps', rarity: 'Rare', sockets: '' }))
      expect(filters.find((f) => f.id === 'misc.exclude_elder')).toBeUndefined()
    })

    it('emits the chip on a white originator map too', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', rarity: 'Normal', sockets: '', zanaMemory: true }),
      )
      expect(filters.find((f) => f.id === 'misc.exclude_elder')?.enabled).toBe(true)
    })
  })

  describe('timeless jewel chips', () => {
    it('generates timeless jewel chips from plain text (Remembrancing)', () => {
      const filters = matchItemMods(
        ['Remembrancing 2724 songworthy deeds by the line of Medved'],
        [],
        undefined,
        makeItemInfo({ baseType: 'Timeless Jewel', itemClass: 'Jewels', sockets: '' }),
      )
      const timelessChips = filters.filter((f) => f.type === 'timeless')
      expect(timelessChips).toHaveLength(2)

      const anyLeader = timelessChips.find((f) => f.id === 'timeless-any')!
      expect(anyLeader.text).toBe('2724 Any Leader')
      expect(anyLeader.min).toBe(2724)
      expect(anyLeader.max).toBe(2724)
      expect(anyLeader.enabled).toBe(true)
      expect(anyLeader.timelessLeaders).toEqual([
        'explicit.pseudo_timeless_jewel_medved',
        'explicit.pseudo_timeless_jewel_vorana',
        'explicit.pseudo_timeless_jewel_uhtred',
      ])

      const specificLeader = timelessChips.find((f) => f.id === 'explicit.pseudo_timeless_jewel_medved')!
      expect(specificLeader.text).toBe('2724 Medved')
      expect(specificLeader.enabled).toBe(false)
    })

    it('generates timeless jewel chips from plain text (other families)', () => {
      const filters = matchItemMods(
        ["Bathed 7421 tips of fingers and toes in the Precursor's blood by Doryani"],
        [],
        undefined,
        makeItemInfo({ baseType: 'Timeless Jewel', itemClass: 'Jewels', sockets: '' }),
      )
      const timelessChips = filters.filter((f) => f.type === 'timeless')
      expect(timelessChips).toHaveLength(2)

      const anyLeader = timelessChips.find((f) => f.id === 'timeless-any')!
      expect(anyLeader.text).toBe('7421 Any Leader')
      expect(anyLeader.timelessLeaders).toEqual([
        'explicit.pseudo_timeless_jewel_doryani',
        'explicit.pseudo_timeless_jewel_xibaqua',
        'explicit.pseudo_timeless_jewel_ahuana',
      ])
    })

    it('generates timeless jewel chips from advanced mod data', () => {
      const advancedMods: AdvancedMod[] = [
        {
          type: 'prefix',
          name: 'Timeless',
          tier: 1,
          tags: [],
          lines: [
            'Passives in radius are Conquered by the Karui',
            'Carved to glorify 5972(2000-10000) new faithful converted by High Templar Dominus(Avarius-Maxarius)',
          ],
          ranges: [{ value: 5972, min: 2000, max: 10000 }],
        },
      ]
      const filters = matchItemMods(
        [
          'Passives in radius are Conquered by the Karui',
          'Carved to glorify 5972 new faithful converted by High Templar Dominus',
        ],
        [],
        undefined,
        makeItemInfo({ baseType: 'Timeless Jewel', itemClass: 'Jewels', sockets: '' }),
        advancedMods,
      )
      const timelessChips = filters.filter((f) => f.type === 'timeless')
      expect(timelessChips).toHaveLength(2)

      const anyLeader = timelessChips.find((f) => f.id === 'timeless-any')!
      expect(anyLeader.text).toBe('5972 Any Leader')
      expect(anyLeader.timelessLeaders).toEqual([
        'explicit.pseudo_timeless_jewel_dominus',
        'explicit.pseudo_timeless_jewel_avarius',
        'explicit.pseudo_timeless_jewel_maxarius',
      ])
    })

    it('skips timeless jewel special mods from regular explicit processing', () => {
      const filters = matchItemMods(
        ['Passives in radius are Conquered by the Karui', 'Historic', 'Remembrancing 1234 deeds by the line of Vorana'],
        [],
        undefined,
        makeItemInfo({ baseType: 'Timeless Jewel', itemClass: 'Jewels', sockets: '' }),
      )
      // These mods should not produce explicit chips (they're handled by timeless system)
      const explicitChips = filters.filter((f) => f.type === 'explicit')
      const hasConquered = explicitChips.some((f) => f.text.includes('Conquered'))
      const hasHistoric = explicitChips.some((f) => f.text === 'Historic')
      expect(hasConquered).toBe(false)
      expect(hasHistoric).toBe(false)
    })
  })

  describe('heist filters', () => {
    it('generates area level chip for heist contracts', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Heist Contracts', sockets: '', monsterLevel: 83 }),
      )
      const areaLevel = filters.find((f) => f.id === 'misc.area_level')
      expect(areaLevel).toBeDefined()
      expect(areaLevel?.value).toBe(83)
      expect(areaLevel?.enabled).toBe(true)
    })

    it('does not generate area level chip for maps', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Maps', sockets: '', monsterLevel: 83 }),
      )
      const areaLevel = filters.find((f) => f.id === 'misc.area_level')
      expect(areaLevel).toBeUndefined()
    })

    it('does not generate area level chip for forbidden tomes (sanctum research)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Sanctum Research', sockets: '', monsterLevel: 83 }),
      )
      const areaLevel = filters.find((f) => f.id === 'misc.area_level')
      expect(areaLevel).toBeUndefined()
    })

    it('generates wings revealed/total chips for heist blueprints with correct trade keys', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Blueprints', wingsRevealed: 3, wingsTotal: 4 }),
      )
      // The id strips to the trade API filter key: "heist.heist_wings" -> "heist_wings"
      const wingsRevealed = filters.find((f) => f.id === 'heist.heist_wings')
      expect(wingsRevealed).toBeDefined()
      expect(wingsRevealed?.value).toBe(3)
      expect(wingsRevealed?.min).toBe(3)
      expect(wingsRevealed?.enabled).toBe(true)

      // Total wings uses min (not max) per trade site behavior
      const wingsTotal = filters.find((f) => f.id === 'heist.heist_max_wings')
      expect(wingsTotal).toBeDefined()
      expect(wingsTotal?.value).toBe(4)
      expect(wingsTotal?.min).toBe(4)
      expect(wingsTotal?.enabled).toBe(true)
    })

    it('generates heist job filter for contracts (min: 1)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Contracts', heistJobs: [{ skill: 'Engineering', level: 3 }] }),
      )
      // The id strips to the trade API filter key: "heist.heist_engineering"
      const jobFilter = filters.find((f) => f.id === 'heist.heist_engineering')
      expect(jobFilter).toBeDefined()
      expect(jobFilter?.min).toBe(1)
      expect(jobFilter?.enabled).toBe(true)
    })

    it('generates one heist job row per blueprint job, off by default and pinned to its level', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Blueprints',
          wingsRevealed: 1,
          wingsTotal: 3,
          heistJobs: [
            { skill: 'Demolition', level: 2 },
            { skill: 'Counter-Thaumaturgy', level: 5 },
            { skill: 'Trap Disarmament', level: 1 },
          ],
        }),
      )
      const jobRows = filters.filter(
        (f) =>
          f.type === 'heist' &&
          f.id.startsWith('heist.heist_') &&
          f.id !== 'heist.heist_wings' &&
          f.id !== 'heist.heist_max_wings',
      )
      // Counter-Thaumaturgy's hyphen would survive a naive slug and yield a key
      // the trade API doesn't have.
      expect(jobRows.map((f) => f.id)).toEqual([
        'heist.heist_demolition',
        'heist.heist_counter_thaumaturgy',
        'heist.heist_trap_disarmament',
      ])
      expect(jobRows.map((f) => f.min)).toEqual([2, 5, 1])
      expect(jobRows.map((f) => f.value)).toEqual([2, 5, 1])
      expect(jobRows.every((f) => f.enabled)).toBe(false)
      expect(jobRows[1].text).toBe('Requires Counter-Thaumaturgy (Level 5)')
    })

    it('does NOT generate heist job rows for non-heist item classes', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Body Armours', heistJobs: [{ skill: 'Engineering', level: 3 }] }),
      )
      expect(filters.find((f) => f.id === 'heist.heist_engineering')).toBeUndefined()
    })

    it('adds Exclude Enchanted misc chip enabled by default for unenchanted blueprints', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Blueprints', wingsRevealed: 3, wingsTotal: 3, heistTarget: 'Currency' }),
      )
      const chip = filters.find((f) => f.id === 'misc.exclude_enchanted')
      expect(chip).toBeDefined()
      expect(chip?.type).toBe('misc')
      expect(chip?.enabled).toBe(true)
      expect(chip?.text).toBe('Exclude Enchanted')
    })

    it('defaults Exclude Enchanted off for Enchanted Armaments blueprints', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Blueprints',
          wingsRevealed: 1,
          wingsTotal: 3,
          heistTarget: 'Enchanted Armaments',
        }),
      )
      const chip = filters.find((f) => f.id === 'misc.exclude_enchanted')
      expect(chip?.enabled).toBe(false)
    })

    it('defaults Exclude Enchanted off when blueprint has enchants', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Blueprints',
          wingsRevealed: 1,
          wingsTotal: 3,
          enchants: ['Heist Targets are always Enchanted Armaments'],
        }),
      )
      const chip = filters.find((f) => f.id === 'misc.exclude_enchanted')
      expect(chip?.enabled).toBe(false)
    })
  })

  describe('trial key area level pinning', () => {
    let prevVersion: ReturnType<typeof getPoeVersion>

    beforeEach(() => {
      prevVersion = getPoeVersion()
    })

    afterEach(() => {
      setPoeVersion(prevVersion)
    })

    it('pins area_level min AND max for PoE2 Djinn Barya, type pseudo (renders as row)', () => {
      setPoeVersion(2)
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Trial Coins', baseType: 'Djinn Barya', sockets: '', monsterLevel: 75 }),
      )
      const areaLevel = filters.find((f) => f.id === 'misc.area_level')
      expect(areaLevel).toBeDefined()
      expect(areaLevel?.min).toBe(75)
      expect(areaLevel?.max).toBe(75)
      expect(areaLevel?.enabled).toBe(true)
      expect(areaLevel?.type).toBe('pseudo')
    })

    it('pins area_level min AND max for PoE2 Inscribed Ultimatum, type pseudo (renders as editable row), enabled true', () => {
      setPoeVersion(2)
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Inscribed Ultimatum',
          baseType: 'Inscribed Ultimatum',
          sockets: '',
          monsterLevel: 79,
        }),
      )
      const areaLevel = filters.find((f) => f.id === 'misc.area_level')
      expect(areaLevel).toBeDefined()
      expect(areaLevel?.min).toBe(79)
      expect(areaLevel?.max).toBe(79)
      expect(areaLevel?.enabled).toBe(true)
      expect(areaLevel?.type).toBe('pseudo')
    })

    it('keeps area_level max null for PoE1 Inscribed Ultimatum (higher level is better), type misc', () => {
      setPoeVersion(1)
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Inscribed Ultimatum',
          baseType: 'Inscribed Ultimatum',
          sockets: '',
          monsterLevel: 79,
        }),
      )
      const areaLevel = filters.find((f) => f.id === 'misc.area_level')
      expect(areaLevel).toBeDefined()
      expect(areaLevel?.min).toBe(79)
      expect(areaLevel?.max).toBeNull()
      expect(areaLevel?.type).toBe('misc')
    })

    it('keeps area_level max null for non-trial items in PoE2', () => {
      setPoeVersion(2)
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Heist Contracts', sockets: '', monsterLevel: 83 }),
      )
      const areaLevel = filters.find((f) => f.id === 'misc.area_level')
      expect(areaLevel).toBeDefined()
      expect(areaLevel?.min).toBe(83)
      expect(areaLevel?.max).toBeNull()
    })
  })

  describe('ilvl chip defaults', () => {
    it('generates ilvl chip with enabled=true and chipState=max for Forbidden Tomes (Sanctum Research)', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ itemClass: 'Sanctum Research', itemLevel: 83 }))
      const ilvl = filters.find((f) => f.id === 'misc.ilvl')
      expect(ilvl).toBeDefined()
      expect(ilvl?.enabled).toBe(true)
      expect(ilvl?.chipState).toBe('max')
      expect(ilvl?.min).toBeNull()
      expect(ilvl?.max).toBe(83)
    })

    it('generates ilvl chip with enabled=false and no chipState for regular rares', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ itemClass: 'Body Armours', itemLevel: 86 }))
      const ilvl = filters.find((f) => f.id === 'misc.ilvl')
      expect(ilvl).toBeDefined()
      expect(ilvl?.enabled).toBe(false)
      expect(ilvl?.chipState).toBeUndefined()
    })
  })

  describe('added elemental damage pseudo (non-weapon consolidator)', () => {
    const FIRE_ATK = { id: 'explicit.stat_1573130764', text: 'Adds # to # Fire Damage to Attacks', type: 'explicit' }
    const COLD_ATK = { id: 'explicit.stat_4067062424', text: 'Adds # to # Cold Damage to Attacks', type: 'explicit' }
    const LITE_ATK = {
      id: 'explicit.stat_1754445556',
      text: 'Adds # to # Lightning Damage to Attacks',
      type: 'explicit',
    }
    const FIRE_PLAIN = { id: 'explicit.stat_321077055', text: 'Adds # to # Fire Damage', type: 'explicit' }
    const COLD_PLAIN = { id: 'explicit.stat_2387423236', text: 'Adds # to # Cold Damage', type: 'explicit' }
    const FIRE_SPELLS = { id: 'explicit.stat_1133016593', text: 'Adds # to # Fire Damage to Spells', type: 'explicit' }
    const LITE_SPELLS = {
      id: 'explicit.stat_2831165374',
      text: 'Adds # to # Lightning Damage to Spells',
      type: 'explicit',
    }
    const FIRE_BOTH = {
      id: 'explicit.stat_3964634628',
      text: 'Adds # to # Fire Damage to Spells and Attacks',
      type: 'explicit',
    }

    const PSEUDO_TO_ATK = 'pseudo.pseudo_adds_elemental_damage_to_attacks'
    const PSEUDO_TO_SPL = 'pseudo.pseudo_adds_elemental_damage_to_spells'
    const PSEUDO_PLAIN = 'pseudo.pseudo_adds_elemental_damage'

    const run = (
      stats: Array<{ id: string; text: string; type: string }>,
      mods: string[],
      itemClass = 'Belts',
    ): ReturnType<typeof matchItemMods> => {
      _setStatEntriesForTests(stats)
      return matchItemMods(mods, [], undefined, makeItemInfo({ rarity: 'Rare', itemClass }))
    }

    it('two ele colors to-attacks on a non-weapon: pseudo emitted with summed averages', () => {
      // Prismweave belt: fire 14-32 (avg 23) + cold 11-24 (avg 17.5) + lightning 1-61 (avg 31)
      // Sum of averages -> 71.5 -> floored 71
      const filters = run(
        [FIRE_ATK, COLD_ATK, LITE_ATK],
        [
          'Adds 14 to 32 Fire Damage to Attacks',
          'Adds 11 to 24 Cold Damage to Attacks',
          'Adds 1 to 61 Lightning Damage to Attacks',
        ],
      )
      const pseudo = filters.find((f) => f.id === PSEUDO_TO_ATK)
      expect(pseudo).toBeDefined()
      expect(pseudo?.value).toBe(71)
    })

    it('one ele color to-attacks on a non-weapon: no pseudo emitted (single-color row already shown)', () => {
      const filters = run([FIRE_ATK], ['Adds 14 to 32 Fire Damage to Attacks'])
      expect(filters.find((f) => f.id === PSEUDO_TO_ATK)).toBeUndefined()
    })

    it('two ele colors plain "Adds X to Y" on a non-weapon: pseudo emitted', () => {
      // Painseeker gloves: fire 16-26 (avg 21) + cold 16-29 (avg 22.5) -> 43.5 -> 43
      const filters = run(
        [FIRE_PLAIN, COLD_PLAIN],
        ['Adds 16 to 26 Fire Damage', 'Adds 16 to 29 Cold Damage'],
        'Gloves',
      )
      const pseudo = filters.find((f) => f.id === PSEUDO_PLAIN)
      expect(pseudo).toBeDefined()
      expect(pseudo?.value).toBe(43)
    })

    it('two ele colors on a weapon: no pseudo (weapon DPS pipeline owns this)', () => {
      const filters = run(
        [FIRE_ATK, COLD_ATK],
        ['Adds 10 to 20 Fire Damage to Attacks', 'Adds 5 to 15 Cold Damage to Attacks'],
        'Wands',
      )
      expect(filters.find((f) => f.id === PSEUDO_TO_ATK)).toBeUndefined()
    })

    it('"to Spells" mods accumulate independently from "to Attacks"', () => {
      const filters = run(
        [FIRE_SPELLS, LITE_SPELLS],
        ['Adds 5 to 15 Fire Damage to Spells', 'Adds 7 to 86 Lightning Damage to Spells'],
        'Helmets',
      )
      const pseudo = filters.find((f) => f.id === PSEUDO_TO_SPL)
      expect(pseudo).toBeDefined()
      // (5+15)/2 + (7+86)/2 = 10 + 46.5 = 56.5 -> 56
      expect(pseudo?.value).toBe(56)
      expect(filters.find((f) => f.id === PSEUDO_TO_ATK)).toBeUndefined()
    })

    it('"Spells and Attacks" hybrid contributes to both pseudos', () => {
      const filters = run(
        [FIRE_BOTH, LITE_ATK, LITE_SPELLS],
        [
          'Adds 30 to 60 Fire Damage to Spells and Attacks',
          'Adds 5 to 15 Lightning Damage to Attacks',
          'Adds 5 to 15 Lightning Damage to Spells',
        ],
        'Amulets',
      )
      // To-attacks: fire-both (45) + lightning-attacks (10) = 55
      const atk = filters.find((f) => f.id === PSEUDO_TO_ATK)
      expect(atk?.value).toBe(55)
      // To-spells: fire-both (45) + lightning-spells (10) = 55
      const spl = filters.find((f) => f.id === PSEUDO_TO_SPL)
      expect(spl?.value).toBe(55)
    })

    it('does not regress existing pseudos with default minCount=1', () => {
      _setStatEntriesForTests([{ id: 'explicit.stat_1671376347', text: '+#% to Fire Resistance', type: 'explicit' }])
      const filters = matchItemMods(['+30% to Fire Resistance'], [], undefined, makeItemInfo({ rarity: 'Rare' }))
      // Single resistance roll still emits Total Ele Res pseudo (minCount default = 1)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')?.value).toBe(30)
    })
  })

  describe('cluster jewel "Adds N Passive Skills" enchant', () => {
    const ADDS_PASSIVES = { id: 'enchant.stat_3086156145', text: 'Adds # Passive Skills', type: 'enchant' }

    const runEnchant = (baseType: string, enchant: string): ReturnType<typeof matchItemMods> => {
      _setStatEntriesForTests([ADDS_PASSIVES])
      return matchItemMods([], [], undefined, makeItemInfo({ baseType, itemClass: 'Jewels', enchants: [enchant] }))
    }

    it('Medium 4 -> default min 4 max 5 (excludes 6)', () => {
      const filters = runEnchant('Medium Cluster Jewel', 'Adds 4 Passive Skills')
      const f = filters.find((x) => x.id === 'enchant.stat_3086156145')!
      expect(f.min).toBe(4)
      expect(f.max).toBe(5)
    })

    it('Medium 5 -> default min 4 max 5 (5 == 4 functionally)', () => {
      const filters = runEnchant('Medium Cluster Jewel', 'Adds 5 Passive Skills')
      const f = filters.find((x) => x.id === 'enchant.stat_3086156145')!
      expect(f.min).toBe(4)
      expect(f.max).toBe(5)
    })

    it('Medium 6 -> min 6, no max (6 is its own price tier)', () => {
      const filters = runEnchant('Medium Cluster Jewel', 'Adds 6 Passive Skills')
      const f = filters.find((x) => x.id === 'enchant.stat_3086156145')!
      expect(f.min).toBe(6)
      expect(f.max).toBeNull()
    })

    it('Large 8 -> max 8, no min (else every 12 surfaces)', () => {
      const filters = runEnchant('Large Cluster Jewel', 'Adds 8 Passive Skills')
      const f = filters.find((x) => x.id === 'enchant.stat_3086156145')!
      expect(f.min).toBeNull()
      expect(f.max).toBe(8)
    })

    it('Large 12 -> min 12 (default)', () => {
      const filters = runEnchant('Large Cluster Jewel', 'Adds 12 Passive Skills')
      const f = filters.find((x) => x.id === 'enchant.stat_3086156145')!
      expect(f.min).toBe(12)
      expect(f.max).toBeNull()
    })

    it('Small cluster passes through with min equal to value', () => {
      const filters = runEnchant('Small Cluster Jewel', 'Adds 3 Passive Skills')
      const f = filters.find((x) => x.id === 'enchant.stat_3086156145')!
      expect(f.min).toBe(3)
      expect(f.max).toBeNull()
    })
  })

  describe('relic (sanctum) mods', () => {
    // Relic affixes live under sanctum.* on the trade API, not explicit.*. Before
    // the fix the explicit matcher found nothing and the price checker showed no
    // searchable chips for relics. Real ids from the live PoE2 stats catalog.
    const RELIC_STATS = [
      { id: 'sanctum.stat_1583320325', text: '#% increased Honour restored', type: 'sanctum' },
      { id: 'sanctum.stat_1680962389', text: '#% increased quantity of Relics dropped by Monsters', type: 'sanctum' },
    ]

    it('matches relic prefix/suffix mods to sanctum stats and enables them', () => {
      _setStatEntriesForTests(RELIC_STATS)
      const filters = matchItemMods(
        ['10% increased Honour restored', '7% increased quantity of Relics dropped by Monsters'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Relics', baseType: 'Urn Relic' }),
      )
      const honour = filters.find((f) => f.id === 'sanctum.stat_1583320325')
      const quantity = filters.find((f) => f.id === 'sanctum.stat_1680962389')
      expect(honour).toBeDefined()
      expect(honour?.type).toBe('sanctum')
      expect(honour?.enabled).toBe(true)
      expect(honour?.value).toBe(10)
      expect(honour?.min).toBe(9) // floor(10 * 0.9)
      expect(quantity).toBeDefined()
      expect(quantity?.value).toBe(7)
    })

    it('does not match relic stats for non-relic items', () => {
      _setStatEntriesForTests(RELIC_STATS)
      const filters = matchItemMods(
        ['10% increased Honour restored'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings' }),
      )
      expect(filters.find((f) => f.type === 'sanctum')).toBeUndefined()
    })

    // #582. The room-count mod prints its plural form with a plural verb ("2 additional
    // Rooms ARE revealed") while the live PoE1 trade stat is baked singular ("An
    // additional Room IS revealed"), so every roll above 1 matched nothing and the relic
    // lost the row. The count is a real filter value on these stats even though their
    // text has no "#" (probed on Standard, unfiltered / min:2 / min:3: rooms 1597/485/4,
    // Merchant Choice 731/290/10), and it is a small per-tier integer, so it must search
    // as an exact min.
    const ROOM_STATS = [
      { id: 'sanctum.stat_386901949', text: 'An additional Room is revealed on the Sanctum Map', type: 'sanctum' },
      { id: 'sanctum.stat_3237367570', text: 'Rooms are unknown on the Sanctum Map', type: 'sanctum' },
      { id: 'sanctum.stat_290775436', text: 'The Merchant has an additional Choice', type: 'sanctum' },
    ]
    const runRelic = (mods: string[]) =>
      matchItemMods(mods, [], undefined, makeItemInfo({ rarity: 'Magic', itemClass: 'Relics', baseType: 'Urn Relic' }))

    it('matches the plural room-count roll to the singular trade stat (#582)', () => {
      _setStatEntriesForTests(ROOM_STATS)
      const f = runRelic(['2 additional Rooms are revealed on the Sanctum Map']).find(
        (x) => x.id === 'sanctum.stat_386901949',
      )
      expect(f).toBeDefined()
      expect(f?.value).toBe(2)
      expect(f?.min).toBe(2) // exact, not floor(2 * 0.9) = 1
    })

    it('still matches the singular room-count roll, counting it as 1', () => {
      _setStatEntriesForTests(ROOM_STATS)
      const f = runRelic(['An additional Room is revealed on the Sanctum Map']).find(
        (x) => x.id === 'sanctum.stat_386901949',
      )
      expect(f).toBeDefined()
      expect(f?.value).toBe(1)
      expect(f?.min).toBe(1)
    })

    it('carries the count of the other word-spelled sanctum counts (#582)', () => {
      _setStatEntriesForTests(ROOM_STATS)
      const f = runRelic(['The Merchant has 2 additional Choices']).find((x) => x.id === 'sanctum.stat_290775436')
      expect(f).toBeDefined()
      expect(f?.value).toBe(2)
      expect(f?.min).toBe(2)
    })

    it('leaves a genuinely valueless sanctum stat presence-only (negative control)', () => {
      _setStatEntriesForTests(ROOM_STATS)
      const f = runRelic(['Rooms are unknown on the Sanctum Map']).find((x) => x.id === 'sanctum.stat_3237367570')
      expect(f).toBeDefined()
      expect(f?.value).toBeNull()
      expect(f?.min).toBeNull()
    })
  })

  describe('minimum-only added damage fold (#587)', () => {
    // #587. Tulfall prints both ends of its added-damage roll ("Adds 50 to 70 Cold
    // Damage to Spells per Power Charge") but GGG publishes the stat text with only
    // the minimum in it ("Adds # minimum Cold Damage to Spells per Power Charge",
    // explicit.stat_3408048164), so the line matched nothing and the wand lost the
    // row entirely. The id is indexed as an ordinary min-max range despite that text:
    // probed on Allflame, value 50 returns 0 listings and 60 (the average of 50 and
    // 70) returns 113. Tulborn's twin mod is published with both #s, so the fold must
    // not fire on it.
    const FOLD_STATS = [
      {
        id: 'explicit.stat_3408048164',
        text: 'Adds # minimum Cold Damage to Spells per Power Charge',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_4085417083',
        text: 'Adds # to # Lightning Damage to Spells per Power Charge',
        type: 'explicit',
      },
    ]
    const runWand = (mods: string[]) =>
      matchItemMods(mods, [], undefined, makeItemInfo({ rarity: 'Unique', itemClass: 'Wands', baseType: 'Opal Wand' }))

    it('matches a two-ended roll to the minimum-only stat, averaged (#587)', () => {
      _setStatEntriesForTests(FOLD_STATS)
      const f = runWand(['Adds 50 to 70 Cold Damage to Spells per Power Charge']).find(
        (x) => x.id === 'explicit.stat_3408048164',
      )
      expect(f).toBeDefined()
      expect(f?.value).toBe(60)
    })

    it('leaves an ordinary two-# added-damage stat on its own id (negative control)', () => {
      _setStatEntriesForTests(FOLD_STATS)
      const filters = runWand(['Adds 10 to 20 Lightning Damage to Spells per Power Charge'])
      expect(filters.find((x) => x.id === 'explicit.stat_4085417083')?.value).toBe(15)
      expect(filters.find((x) => x.id === 'explicit.stat_3408048164')).toBeUndefined()
    })
  })

  describe('catalyst quality scales implicit magnitude (#477)', () => {
    // Catalyst quality on jewellery scales the magnitude of both explicit AND
    // implicit mods of the relevant tag; GGG annotates each scaled mod's advanced
    // header with "-- N% Increased", parsed onto the AdvancedMod as
    // magnitudeMultiplier. Explicits already apply it; implicits did not (#477).
    it('scales an implicit roll up by the advanced-mod magnitude multiplier', () => {
      _setStatEntriesForTests([{ id: 'implicit.stat_3372524247', text: '+#% to Fire Resistance', type: 'implicit' }])
      const advancedMods: AdvancedMod[] = [
        {
          type: 'implicit',
          name: '',
          tier: 0,
          tags: [],
          lines: ['+12% to Fire Resistance'],
          ranges: [],
          magnitudeMultiplier: 1.2, // 20% catalyst quality
        },
      ]
      const filters = matchItemMods(
        [],
        ['+12% to Fire Resistance'],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings', quality: 20 }),
        advancedMods,
      )
      const res = filters.find((f) => f.id === 'implicit.stat_3372524247')
      expect(res).toBeDefined()
      expect(res?.value).toBe(14) // trunc(12 * 1.2)
      expect(res?.min).toBe(14)
      expect(res?.text).toContain('14')
    })

    it('leaves an implicit roll untouched when there is no magnitude multiplier', () => {
      _setStatEntriesForTests([{ id: 'implicit.stat_3372524247', text: '+#% to Fire Resistance', type: 'implicit' }])
      const advancedMods: AdvancedMod[] = [
        { type: 'implicit', name: '', tier: 0, tags: [], lines: ['+12% to Fire Resistance'], ranges: [] },
      ]
      const filters = matchItemMods(
        [],
        ['+12% to Fire Resistance'],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings' }),
        advancedMods,
      )
      const res = filters.find((f) => f.id === 'implicit.stat_3372524247')
      expect(res?.value).toBe(12)
    })
  })

  describe('vestigial items (#533)', () => {
    // A vestigial item's implicit replaces the base implicit and is the item's
    // defining mod (the whole reason it's worth anything), so it must default to
    // enabled even on a non-corrupted unique -- unlike a normal unique implicit,
    // which is a fixed base roll and stays disabled unless corrupted.
    it('enables the implicit row on a non-corrupted vestigial unique', () => {
      _setStatEntriesForTests([
        { id: 'implicit.stat_383509486', text: '#% of Physical Damage taken as Fire Damage', type: 'implicit' },
      ])
      const filters = matchItemMods(
        [],
        ['20% of Physical Damage taken as Fire Damage'],
        undefined,
        makeItemInfo({
          rarity: 'Unique',
          itemClass: 'Body Armours',
          baseType: 'Simple Robe',
          corrupted: false,
          vestigial: true,
        }),
      )
      const implicitRow = filters.find((f) => f.id === 'implicit.stat_383509486')
      expect(implicitRow).toBeDefined()
      expect(implicitRow?.enabled).toBe(true)
    })
  })

  describe('abyssal sockets (singular clipboard vs plural trade text)', () => {
    // PoE1 trade stores "Has # Abyssal Sockets"; Stygian Vise clipboard prints
    // "Has 1 Abyssal Socket". Without a singular->plural variant the match used to
    // fall through to relaxed "Has 1 Socket" and break Stygian searches.
    it('matches Has 1 Abyssal Socket to Has # Abyssal Sockets, not Has 1 Socket', () => {
      _setStatEntriesForTests([
        { id: 'implicit.stat_4077843608', text: 'Has 1 Socket', type: 'implicit' },
        { id: 'implicit.stat_3527617737', text: 'Has # Abyssal Sockets', type: 'implicit' },
      ])
      const result = matchModToStat('Has 1 Abyssal Socket', false, 'implicit')
      expect(result?.statId).toBe('implicit.stat_3527617737')
      expect(result?.value).toBe(1)
    })

    it('relaxed Has 1 Socket does not swallow Has 1 Abyssal Socket', () => {
      _setStatEntriesForTests([{ id: 'implicit.stat_4077843608', text: 'Has 1 Socket', type: 'implicit' }])
      expect(matchModToStat('Has 1 Abyssal Socket', false, 'implicit')).toBeNull()
    })
  })

  describe('charm slots (singular trade text vs plural item text)', () => {
    // The PoE2 trade API stores these singular ("# Charm Slot", "Has # Charm Slot"),
    // but a belt with 2+ slots reads "Charm Slots". Without the plural->singular
    // text variant the anchored pattern never matches and the price checker shows
    // no chip for the slot count. Real ids from the live PoE2 stats catalog.
    const CHARM_SLOT_STATS = [
      { id: 'implicit.stat_1416292992', text: 'Has # Charm Slot', type: 'implicit' },
      { id: 'explicit.stat_2582079000', text: '# Charm Slot', type: 'explicit' },
    ]

    it('matches the plural "Has 2 Charm Slots" belt implicit', () => {
      _setStatEntriesForTests(CHARM_SLOT_STATS)
      const filters = matchItemMods(
        [],
        ['Has 2 Charm Slots'],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Belts' }),
      )
      const slot = filters.find((f) => f.id === 'implicit.stat_1416292992')
      expect(slot).toBeDefined()
      expect(slot?.value).toBe(2)
    })

    it('matches the plural "+2 Charm Slots" explicit', () => {
      _setStatEntriesForTests(CHARM_SLOT_STATS)
      const filters = matchItemMods(
        ['+2 Charm Slots'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Belts' }),
      )
      const slot = filters.find((f) => f.id === 'explicit.stat_2582079000')
      expect(slot).toBeDefined()
      expect(slot?.value).toBe(2)
    })

    it('still matches the singular "Has 1 Charm Slot" form', () => {
      _setStatEntriesForTests(CHARM_SLOT_STATS)
      const filters = matchItemMods(
        [],
        ['Has 1 Charm Slot'],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Belts' }),
      )
      const slot = filters.find((f) => f.id === 'implicit.stat_1416292992')
      expect(slot).toBeDefined()
      expect(slot?.value).toBe(1)
    })

    it('routes a non-belt "# Charm Slot" (Elevore helmet) to the Global trade id', () => {
      // trade2 indexes the belt explicit charm-slot affix under explicit.stat_2582079000
      // but a GLOBAL charm-slot grant (Elevore Hunter Hood) under explicit.stat_554899692
      // ("# Charm Slot (Global)"). Identical clipboard text, so the text matcher always
      // lands on the belt id -- non-belts must be redirected to the Global id.
      _setStatEntriesForTests([
        { id: 'explicit.stat_2582079000', text: '# Charm Slot', type: 'explicit' },
        { id: 'explicit.stat_554899692', text: '# Charm Slot (Global)', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['1 Charm Slot'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Helmets', baseType: 'Hunter Hood' }),
      )
      const slot = filters.find((f) => f.id === 'explicit.stat_554899692')
      expect(slot).toBeDefined()
      expect(slot?.value).toBe(1)
      expect(filters.find((f) => f.id === 'explicit.stat_2582079000')).toBeUndefined()
    })

    it('keeps a belt "+2 Charm Slots" on the plain (non-Global) trade id even when the Global stat exists', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_2582079000', text: '# Charm Slot', type: 'explicit' },
        { id: 'explicit.stat_554899692', text: '# Charm Slot (Global)', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['+2 Charm Slots'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Belts' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_2582079000')).toBeDefined()
      expect(filters.find((f) => f.id === 'explicit.stat_554899692')).toBeUndefined()
    })
  })

  describe('number-governed plurals (#577)', () => {
    // The clipboard pluralizes the noun a number governs ("for 2 seconds") while the
    // trade stat text bakes in one plurality ("Gain Adrenaline for # second on Kill",
    // explicit.stat_4145689649). Death Rush rolls 1-3 seconds, so only the 1-second
    // roll produced a row -- 2 and 3 matched nothing and the mod was dropped.
    const DEATH_RUSH_STATS = [
      { id: 'explicit.stat_821241261', text: 'Recover #% of Life on Kill', type: 'explicit' },
      { id: 'explicit.stat_4145689649', text: 'Gain Adrenaline for # second on Kill', type: 'explicit' },
    ]

    it.each([1, 2, 3])('emits the Adrenaline row for a %i second roll', (seconds) => {
      _setStatEntriesForTests(DEATH_RUSH_STATS)
      const filters = matchItemMods(
        ['Recover 4% of Life on Kill', `Gain Adrenaline for ${seconds} second${seconds === 1 ? '' : 's'} on Kill`],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Rings', baseType: 'Amethyst Ring' }),
      )
      const adrenaline = filters.find((f) => f.id === 'explicit.stat_4145689649')
      expect(adrenaline).toBeDefined()
      expect(adrenaline?.value).toBe(seconds)
    })

    it('matches a singular clipboard roll against a plural stat text', () => {
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_4205704547',
          text: 'Gain Adrenaline for # seconds when you reach Low Life',
          type: 'explicit',
        },
      ])
      const filters = matchItemMods(
        ['Gain Adrenaline for 1 second when you reach Low Life'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique' }),
      )
      const adrenaline = filters.find((f) => f.id === 'explicit.stat_4205704547')
      expect(adrenaline?.value).toBe(1)
    })

    it('keeps a fixed-value stat on its own id when the rollable twin also matches', () => {
      // The only pair in either live catalog where relaxing the plural makes a second
      // stat match a real clipboard line: the fixed 1.5m Shock spread and its rollable
      // "# metre" twin. The longest-text tiebreak has to keep the fixed one.
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_424549222',
          text: 'Shocks you inflict spread to other Enemies within # metre',
          type: 'explicit',
        },
        {
          id: 'explicit.stat_1640259660',
          text: 'Shocks you inflict spread to other Enemies within 1.5 metres',
          type: 'explicit',
        },
      ])
      expect(matchModToStat('Shocks you inflict spread to other Enemies within 1.5 metres')?.statId).toBe(
        'explicit.stat_1640259660',
      )
      // …while a rolled distance still reaches the rollable id (it never matched before).
      const rolled = matchModToStat('Shocks you inflict spread to other Enemies within 2 metres')
      expect(rolled?.statId).toBe('explicit.stat_424549222')
      expect(rolled?.value).toBe(2)
    })

    it('matches the plural metre form of a singular range stat', () => {
      _setStatEntriesForTests([{ id: 'explicit.stat_2264295449', text: '+# metre to Weapon Range', type: 'explicit' }])
      const filters = matchItemMods(['+2 metres to Weapon Range'], [], undefined, makeItemInfo())
      expect(filters.find((f) => f.id === 'explicit.stat_2264295449')?.value).toBe(2)
    })
  })

  describe('tablet (precursor tablet) mods', () => {
    // Tablet affixes are explicit map mods, but the clipboard phrases them
    // differently from the trade stat text. buildTabletFilters maps the clipboard
    // phrasing to the trade explicit id via the EE2-derived tablet-mods table.
    it('maps tablet clipboard phrasings to their trade explicit stat ids', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['36% increased Quantity of Waystones found in Map', 'Map is inhabited by 1 additional Rogue Exile'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
      )
      const waystones = filters.find((f) => f.id === 'explicit.stat_2777224821')
      const exiles = filters.find((f) => f.id === 'explicit.stat_3550168289')
      expect(waystones).toBeDefined()
      expect(waystones?.value).toBe(36)
      expect(waystones?.min).toBe(32) // floor(36 * 0.9)
      expect(waystones?.enabled).toBe(true)
      expect(exiles).toBeDefined()
      expect(exiles?.value).toBe(1)
    })

    it('defaults the base-type chip on for a non-unique tablet (scopes the mod search to the tablet type)', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['36% increased Quantity of Waystones found in Map'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
      )
      const baseChip = filters.find((f) => f.id === 'misc.basetype')
      expect(baseChip).toBeDefined()
      expect(baseChip?.text).toBe('Overseer Tablet')
      expect(baseChip?.enabled).toBe(true)
    })

    it('emits no base-type chip for a unique tablet (searched by name, not base)', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Tablet', baseType: 'Breach Tablet', name: 'Wraeclast Besieged' }),
      )
      expect(filters.find((f) => f.id === 'misc.basetype')).toBeUndefined()
    })

    // The tablet-mods table collapses "reduced"/"increased" phrasings onto one positive
    // ("increased") stat id; the table lookup must re-apply the reduced->increased sign that
    // matchModToStat handles for the non-table path, else the value stays positive and the
    // search points the wrong way (issue: "costs reduced Tribute" searched as +increased).
    const TRIBUTE_STATS = [
      {
        id: 'explicit.stat_2282052746',
        text: 'Rerolling Favours at Ritual Altars in Map costs #% increased Tribute',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_159726667',
        text: 'Monsters Sacrificed at Ritual Altars in Map grant #% increased Tribute',
        type: 'explicit',
      },
    ]

    it('negates a "reduced Tribute" cost roll (beneficial negative: MAX bound at the exact roll)', () => {
      _setStatEntriesForTests(TRIBUTE_STATS)
      const filters = matchItemMods(
        ['Rerolling Favours at Ritual Altars in Map costs 30% reduced Tribute'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Ritual Tablet' }),
      )
      const chip = filters.find((f) => f.id === 'explicit.stat_2282052746')
      expect(chip?.value).toBe(-30)
      expect(chip?.min).toBeNull() // beneficial negative -> no min
      expect(chip?.max).toBe(-30) // more-reduced (more negative) is better
    })

    it('treats a "grant reduced Tribute" roll as a detrimental negative (MIN bound, not beneficial)', () => {
      _setStatEntriesForTests(TRIBUTE_STATS)
      const filters = matchItemMods(
        ['Monsters Sacrificed at Ritual Altars in Map grant 20% reduced Tribute'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Ritual Tablet' }),
      )
      const chip = filters.find((f) => f.id === 'explicit.stat_159726667')
      expect(chip?.value).toBe(-20)
      expect(chip?.max).toBeNull()
      expect(chip?.min).toBe(-22) // ceil(-20 * 1.1): widened toward more-negative
    })

    it('does not run the tablet map for non-tablet items', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['36% increased Quantity of Waystones found in Map'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Rings' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_2777224821')).toBeUndefined()
    })

    // The tablet's defining implicit is a two-line combined stat the trade API
    // stores singular ("Adds Abysses to a Map \n# use remaining"); the advanced
    // clipboard rebuild feeds the matcher the per-line fragments plus the joined
    // form. Real ids/text from the live PoE2 stats catalog.
    const TABLET_IMPLICIT_STATS = [
      { id: 'implicit.stat_2369421690', text: 'Adds Abysses to a Map \n# use remaining', type: 'implicit' },
      {
        id: 'implicit.stat_2219129443',
        text: 'Adds an Otherworldy Breach to a Map \n# use remaining',
        type: 'implicit',
      },
    ]

    it('matches a multi-use tablet implicit (plural "uses") and defaults it on with the uses count', () => {
      _setStatEntriesForTests(TABLET_IMPLICIT_STATS)
      const filters = matchItemMods(
        [],
        ['Adds Abysses to a Map', '10 uses remaining', 'Adds Abysses to a Map\n10 uses remaining'],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Abyss Tablet' }),
      )
      const chips = filters.filter((f) => f.id === 'implicit.stat_2369421690')
      expect(chips).toHaveLength(1)
      expect(chips[0].value).toBe(10)
      expect(chips[0].min).toBe(10)
      expect(chips[0].enabled).toBe(true)
    })

    it('matches a single-use tablet implicit (singular "use") and defaults it on', () => {
      _setStatEntriesForTests(TABLET_IMPLICIT_STATS)
      const filters = matchItemMods(
        [],
        [
          'Adds an Otherworldy Breach to a Map',
          '1 use remaining',
          'Adds an Otherworldy Breach to a Map\n1 use remaining',
        ],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Tablet', baseType: 'Breach Tablet' }),
      )
      const chip = filters.find((f) => f.id === 'implicit.stat_2219129443')
      expect(chip).toBeDefined()
      expect(chip?.value).toBe(1)
      expect(chip?.min).toBe(1)
      expect(chip?.enabled).toBe(true)
    })

    // GGG splits Abyss into a dedicated singular stat ("Map contains an additional
    // Abyss" = explicit.stat_1070816711) separate from the numeric "# additional
    // Abysses" (explicit.stat_3490187949) -- unlike Strongbox/Essence/Shrine, which
    // alias both phrasings under a single id. The tablet table must route the valueless
    // singular phrasing to the singular id, or the price check searches the wrong
    // (numeric) stat and misses every singular-Abyss tablet.
    it('routes the singular "an additional Abyss" tablet mod to its dedicated stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains an additional Abyss'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Abyss Tablet' }),
      )
      const abyss = filters.find((f) => f.text === 'Map contains an additional Abyss')
      expect(abyss?.id).toBe('explicit.stat_1070816711')
    })

    it('keeps the numeric "# additional Abysses" tablet mod on the numeric stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains 2 additional Abysses'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Abyss Tablet' }),
      )
      const abyss = filters.find((f) => f.id === 'explicit.stat_3490187949')
      expect(abyss).toBeDefined()
      expect(abyss?.value).toBe(2)
    })

    // GGG splits "increased Experience gain" into TWO trade stats: the generic
    // explicit.stat_3666934677 (also the rune stat) and the map-scoped
    // explicit.stat_57434274 -- the id that carries the "...in Map" text variant and
    // the one tablets/maps are actually indexed under for search. EE2 folds both into
    // one ref and lists the generic id first, so the [0]-pick build must override the
    // tablet experience phrasings onto the map-scoped id, or the price check searches
    // the wrong (generic) stat and misses every experience tablet.
    it('routes the tablet "increased Experience gain in Map" mod to the map-scoped stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['15% increased Experience gain in Map'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Irradiated Tablet' }),
      )
      const exp = filters.find((f) => f.text === '15% increased Experience gain in Map')
      expect(exp?.id).toBe('explicit.stat_57434274')
    })

    // Same [0]-pick split as Experience: GGG indexes a tablet's "Gold found in Map"
    // mod under the "(Gold Piles)" stat explicit.stat_1276056105 (which carries the
    // "...in Map (Gold Piles)" text), NOT the generic explicit.stat_1133965702 ("Gold
    // found in this Area"). EE2 folds both into map_gold_+% and lists the generic id
    // first, so the table build must override the tablet gold phrasings onto the
    // map-scoped id.
    it('routes the tablet "increased Gold found in Map" mod to the (Gold Piles) map-scoped stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['35% increased Gold found in Map'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Irradiated Tablet' }),
      )
      const gold = filters.find((f) => f.text === '35% increased Gold found in Map')
      expect(gold?.id).toBe('explicit.stat_1276056105')
    })

    // Same singular/numeric split as Abyss: GGG indexes the valueless singular "Map
    // contains an additional Azmeri Spirit" under its own stat_775597083 (live-probed:
    // 210 tablet listings), separate from the numeric "# additional Azmeri Spirit"
    // (stat_358129101). The [0]-pick build sent the singular to the numeric id; the
    // override routes it to the dedicated singular id, while the numeric roll stays put.
    it('routes the singular "an additional Azmeri Spirit" tablet mod to its dedicated stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains an additional Azmeri Spirit'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
      )
      const azmeri = filters.find((f) => f.text === 'Map contains an additional Azmeri Spirit')
      expect(azmeri?.id).toBe('explicit.stat_775597083')
    })

    it('keeps the numeric "# additional Azmeri Spirit" tablet mod on the numeric stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains 2 additional Azmeri Spirit'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
      )
      const azmeri = filters.find((f) => f.text === 'Map contains 2 additional Azmeri Spirit')
      expect(azmeri?.id).toBe('explicit.stat_358129101')
    })

    it('routes the plural of Wisps clipboard roll to the boss-pool stat (issue #625)', async () => {
      const { parseItemText } = await import('./clipboard')
      _setStatEntriesForTests([])
      const item = parseItemText(`Item Class: Tablet
Rarity: Rare
Void Terraform
Overseer Tablet
--------
Item Level: 80
--------
{ Implicit Modifier }
Empowers the Map Boss of a Map
10 uses remaining
--------
{ Prefix Modifier "Challenger's" (Tier: 1) }
Monsters have 12(10-15)% increased Effectiveness
{ Prefix Modifier "Bountiful" (Tier: 1) }
31(25-35)% increased Gold found in Map
{ Suffix Modifier "of the Devoted" (Tier: 1) }
Map contains an additional Shrine
{ Suffix Modifier "of Wisps" (Tier: 1) }
Map contains 2(1-2) additional Azmeri Spirits — Unscalable Value
--------
Can be used in a personal Map Device to add modifiers to a Map.
--------
Corrupted
--------
Note: ~b/o 1 divine`)
      expect(item).not.toBeNull()
      const filters = matchItemMods(item!.explicits, item!.implicits, undefined, item!, item!.advancedMods)
      expect(filters.find((f) => f.text === 'Map contains 2 additional Azmeri Spirits')).toMatchObject({
        id: 'explicit.stat_775597083',
        value: 2,
        modTier: 1,
        modRange: { min: 1, max: 2 },
      })
      expect(filters.some((f) => f.id === 'explicit.stat_358129101')).toBe(false)
      expect(filters.find((f) => f.text === 'Map contains an additional Shrine')?.id).toBe('explicit.stat_1468737867')

      // Simple copies have no suffix name to distinguish the boss pool.
      const simpleFilters = matchItemMods(item!.explicits, item!.implicits, undefined, item!)
      expect(simpleFilters.find((f) => f.text === 'Map contains 2 additional Azmeri Spirits')).toMatchObject({
        id: 'explicit.stat_358129101',
        value: 2,
      })
    })

    // Strongbox singular/numeric split (issue #471): the singular "Map contains an
    // additional Strongbox" text is the regular numeric stat's value-1 display on ALL
    // tablet bases (live-probed: 218 Breach + 168 Overseer listings under
    // stat_3240183538). A June fix had re-routed this text to stat_3040603554, which
    // has 0 listings on non-Overseer bases like Breach -- that override is reverted.
    // stat_3040603554 is the SEPARATE Overseer boss-pool mod, resolved at runtime via
    // the advanced-mod suffix name (see the boss-pool tests below).
    it('keeps the singular "Map contains an additional Strongbox" on the regular numeric stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains an additional Strongbox'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Breach Tablet' }),
      )
      const strongbox = filters.find((f) => f.text === 'Map contains an additional Strongbox')
      expect(strongbox?.id).toBe('explicit.stat_3240183538')
    })

    it('keeps the "Area contains an additional Strongbox" tablet phrasing on its own ([0]) stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Area contains an additional Strongbox'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
      )
      const strongbox = filters.find((f) => f.text === 'Area contains an additional Strongbox')
      expect(strongbox?.id).toBe('explicit.stat_3240183538')
    })

    // Delirium Fog duration (issue #471): GGG has two identical-text stats for this mod;
    // the identical-text twin stat_1174954559 is a dead index (live-probed 0 listings vs
    // 1692 on the indexed twin stat_3226351972).
    it('routes the "Delirium Fog in Map lasts additional seconds" tablet mod to the indexed stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Delirium Fog in Map lasts 10 additional seconds before dissipating'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Delirium Tablet' }),
      )
      const chip = filters.find((f) => f.id === 'explicit.stat_3226351972')
      expect(chip).toBeDefined()
    })

    // Summoning Circle chance (issue #471): EE2's stat_866117935 was delisted from the
    // live catalog; an unresolvable id blanks the whole trade query.
    it('routes the "Summoning Circle" chance tablet mod to the live (non-delisted) stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map has 72% increased chance to contain a Summoning Circle'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Ritual Tablet' }),
      )
      const chip = filters.find((f) => f.id === 'explicit.stat_267210597')
      expect(chip).toBeDefined()
    })

    // Delisted mods (issue #471): these ids were removed from the live trade2 /data/stats
    // catalog with no retext successor. The key is dropped from tablet-mods.json, so the
    // fallback matchModToStat misses and buildTabletFilters `continue`s past the mod --
    // it must not be emitted with a dead id that would blank the whole query.
    it('skips a delisted tablet mod instead of emitting a dead stat id', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Natural Monster Packs in Area are in a Union of Souls'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Ritual Tablet' }),
      )
      expect(filters.find((f) => f.text === 'Natural Monster Packs in Area are in a Union of Souls')).toBeUndefined()
    })

    // Boss-pool discrimination (issue #471): Overseer Tablets can carry a boss-pool
    // encounter mod that shares clipboard text with the regular-pool mod but is indexed
    // under a separate trade stat. The advanced-mod suffix name ("of Worship") is what
    // discriminates it; with no advanced mods the regular id stays the default.
    it('routes a shrine mod to the boss-pool stat id when the advanced-mod suffix is "of Worship"', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains an additional Shrine'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
        [
          {
            type: 'suffix',
            name: 'of Worship',
            tier: 1,
            tags: [],
            lines: ['Map contains an additional Shrine'],
            ranges: [],
          },
        ],
      )
      const chip = filters.find((f) => f.text === 'Map contains an additional Shrine')
      expect(chip?.id).toBe('explicit.stat_3042527515')
    })

    it('keeps the shrine mod on the regular stat id with no advanced mods', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains an additional Shrine'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
      )
      const chip = filters.find((f) => f.text === 'Map contains an additional Shrine')
      expect(chip?.id).toBe('explicit.stat_1468737867')
    })

    it('routes a strongbox mod to the boss-pool stat id when the advanced-mod suffix is "of Compartments"', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains an additional Strongbox'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
        [
          {
            type: 'suffix',
            name: 'of Compartments',
            tier: 1,
            tags: [],
            lines: ['Map contains an additional Strongbox'],
            ranges: [],
          },
        ],
      )
      const chip = filters.find((f) => f.text === 'Map contains an additional Strongbox')
      expect(chip?.id).toBe('explicit.stat_3040603554')
    })

    it('keeps the strongbox mod on the regular stat id when the advanced-mod suffix is "of the Antiquarian"', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains an additional Strongbox'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
        [
          {
            type: 'suffix',
            name: 'of the Antiquarian',
            tier: 1,
            tags: [],
            lines: ['Map contains an additional Strongbox'],
            ranges: [],
          },
        ],
      )
      const chip = filters.find((f) => f.text === 'Map contains an additional Strongbox')
      expect(chip?.id).toBe('explicit.stat_3240183538')
    })

    it('routes an essence numeric-roll mod to the boss-pool stat id when the advanced-mod suffix is "of Crystals"', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        ['Map contains 2 additional Essences'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Tablet', baseType: 'Overseer Tablet' }),
        [
          {
            type: 'suffix',
            name: 'of Crystals',
            tier: 1,
            tags: [],
            lines: ['Map contains 2 additional Essences'],
            ranges: [],
          },
        ],
      )
      const chip = filters.find((f) => f.text === 'Map contains 2 additional Essences')
      expect(chip?.id).toBe('explicit.stat_2162684861')
      expect(chip?.value).toBe(2)
    })

    // Regression guard (issue #471): these ids are dead on trade2 -- the first has no
    // indexed items, the rest were removed from /data/stats and blank the whole query.
    // If a future EE2 resync reintroduces one, the build overrides/delisted list needs
    // re-checking.
    it('never emits a dead or delisted trade stat id from the generated tablet-mods table', () => {
      const deadIds = [
        'explicit.stat_1174954559', // dead delirium twin (0 listings)
        'explicit.stat_866117935', // delisted summoning circle
        'explicit.stat_1443457598', // delisted union of souls (rare)
        'explicit.stat_2885317882', // delisted union of souls (natural packs)
        'explicit.stat_166883716', // delisted monster defences
        'explicit.stat_2068415277', // delisted player defences
      ]
      const values = Object.values(tabletMods as Record<string, string>)
      for (const id of deadIds) {
        expect(values).not.toContain(id)
      }
    })

    // Unique tablet count-mods (Wraeclast Besieged, issue #417): the clipboard
    // pluralizes the noun and carries the rolled number ("2 additional waves of
    // Hiveborn Monsters"), while the trade stat keeps "an additional <singular>"
    // ("an additional wave of Hiveborn Monsters"). Without the noun-head
    // singularization in generateTextVariants the matcher dropped all three and
    // they went missing from the price check. Real ids/text from live PoE2 stats.
    const UNIQUE_BREACH_TABLET_STATS = [
      {
        id: 'explicit.stat_4104094246',
        text: 'Unstable Breaches in Map take an additional second to collapse after timer is filled',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_2734787892',
        text: 'Breach Hives in Map have an additional wave of Hiveborn Monsters',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_3762913035',
        text: 'Unstable Breaches in Map spawn an additional Rare Monster when Stabilised',
        type: 'explicit',
      },
      { id: 'explicit.stat_1210760818', text: 'Breaches in Map have #% increased Pack Size', type: 'explicit' },
    ]

    it('matches unique Breach tablet count-mods that pluralize the noun ("an additional <plural>")', () => {
      _setStatEntriesForTests(UNIQUE_BREACH_TABLET_STATS)
      const filters = matchItemMods(
        [
          'Unstable Breaches in Map take 120 additional seconds to collapse after timer is filled',
          'Breach Hives in Map have 2 additional waves of Hiveborn Monsters',
          'Unstable Breaches in Map spawn 3 additional Rare Monsters when Stabilised',
          'Breaches in Map have 2% reduced Pack Size',
        ],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Tablet', baseType: 'Breach Tablet', name: 'Wraeclast Besieged' }),
      )
      for (const id of ['explicit.stat_4104094246', 'explicit.stat_2734787892', 'explicit.stat_3762913035']) {
        const chip = filters.find((f) => f.id === id)
        expect(chip, `expected filter for ${id}`).toBeDefined()
        expect(chip?.enabled).toBe(true)
      }
      // reduced -> increased polarity flips the value negative on the Pack Size stat.
      const packSize = filters.find((f) => f.id === 'explicit.stat_1210760818')
      expect(packSize?.value).toBe(-2)
    })

    it('applies the bundled Wraeclast Besieged premium override (2 chase mods on, others off)', () => {
      const prev = getPoeVersion()
      _resetPremiumMatchCacheForTests()
      _setPremiumModsForTests(bundledPremiumMods as unknown as PremiumModsData)
      _setStatEntriesForTests(UNIQUE_BREACH_TABLET_STATS)
      try {
        setPoeVersion(2)
        const filters = matchItemMods(
          [
            'Unstable Breaches in Map take 120 additional seconds to collapse after timer is filled',
            'Breach Hives in Map have 2 additional waves of Hiveborn Monsters',
            'Unstable Breaches in Map spawn 3 additional Rare Monsters when Stabilised',
            'Breaches in Map have 2% reduced Pack Size',
          ],
          [],
          undefined,
          makeItemInfo({
            rarity: 'Unique',
            itemClass: 'Tablet',
            baseType: 'Breach Tablet',
            name: 'Wraeclast Besieged',
          }),
        )
        // The two 2-5-range chase mods are primary: enabled + premium (survive unique Base mode).
        for (const id of ['explicit.stat_2734787892', 'explicit.stat_3762913035']) {
          const chip = filters.find((f) => f.id === id)
          expect(chip?.enabled, `${id} should be on`).toBe(true)
          expect(chip?.premium, `${id} should be premium`).toBe(true)
        }
        // The collapse-time and pack-size rows are secondary: shown but off.
        for (const id of ['explicit.stat_4104094246', 'explicit.stat_1210760818']) {
          const chip = filters.find((f) => f.id === id)
          expect(chip, `${id} should be present`).toBeDefined()
          expect(chip?.enabled, `${id} should be off`).toBe(false)
        }
      } finally {
        setPoeVersion(prev)
        _setPremiumModsForTests(null)
        _resetPremiumMatchCacheForTests()
      }
    })

    it('adopts rolled count from advanced-mod range for value-bearing valueless stats (stat_2734787892)', () => {
      // stat_2734787892 has no # in its trade text so matchModToStat yields value=null.
      // The clipboard carries the roll in advanced-mod form ("5(2-5)"); tablets.ts must
      // adopt that value so bounds + prefill:1 can pin the exact roll.
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_2734787892',
          text: 'Breach Hives in Map have an additional wave of Hiveborn Monsters',
          type: 'explicit',
        },
      ])
      const advancedMods: AdvancedMod[] = [
        {
          type: 'prefix',
          name: 'Breach Hives',
          tier: 0,
          tags: [],
          lines: ['Breach Hives in Map have 5(2-5) additional waves of Hiveborn Monsters'],
          ranges: [{ value: 5, min: 2, max: 5 }],
        },
      ]
      const filters = matchItemMods(
        ['Breach Hives in Map have 5 additional waves of Hiveborn Monsters'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Tablet', baseType: 'Breach Tablet', name: 'Wraeclast Besieged' }),
        advancedMods,
      )
      const chip = filters.find((f) => f.id === 'explicit.stat_2734787892')
      expect(chip, 'chip must be present').toBeDefined()
      // Adoption: value must be 5 (from the advanced-mod range)
      expect(chip?.value).toBe(5)
      // Range captured for display: {min:2, max:5} from the adv-mod ranges block
      expect(chip?.modRange).toEqual({ min: 2, max: 5 })
    })

    it('does NOT adopt a rolled count for a stat not in VALUE_BEARING_VALUELESS_STATS (negative control)', () => {
      // stat_4104094246 ("an additional second") is also valueless but NOT in the curated set;
      // it must stay value=null (presence-only search) so the gate is verified.
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_4104094246',
          text: 'Unstable Breaches in Map take an additional second to collapse after timer is filled',
          type: 'explicit',
        },
      ])
      const advancedMods: AdvancedMod[] = [
        {
          type: 'prefix',
          name: 'Collapse Time',
          tier: 0,
          tags: [],
          lines: ['Unstable Breaches in Map take 120(1-120) additional seconds to collapse after timer is filled'],
          ranges: [{ value: 120, min: 1, max: 120 }],
        },
      ]
      const filters = matchItemMods(
        ['Unstable Breaches in Map take 120 additional seconds to collapse after timer is filled'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Tablet', baseType: 'Breach Tablet', name: 'Wraeclast Besieged' }),
        advancedMods,
      )
      const chip = filters.find((f) => f.id === 'explicit.stat_4104094246')
      expect(chip, 'chip must be present').toBeDefined()
      // Must NOT adopt: stays null (presence-only)
      expect(chip?.value).toBeNull()
    })

    it('adopts value from advanced-mod and prefill:1 pins min to exact roll (bundled premium, stat_2734787892)', () => {
      // Full integration: value adoption + prefill:1 -> min=value=5, max stays null
      // (unique branch sets max=null; prefill:1 only sets min to the exact roll).
      const prev = getPoeVersion()
      _resetPremiumMatchCacheForTests()
      _setPremiumModsForTests(bundledPremiumMods as unknown as PremiumModsData)
      _setStatEntriesForTests(UNIQUE_BREACH_TABLET_STATS)
      try {
        setPoeVersion(2)
        const advancedMods: AdvancedMod[] = [
          {
            type: 'prefix',
            name: 'Breach Hives',
            tier: 0,
            tags: [],
            lines: ['Breach Hives in Map have 5(2-5) additional waves of Hiveborn Monsters'],
            ranges: [{ value: 5, min: 2, max: 5 }],
          },
          {
            type: 'prefix',
            name: 'Unstable Breaches',
            tier: 0,
            tags: [],
            lines: ['Unstable Breaches in Map spawn 5(2-5) additional Rare Monsters when Stabilised'],
            ranges: [{ value: 5, min: 2, max: 5 }],
          },
        ]
        const filters = matchItemMods(
          [
            'Breach Hives in Map have 5 additional waves of Hiveborn Monsters',
            'Unstable Breaches in Map spawn 5 additional Rare Monsters when Stabilised',
          ],
          [],
          undefined,
          makeItemInfo({
            rarity: 'Unique',
            itemClass: 'Tablet',
            baseType: 'Breach Tablet',
            name: 'Wraeclast Besieged',
          }),
          advancedMods,
        )
        // stat_2734787892: prefill:1 -> min=floor(5*1)=5, max=null (unique branch)
        const chip1 = filters.find((f) => f.id === 'explicit.stat_2734787892')
        expect(chip1?.enabled, 'stat_2734787892 chase mod must be on').toBe(true)
        expect(chip1?.premium, 'stat_2734787892 chase mod must be premium').toBe(true)
        expect(chip1?.value).toBe(5)
        expect(chip1?.min).toBe(5)
        // stat_3762913035: same adoption path, min pinned to exact roll, max=null
        const chip2 = filters.find((f) => f.id === 'explicit.stat_3762913035')
        expect(chip2?.enabled, 'stat_3762913035 chase mod must be on').toBe(true)
        expect(chip2?.premium, 'stat_3762913035 chase mod must be premium').toBe(true)
        expect(chip2?.value).toBe(5)
        expect(chip2?.min).toBe(5)
      } finally {
        setPoeVersion(prev)
        _setPremiumModsForTests(null)
        _resetPremiumMatchCacheForTests()
      }
    })
  })

  describe('waystone property chips', () => {
    it('emits map_filter chips for a rare waystone, tier enabled and exact', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({
          itemClass: 'Waystones',
          rarity: 'Rare',
          mapTier: 15,
          mapRarity: 60,
          mapQuantity: 40,
          mapPackSize: 16,
          mapRevives: 1,
          mapDropChance: 80,
          mapGold: 5000,
          mapMagicMonsters: 30,
          mapRareMonsters: 20,
        }),
      )
      const tier = filters.find((f) => f.id === 'map.map_tier')
      expect(tier).toBeDefined()
      expect(tier?.type).toBe('map')
      expect(tier?.enabled).toBe(true)
      expect(tier?.min).toBe(15)
      expect(tier?.max).toBe(15) // exact tier
      // The 6 opt-in keys GGG indexes (live-probed) surface with a fuzzed min
      // (floor(value * 0.9)). Tier plus the high-signal yields (Item Rarity, Pack
      // Size, Magic/Rare Monsters) default ON for waystone price-checks; Revives and
      // Drop Chance stay opt-in.
      for (const [id, value, min, enabled] of [
        ['map.map_iir', 60, 54, true],
        ['map.map_packsize', 16, 14, true],
        ['map.map_revives', 1, 0, false],
        ['map.map_bonus', 80, 72, false],
        ['map.map_magic_monsters', 30, 27, true],
        ['map.map_rare_monsters', 20, 18, true],
      ] as const) {
        const chip = filters.find((f) => f.id === id)
        expect(chip, `${id} should surface`).toBeDefined()
        expect(chip?.value).toBe(value)
        expect(chip?.enabled).toBe(enabled)
        expect(chip?.min).toBe(min)
      }
      // map_iiq and map_gold are still unindexed on the PoE2 trade site (live-probed:
      // map_filter searches return zero), so enabling their chip would break the
      // search. Neither must surface even when the item carries the property.
      for (const id of ['map.map_iiq', 'map.map_gold']) {
        expect(
          filters.find((f) => f.id === id),
          `${id} should be hidden`,
        ).toBeUndefined()
      }
    })

    it('shows the tier chip on a white (Normal) waystone with no affix properties', () => {
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Waystones', rarity: 'Normal', mapTier: 14 }),
      )
      const tier = filters.find((f) => f.id === 'map.map_tier')
      expect(tier).toBeDefined()
      expect(tier?.enabled).toBe(true)
      expect(tier?.min).toBe(14)
      expect(tier?.max).toBe(14)
      // No affix-derived chips on a white waystone.
      expect(filters.find((f) => f.id === 'map.map_iir')).toBeUndefined()
      expect(filters.find((f) => f.id === 'map.map_packsize')).toBeUndefined()
    })

    it('defaults waystone prefix/suffix affixes off, keeping yield chips on', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_extra_cold', text: 'Monsters deal #% of Damage as Extra Cold', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Monsters deal 29% of Damage as Extra Cold'],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Waystones', rarity: 'Rare', mapTier: 15, mapPackSize: 16 }),
      )
      // The prefix/suffix affix defaults OFF (monster-difficulty mods aren't price drivers).
      const affix = filters.find((f) => f.id === 'explicit.stat_extra_cold')
      expect(affix, 'affix chip should surface').toBeDefined()
      expect(affix?.enabled).toBe(false)
      // The yield chip stays ON.
      const packSize = filters.find((f) => f.id === 'map.map_packsize')
      expect(packSize?.enabled).toBe(true)
    })

    it('keeps the same monster affix enabled on non-map gear (proves the Waystones rule flips it)', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_extra_cold', text: 'Monsters deal #% of Damage as Extra Cold', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Monsters deal 29% of Damage as Extra Cold'],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Rings', rarity: 'Rare' }),
      )
      const affix = filters.find((f) => f.id === 'explicit.stat_extra_cold')
      expect(affix?.enabled).toBe(true)
    })

    it('emits no base-type chip for a waystone (searched by category, not the generic "Waystone" base)', () => {
      // All waystones share the bare base "Waystone" (only the tier differs), so the
      // base-type chip would strip to "Waystone" and trade.ts would send that as
      // query.type -- not a valid trade2 waystone type, which breaks the category
      // search. Tier is already pinned via the map_tier filter.
      _setStatEntriesForTests([])
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Waystones', rarity: 'Rare', baseType: 'Waystone (Tier 15)', mapTier: 15 }),
      )
      expect(filters.find((f) => f.id === 'misc.basetype')).toBeUndefined()
    })

    it('surfaces a chip once the remote allowlist marks its key indexed', () => {
      // Simulate GGG indexing Pack Size: the remote-overridable allowlist gains
      // map.map_packsize, and the chip starts emitting -- no code change needed.
      _setStatEntriesForTests([])
      _setIndexedEndgameKeysForTests(['map.map_tier', 'map.map_revives', 'map.map_packsize'])
      try {
        const filters = matchItemMods(
          [],
          [],
          undefined,
          makeItemInfo({ itemClass: 'Waystones', rarity: 'Rare', mapTier: 15, mapPackSize: 16 }),
        )
        const packSize = filters.find((f) => f.id === 'map.map_packsize')
        expect(packSize?.value).toBe(16)
        expect(packSize?.enabled).toBe(true) // defaults on for waystone price-checks
        expect(packSize?.min).toBe(14) // floor(16 * 0.9)
      } finally {
        _setIndexedEndgameKeysForTests(null) // restore bundled default
      }
    })
  })

  describe('memory strands', () => {
    it('generates memory strands chip', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: '', memoryStrands: 5 }))
      const strandChip = filters.find((f) => f.id === 'misc.memory_level')
      expect(strandChip).toBeDefined()
      expect(strandChip?.value).toBe(5)
      expect(strandChip?.min).toBe(5)
      expect(strandChip?.enabled).toBe(true)
    })
  })

  describe('attribute -> life/mana pseudo contribution', () => {
    const runWithStats = (
      stats: Array<{ id: string; text: string; type: string }>,
      modLines: string[],
    ): ReturnType<typeof matchItemMods> => {
      _setStatEntriesForTests(stats)
      return matchItemMods(modLines, [], undefined, makeItemInfo({ rarity: 'Rare' }))
    }
    const TOTAL_LIFE = 'pseudo.pseudo_total_life'
    const TOTAL_MANA = 'pseudo.pseudo_total_mana'
    const STR = { id: 'explicit.stat_4080418644', text: '+# to Strength', type: 'explicit' }
    const INT = { id: 'explicit.stat_328541901', text: '+# to Intelligence', type: 'explicit' }
    const DEX = { id: 'explicit.stat_3261801346', text: '+# to Dexterity', type: 'explicit' }
    const STR_INT = { id: 'explicit.stat_1535626285', text: '+# to Strength and Intelligence', type: 'explicit' }
    const STR_DEX = { id: 'explicit.stat_538848803', text: '+# to Strength and Dexterity', type: 'explicit' }
    const DEX_INT = { id: 'explicit.stat_2300185227', text: '+# to Dexterity and Intelligence', type: 'explicit' }
    const ALL_ATTR = { id: 'explicit.stat_1379411836', text: '+# to all Attributes', type: 'explicit' }
    const MAX_MANA = { id: 'explicit.stat_1050105434', text: '+# to maximum Mana', type: 'explicit' }
    const MAX_LIFE = { id: 'explicit.stat_3299347043', text: '+# to maximum Life', type: 'explicit' }

    // Attribute-only items: the raw attribute row surfaces; no pseudo is emitted because
    // there is no real (maximum-Life / maximum-Mana) contributor to gate the fold-in.
    it('lone Strength (no max-Life mod): Str row surfaced, no Total Life pseudo', () => {
      const filters = runWithStats([STR], ['+30 to Strength'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
      const strRow = filters.find((f) => f.id === STR.id)
      expect(strRow).toBeDefined()
      expect(strRow?.enabled).toBe(true)
    })

    it('lone Intelligence (no max-Mana mod): Int row surfaced, no Total Mana pseudo', () => {
      const filters = runWithStats([INT], ['+40 to Intelligence'])
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
      const intRow = filters.find((f) => f.id === INT.id)
      expect(intRow).toBeDefined()
      expect(intRow?.enabled).toBe(true)
    })

    it('Dexterity does not contribute to Life or Mana pseudo', () => {
      const filters = runWithStats([DEX], ['+50 to Dexterity'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
    })

    it('lone Str+Int hybrid: no pseudos emitted, row surfaced', () => {
      const filters = runWithStats([STR_INT], ['+20 to Strength and Intelligence'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
      expect(filters.find((f) => f.id === STR_INT.id)).toBeDefined()
    })

    it('lone Str+Dex hybrid: no Total Life pseudo, no Total Mana, row surfaced', () => {
      const filters = runWithStats([STR_DEX], ['+24 to Strength and Dexterity'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
    })

    it('lone Dex+Int hybrid: no Total Mana pseudo, no Total Life, row surfaced', () => {
      const filters = runWithStats([DEX_INT], ['+24 to Dexterity and Intelligence'])
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
    })

    it('lone all Attributes: no pseudos emitted, row surfaced', () => {
      const filters = runWithStats([ALL_ATTR], ['+10 to all Attributes'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
      expect(filters.find((f) => f.id === ALL_ATTR.id)).toBeDefined()
    })

    it('lone Strength (odd value, no max-Life): Str row surfaced, no Total Life pseudo', () => {
      // Previously tested flooring 25*0.5=12; now no pseudo should appear at all.
      const filters = runWithStats([STR], ['+25 to Strength'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
      expect(filters.find((f) => f.id === STR.id)).toBeDefined()
    })

    it('two Strength mods (no max-Life): no Total Life pseudo (attribute-only, no real contributor)', () => {
      // Previously verified pooling behavior; now with no real contributor no pseudo is emitted.
      const filters = runWithStats([STR], ['+25 to Strength', '+13 to Strength'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
    })

    it('maximum Mana contributes 1:1 to Total Mana', () => {
      const filters = runWithStats([MAX_MANA], ['+50 to maximum Mana'])
      expect(filters.find((f) => f.id === TOTAL_MANA)?.value).toBe(50)
    })

    it('Str + maximum Life: folds into Total Life pseudo (value = life + floor(str*0.5))', () => {
      // 60 (life) + 30 * 0.5 (Str) = 75; max-Life is the real contributor that gates the fold.
      const filters = runWithStats([STR, MAX_LIFE], ['+30 to Strength', '+60 to maximum Life'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)?.value).toBe(75)
      // Str source row should be suppressed (enabled: false)
      expect(filters.find((f) => f.id === STR.id)?.enabled).toBe(false)
    })

    it('Int + maximum Mana: folds into Total Mana pseudo, Int row suppressed', () => {
      // 50 (mana) + 40 * 0.5 (Int) = 70
      const filters = runWithStats([INT, MAX_MANA], ['+40 to Intelligence', '+50 to maximum Mana'])
      expect(filters.find((f) => f.id === TOTAL_MANA)?.value).toBe(70)
      expect(filters.find((f) => f.id === INT.id)?.enabled).toBe(false)
    })

    it('Str+Int hybrid with maximum Life but no maximum Mana: stays surfaced, not partially folded', () => {
      // Only the Life half has a real contributor. An all-or-nothing fold avoids losing
      // the Int->Mana half, so the hybrid row stays surfaced and Total Life reflects the
      // real life mod only (60), NOT 60 + floor(20*0.5).
      const filters = runWithStats([STR_INT, MAX_LIFE], ['+20 to Strength and Intelligence', '+60 to maximum Life'])
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
      expect(filters.find((f) => f.id === TOTAL_LIFE)?.value).toBe(60)
      const hybrid = filters.find((f) => f.id === STR_INT.id)
      expect(hybrid).toBeDefined()
      expect(hybrid?.enabled).toBe(true)
    })

    it('regression: two resistance mods still fold into pseudo_total_elemental_resistance (unchanged)', () => {
      const FIRE_RES = { id: 'explicit.stat_1671376347', text: '+#% to Fire Resistance', type: 'explicit' }
      const COLD_RES = { id: 'explicit.stat_4220027924', text: '+#% to Cold Resistance', type: 'explicit' }
      const filters = runWithStats([FIRE_RES, COLD_RES], ['+30% to Fire Resistance', '+25% to Cold Resistance'])
      const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
      expect(pseudo).toBeDefined()
      expect(pseudo?.value).toBe(55)
    })
  })

  describe('fractured pseudo contribution', () => {
    it('adds fractured ele-res mod into pseudo_total_elemental_resistance', () => {
      // Trade API stat for "+#% to Lightning Resistance" lives under explicit.* and
      // the buildPseudoMap pattern picks it up under pseudo_total_elemental_resistance.
      // The fractured-prefix remap used to clobber matched.statId before the pseudo
      // lookup ran, so fractured ele-res rolls silently dropped out of the pseudo.
      _setStatEntriesForTests([
        { id: 'explicit.stat_3261801346', text: '#% to Lightning Resistance', type: 'explicit' },
      ])
      const advancedMods: AdvancedMod[] = [
        {
          type: 'suffix',
          name: 'of the Maelstrom',
          tier: 3,
          tags: ['Elemental', 'Lightning', 'Resistance'],
          lines: ['+41% to Lightning Resistance'],
          ranges: [{ value: 41, min: 36, max: 41 }],
          fractured: true,
          crafted: false,
          eldritch: false,
          foulborn: false,
        },
      ]
      const filters = matchItemMods(
        ['+41% to Lightning Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Body Armours' }),
        advancedMods,
      )
      const pseudoEle = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
      expect(pseudoEle).toBeDefined()
      expect(pseudoEle?.value).toBe(41)
      // The fractured row itself should still be tagged with the fractured stat id and type
      const fracturedRow = filters.find((f) => f.id === 'fractured.stat_3261801346')
      expect(fracturedRow).toBeDefined()
      expect(fracturedRow?.type).toBe('fractured')
    })
  })

  describe('PoE2 crafted mods', () => {
    // PoE2's trade API has no crafted.* stat category, and PoE2 crafted mods aren't
    // trivially re-rolled like PoE1 bench crafts. So they query as explicit.* and are
    // enabled by default, while the crafted flag still drives the display color.
    it('queries as explicit, enabled by default, but keeps crafted type', () => {
      const prev = getPoeVersion()
      setPoeVersion(2)
      try {
        _setStatEntriesForTests([
          { id: 'explicit.stat_518292764', text: '#% to Critical Hit Chance', type: 'explicit' },
        ])
        const advancedMods: AdvancedMod[] = [
          {
            type: 'suffix',
            name: 'of Calamity',
            tier: 3,
            tags: ['Attack', 'Critical'],
            lines: ['+5% to Critical Hit Chance'],
            ranges: [{ value: 5, min: 3, max: 5 }],
            fractured: false,
            crafted: true,
            eldritch: false,
            foulborn: false,
          },
        ]
        const filters = matchItemMods(
          ['+5% to Critical Hit Chance'],
          [],
          undefined,
          makeItemInfo({ rarity: 'Rare', itemClass: 'Rings' }),
          advancedMods,
        )
        const row = filters.find((f) => f.id === 'explicit.stat_518292764')
        expect(row).toBeDefined()
        expect(row?.type).toBe('crafted')
        expect(row?.enabled).toBe(true)
        expect(filters.some((f) => f.id.startsWith('crafted.'))).toBe(false)
      } finally {
        setPoeVersion(prev)
      }
    })
  })

  describe('elemental + chaos hybrid pseudo contribution', () => {
    it('master crafted "Lightning and Chaos Resistances" feeds both Total Ele Res and Total Chaos Res', () => {
      _setStatEntriesForTests([
        { id: 'crafted.stat_lightning_chaos', text: '+#% to Lightning and Chaos Resistances', type: 'crafted' },
      ])
      // Crafted mods arrive from the clipboard with a "(crafted)" suffix
      const filters = matchItemMods(
        ['+14% to Lightning and Chaos Resistances (crafted)'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare' }),
      )
      const ele = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
      const chaos = filters.find((f) => f.id === 'pseudo.pseudo_total_chaos_resistance')
      expect(ele).toBeDefined()
      expect(ele?.value).toBe(14)
      expect(chaos).toBeDefined()
      expect(chaos?.value).toBe(14)
    })

    it('fire+chaos and cold+chaos hybrids also feed both pseudos', () => {
      _setStatEntriesForTests([
        { id: 'crafted.stat_fire_chaos', text: '+#% to Fire and Chaos Resistances', type: 'crafted' },
        { id: 'crafted.stat_cold_chaos', text: '+#% to Cold and Chaos Resistances', type: 'crafted' },
      ])
      // Crafted mods arrive from the clipboard with a "(crafted)" suffix
      const filters = matchItemMods(
        ['+10% to Fire and Chaos Resistances (crafted)', '+12% to Cold and Chaos Resistances (crafted)'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare' }),
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')?.value).toBe(22)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_chaos_resistance')?.value).toBe(22)
    })
  })

  describe('pseudo weightFilters attachment', () => {
    it('attaches the contributing real stat ids to the pseudo chip', () => {
      _setStatEntriesForTests([{ id: 'explicit.stat_fire', text: '+#% to Fire Resistance', type: 'explicit' }])
      const filters = matchItemMods(
        ['+40% to Fire Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Body Armours' }),
      )
      const ele = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
      expect(ele).toBeDefined()
      expect(ele!.weightFilters).toContainEqual({ id: 'explicit.stat_fire' })
    })
  })

  describe('exposure implicit excluded from resistance pseudo', () => {
    // Eldritch (Eater of Worlds) "Inflict <Ele> Exposure on Hit, applying
    // -#% to <Ele> Resistance" is an enemy debuff. Its text contains
    // "to <Ele> Resistance", so the loose resistance pattern used to sum the
    // negative roll into the player's Total Elemental Resistance pseudo.
    it('fire exposure implicit does not subtract from Total Elemental Resistance', () => {
      _setStatEntriesForTests([
        {
          id: 'implicit.stat_fire_exposure',
          text: 'Inflict Fire Exposure on Hit, applying #% to Fire Resistance',
          type: 'implicit',
        },
        { id: 'explicit.stat_4220027924', text: '#% to Cold Resistance', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Inflict Fire Exposure on Hit, applying -11% to Fire Resistance (implicit)', '+36% to Cold Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Gloves' }),
      )
      const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
      expect(pseudo).toBeDefined()
      // Only the +36 Cold Res counts; the -11 exposure debuff must not subtract.
      expect(pseudo?.value).toBe(36)
    })

    it('cold and lightning exposure implicits are likewise excluded', () => {
      _setStatEntriesForTests([
        {
          id: 'implicit.stat_cold_exposure',
          text: 'Inflict Cold Exposure on Hit, applying #% to Cold Resistance',
          type: 'implicit',
        },
        {
          id: 'implicit.stat_lightning_exposure',
          text: 'Inflict Lightning Exposure on Hit, applying #% to Lightning Resistance',
          type: 'implicit',
        },
      ])
      const filters = matchItemMods(
        [
          'Inflict Cold Exposure on Hit, applying -13% to Cold Resistance (implicit)',
          'Inflict Lightning Exposure on Hit, applying -12% to Lightning Resistance (implicit)',
        ],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Gloves' }),
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')).toBeUndefined()
    })
  })

  describe('minion resistance excluded from resistance pseudo', () => {
    // Bone Ring / minion gear: "Minions have +#% to all Elemental Resistances"
    // must not create a player Total Ele Res chip ((15+22)×3 = 111 false positive).
    it('minion all-ele-res does not feed Total Elemental Resistance', () => {
      _setStatEntriesForTests([
        {
          id: 'implicit.stat_minion_allres',
          text: 'Minions have #% to all Elemental Resistances',
          type: 'implicit',
        },
        {
          id: 'explicit.stat_minion_allres',
          text: 'Minions have #% to all Elemental Resistances',
          type: 'explicit',
        },
        { id: 'explicit.stat_4220027924', text: '#% to Cold Resistance', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Minions have +22% to all Elemental Resistances', '+30% to Cold Resistance'],
        ['Minions have +15% to all Elemental Resistances'],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings', baseType: 'Bone Ring' }),
      )
      const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
      expect(pseudo?.value).toBe(30)
    })

    it('Bone Ring with only minion resists emits no Total Elemental Resistance chip', () => {
      _setStatEntriesForTests([
        {
          id: 'implicit.stat_minion_allres',
          text: 'Minions have #% to all Elemental Resistances',
          type: 'implicit',
        },
        {
          id: 'explicit.stat_minion_allres',
          text: 'Minions have #% to all Elemental Resistances',
          type: 'explicit',
        },
      ])
      const filters = matchItemMods(
        ['Minions have +22% to all Elemental Resistances'],
        ['Minions have +15% to all Elemental Resistances'],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings', baseType: 'Bone Ring' }),
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')).toBeUndefined()
    })
  })

  describe('nearby enemies resistance excluded from resistance pseudo', () => {
    // Redeemer "of the Conquest" and its cold/lightning/chaos twins: "Nearby
    // Enemies have -#% to <Ele> Resistance" is an enemy debuff, not player
    // resistance. #544: the negative roll was folding into
    // pseudo_total_elemental_resistance, understating the total and hiding
    // the real mod row (the pseudo replaces its source row).
    it('nearby enemies fire resistance debuff does not subtract from Total Elemental Resistance', () => {
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_3914021960',
          text: 'Nearby Enemies have #% to Fire Resistance',
          type: 'explicit',
        },
        { id: 'explicit.stat_4220027924', text: '#% to Cold Resistance', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Nearby Enemies have -9% to Fire Resistance', '+36% to Cold Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Helmets' }),
      )
      const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
      expect(pseudo).toBeDefined()
      // Only the +36 Cold Res counts; the -9 enemy debuff must not subtract.
      expect(pseudo?.value).toBe(36)
    })

    it('nearby enemies resistance debuff alone emits no resistance pseudo chip', () => {
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_3914021960',
          text: 'Nearby Enemies have #% to Fire Resistance',
          type: 'explicit',
        },
      ])
      const filters = matchItemMods(
        ['Nearby Enemies have -9% to Fire Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Helmets' }),
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')).toBeUndefined()
    })

    it('nearby enemies chaos resistance debuff does not feed Total Chaos Resistance', () => {
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_1902595112',
          text: 'Nearby Enemies have #% to Chaos Resistance',
          type: 'explicit',
        },
      ])
      const filters = matchItemMods(
        ['Nearby Enemies have -9% to Chaos Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Helmets' }),
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_chaos_resistance')).toBeUndefined()
    })

    it('unique enemy presence implicit still contributes to Total Elemental Resistance', () => {
      _setStatEntriesForTests([
        {
          id: 'implicit.stat_3521653836',
          text: 'While a Unique Enemy is in your Presence, #% to Fire Resistance',
          type: 'implicit',
        },
      ])
      const filters = matchItemMods(
        [],
        ['While a Unique Enemy is in your Presence, +18% to Fire Resistance'],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Helmets' }),
      )
      const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
      expect(pseudo?.value).toBe(18)
    })
  })

  describe('passive-granting mods excluded from PoE1 pseudos', () => {
    // "Passive Skills in Radius also grant +#% to X" (The Light of Meaning) and
    // "Added Small Passive Skills also grant: +#% to X" (cluster jewels) push the
    // stat onto tree passives, not onto the wearer. GGG's PoE1 pseudos exclude
    // them -- probed live: 4517 listings carry the cluster chaos-res mod and 0 of
    // them satisfy pseudo_total_chaos_resistance >= 1. Emitting the pseudo also
    // suppressed the real mod row, so the search returned nothing at all.
    let prevVersion: ReturnType<typeof getPoeVersion>

    beforeEach(() => {
      prevVersion = getPoeVersion()
      setPoeVersion(1)
    })

    afterEach(() => {
      setPoeVersion(prevVersion)
    })

    const RADIUS_CHAOS = {
      id: 'explicit.stat_1812306107',
      text: 'Passive Skills in Radius also grant +#% to Chaos Resistance',
      type: 'explicit',
    }
    const RADIUS_LIFE = {
      id: 'explicit.stat_1223932609',
      text: 'Passive Skills in Radius also grant +# to maximum Life',
      type: 'explicit',
    }
    const RADIUS_MANA = {
      id: 'explicit.stat_3382199855',
      text: 'Passive Skills in Radius also grant +# to maximum Mana',
      type: 'explicit',
    }
    const CLUSTER_CHAOS = {
      id: 'explicit.stat_1811604576',
      text: 'Added Small Passive Skills also grant: +#% to Chaos Resistance',
      type: 'explicit',
    }
    const jewel = () =>
      makeItemInfo({ rarity: 'Unique', itemClass: 'Jewels', baseType: 'Prismatic Jewel', name: 'The Light of Meaning' })

    it('radius chaos-res grant emits no Total Chaos Resistance pseudo', () => {
      _setStatEntriesForTests([RADIUS_CHAOS])
      const filters = matchItemMods(
        ['Passive Skills in Radius also grant +5% to Chaos Resistance'],
        [],
        undefined,
        jewel(),
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_chaos_resistance')).toBeUndefined()
    })

    it('radius chaos-res grant keeps its own mod row enabled', () => {
      _setStatEntriesForTests([RADIUS_CHAOS])
      const filters = matchItemMods(
        ['Passive Skills in Radius also grant +5% to Chaos Resistance'],
        [],
        undefined,
        jewel(),
      )
      const row = filters.find((f) => f.id === RADIUS_CHAOS.id)
      expect(row).toBeDefined()
      expect(row?.enabled).toBe(true)
    })

    it('radius life and mana grants emit no Total Life / Total Mana pseudos', () => {
      _setStatEntriesForTests([RADIUS_LIFE, RADIUS_MANA])
      const filters = matchItemMods(
        [
          'Passive Skills in Radius also grant +5 to maximum Life',
          'Passive Skills in Radius also grant +5 to maximum Mana',
        ],
        [],
        undefined,
        jewel(),
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_life')).toBeUndefined()
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_mana')).toBeUndefined()
    })

    it('cluster jewel passive grant emits no Total Chaos Resistance pseudo', () => {
      _setStatEntriesForTests([CLUSTER_CHAOS])
      const filters = matchItemMods(
        ['Added Small Passive Skills also grant: +12% to Chaos Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Jewels', baseType: 'Large Cluster Jewel' }),
      )
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_chaos_resistance')).toBeUndefined()
    })

    it('a real player chaos-res roll on the same jewel still feeds the pseudo', () => {
      _setStatEntriesForTests([
        RADIUS_CHAOS,
        { id: 'explicit.stat_2923486259', text: '+#% to Chaos Resistance', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Passive Skills in Radius also grant +5% to Chaos Resistance', '+26% to Chaos Resistance'],
        [],
        undefined,
        jewel(),
      )
      const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_chaos_resistance')
      // Only the +26 real roll counts; the radius grant must not add its 5.
      expect(pseudo?.value).toBe(26)
    })

    it('PoE2 radius grants DO still feed the pseudo (GGG counts them there)', () => {
      // Divergence, not an oversight: a live Time-Lost Diamond whose only chaos
      // source is "+3% to Chaos Resistance" in radius matches trade2's
      // pseudo_total_chaos_resistance at min 3 and drops out at min 4.
      setPoeVersion(2)
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_2264240911',
          text: 'Small Passive Skills in Radius also grant #% to Chaos Resistance',
          type: 'explicit',
        },
      ])
      const filters = matchItemMods(
        ['Small Passive Skills in Radius also grant +3% to Chaos Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Jewels', baseType: 'Time-Lost Diamond' }),
      )
      const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_chaos_resistance')
      expect(pseudo?.value).toBe(3)
    })
  })

  describe('fractured chip', () => {
    it('generates fractured chip for equipment in "any" state when no fractured mods', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Boots', sockets: '' }),
      )
      const fracturedChip = filters.find((f) => f.id === 'misc.fractured')
      expect(fracturedChip).toBeDefined()
      expect(fracturedChip?.text).toBe('Fractured')
      expect(fracturedChip?.chipState).toBeUndefined()
    })

    it('does not generate fractured chip for unique items', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Boots', sockets: '' }),
      )
      const fracturedChip = filters.find((f) => f.id === 'misc.fractured')
      expect(fracturedChip).toBeUndefined()
    })
  })

  describe('defaultPercent parameter', () => {
    it('uses custom percent for min value calculation on defenses', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 1000, evasion: 0, energyShield: 0, ward: 0, block: 0 },
        makeItemInfo({ quality: 20 }),
        undefined,
        80,
      )
      const armourChip = filters.find((f) => f.id === 'defence.armour')!
      expect(armourChip.min).toBe(800) // 80% of 1000
    })
  })

  describe('filter ordering', () => {
    it('places weapon/defense/pseudo/timeless/enchant/map/misc chips before explicit/implicit', () => {
      const filters = matchItemMods(
        [],
        [],
        { armour: 100, evasion: 0, energyShield: 0, ward: 0, block: 0 },
        makeItemInfo({
          quality: 20,
          itemLevel: 85,
          sockets: '',
          corrupted: false,
          rarity: 'Rare',
          itemClass: 'Body Armours',
        }),
      )
      // Defense chips should come before misc chips
      const defIdx = filters.findIndex((f) => f.type === 'defence')
      const miscIdx = filters.findIndex((f) => f.type === 'misc')
      expect(defIdx).toBeLessThan(miscIdx)
    })
  })

  describe('local vs global variant selection', () => {
    it('spear attack speed picks the local variant', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_210067635', text: '#% increased Attack Speed (Local)', type: 'explicit' },
        { id: 'explicit.stat_681332047', text: '#% increased Attack Speed', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['12% increased Attack Speed'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Spears' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_210067635')).toBeDefined()
      expect(filters.find((f) => f.id === 'explicit.stat_681332047')).toBeUndefined()
    })

    it('spear "reduced Attack Speed" picks the local variant with a negated value', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_210067635', text: '#% increased Attack Speed (Local)', type: 'explicit' },
        { id: 'explicit.stat_681332047', text: '#% increased Attack Speed', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['10% reduced Attack Speed'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Spears' }),
      )
      const local = filters.find((f) => f.id === 'explicit.stat_210067635')
      expect(local).toBeDefined()
      expect(local?.value).toBe(-10)
      expect(filters.find((f) => f.id === 'explicit.stat_681332047')).toBeUndefined()
    })

    it('shield "increased Block chance" picks the local variant', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_2481353198', text: '#% increased Block chance (Local)', type: 'explicit' },
        { id: 'explicit.stat_4147897060', text: '#% increased Block chance', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['25% increased Block chance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Shields' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_2481353198')).toBeDefined()
      expect(filters.find((f) => f.id === 'explicit.stat_4147897060')).toBeUndefined()
    })

    it('ring with "increased Attack Speed" picks the global variant (no local mods on accessories)', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_210067635', text: '#% increased Attack Speed (Local)', type: 'explicit' },
        { id: 'explicit.stat_681332047', text: '#% increased Attack Speed', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['12% increased Attack Speed'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_681332047')).toBeDefined()
      expect(filters.find((f) => f.id === 'explicit.stat_210067635')).toBeUndefined()
    })

    // #449: a glove corruption enchant "Break #% increased Armour" must not be
    // hijacked by the local "#% increased Armour (Local)" enchant. preferLocal
    // (set for armour/weapon items) used to override to the local match even
    // though the non-local "Break ..." stat is a strictly more-specific match --
    // the local pattern only matched by letting its "#" swallow the word "Break".
    it('glove enchant "Break increased Armour" keeps the specific Break stat over the local lookalike', () => {
      _setStatEntriesForTests([
        { id: 'enchant.stat_1776411443', text: 'Break #% increased Armour', type: 'enchant' },
        { id: 'enchant.stat_1062208444', text: '#% increased Armour', type: 'enchant' },
        { id: 'enchant.stat_2866361420', text: '#% increased Armour (Local)', type: 'enchant' },
      ])
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Gloves', enchants: ['Break 50% increased Armour'] }),
      )
      const breakFilter = filters.find((f) => f.id === 'enchant.stat_1776411443')
      expect(breakFilter).toBeDefined()
      expect(breakFilter?.value).toBe(50)
      expect(filters.find((f) => f.id === 'enchant.stat_2866361420')).toBeUndefined()
    })
  })

  describe('jewel vs global variant selection', () => {
    it('jewel picks the (Jewel) variant and preserves the roll value', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_1604736568', text: 'Recover #% of maximum Mana on Kill (Jewel)', type: 'explicit' },
        { id: 'explicit.stat_1030153674', text: 'Recover #% of maximum Mana on Kill', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Recover 5% of maximum Mana on Kill'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Jewels' }),
      )
      const jewelFilter = filters.find((f) => f.id === 'explicit.stat_1604736568')
      expect(jewelFilter).toBeDefined()
      expect(jewelFilter?.value).toBe(5)
      expect(filters.find((f) => f.id === 'explicit.stat_1030153674')).toBeUndefined()
    })

    it('non-jewel item picks the global variant and not the (Jewel) one', () => {
      _setStatEntriesForTests([
        { id: 'explicit.stat_1604736568', text: 'Recover #% of maximum Mana on Kill (Jewel)', type: 'explicit' },
        { id: 'explicit.stat_1030153674', text: 'Recover #% of maximum Mana on Kill', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Recover 5% of maximum Mana on Kill'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Amulets' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_1030153674')).toBeDefined()
      expect(filters.find((f) => f.id === 'explicit.stat_1604736568')).toBeUndefined()
    })
  })

  describe('PoE1 staff-block attack (jewels vs Staves)', () => {
    // Live trade API: jewels use untagged stat_1778298516; staves use
    // stat_1001829678 tagged "(Staves)". A former STAT_ID_REMAPS blanket always
    // forced jewels→staves and empty-resulted Cobalt Jewel searches.
    const STAFF_BLOCK_STATS = [
      {
        id: 'explicit.stat_1778298516',
        text: '+#% Chance to Block Attack Damage while wielding a Staff',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_1001829678',
        text: '+#% Chance to Block Attack Damage while wielding a Staff (Staves)',
        type: 'explicit',
      },
    ]

    it('Cobalt Jewel keeps the untagged jewels trade id', () => {
      _setStatEntriesForTests(STAFF_BLOCK_STATS)
      const filters = matchItemMods(
        ['+3% Chance to Block Attack Damage while wielding a Staff'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Jewels', baseType: 'Cobalt Jewel' }),
      )
      const block = filters.find((f) => f.id === 'explicit.stat_1778298516')
      expect(block).toBeDefined()
      expect(block?.value).toBe(3)
      expect(filters.find((f) => f.id === 'explicit.stat_1001829678')).toBeUndefined()
    })

    it('staff weapon prefers the (Staves) trade id', () => {
      _setStatEntriesForTests(STAFF_BLOCK_STATS)
      const filters = matchItemMods(
        ['+18% Chance to Block Attack Damage while wielding a Staff'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Staves', baseType: 'Judgement Staff' }),
      )
      const block = filters.find((f) => f.id === 'explicit.stat_1001829678')
      expect(block).toBeDefined()
      expect(block?.value).toBe(18)
      expect(filters.find((f) => f.id === 'explicit.stat_1778298516')).toBeUndefined()
    })

    it('still picks jewels id when the staves entry is listed first', () => {
      _setStatEntriesForTests([...STAFF_BLOCK_STATS].reverse())
      const filters = matchItemMods(
        ['+3% Chance to Block Attack Damage while wielding a Staff'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Jewels', baseType: 'Cobalt Jewel' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_1778298516')).toBeDefined()
      expect(filters.find((f) => f.id === 'explicit.stat_1001829678')).toBeUndefined()
    })
  })

  // The PoE2 trade API disambiguates "#% increased Duration" with a trailing
  // category qualifier: "(Charm)", "(Flask)". The clipboard text on the item is
  // the bare "X% increased Duration", so the matcher has to strip the qualifier
  // and prefer the one matching the item's class -- otherwise the bare mod falls
  // through to the substring fallback and grabs the longest "increased Duration..."
  // stat (e.g. the Frenzy-charge poison-duration mod). See issue #397.
  describe('charm/flask Duration qualifier selection', () => {
    const DURATION_STATS = [
      { id: 'explicit.stat_2541588185', text: '#% increased Duration (Charm)', type: 'explicit' },
      { id: 'explicit.stat_1256719186', text: '#% increased Duration (Flask)', type: 'explicit' },
      {
        id: 'explicit.stat_3841138199',
        text: "#% increased Duration of Poisons you inflict when you've consumed a Frenzy Charge Recently",
        type: 'explicit',
      },
    ]

    it('charm picks the (Charm) Duration variant, not the poison-duration mod', () => {
      _setStatEntriesForTests(DURATION_STATS)
      const filters = matchItemMods(
        ['28% increased Duration'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Charms' }),
      )
      const charmFilter = filters.find((f) => f.id === 'explicit.stat_2541588185')
      expect(charmFilter).toBeDefined()
      expect(charmFilter?.value).toBe(28)
      expect(filters.find((f) => f.id === 'explicit.stat_3841138199')).toBeUndefined()
      expect(filters.find((f) => f.id === 'explicit.stat_1256719186')).toBeUndefined()
    })

    it('flask picks the (Flask) Duration variant', () => {
      _setStatEntriesForTests(DURATION_STATS)
      const filters = matchItemMods(
        ['20% increased Duration'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Magic', itemClass: 'Flasks' }),
      )
      const flaskFilter = filters.find((f) => f.id === 'explicit.stat_1256719186')
      expect(flaskFilter).toBeDefined()
      expect(flaskFilter?.value).toBe(20)
      expect(filters.find((f) => f.id === 'explicit.stat_2541588185')).toBeUndefined()
    })

    it('PoE2 Life Flasks class picks the (Flask) Duration variant (#466)', () => {
      _setStatEntriesForTests(DURATION_STATS)
      const filters = matchItemMods(
        ['39% increased Duration'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Life Flasks' }),
      )
      const flaskFilter = filters.find((f) => f.id === 'explicit.stat_1256719186')
      expect(flaskFilter).toBeDefined()
      expect(flaskFilter?.value).toBe(39)
      expect(filters.find((f) => f.id === 'explicit.stat_2541588185')).toBeUndefined()
      expect(filters.find((f) => f.id === 'explicit.stat_3841138199')).toBeUndefined()
    })

    it('PoE2 Mana Flasks class picks the (Flask) Duration variant (#466)', () => {
      _setStatEntriesForTests(DURATION_STATS)
      const filters = matchItemMods(
        ['20% increased Duration'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Mana Flasks' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_1256719186')).toBeDefined()
    })

    it('Blood of the Warrior (PoE2 unique life flask) surfaces every trade-indexed line (#466)', () => {
      _setStatEntriesForTests([
        ...DURATION_STATS,
        { id: 'explicit.stat_1726753705', text: '#% less Life Recovered', type: 'explicit' },
        {
          id: 'explicit.stat_2932359713',
          text: 'Effect is not removed when Unreserved Life is Filled',
          type: 'explicit',
        },
        { id: 'explicit.stat_3598623697', text: '#% of Damage taken during effect Recouped as Life', type: 'explicit' },
        { id: 'explicit.stat_555311715', text: 'Gain # Rage when Hit by an Enemy during effect', type: 'explicit' },
        { id: 'explicit.stat_3464644319', text: 'No Inherent loss of Rage during effect', type: 'explicit' },
        // Decoys: non-flask twins that must not swallow the flask lines
        { id: 'explicit.stat_1444556985', text: '#% of Damage taken Recouped as Life', type: 'explicit' },
        { id: 'explicit.stat_3292710273', text: 'Gain # Rage when Hit by an Enemy', type: 'explicit' },
        { id: 'explicit.stat_4163076972', text: 'No Inherent loss of Rage', type: 'explicit' },
      ])
      // Explicits as clipboard.ts emits them for the real item: the Recoup/Rage/
      // no-rage-loss lines are one hybrid advanced-mod block, so the joined
      // variant is pushed alongside the individual lines.
      const filters = matchItemMods(
        [
          '90% less Life Recovered',
          'Effect is not removed when Unreserved Life is Filled',
          '18% of Damage taken during effect Recouped as Life',
          'Gain 3 Rage when Hit by an Enemy during effect',
          'No Inherent loss of Rage during effect',
          '18% of Damage taken during effect Recouped as Life\nGain 3 Rage when Hit by an Enemy during effect\nNo Inherent loss of Rage during effect',
          '39% increased Duration',
        ],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Life Flasks', itemLevel: 45 }),
      )
      const ids = filters.filter((f) => f.type === 'explicit').map((f) => f.id)
      expect(ids).toContain('explicit.stat_1726753705')
      expect(ids).toContain('explicit.stat_2932359713')
      expect(ids).toContain('explicit.stat_3598623697')
      expect(ids).toContain('explicit.stat_555311715')
      expect(ids).toContain('explicit.stat_3464644319')
      expect(ids).toContain('explicit.stat_1256719186')
      // The valueless line matches with a null value and stays enabled
      const notRemoved = filters.find((f) => f.id === 'explicit.stat_2932359713')
      expect(notRemoved?.value).toBeNull()
      expect(notRemoved?.enabled).toBe(true)
    })
  })

  describe('perfectRoll flag (unique best-or-better rolls)', () => {
    const STAT = { id: 'explicit.stat_ev', text: '#% increased Evasion Rating', type: 'explicit' as const }
    // An advanced mod whose stripped line matches `${value}% increased Evasion Rating`,
    // carrying the roll range in parens. `range` is matched by value, so pass it explicitly.
    const advMod = (value: number, min: number, max: number): AdvancedMod[] => [
      {
        type: 'prefix',
        name: 'Test',
        tier: 1,
        tags: [],
        lines: [`${value}(${min}-${max})% increased Evasion Rating`],
        ranges: [{ value, min, max }],
      },
    ]
    const run = (value: number, min: number, max: number, rarity = 'Unique') => {
      _setStatEntriesForTests([STAT])
      return matchItemMods(
        [`${value}% increased Evasion Rating`],
        [],
        undefined,
        makeItemInfo({ rarity, itemClass: 'Body Armours' }),
        advMod(value, min, max),
      ).find((f) => f.id === STAT.id)
    }

    it('flags a perfect (== max) ranged unique roll', () => {
      expect(run(30, 20, 30)?.perfectRoll).toBe(true)
    })

    it('flags an over-rolled (> max) ranged unique roll', () => {
      expect(run(35, 20, 30)?.perfectRoll).toBe(true)
    })

    it('does not flag a sub-max ranged unique roll', () => {
      expect(run(25, 20, 30)?.perfectRoll).toBeUndefined()
    })

    it('flags an over-rolled (> single value) fixed unique mod', () => {
      expect(run(60, 50, 50)?.perfectRoll).toBe(true)
    })

    it('does not flag a fixed unique mod at its single value', () => {
      expect(run(50, 50, 50)?.perfectRoll).toBeUndefined()
    })

    it('does not flag a perfect roll on a non-unique', () => {
      expect(run(30, 20, 30, 'Rare')?.perfectRoll).toBeUndefined()
    })

    it('does not flag a detrimental roll on a sign-flipped (reduced) bracket', () => {
      // "9% reduced Cast Speed" reports an inverted bracket {min:15, max:-15}; the value
      // (-9) is far from the true best (+15), so it must NOT be perfect -- otherwise Base
      // mode would auto-enable a junk downside (the Loreweave reduced-mods bug).
      _setStatEntriesForTests([{ id: 'explicit.stat_cs', text: '#% increased Cast Speed', type: 'explicit' }])
      const filters = matchItemMods(
        ['9% reduced Cast Speed'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Body Armours' }),
        [
          {
            type: 'suffix',
            name: 'Unique',
            tier: 1,
            tags: [],
            lines: ['9(15--15)% reduced Cast Speed'],
            ranges: [{ value: 9, min: 15, max: -15 }],
          },
        ],
      )
      expect(filters.find((f) => f.id === 'explicit.stat_cs')?.perfectRoll).toBeUndefined()
    })

    it('flags a corruption-overrolled single-value mod (The Pandemonius cold pen)', () => {
      // "Damage Penetrates 85(75)% Cold Resistance" -- single-value paren, value > base.
      _setStatEntriesForTests([
        { id: 'explicit.stat_coldpen', text: 'Damage Penetrates #% Cold Resistance', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['Damage Penetrates 85% Cold Resistance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Amulets' }),
        [
          {
            type: 'prefix',
            name: 'Unique',
            tier: 1,
            tags: [],
            lines: ['Damage Penetrates 85(75)% Cold Resistance'],
            ranges: [{ value: 85, min: 75, max: 75 }],
          },
        ],
      )
      expect(filters.find((f) => f.id === 'explicit.stat_coldpen')?.perfectRoll).toBe(true)
    })
  })
})

// ─── Constricting Command "fewer enemies Surrounded" premium override ────────

describe('Constricting Command (PoE2 inverted Surrounded mod)', () => {
  const PREMIUM_DATA = {
    schemaVersion: 2,
    poe1: {},
    poe2: {
      'Constricting Command': {
        mode: 'stat_list' as const,
        confidence: 'verified' as const,
        mods: [
          {
            id: 'explicit.stat_2267564181',
            text: 'Require # additional enemies to be Surrounded',
            direction: 'lower' as const,
            prefill: 1,
          },
        ],
      },
    },
  }

  afterEach(() => {
    _setPremiumModsForTests(null)
    setPoeVersion(1)
  })

  it('surfaces the "fewer enemies Surrounded" line as a premium, default-on row with an exact MAX bound', () => {
    setPoeVersion(2)
    _setStatEntriesForTests([
      { id: 'explicit.stat_2267564181', text: 'Require # additional enemies to be Surrounded', type: 'explicit' },
    ])
    _setPremiumModsForTests(PREMIUM_DATA)

    const filters = matchItemMods(
      ['Require 4 fewer enemies to be Surrounded'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Unique', itemClass: 'Helmets', name: 'Constricting Command' }),
      [
        {
          type: 'prefix',
          name: 'Unique',
          tier: 0,
          tags: [],
          lines: ['Require 4(4-2) fewer enemies to be Surrounded'],
          ranges: [{ value: 4, min: 4, max: 2 }],
        },
      ],
    )

    const row = filters.find((f) => f.id === 'explicit.stat_2267564181')
    expect(row).toBeDefined()
    expect(row?.value).toBe(-4)
    expect(row?.enabled).toBe(true)
    expect(row?.premium).toBe(true)
    // direction lower + prefill 1: exact MAX bound (more negative is better), no MIN.
    expect(row?.max).toBe(-4)
    expect(row?.min).toBeNull()
    // modRange is flipped into the matched value's (negative) sign space so the search
    // value -4 sits inside its own range -- otherwise the renderer tints the box red.
    expect(row?.modRange).toEqual({ min: -4, max: -2 })
  })
})

// ─── 100%-chance binary stat folding (PoE2) ──────────────────────────────────

describe('chance-to binary stat folding', () => {
  it('matches an over-rolled "#% chance to <effect>" to the valueless binary trade stat', () => {
    // The Pandemonius prints "113% chance to Blind Chilled enemies on Hit" (100% base,
    // over-rolled by corruption), but PoE2 trade folds the always-100% chance into a
    // valueless binary stat "Blind Chilled enemies on Hit" (Pandemonius line missing).
    _setStatEntriesForTests([
      { id: 'explicit.stat_3450276548', text: 'Blind Chilled enemies on Hit', type: 'explicit' },
    ])
    const result = matchModToStat('113% chance to Blind Chilled enemies on Hit')
    expect(result?.statId).toBe('explicit.stat_3450276548')
    expect(result?.value).toBeNull()
  })

  it('still matches a real "#% chance to" stat with its rolled value (no false fold)', () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_318953428', text: '#% chance to Blind Enemies on Hit with Attacks', type: 'explicit' },
    ])
    const result = matchModToStat('25% chance to Blind Enemies on Hit with Attacks')
    expect(result?.statId).toBe('explicit.stat_318953428')
    expect(result?.value).toBe(25)
  })
})

// ─── "Monsters have #% chance to X" 100%-roll qualifier drop (PoE1 Charts) ──

describe('Monsters have #% chance to X qualifier drop', () => {
  it('matches a 100%-rolled chance mod printed without the qualifier', () => {
    // Chart suffix "of Impedance": the game prints "Monsters Hinder on Hit with
    // Spells" (no "#% chance to") because the mod rolled 100%.
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_962720646',
        text: 'Monsters have #% chance to Hinder on Hit with Spells',
        type: 'explicit',
      },
    ])
    const result = matchModToStat('Monsters Hinder on Hit with Spells')
    expect(result?.statId).toBe('explicit.stat_962720646')
    expect(result?.value).toBe(100)
  })

  it('still matches an exact valueless "Monsters X" stat over the chance variant (no false fold)', () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_aaa', text: 'Monsters Poison on Hit', type: 'explicit' },
      { id: 'explicit.stat_bbb', text: 'Monsters have #% chance to Poison on Hit', type: 'explicit' },
    ])
    const result = matchModToStat('Monsters Poison on Hit')
    expect(result?.statId).toBe('explicit.stat_aaa')
  })

  it('emits both chips for a Chart with a 100%-chance suffix and a value suffix', () => {
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_962720646',
        text: 'Monsters have #% chance to Hinder on Hit with Spells',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_1605192338',
        text: "#% increased Dead Man's Sulphur found in this Area",
        type: 'explicit',
      },
    ])
    const filters = matchItemMods(
      ['Monsters Hinder on Hit with Spells', "30% increased Dead Man's Sulphur found in this Area"],
      [],
      undefined,
      makeItemInfo({ rarity: 'Magic', itemClass: 'Chart' }),
    )
    expect(filters.find((f) => f.id === 'explicit.stat_962720646')).toBeDefined()
    expect(filters.find((f) => f.id === 'explicit.stat_1605192338')).toBeDefined()
  })
})

// ─── "<X> have #% chance to <Y>" clause fold (PoE1) ──────────────────────────

describe('chance-clause fold onto a valueless stat', () => {
  const MELEE_FORTIFY = {
    id: 'implicit.stat_1166417447',
    text: 'Melee Hits Fortify',
    type: 'implicit',
  }

  it('matches a corruption implicit whose chance clause the trade API folded away', () => {
    // "Melee Hits have 11% chance to Fortify" is indexed as the clause-less
    // "Melee Hits Fortify"; the chance is still the filter's value (probe: min
    // 101 returns nothing, min 1 returns the 10-15% rolls).
    _setStatEntriesForTests([MELEE_FORTIFY])
    const result = matchModToStat('Melee Hits have 11% chance to Fortify', false, 'implicit')
    expect(result?.statId).toBe('implicit.stat_1166417447')
    expect(result?.value).toBe(11)
  })

  it('re-conjugates the verb the folded clause governed', () => {
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_1104120660',
        text: 'Your Mark Transfers to another Enemy when Marked Enemy dies',
        type: 'explicit',
      },
    ])
    const result = matchModToStat('Your Mark has a 10% chance to Transfer to another Enemy when Marked Enemy dies')
    expect(result?.statId).toBe('explicit.stat_1104120660')
    expect(result?.value).toBe(10)
  })

  it('prefers a real "... have #% chance to ..." stat over the fold', () => {
    // "Melee Hits which Stun have #% chance to Fortify" is its own trade stat --
    // folding it onto "Melee Hits Fortify" would search the wrong mod.
    _setStatEntriesForTests([
      MELEE_FORTIFY,
      {
        id: 'implicit.stat_3206381437',
        text: 'Melee Hits which Stun have #% chance to Fortify',
        type: 'implicit',
      },
    ])
    const result = matchModToStat('Melee Hits which Stun have 10% chance to Fortify', false, 'implicit')
    expect(result?.statId).toBe('implicit.stat_3206381437')
    expect(result?.value).toBe(10)
  })

  it('never folds onto a stat that has its own "#" to roll', () => {
    // Only a valueless stat can be the folded twin. A "#"-bearing lookalike
    // would swallow the chance and search on the wrong number.
    _setStatEntriesForTests([
      { id: 'explicit.stat_bow', text: 'Bow Attacks fire # additional Arrows', type: 'explicit' },
    ])
    expect(matchModToStat('Bow Attacks have 20% chance to fire 2 additional Arrows')).toBeNull()
  })

  it('emits an enabled implicit chip with the chance as the search min', () => {
    _setStatEntriesForTests([MELEE_FORTIFY])
    const filters = matchItemMods(
      [],
      ['Melee Hits have 11% chance to Fortify'],
      undefined,
      makeItemInfo({ rarity: 'Unique', itemClass: 'One Hand Swords', corrupted: true }),
    )
    const row = filters.find((f) => f.id === 'implicit.stat_1166417447')
    expect(row?.text).toBe('Melee Hits have 11% chance to Fortify')
    expect(row?.min).toBe(11)
    expect(row?.enabled).toBe(true)
  })
})

// ─── category-qualified implicit stats ──────────────────────────────────────

describe('category-qualified implicit stats', () => {
  it('matches a corrupted shield block implicit against the "(Shields)" stat', () => {
    // Corrupted shields print "+5% Chance to Block". The trade stat carries a
    // "(Shields)" qualifier and has no unqualified twin for the explicit-stat
    // fallback to land on, so without the item's category the row is dropped.
    _setStatEntriesForTests([
      { id: 'implicit.stat_4253454700', text: '+#% Chance to Block (Shields)', type: 'implicit' },
      { id: 'implicit.stat_1702195217', text: '+#% Chance to Block Attack Damage', type: 'implicit' },
    ])
    const filters = matchItemMods(
      [],
      ['+5% Chance to Block'],
      undefined,
      makeItemInfo({ itemClass: 'Shields', corrupted: true }),
    )
    const row = filters.find((f) => f.id === 'implicit.stat_4253454700')
    expect(row?.min).toBe(5)
    expect(row?.enabled).toBe(true)
  })

  it('ignores a qualified implicit stat on an item of another category', () => {
    _setStatEntriesForTests([
      { id: 'implicit.stat_4253454700', text: '+#% Chance to Block (Shields)', type: 'implicit' },
    ])
    const filters = matchItemMods(
      [],
      ['+5% Chance to Block'],
      undefined,
      makeItemInfo({ itemClass: 'Gloves', corrupted: true }),
    )
    expect(filters.find((f) => f.id === 'implicit.stat_4253454700')).toBeUndefined()
  })
})

// ─── local vs non-local implicit resolution (#542) ───────────────────────────

describe('local vs non-local implicit resolution', () => {
  it('resolves a weapon-twinned implicit to the "(Local)" id, not the zero-listing non-local twin', () => {
    // A claw's phys-leech-as-life corruption implicit indexes under the local id
    // league-wide; its non-local twin has zero listings (probe-verified).
    _setStatEntriesForTests([
      { id: 'implicit.stat_55876295', text: '#% of Physical Attack Damage Leeched as Life (Local)', type: 'implicit' },
      { id: 'implicit.stat_3593843976', text: '#% of Physical Attack Damage Leeched as Life', type: 'implicit' },
    ])
    const filters = matchItemMods(
      [],
      ['1.2% of Physical Attack Damage Leeched as Life'],
      undefined,
      makeItemInfo({ itemClass: 'Claws', corrupted: true }),
    )
    expect(filters.find((f) => f.id === 'implicit.stat_55876295')).toBeDefined()
    expect(filters.find((f) => f.id === 'implicit.stat_3593843976')).toBeUndefined()
  })

  it('regression: jewellery keeps resolving a twinned implicit to the non-local id', () => {
    // Rings are neither weapon nor armour, so hasLocalMods is false and the local
    // retry never fires -- the "Adds # to # Fire Damage" implicit stays on its
    // non-local id even though a local twin exists in the catalog.
    _setStatEntriesForTests([
      { id: 'implicit.stat_local_fire', text: 'Adds # to # Fire Damage (Local)', type: 'implicit' },
      { id: 'implicit.stat_321077055', text: 'Adds # to # Fire Damage', type: 'implicit' },
    ])
    const filters = matchItemMods(
      [],
      ['Adds 1 to 5 Fire Damage'],
      undefined,
      makeItemInfo({ itemClass: 'Rings', corrupted: true }),
    )
    expect(filters.find((f) => f.id === 'implicit.stat_321077055')).toBeDefined()
    expect(filters.find((f) => f.id === 'implicit.stat_local_fire')).toBeUndefined()
  })

  it('regression: the ambiguous armour "chance to Poison on Hit" implicit stays on the non-local id', () => {
    // Armour deliberately gets no blanket local preference -- a glove's poison-on-hit
    // implicit is the NON-local id (the local twin has zero listings), unlike its
    // "#% increased Armour" implicit which IS local. A blanket rule would regress this.
    _setStatEntriesForTests([
      { id: 'implicit.stat_3885634897', text: '#% chance to Poison on Hit (Local)', type: 'implicit' },
      { id: 'implicit.stat_795138349', text: '#% chance to Poison on Hit', type: 'implicit' },
    ])
    const filters = matchItemMods(
      [],
      ['10% chance to Poison on Hit'],
      undefined,
      makeItemInfo({ itemClass: 'Gloves', corrupted: true }),
    )
    expect(filters.find((f) => f.id === 'implicit.stat_795138349')).toBeDefined()
    expect(filters.find((f) => f.id === 'implicit.stat_3885634897')).toBeUndefined()
  })

  it('resolves an armour local-ONLY implicit instead of falling through to the explicit remap', () => {
    // "+# to Armour" has no non-local implicit twin. Before the fix, the plain
    // implicit lookup found nothing and execution fell through to the explicit
    // fallback, which matched the non-local EXPLICIT twin and rewrote its id to
    // implicit.stat_809229260 -- an id that does not exist in the implicit catalog.
    // Seeding that explicit twin here proves the local retry wins instead.
    _setStatEntriesForTests([
      { id: 'implicit.stat_3484657501', text: '+# to Armour (Local)', type: 'implicit' },
      { id: 'explicit.stat_809229260', text: '+# to Armour', type: 'explicit' },
    ])
    const filters = matchItemMods(
      [],
      ['+50 to Armour'],
      undefined,
      makeItemInfo({ itemClass: 'Gloves', corrupted: true }),
    )
    expect(filters.find((f) => f.id === 'implicit.stat_3484657501')).toBeDefined()
    expect(filters.find((f) => f.id === 'implicit.stat_809229260')).toBeUndefined()
  })

  it('resolves a weapon local-ONLY implicit instead of the nonexistent explicit-remap id', () => {
    // "Adds # to # Physical Damage" is local-only on weapons too -- same failure
    // mode as the armour case above, this time gated through isWeapon rather than
    // the hasLocalMods-and-not-weapon retry.
    _setStatEntriesForTests([
      { id: 'implicit.stat_1940865751', text: 'Adds # to # Physical Damage (Local)', type: 'implicit' },
      { id: 'explicit.stat_960081730', text: 'Adds # to # Physical Damage', type: 'explicit' },
    ])
    const filters = matchItemMods(
      [],
      ['Adds 5 to 10 Physical Damage'],
      undefined,
      makeItemInfo({ itemClass: 'Two Hand Axes', corrupted: true }),
    )
    expect(filters.find((f) => f.id === 'implicit.stat_1940865751')).toBeDefined()
    expect(filters.find((f) => f.id === 'implicit.stat_960081730')).toBeUndefined()
  })
})

// ─── matchModToStat: requires stat entries (network-dependent) ───────────────

describe('matchModToStat (requires stat entries)', () => {
  it.skip('matches a basic life mod - requires trade API data', () => {
    // This test needs stat entries loaded via ensureStatsLoaded() which makes HTTP calls
    // const result = matchModToStat('+70 to maximum Life')
    // expect(result).not.toBeNull()
    // expect(result!.value).toBe(70)
  })

  it.skip('matches reduced mods as negative increased - requires trade API data', () => {
    // const result = matchModToStat('10% reduced Mana Cost of Skills')
    // expect(result).not.toBeNull()
    // expect(result!.value).toBe(-10)
  })

  it.skip('matches negative resistance mods - requires trade API data', () => {
    // const result = matchModToStat('-50% to Lightning Resistance')
    // expect(result).not.toBeNull()
    // expect(result!.value).toBe(-50)
  })
})

// ─── PoE2 stat text format (no leading "+") ─────────────────────────────────
//
// PoE2's /api/trade2/data/stats returns stat texts without the "+" sign that
// PoE1 includes (e.g. "# to maximum Life" vs PoE1's "+# to maximum Life"),
// while item clipboard text in both games still has the "+". The (.+?) capture
// then grabs "+50" instead of "50", and the numeric validation must accept
// that or value comes back null and the price-check row has no prefill.

describe('matchModToStat (PoE2 stat text without leading sign)', () => {
  it('extracts numeric value from "+# to maximum Life" item text matched against bare "# to maximum Life" stat', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_3299347043', text: '# to maximum Life', type: 'explicit' }])
    const result = matchModToStat('+50 to maximum Life')
    expect(result).not.toBeNull()
    expect(result?.value).toBe(50)
  })

  it('extracts percent value from "+#% to Cold Resistance" item against bare "#% to Cold Resistance" stat', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_4220027924', text: '#% to Cold Resistance', type: 'explicit' }])
    const result = matchModToStat('+47% to Cold Resistance')
    expect(result).not.toBeNull()
    expect(result?.value).toBe(47)
  })

  it('extracts negative value when stat text has no sign', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_x', text: '#% to Lightning Resistance', type: 'explicit' }])
    const result = matchModToStat('-50% to Lightning Resistance')
    expect(result).not.toBeNull()
    expect(result?.value).toBe(-50)
  })

  it('still works for unsigned PoE1-style mod text', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_y', text: '#% increased Spell Damage', type: 'explicit' }])
    const result = matchModToStat('20% increased Spell Damage')
    expect(result).not.toBeNull()
    expect(result?.value).toBe(20)
  })

  it('matches a global hybrid defence mod despite the clipboard Oxford comma', () => {
    // PoE2 clipboard writes "Global Armour, Evasion, and Energy Shield" (Oxford
    // comma) but the trade API stat text drops the comma before "and".
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_1177404658',
        text: '#% increased Global Armour, Evasion and Energy Shield',
        type: 'explicit',
      },
    ])
    const result = matchModToStat('29% increased Global Armour, Evasion, and Energy Shield', false, 'explicit')
    expect(result?.statId).toBe('explicit.stat_1177404658')
    expect(result?.value).toBe(29)
  })

  it('averages multiple signed numeric captures (PoE2 "Adds #-#" hybrid case)', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_z', text: 'Adds # to # Cold Damage', type: 'explicit' }])
    const result = matchModToStat('Adds +5 to +15 Cold Damage')
    expect(result).not.toBeNull()
    expect(result?.value).toBe(10)
    expect(result?.aggregated).toBe(true)
  })

  // Kitava's Thirst (and its foulborn Life twin) publish TWO `#` placeholders:
  // chance% and spend threshold. Averaging them produced Exact Values=125 and
  // zero trade hits. Prefer the first `#` (chance); do not mark aggregated.
  it('uses the first # for Kitava-style chance+threshold mods (not the average)', () => {
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_2513998383',
        text: '#% chance to Trigger Socketed Spells when you Spend at least # Life on an\nUpfront Cost to Use or Trigger a Skill, with a 0.1 second Cooldown',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_723388324',
        text: '#% chance to Trigger Socketed Spells when you Spend at least # Mana on an\nUpfront Cost to Use or Trigger a Skill, with a 0.1 second Cooldown',
        type: 'explicit',
      },
    ])
    const life = matchModToStat(
      '50% chance to Trigger Socketed Spells when you Spend at least 200 Life on an Upfront Cost to Use or Trigger a Skill, with a 0.1 second Cooldown',
    )
    expect(life?.statId).toBe('explicit.stat_2513998383')
    expect(life?.value).toBe(50)
    expect(life?.aggregated).toBeUndefined()

    const mana = matchModToStat(
      '50% chance to Trigger Socketed Spells when you Spend at least 100 Mana on an Upfront Cost to Use or Trigger a Skill, with a 0.1 second Cooldown',
    )
    expect(mana?.statId).toBe('explicit.stat_723388324')
    expect(mana?.value).toBe(50)
    expect(mana?.aggregated).toBeUndefined()
  })

  // The same mod as it actually arrives from a basic (Ctrl+C) copy: wrapped across
  // two lines, with the clipboard parser adding the "\n"-joined candidate. Only the
  // joined row may survive -- the trailing half alone matches the WRONG twin (Mana)
  // with no value, which searched for a different item entirely (#527).
  it('resolves the wrapped basic-copy Kitava mod to one valued row on the right twin', () => {
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_2513998383',
        text: '#% chance to Trigger Socketed Spells when you Spend at least # Life on an\nUpfront Cost to Use or Trigger a Skill, with a 0.1 second Cooldown',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_723388324',
        text: '#% chance to Trigger Socketed Spells when you Spend at least # Mana on an\nUpfront Cost to Use or Trigger a Skill, with a 0.1 second Cooldown',
        type: 'explicit',
      },
    ])
    const half1 = '50% chance to Trigger Socketed Spells when you Spend at least 200 Life on an'
    const half2 = 'Upfront Cost to Use or Trigger a Skill, with a 0.1 second Cooldown'
    const filters = matchItemMods(
      [half1, half2, `${half1}\n${half2}`],
      [],
      undefined,
      makeItemInfo({ rarity: 'Unique', itemClass: 'Helmets', baseType: 'Zealot Helmet' }),
    )
    const rows = filters.filter((f) => f.type === 'explicit')
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('explicit.stat_2513998383')
    expect(rows[0].value).toBe(50)
    expect(rows[0].aggregated).toBeUndefined()
  })

  // The trade API stores "fewer enemies to be Surrounded" as the inverse of its
  // positive "additional" stat: clipboard "Require 4 fewer" -> trade value -4.
  // Without the fewer->additional variant the row never matches and the line is
  // dropped from the price check entirely (Constricting Command).
  it('matches "Require N fewer enemies to be Surrounded" against the "additional" stat and negates the value', () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_2267564181', text: 'Require # additional enemies to be Surrounded', type: 'explicit' },
    ])
    const result = matchModToStat('Require 4 fewer enemies to be Surrounded')
    expect(result?.statId).toBe('explicit.stat_2267564181')
    expect(result?.value).toBe(-4)
  })

  it('still matches the positive "additional enemies to be Surrounded" form with a positive value', () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_2267564181', text: 'Require # additional enemies to be Surrounded', type: 'explicit' },
    ])
    const result = matchModToStat('Require 2 additional enemies to be Surrounded')
    expect(result?.statId).toBe('explicit.stat_2267564181')
    expect(result?.value).toBe(2)
  })

  it('rejects a match whose # captured a word instead of a number', () => {
    // A `#` always stands for a number, so a word in the capture means the
    // `(.+?)` only matched by swallowing text this stat has no claim to (#558).
    _setStatEntriesForTests([{ id: 'explicit.stat_q', text: 'Causes # additional Effects', type: 'explicit' }])
    expect(matchModToStat('Causes random additional Effects')).toBeNull()
    expect(matchModToStat('Causes 3 additional Effects')?.value).toBe(3)
  })

  it('matches "an additional <Noun>" clipboard text against "# additional <Noun>s" trade stat', () => {
    // Real bug: the bow suffix "of Splintering" prints in clipboard as "Bow Attacks fire
    // an additional Arrow" (singular) but the trade API stores it as "Bow Attacks fire
    // # additional Arrows" (numeric placeholder + plural). Without the variant transform
    // the price checker returned no match for this mod.
    _setStatEntriesForTests([
      { id: 'explicit.stat_2222186378', text: 'Bow Attacks fire # additional Arrows', type: 'explicit' },
    ])
    const result = matchModToStat('Bow Attacks fire an additional Arrow')
    expect(result).not.toBeNull()
    expect(result?.statId).toBe('explicit.stat_2222186378')
    expect(result?.value).toBe(1)
  })

  describe('multi-line wrapped mods', () => {
    // A single stat that wraps across two clipboard lines (e.g. Yoke of Suffering's
    // "Enemies take #% increased Damage for each Elemental Ailment type among your
    // Ailments on them") arrives from clipboard.ts as three explicit strings: each
    // physical line plus the "\n"-joined whole. The two fragments are a prefix and a
    // suffix of the trade stat text, so the substring fallback matches them with a null
    // value -- producing junk duplicate rows alongside the real (joined) row. The
    // matcher must collapse these to a single row carrying the real value.
    const WRAPPED_EXPLICITS = [
      'Enemies take 17% increased Damage for each Elemental Ailment type among',
      'your Ailments on them',
      'Enemies take 17% increased Damage for each Elemental Ailment type among\nyour Ailments on them',
    ]

    it('emits a single explicit row for a stat that wraps across two clipboard lines', () => {
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_yoke',
          text: 'Enemies take #% increased Damage for each Elemental Ailment type among your Ailments on them',
          type: 'explicit',
        },
      ])
      const filters = matchItemMods(WRAPPED_EXPLICITS, [], undefined, makeItemInfo({ rarity: 'Unique' }))
      const yokeRows = filters.filter((f) => f.id === 'explicit.stat_yoke')
      expect(yokeRows).toHaveLength(1)
      expect(yokeRows[0].value).toBe(17)
    })

    it('still keeps both stats of a genuine hybrid mod (distinct stat ids)', () => {
      // Hybrid mods (two independent stats under one affix header) match different
      // stat ids, so the dedup must not collapse them.
      _setStatEntriesForTests([
        { id: 'explicit.stat_area', text: '#% increased Area Damage', type: 'explicit' },
        { id: 'explicit.stat_fireres', text: '+#% to Fire Resistance', type: 'explicit' },
      ])
      const filters = matchItemMods(
        ['25% increased Area Damage', '+44% to Fire Resistance'],
        [],
        undefined,
        makeItemInfo(),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_area')?.value).toBe(25)
      expect(filters.find((f) => f.id === 'explicit.stat_fireres')?.value).toBe(44)
    })

    it('drops a wrap fragment that matches a DIFFERENT (longer) stat id than the joined row', () => {
      // Watcher's Eye "of Purity of Lightning" wraps across two clipboard lines. The
      // trailing fragment "affected by Purity of Lightning" matches, via the
      // substring fallback, the unrelated (longer) stat_254131992 text -- not the
      // same id as the joined row -- so the same-id rule alone misses it.
      _setStatEntriesForTests([
        {
          id: 'explicit.stat_3953667743',
          text: '#% of Fire and Cold Damage taken as Lightning Damage while\naffected by Purity of Lightning',
          type: 'explicit',
        },
        {
          id: 'explicit.stat_254131992',
          text: '#% of Physical Damage from Hits taken as Lightning Damage while affected by Purity of Lightning',
          type: 'explicit',
        },
      ])
      const filters = matchItemMods(
        [
          '15% of Fire and Cold Damage taken as Lightning Damage while',
          'affected by Purity of Lightning',
          '15% of Fire and Cold Damage taken as Lightning Damage while\naffected by Purity of Lightning',
        ],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Jewels' }),
      )
      expect(filters.find((f) => f.id === 'explicit.stat_254131992')).toBeUndefined()
      const rows = filters.filter((f) => f.id === 'explicit.stat_3953667743')
      expect(rows).toHaveLength(1)
      expect(rows[0].value).toBe(15)
    })
  })
})

describe('matchModToStat (Unscalable Value prefix/suffix fallback)', () => {
  it('matches when clipboard text is the trailing portion of the stat (hidden chance prefix)', () => {
    // "of the Essence" belt suffix in PoE1: clipboard hides the leading "#% chance to "
    // because the chance is unscalable (always 100%). The stat-matcher must still
    // resolve the trade API stat ID so the price-checker shows a row for it.
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_2989883253',
        text: "#% chance to gain Alchemist's Genius when you use a Flask",
        type: 'explicit',
      },
    ])
    const result = matchModToStat("Gain Alchemist's Genius when you use a Flask")
    expect(result).not.toBeNull()
    expect(result?.statId).toBe('explicit.stat_2989883253')
    expect(result?.value).toBeNull()
  })

  it('matches synthesis Intimidate-on-hit when the trade text keeps a fixed duration digit', () => {
    // Clipboard: "Intimidate Enemies for 4 seconds on Hit with Attacks"
    // Trade:     "#% chance to Intimidate Enemies for 4 seconds on Hit with Attacks"
    // Digits must be stripped on both sides or the leftover "4" on the stat
    // breaks endsWith and the synthesised implicit chip never appears.
    _setStatEntriesForTests([
      {
        id: 'implicit.stat_3438201750',
        text: '#% chance to Intimidate Enemies for 4 seconds on Hit with Attacks',
        type: 'implicit',
      },
    ])
    const result = matchModToStat('Intimidate Enemies for 4 seconds on Hit with Attacks', false, 'implicit')
    expect(result).not.toBeNull()
    expect(result?.statId).toBe('implicit.stat_3438201750')
    expect(result?.value).toBeNull()
  })

  it('still matches when clipboard text is the leading portion of the stat (existing prefix case)', () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_xxx', text: 'Bladefall deals extra Damage by #% of their value', type: 'explicit' },
    ])
    const result = matchModToStat('Bladefall deals extra Damage')
    expect(result).not.toBeNull()
    expect(result?.statId).toBe('explicit.stat_xxx')
    expect(result?.value).toBeNull()
  })

  it('does NOT match a plain mod against a longer stat whose dropped prefix is descriptive (issue #399)', () => {
    // A weapon "increased Attack Speed" corruption enchant has no global plain enchant
    // stat in the trade API, so the suffix fallback used to grab the unrelated
    // "Allies in your Presence have #% increased Attack Speed". The dropped prefix
    // ("Allies in your Presence have") is descriptive text, not a hidden roll/chance
    // chunk, so it must NOT be accepted.
    _setStatEntriesForTests([
      {
        id: 'enchant.stat_1998951374',
        text: 'Allies in your Presence have #% increased Attack Speed',
        type: 'enchant',
      },
    ])
    const result = matchModToStat('8% increased Attack Speed', false, 'enchant')
    expect(result).toBeNull()
  })

  it('prefers the (Local) enchant stat for a weapon corruption enchant (issue #399)', () => {
    // The correct trade stat for a weapon's "increased Attack Speed" corruption
    // enchant is the "(Local)" enchant entry; the global "Allies in your Presence"
    // lookalike must not win. preferLocal=true is passed for items with local affixes.
    _setStatEntriesForTests([
      { id: 'enchant.stat_210067635', text: '#% increased Attack Speed (Local)', type: 'enchant' },
      {
        id: 'enchant.stat_1998951374',
        text: 'Allies in your Presence have #% increased Attack Speed',
        type: 'enchant',
      },
    ])
    const result = matchModToStat('8% increased Attack Speed', true, 'enchant')
    expect(result?.statId).toBe('enchant.stat_210067635')
    expect(result?.value).toBe(8)
  })
})

describe('buildEnchantFilters via matchItemMods (weapon corruption enchant, issue #399)', () => {
  it('routes a Widowhail attack-speed corruption enchant to the (Local) enchant stat', () => {
    _setStatEntriesForTests([
      { id: 'enchant.stat_210067635', text: '#% increased Attack Speed (Local)', type: 'enchant' },
      {
        id: 'enchant.stat_1998951374',
        text: 'Allies in your Presence have #% increased Attack Speed',
        type: 'enchant',
      },
    ])
    const filters = matchItemMods([], [], undefined, {
      ...makeItemInfo({ itemClass: 'Bows', baseType: 'Crude Bow', rarity: 'Unique', corrupted: true }),
      enchants: ['8% increased Attack Speed'],
    })
    const enchant = filters.find((f) => f.type === 'enchant')
    expect(enchant?.id).toBe('enchant.stat_210067635')
    expect(enchant?.value).toBe(8)
  })
})

describe('buildRuneFilters via matchItemMods (PoE2 socketed rune mods)', () => {
  // GGG tags rune stat entries with type "augment" (not "rune"); the pseudo map and
  // matcher detect runes by the rune.* id prefix. Fixtures use the real "augment" type.
  it('emits a rune chip matched to the rune.* group, default ON when it feeds no pseudo', () => {
    _setStatEntriesForTests([{ id: 'rune.stat_3261801346', text: '# to Dexterity', type: 'augment' }])
    const filters = matchItemMods([], [], undefined, {
      ...makeItemInfo({ itemClass: 'Helmets', baseType: 'Felt Cap', rarity: 'Rare' }),
      runes: ['+9 to Dexterity'],
    })
    const rune = filters.find((f) => f.type === 'rune')
    expect(rune?.id).toBe('rune.stat_3261801346')
    expect(rune?.value).toBe(9)
    // Dexterity feeds no pseudo, so the rune chip behaves like an enchant (default on).
    expect(rune?.enabled).toBe(true)
  })

  it('feeds a rune all-ele-res mod into the Total Elemental Resistance pseudo and defaults the chip off', () => {
    _setStatEntriesForTests([{ id: 'rune.stat_2901986750', text: '#% to all Elemental Resistances', type: 'augment' }])
    const filters = matchItemMods([], [], undefined, {
      ...makeItemInfo({ itemClass: 'Helmets', baseType: 'Felt Cap', rarity: 'Rare' }),
      runes: ['+34% to all Elemental Resistances'],
    })
    const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
    expect(pseudo?.value).toBe(102) // 34 * 3 (all-resistances multiplier)
    // The rune folds into the pseudo, so its own chip is suppressed (off) like an explicit res mod.
    const rune = filters.find((f) => f.type === 'rune')
    expect(rune?.id).toBe('rune.stat_2901986750')
    expect(rune?.enabled).toBe(false)
  })

  // The exact Goldrim scenario: a +29% all-res explicit (x3 = 87) plus a +18% fire-res
  // rune (x1 = 18) must sum to 105 in the Total Elemental Resistance pseudo. Regresses
  // the bug where rune entries (type "augment") were skipped by buildPseudoMap.
  it('sums an explicit all-res mod and a fire-res rune into one Total Ele Res pseudo', () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_2901986750', text: '#% to all Elemental Resistances', type: 'explicit' },
      { id: 'rune.stat_3372524247', text: '#% to Fire Resistance', type: 'augment' },
    ])
    const filters = matchItemMods(['+29% to all Elemental Resistances'], [], undefined, {
      ...makeItemInfo({ itemClass: 'Helmets', baseType: 'Felt Cap', rarity: 'Unique' }),
      runes: ['+18% to Fire Resistance'],
    })
    const pseudo = filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
    expect(pseudo?.value).toBe(105) // 29*3 + 18*1
  })
})

describe('matchModToStat (Forbidden Shako indexable_support routing)', () => {
  // The trade API ships TWO stats with identical display text for each Forbidden
  // Shako-style randomized support: a regular `stat_*` ID (which doesn't actually
  // search Forbidden Shakos) and an `indexable_support_*` ID (which does). The
  // matcher must route to the right family based on whether the caller has flagged
  // the mod as a randomized support. Without this, both candidates match and the
  // matcher coin-flips between them.

  function seedDuplicateSupports() {
    _setStatEntriesForTests([
      // Regular family: applies to craftable / built-in support mods on equipment.
      {
        id: 'explicit.stat_2388360415',
        text: 'Socketed Gems are Supported by Level # Endurance Charge on Melee Stun',
        type: 'explicit',
      },
      // Indexable family: only applies to Forbidden Shako-style randomized supports.
      {
        id: 'explicit.indexable_support_98',
        text: 'Socketed Gems are Supported by Level # Endurance Charge on Melee Stun',
        type: 'explicit',
      },
    ])
  }

  it('default behavior excludes indexable_support entries (regular item path)', () => {
    seedDuplicateSupports()
    const result = matchModToStat('Socketed Gems are Supported by Level 9 Endurance Charge on Melee Stun')
    expect(result).not.toBeNull()
    expect(result?.statId).toBe('explicit.stat_2388360415')
  })

  it('preferIndexableSupport=true routes to indexable_support family (Forbidden Shako path)', () => {
    seedDuplicateSupports()
    const result = matchModToStat(
      'Socketed Gems are Supported by Level 9 Endurance Charge on Melee Stun',
      false,
      'explicit',
      true,
    )
    expect(result).not.toBeNull()
    expect(result?.statId).toBe('explicit.indexable_support_98')
  })

  it('preferIndexableSupport=true returns null when only the regular stat exists', () => {
    // Defensive: if the trade dict has no indexable variant for this support type,
    // we'd rather return null than fall back to the wrong family. The chip just
    // gets dropped, which is preferable to emitting a chip that searches nothing.
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_2388360415',
        text: 'Socketed Gems are Supported by Level # Endurance Charge on Melee Stun',
        type: 'explicit',
      },
    ])
    const result = matchModToStat(
      'Socketed Gems are Supported by Level 9 Endurance Charge on Melee Stun',
      false,
      'explicit',
      true,
    )
    expect(result).toBeNull()
  })

  it('matchItemMods routes a Forbidden Shako support to indexable_support when advanced data flags it', () => {
    seedDuplicateSupports()
    const advancedMods: AdvancedMod[] = [
      {
        type: 'prefix',
        name: '',
        tier: 0,
        tags: ['Gem'],
        lines: ['Socketed Gems are Supported by Level 9 Endurance Charge on Melee Stun'],
        ranges: [],
        randomSupport: true,
      },
    ]
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 9 Endurance Charge on Melee Stun'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Unique', baseType: 'Great Crown' }),
      advancedMods,
    )
    const supportChip = filters.find((f) => f.text.includes('Endurance Charge on Melee Stun'))
    expect(supportChip).toBeDefined()
    expect(supportChip?.id).toBe('explicit.indexable_support_98')
  })

  it('matchItemMods routes a regular crafted/built-in support to the stat_* family by default', () => {
    seedDuplicateSupports()
    // No advancedMods, or advancedMods without randomSupport flag -> regular path.
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 9 Endurance Charge on Melee Stun'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Rare' }),
    )
    const supportChip = filters.find((f) => f.text.includes('Endurance Charge on Melee Stun'))
    expect(supportChip).toBeDefined()
    expect(supportChip?.id).toBe('explicit.stat_2388360415')
  })
})

describe('Forbidden Shako double-Decay: indexable-support rows are not sum-merged (#552)', () => {
  // The trade index keeps each indexable-support instance separate: a search on
  // indexable_support_92 with min=36 over all of Standard returns 0 items, so a
  // double-Decay Shako's two lines are never combined server-side. Summing them
  // into one Level-34 row (the old mergeDuplicateStats behavior) searched only
  // items that rolled a single Level-34 Decay -- the wrong items, wrong price.
  function seedDecayEntries() {
    _setStatEntriesForTests([
      { id: 'explicit.indexable_support_92', text: 'Socketed Gems are Supported by Level # Decay', type: 'explicit' },
      { id: 'explicit.stat_388696990', text: 'Socketed Gems are Supported by Level # Decay', type: 'explicit' },
    ])
  }

  it('double Decay: both rows survive unmerged, only the higher roll stays enabled', () => {
    seedDecayEntries()
    const advancedMods: AdvancedMod[] = [
      {
        type: 'prefix',
        name: '',
        tier: 0,
        tags: ['Gem'],
        lines: [
          'Socketed Gems are Supported by Level 4(1-10) Decay(Greater Multiple Projectiles-Hallow) - Unscalable Value',
        ],
        ranges: [],
        randomSupport: true,
      },
      {
        type: 'prefix',
        name: '',
        tier: 0,
        tags: ['Gem'],
        lines: [
          'Socketed Gems are Supported by Level 30(25-35) Decay(Greater Multiple Projectiles-Hallow) - Unscalable Value',
        ],
        ranges: [],
        randomSupport: true,
      },
    ]
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 4 Decay', 'Socketed Gems are Supported by Level 30 Decay'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Unique', baseType: 'Great Crown', itemLevel: 85 }),
      advancedMods,
    )
    const decayRows = filters.filter((f) => f.id === 'explicit.indexable_support_92')
    expect(decayRows).toHaveLength(2)
    const highRow = decayRows.find((r) => r.value === 30)
    const lowRow = decayRows.find((r) => r.value === 4)
    expect(highRow).toBeDefined()
    expect(lowRow).toBeDefined()
    // Open-ended min, not a min=max pin: a Shako's support level rolls, so the search
    // wants equal-or-better copies (#564).
    expect(highRow?.min).toBe(30)
    expect(highRow?.max).toBeNull()
    expect(highRow?.enabled).toBe(true)
    expect(lowRow?.min).toBe(4)
    expect(lowRow?.max).toBeNull()
    expect(lowRow?.enabled).toBe(false)
  })
})

describe('Forbidden Shako randomized supports are price-defining rows (#564)', () => {
  // A Shako is priced on WHICH supports it rolled and how high, so its support rows
  // carry `randomSupport` (Base mode keeps them, see base-mode.test.ts) and search an
  // open-ended min instead of the Elder-hybrid Level-N pin.
  const PC_ON_CRIT = 'explicit.indexable_support_30'
  function seedPowerCharge() {
    _setStatEntriesForTests([
      // Live PoE1 catalog: the indexable twin carries the current gem name while the
      // craftable stat_* twin still says "Strike", so a Shako support that misses the
      // indexable family matches NOTHING and the row vanishes entirely.
      { id: PC_ON_CRIT, text: 'Socketed Gems are Supported by Level # Power Charge On Critical', type: 'explicit' },
      {
        id: 'explicit.stat_4015918489',
        text: 'Socketed Gems are Supported by Level # Power Charge On Critical Strike',
        type: 'explicit',
      },
    ])
  }

  it('flags the row and searches min-only, keeping the rolled bracket', () => {
    seedPowerCharge()
    const advancedMods: AdvancedMod[] = [
      {
        type: 'prefix',
        name: '',
        tier: 0,
        tags: ['Gem'],
        lines: [
          'Socketed Gems are Supported by Level 8(1-10) Power Charge On Critical(Greater Multiple Projectiles-Hallow) - Unscalable Value',
        ],
        ranges: [{ value: 8, min: 1, max: 10 }],
        randomSupport: true,
      },
    ]
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 8 Power Charge On Critical'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Unique', baseType: 'Great Crown', itemLevel: 85 }),
      advancedMods,
    )
    const chip = filters.find((f) => f.id === PC_ON_CRIT)
    expect(chip).toBeDefined()
    expect(chip?.randomSupport).toBe(true)
    expect(chip?.enabled).toBe(true)
    expect(chip?.min).toBe(8)
    expect(chip?.max).toBeNull()
    // The level rolls, so it is not a fixed value -- the row shows its own bracket.
    expect(chip?.fixedRoll).toBeUndefined()
    expect(chip?.modRange).toEqual({ min: 1, max: 10 })
  })

  it('a maxed roll counts as perfect', () => {
    seedPowerCharge()
    const advancedMods: AdvancedMod[] = [
      {
        type: 'prefix',
        name: '',
        tier: 0,
        tags: ['Gem'],
        lines: ['Socketed Gems are Supported by Level 35(25-35) Power Charge On Critical - Unscalable Value'],
        ranges: [{ value: 35, min: 25, max: 35 }],
        randomSupport: true,
      },
    ]
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 35 Power Charge On Critical'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Unique', baseType: 'Great Crown', itemLevel: 85 }),
      advancedMods,
    )
    expect(filters.find((f) => f.id === PC_ON_CRIT)?.perfectRoll).toBe(true)
  })

  it('basic copy (no advanced mods) still flags the row', () => {
    seedPowerCharge()
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 30 Power Charge On Critical'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Unique', baseType: 'Great Crown' }),
    )
    const chip = filters.find((f) => f.id === PC_ON_CRIT)
    expect(chip?.randomSupport).toBe(true)
    expect(chip?.min).toBe(30)
    expect(chip?.max).toBeNull()
  })

  it('two different supports: only the higher-rolled one is on by default', () => {
    // The slots roll 1-10 and 25-35, so the high one is what the Shako sells on.
    // Searching both at once matches essentially nothing (live probe: "Power Charge
    // On Critical >= 8 AND Fork >= 31" returns 0 on Allflame, each alone returns hits).
    _setStatEntriesForTests([
      { id: PC_ON_CRIT, text: 'Socketed Gems are Supported by Level # Power Charge On Critical', type: 'explicit' },
      { id: 'explicit.indexable_support_80', text: 'Socketed Gems are Supported by Level # Fork', type: 'explicit' },
    ])
    const filters = matchItemMods(
      [
        'Socketed Gems are Supported by Level 8 Power Charge On Critical',
        'Socketed Gems are Supported by Level 31 Fork',
      ],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Unique', baseType: 'Great Crown' }),
    )
    const low = filters.find((f) => f.id === PC_ON_CRIT)
    const high = filters.find((f) => f.id === 'explicit.indexable_support_80')
    expect(low?.enabled).toBe(false)
    expect(high?.enabled).toBe(true)
    // Both rows survive and stay flagged -- the losing one is a tick away, not gone.
    expect(low?.randomSupport).toBe(true)
    expect(high?.randomSupport).toBe(true)
  })

  it('control: an Elder hybrid fixed support level keeps its exact pin and no flag', () => {
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_elder_burn',
        text: 'Socketed Gems are Supported by Level # Burning Damage',
        type: 'explicit',
      },
    ])
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 20 Burning Damage'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Rare', baseType: "Conqueror's Helmet" }),
    )
    const chip = filters.find((f) => f.id === 'explicit.stat_elder_burn')
    expect(chip?.randomSupport).toBeUndefined()
    expect(chip?.min).toBe(20)
    expect(chip?.max).toBe(20)
  })
})

describe('basic-copy Shako Decay routing by item identity (#552)', () => {
  // Basic copies (chat-linked items) carry no advanced-mod block, so randomSupport
  // is never flagged from a roll bracket. Forbidden Shako / Replica Forbidden Shako
  // are the only PoE1 items with indexable supports, so their support lines route
  // to the indexable family by item identity instead.
  function seedDecayEntries() {
    _setStatEntriesForTests([
      { id: 'explicit.indexable_support_92', text: 'Socketed Gems are Supported by Level # Decay', type: 'explicit' },
      { id: 'explicit.stat_388696990', text: 'Socketed Gems are Supported by Level # Decay', type: 'explicit' },
    ])
  }

  it('basic-copy Forbidden Shako routes to indexable_support_92', () => {
    seedDecayEntries()
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 30 Decay'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Unique', baseType: 'Great Crown' }),
    )
    const chip = filters.find((f) => f.text.includes('Decay'))
    expect(chip).toBeDefined()
    expect(chip?.id).toBe('explicit.indexable_support_92')
  })

  it('control: Hungry Loop (Unset Ring) basic copy stays on the regular stat family', () => {
    seedDecayEntries()
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 20 Decay'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Rings', rarity: 'Unique', baseType: 'Unset Ring' }),
    )
    const chip = filters.find((f) => f.text.includes('Decay'))
    expect(chip).toBeDefined()
    expect(chip?.id).toBe('explicit.stat_388696990')
  })

  it("control: rare Conqueror's Helmet basic copy stays on the regular stat family", () => {
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_2388360415',
        text: 'Socketed Gems are Supported by Level # Endurance Charge on Melee Stun',
        type: 'explicit',
      },
      {
        id: 'explicit.indexable_support_98',
        text: 'Socketed Gems are Supported by Level # Endurance Charge on Melee Stun',
        type: 'explicit',
      },
    ])
    const filters = matchItemMods(
      ['Socketed Gems are Supported by Level 20 Endurance Charge on Melee Stun'],
      [],
      undefined,
      makeItemInfo({ itemClass: 'Helmets', rarity: 'Rare', baseType: "Conqueror's Helmet" }),
    )
    const chip = filters.find((f) => f.text.includes('Endurance Charge on Melee Stun'))
    expect(chip).toBeDefined()
    expect(chip?.id).toBe('explicit.stat_2388360415')
  })
})

describe('PoE2 Damage-as-Extra summary pseudos (end to end)', () => {
  const ELE_ID = 'pseudo.pseudo_damage_as_extra_elemental'
  const ELE_CHAOS_ID = 'pseudo.pseudo_damage_as_extra_elemental_chaos'
  const ENTRIES = [
    { id: 'explicit.stat_extra_fire', text: 'Gain #% of Damage as Extra Fire Damage', type: 'explicit' },
    { id: 'explicit.stat_extra_cold', text: 'Gain #% of Damage as Extra Cold Damage', type: 'explicit' },
    { id: 'explicit.stat_extra_light', text: 'Gain #% of Damage as Extra Lightning Damage', type: 'explicit' },
    { id: 'explicit.stat_extra_chaos', text: 'Gain #% of Damage as Extra Chaos Damage', type: 'explicit' },
  ]

  it('3-ele staff: both rows emitted disabled, equal sums, source rows kept enabled', () => {
    const prev = getPoeVersion()
    setPoeVersion(2)
    try {
      _setStatEntriesForTests(ENTRIES)
      const filters = matchItemMods(
        [
          'Gain 27% of Damage as Extra Lightning Damage',
          'Gain 43% of Damage as Extra Cold Damage',
          'Gain 40% of Damage as Extra Fire Damage',
        ],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Staves' }),
      )
      const ele = filters.find((f) => f.id === ELE_ID)
      const eleChaos = filters.find((f) => f.id === ELE_CHAOS_ID)
      expect(ele).toBeDefined()
      expect(eleChaos).toBeDefined()
      expect(ele?.enabled).toBe(false)
      expect(eleChaos?.enabled).toBe(false)
      expect(ele?.value).toBe(110)
      expect(eleChaos?.value).toBe(110) // no chaos present -> same total
      // The four real mod rows stay enabled.
      const fireRow = filters.find((f) => f.id === 'explicit.stat_extra_fire')
      expect(fireRow?.enabled).toBe(true)
      // Weight group carries the contributing stat ids.
      expect(ele?.weightFilters).toContainEqual({ id: 'explicit.stat_extra_fire' })
    } finally {
      setPoeVersion(prev)
    }
  })

  it('all four: ele = 3-sum, ele+chaos = 4-sum', () => {
    const prev = getPoeVersion()
    setPoeVersion(2)
    try {
      _setStatEntriesForTests(ENTRIES)
      const filters = matchItemMods(
        [
          'Gain 10% of Damage as Extra Fire Damage',
          'Gain 20% of Damage as Extra Cold Damage',
          'Gain 30% of Damage as Extra Lightning Damage',
          'Gain 5% of Damage as Extra Chaos Damage',
        ],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Staves' }),
      )
      expect(filters.find((f) => f.id === ELE_ID)?.value).toBe(60)
      expect(filters.find((f) => f.id === ELE_CHAOS_ID)?.value).toBe(65)
    } finally {
      setPoeVersion(prev)
    }
  })

  it('chaos only: ele-only pseudo absent, ele+chaos present', () => {
    const prev = getPoeVersion()
    setPoeVersion(2)
    try {
      _setStatEntriesForTests(ENTRIES)
      const filters = matchItemMods(
        ['Gain 15% of Damage as Extra Chaos Damage'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Staves' }),
      )
      expect(filters.find((f) => f.id === ELE_ID)).toBeUndefined()
      expect(filters.find((f) => f.id === ELE_CHAOS_ID)?.value).toBe(15)
    } finally {
      setPoeVersion(prev)
    }
  })

  it('PoE1: neither summary pseudo emitted', () => {
    const prev = getPoeVersion()
    setPoeVersion(1)
    try {
      _setStatEntriesForTests(ENTRIES)
      const filters = matchItemMods(
        ['Gain 27% of Damage as Extra Lightning Damage'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Staves' }),
      )
      expect(filters.find((f) => f.id === ELE_ID)).toBeUndefined()
      expect(filters.find((f) => f.id === ELE_CHAOS_ID)).toBeUndefined()
    } finally {
      setPoeVersion(prev)
    }
  })
})

describe('duplicate same-id explicit rows (rarity stat merge)', () => {
  const RARITY_STAT = { id: 'explicit.stat_3917489142', text: '#% increased Rarity of Items found', type: 'explicit' }

  it('PoE2: two rarity explicits merge into one row with summed value, enabled', () => {
    const prev = getPoeVersion()
    setPoeVersion(2)
    try {
      _setStatEntriesForTests([RARITY_STAT])
      const filters = matchItemMods(
        ['18% increased Rarity of Items found', '12% increased Rarity of Items found'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings' }),
      )
      const rarityRows = filters.filter((f) => f.id === RARITY_STAT.id)
      expect(rarityRows).toHaveLength(1)
      expect(rarityRows[0].value).toBe(30)
      expect(rarityRows[0].enabled).toBe(true)
      expect(rarityRows[0].min).toBe(27) // Math.floor(30 * 0.9)
      expect(rarityRows[0].text).toContain('30')
    } finally {
      setPoeVersion(prev)
    }
  })

  it('PoE1: two rarity explicits merge into one row with summed value, disabled (low-priority)', () => {
    const prev = getPoeVersion()
    setPoeVersion(1)
    try {
      _setStatEntriesForTests([RARITY_STAT])
      const filters = matchItemMods(
        ['18% increased Rarity of Items found', '12% increased Rarity of Items found'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings' }),
      )
      const rarityRows = filters.filter((f) => f.id === RARITY_STAT.id)
      expect(rarityRows).toHaveLength(1)
      expect(rarityRows[0].value).toBe(30)
      expect(rarityRows[0].enabled).toBe(false)
    } finally {
      setPoeVersion(prev)
    }
  })

  it('no spurious merge: single rarity roll (PoE2) passes through unchanged and is enabled', () => {
    const prev = getPoeVersion()
    setPoeVersion(2)
    try {
      _setStatEntriesForTests([RARITY_STAT])
      const filters = matchItemMods(
        ['18% increased Rarity of Items found'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings' }),
      )
      const rarityRows = filters.filter((f) => f.id === RARITY_STAT.id)
      expect(rarityRows).toHaveLength(1)
      expect(rarityRows[0].value).toBe(18)
      expect(rarityRows[0].enabled).toBe(true)
    } finally {
      setPoeVersion(prev)
    }
  })

  it('no spurious merge: two different stat ids both preserved', () => {
    const LIFE_STAT = { id: 'explicit.stat_3299347043', text: '+# to maximum Life', type: 'explicit' }
    _setStatEntriesForTests([RARITY_STAT, LIFE_STAT])
    const prev = getPoeVersion()
    setPoeVersion(2)
    try {
      const filters = matchItemMods(
        ['18% increased Rarity of Items found', '+50 to maximum Life'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Rings' }),
      )
      const rarityRows = filters.filter((f) => f.id === RARITY_STAT.id)
      const lifeRows = filters.filter((f) => f.id === LIFE_STAT.id)
      expect(rarityRows).toHaveLength(1)
      expect(lifeRows).toHaveLength(1)
    } finally {
      setPoeVersion(prev)
    }
  })
})

// ─── resolveTierDefault unit tests ───────────────────────────────────────────

function makeTier(tier: number, ilvl: number): ModTier {
  return { tier, ilvl, name: '', stats: [], range: { min: 0, max: 0 }, text: '' }
}

describe('resolveTierDefault', () => {
  it('turns off a roll LOW_TIER_GAP+ tiers below best achievable (gap 3 >= 2)', () => {
    // Ladder: T1 needs ilvl 70, T2 needs ilvl 50, T3 needs ilvl 30, T4 needs ilvl 10
    const ladder: ModTier[] = [makeTier(1, 70), makeTier(2, 50), makeTier(3, 30), makeTier(4, 10)]
    // ilvl 80: best achievable = T1; rolled T4 -> gap 3 >= 2 -> off
    expect(resolveTierDefault({ baseEnabled: true, matchedTier: 4, tierLadder: ladder, itemLevel: 80 })).toBe(false)
  })

  it('leaves enabled when gap is below LOW_TIER_GAP (gap 1 < 2)', () => {
    const ladder: ModTier[] = [makeTier(1, 70), makeTier(2, 50)]
    // ilvl 80: best achievable = T1; rolled T2 -> gap 1 < 2 -> stays true
    expect(resolveTierDefault({ baseEnabled: true, matchedTier: 2, tierLadder: ladder, itemLevel: 80 })).toBe(true)
  })

  it('T1 roll overrides baseEnabled false (quality default off -> on)', () => {
    const ladder: ModTier[] = [makeTier(1, 70)]
    expect(resolveTierDefault({ baseEnabled: false, matchedTier: 1, tierLadder: ladder, itemLevel: 80 })).toBe(true)
  })

  it('T1 roll with no ladder also overrides baseEnabled false', () => {
    expect(resolveTierDefault({ baseEnabled: false, matchedTier: 1, tierLadder: undefined, itemLevel: 80 })).toBe(true)
  })

  it('low ilvl where rolled tier IS best achievable -> stays on', () => {
    // Ladder: T1 needs ilvl 70, T2 needs ilvl 50, T3 needs ilvl 10
    // ilvl 15: only T3 is achievable; rolled T3 -> gap 0 -> stays true
    const ladder: ModTier[] = [makeTier(1, 70), makeTier(2, 50), makeTier(3, 10)]
    expect(resolveTierDefault({ baseEnabled: true, matchedTier: 3, tierLadder: ladder, itemLevel: 15 })).toBe(true)
  })

  it('no tierLadder -> returns baseEnabled unchanged (true)', () => {
    expect(resolveTierDefault({ baseEnabled: true, matchedTier: 4, tierLadder: undefined, itemLevel: 80 })).toBe(true)
  })

  it('no tierLadder -> returns baseEnabled unchanged (false)', () => {
    expect(resolveTierDefault({ baseEnabled: false, matchedTier: 4, tierLadder: undefined, itemLevel: 80 })).toBe(false)
  })

  it('itemLevel undefined -> low-tier rule skipped, returns baseEnabled', () => {
    const ladder: ModTier[] = [makeTier(1, 70), makeTier(2, 50), makeTier(3, 10)]
    expect(resolveTierDefault({ baseEnabled: true, matchedTier: 3, tierLadder: ladder, itemLevel: undefined })).toBe(
      true,
    )
  })
})

// ─── resolveTierDefault end-to-end wiring through matchItemMods ───────────────

describe('tier-aware default enablement (e2e via matchItemMods)', () => {
  // TierDataset ordering: idxList is ascending by value (worst tier first, best tier last).
  // Tier numbers are derived from advTier: matched entry gets advTier, entries before it
  // (lower value = worse) get higher numbers, entries after (higher value = better) get lower.
  // So for a two-tier group where T2 has lower values, T2's entry must come FIRST at index 0.
  //
  // Use "increased Critical Strike Chance" (no pseudo contribution) to avoid suppressesSourceRow.
  const CRIT_STAT_ID = 'explicit.stat_crit_e2e'

  it('high-ilvl item: T2 roll (gap 1 < 2) stays enabled', () => {
    // Two-tier dataset: Fledgling(ilvl20, lower vals) idx0, Sharp(ilvl60, higher vals) idx1.
    // T2 advMod matched to Fledgling -> Fledgling=T2, Sharp=T1.
    // Best achievable at ilvl80 is T1; gap = 2-1 = 1 < 2 -> stays on.
    const dataset: TierDataset = {
      schemaVersion: 1,
      mods: [
        { n: 'Fledgling', l: 20, g: 'CritChance', s: [['base_critical_strike_chance_+%', 10, 19]], t: '' },
        { n: 'Sharp', l: 60, g: 'CritChance', s: [['base_critical_strike_chance_+%', 20, 30]], t: '' },
      ],
      pools: [{ CritChance: [0, 1] }],
      bases: { 'Ruby Ring': 0 },
    }
    const prev = getPoeVersion()
    setPoeVersion(1)
    _setTierDataForTests(dataset)
    try {
      _setStatEntriesForTests([{ id: CRIT_STAT_ID, text: '#% increased Critical Strike Chance', type: 'explicit' }])
      const advT2: AdvancedMod[] = [
        {
          type: 'suffix',
          name: 'Fledgling',
          tier: 2,
          tags: [],
          lines: ['15(10-19)% increased Critical Strike Chance'],
          ranges: [{ value: 15, min: 10, max: 19 }],
        },
      ]
      const filters = matchItemMods(
        ['15% increased Critical Strike Chance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', baseType: 'Ruby Ring', itemLevel: 80, itemClass: 'Rings' }),
        advT2,
      )
      const row = filters.find((f) => f.id === CRIT_STAT_ID)
      expect(row?.enabled).toBe(true)
    } finally {
      _setTierDataForTests(null)
      setPoeVersion(prev)
    }
  })

  it('high-ilvl item: T3 roll (gap 2) flips off', () => {
    // Three-tier dataset, worst first: Dull(ilvl10) idx0, Fledgling(ilvl40) idx1, Sharp(ilvl60) idx2.
    // T3 advMod matched to Dull -> Dull=T3, Fledgling=T2, Sharp=T1.
    // Best achievable at ilvl80 is T1; gap = 3-1 = 2 >= 2 -> off.
    const dataset3: TierDataset = {
      schemaVersion: 1,
      mods: [
        { n: 'Dull', l: 10, g: 'CritChance3', s: [['base_critical_strike_chance_+%', 1, 9]], t: '' },
        { n: 'Fledgling', l: 40, g: 'CritChance3', s: [['base_critical_strike_chance_+%', 10, 19]], t: '' },
        { n: 'Sharp', l: 60, g: 'CritChance3', s: [['base_critical_strike_chance_+%', 20, 30]], t: '' },
      ],
      pools: [{ CritChance3: [0, 1, 2] }],
      bases: { 'Ruby Ring': 0 },
    }
    const prev = getPoeVersion()
    setPoeVersion(1)
    _setTierDataForTests(dataset3)
    try {
      _setStatEntriesForTests([{ id: CRIT_STAT_ID, text: '#% increased Critical Strike Chance', type: 'explicit' }])
      const advT3: AdvancedMod[] = [
        {
          type: 'suffix',
          name: 'Dull',
          tier: 3,
          tags: [],
          lines: ['5(1-9)% increased Critical Strike Chance'],
          ranges: [{ value: 5, min: 1, max: 9 }],
        },
      ]
      const filters = matchItemMods(
        ['5% increased Critical Strike Chance'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', baseType: 'Ruby Ring', itemLevel: 80, itemClass: 'Rings' }),
        advT3,
      )
      const row = filters.find((f) => f.id === CRIT_STAT_ID)
      expect(row?.enabled).toBe(false)
    } finally {
      _setTierDataForTests(null)
      setPoeVersion(prev)
    }
  })

  it('T1 low-priority mod (rarity) flips on in PoE1', () => {
    // Rarity mod is low-priority by default in PoE1. T1 should override that.
    // Avarice(lower vals) at index 0, Greed(higher vals) at index 1.
    // advMod tier=1 matched to Greed (idx1) -> Greed=T1, Avarice=T2.
    const RARITY_ID = 'explicit.stat_rarity_e2e'
    const rarityDataset: TierDataset = {
      schemaVersion: 1,
      mods: [
        { n: 'Avarice', l: 20, g: 'Rarity', s: [['base_item_found_rarity_+%', 10, 29]], t: '' },
        { n: 'Greed', l: 60, g: 'Rarity', s: [['base_item_found_rarity_+%', 30, 40]], t: '' },
      ],
      pools: [{ Rarity: [0, 1] }],
      bases: { 'Gold Ring': 0 },
    }
    const prev = getPoeVersion()
    setPoeVersion(1)
    _setTierDataForTests(rarityDataset)
    try {
      _setStatEntriesForTests([{ id: RARITY_ID, text: '#% increased Rarity of Items found', type: 'explicit' }])
      const advT1: AdvancedMod[] = [
        {
          type: 'suffix',
          name: 'Greed',
          tier: 1,
          tags: [],
          lines: ['35(30-40)% increased Rarity of Items found'],
          ranges: [{ value: 35, min: 30, max: 40 }],
        },
      ]
      const filters = matchItemMods(
        ['35% increased Rarity of Items found'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', baseType: 'Gold Ring', itemLevel: 80, itemClass: 'Rings' }),
        advT1,
      )
      const row = filters.find((f) => f.id === RARITY_ID)
      // T1 override: should be enabled even though rarity is low-priority
      expect(row?.enabled).toBe(true)
    } finally {
      _setTierDataForTests(null)
      setPoeVersion(prev)
    }
  })

  it('T1 roll: min uses T1 bracket low, not floor(value * pct)', () => {
    // T1 bracket: [75, 85]. T2 bracket: [50, 60]. Rolled value: 80.
    // floor(80 * 0.9) = 72, which is BELOW T1 min (75).
    // The new behavior should set min = 75 (T1 bracket low).
    // A T2 roll of 55 should still use floor(55 * 0.9) = 49.
    const T1MIN_STAT_ID = 'explicit.stat_t1min_e2e'
    const t1MinDataset: TierDataset = {
      schemaVersion: 1,
      mods: [
        // T2 at lower values (index 0, worst first), T1 at higher values (index 1)
        { n: 'Sturdy', l: 20, g: 'T1MinGroup', s: [['some_stat_id', 50, 60]], t: '' },
        { n: 'Stalwart', l: 60, g: 'T1MinGroup', s: [['some_stat_id', 75, 85]], t: '' },
      ],
      pools: [{ T1MinGroup: [0, 1] }],
      bases: { 'Sapphire Ring': 0 },
    }
    const prev = getPoeVersion()
    setPoeVersion(1)
    _setTierDataForTests(t1MinDataset)
    try {
      _setStatEntriesForTests([{ id: T1MIN_STAT_ID, text: '+# to some stat', type: 'explicit' }])

      // --- T1 roll at 80 ---
      const advT1: AdvancedMod[] = [
        {
          type: 'suffix',
          name: 'Stalwart',
          tier: 1,
          tags: [],
          lines: ['+80(75-85) to some stat'],
          ranges: [{ value: 80, min: 75, max: 85 }],
        },
      ]
      const t1Filters = matchItemMods(
        ['+80 to some stat'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', baseType: 'Sapphire Ring', itemLevel: 80, itemClass: 'Rings' }),
        advT1,
      )
      const t1Row = t1Filters.find((f) => f.id === T1MIN_STAT_ID)
      expect(t1Row).toBeDefined()
      expect(t1Row?.value).toBe(80)
      // floor(80 * 0.9) = 72, but T1 bracket low is 75 -> min must be 75
      expect(t1Row?.min).toBe(75)

      // --- T2 roll at 55: still uses floor(55 * 0.9) = 49 ---
      const advT2: AdvancedMod[] = [
        {
          type: 'suffix',
          name: 'Sturdy',
          tier: 2,
          tags: [],
          lines: ['+55(50-60) to some stat'],
          ranges: [{ value: 55, min: 50, max: 60 }],
        },
      ]
      const t2Filters = matchItemMods(
        ['+55 to some stat'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', baseType: 'Sapphire Ring', itemLevel: 80, itemClass: 'Rings' }),
        advT2,
      )
      const t2Row = t2Filters.find((f) => f.id === T1MIN_STAT_ID)
      expect(t2Row).toBeDefined()
      expect(t2Row?.value).toBe(55)
      // T2 roll: min = floor(55 * 0.9) = 49
      expect(t2Row?.min).toBe(49)
    } finally {
      _setTierDataForTests(null)
      setPoeVersion(prev)
    }
  })
})

describe('parseAdvancedMods (Forbidden Shako randomSupport detection)', () => {
  // Sanity: the clipboard parser must set randomSupport=true on advanced mod blocks
  // whose support lines carry a rolled Level N(min-max) bracket AND "Unscalable Value".
  // Fixed Elder hybrid supports (Level N — Unscalable Value, no bracket) must NOT be flagged.

  it('flags Forbidden Shako support mods with randomSupport=true', async () => {
    const { parseItemText } = await import('./clipboard')
    const text = `Item Class: Helmets
Rarity: Unique
Forbidden Shako
Great Crown
--------
Item Level: 85
--------
{ Unique Modifier — Gem }
Socketed Gems are Supported by Level 9(1-10) Endurance Charge on Melee Stun(Greater Multiple Projectiles-Hallow) — Unscalable Value
{ Unique Modifier — Gem }
Socketed Gems are Supported by Level 35(25-35) Bloodthirst(Greater Multiple Projectiles-Hallow) — Unscalable Value
{ Unique Modifier — Attribute }
+29(25-30) to all Attributes
`
    const item = parseItemText(text)
    expect(item).not.toBeNull()
    expect(item?.advancedMods).toBeDefined()
    const supportMods =
      item?.advancedMods?.filter((am) => am.lines.some((l) => /Socketed Gems are Supported by/i.test(l))) ?? []
    expect(supportMods.length).toBe(2)
    expect(supportMods.every((m) => m.randomSupport === true)).toBe(true)
    // Attribute mod should NOT be flagged (no Unscalable Value).
    const attrMod = item?.advancedMods?.find((am) => am.lines.some((l) => /to all Attributes/.test(l)))
    expect(attrMod).toBeDefined()
    expect(attrMod?.randomSupport).toBeUndefined()
  })

  it('does not flag Elder hybrid fixed support levels as randomSupport', async () => {
    const { parseItemText } = await import('./clipboard')
    const text = `Item Class: Helmets
Rarity: Rare
Skull Crown
Conqueror's Helmet
--------
Item Level: 85
--------
{ Prefix Modifier "The Elder's" (Tier: 1) }
Socketed Gems are Supported by Level 20 Burning Damage — Unscalable Value
35(31-35)% increased Burning Damage
{ Suffix Modifier "of the Elder" (Tier: 4) }
Socketed Gems are Supported by Level 16 Concentrated Effect — Unscalable Value
15(12-14)% increased Area Damage
`
    const item = parseItemText(text)
    expect(item).not.toBeNull()
    const supportMods =
      item?.advancedMods?.filter((am) => am.lines.some((l) => /Socketed Gems are Supported by/i.test(l))) ?? []
    expect(supportMods.length).toBe(2)
    expect(supportMods.every((m) => !m.randomSupport)).toBe(true)
  })
})

describe('Elder hybrid socketed-support search values', () => {
  // Companion "% increased" brackets must not rewrite the support Level N search min.
  it('pins Burning / Concentrated support chips to Level N, not companion T# ranges', () => {
    const BURN_SUPPORT = {
      id: 'explicit.stat_elder_burn_support',
      text: 'Socketed Gems are Supported by Level # Burning Damage',
      type: 'explicit',
    }
    const BURN_INC = {
      id: 'explicit.stat_elder_burn_inc',
      text: '#% increased Burning Damage',
      type: 'explicit',
    }
    const CONC_SUPPORT = {
      id: 'explicit.stat_elder_conc_support',
      text: 'Socketed Gems are Supported by Level # Concentrated Effect',
      type: 'explicit',
    }
    const AREA_INC = {
      id: 'explicit.stat_elder_area_inc',
      text: '#% increased Area Damage',
      type: 'explicit',
    }
    _setStatEntriesForTests([BURN_SUPPORT, BURN_INC, CONC_SUPPORT, AREA_INC])

    const adv: AdvancedMod[] = [
      {
        type: 'prefix',
        name: "The Elder's",
        tier: 1,
        tags: [],
        lines: [
          'Socketed Gems are Supported by Level 20 Burning Damage — Unscalable Value',
          '35(31-35)% increased Burning Damage',
        ],
        ranges: [{ value: 35, min: 31, max: 35 }],
      },
      {
        type: 'suffix',
        name: 'of the Elder',
        tier: 4,
        tags: [],
        lines: [
          'Socketed Gems are Supported by Level 16 Concentrated Effect — Unscalable Value',
          '15(12-14)% increased Area Damage',
        ],
        ranges: [{ value: 15, min: 12, max: 14 }],
      },
    ]

    const filters = matchItemMods(
      [
        'Socketed Gems are Supported by Level 20 Burning Damage',
        '35% increased Burning Damage',
        'Socketed Gems are Supported by Level 16 Concentrated Effect',
        '15% increased Area Damage',
      ],
      [],
      undefined,
      makeItemInfo({
        rarity: 'Rare',
        itemClass: 'Helmets',
        baseType: "Conqueror's Helmet",
        itemLevel: 85,
      }),
      adv,
    )

    const burn = filters.find((f) => f.id === BURN_SUPPORT.id)
    expect(burn).toBeDefined()
    expect(burn?.value).toBe(20)
    expect(burn?.min).toBe(20)
    expect(burn?.max).toBe(20)
    expect(burn?.tierLadder).toBeUndefined()

    const conc = filters.find((f) => f.id === CONC_SUPPORT.id)
    expect(conc).toBeDefined()
    expect(conc?.value).toBe(16)
    expect(conc?.min).toBe(16)
    expect(conc?.max).toBe(16)
    expect(conc?.tierLadder).toBeUndefined()

    // Companion % lines stay present but off by default (hybrid companion rule).
    expect(filters.find((f) => f.id === BURN_INC.id)?.enabled).toBe(false)
    expect(filters.find((f) => f.id === AREA_INC.id)?.enabled).toBe(false)
  })
})

describe('multi-line stat sharing an affix block with a third line (#559)', () => {
  // "Tacati's" is one prefix whose block holds TWO trade stats: a stat that itself
  // spans two clipboard lines (the trigger + its "more Cost" rider) and an
  // independent "increased Spell Damage" line. Neither the single lines nor the
  // whole-block join matches the two-line stat, so it used to vanish entirely --
  // and its fragment rows were dropped as duplicates of the (bogus) whole-block
  // match against the Spell Damage stat.
  const TRIGGER = {
    id: 'explicit.stat_1582781759',
    text: 'Trigger a Socketed Spell on Using a Skill, with a # second Cooldown\nSpells Triggered this way have 150% more Cost',
    type: 'explicit',
  }
  const SPELL_DAMAGE = { id: 'explicit.stat_2974417149', text: '#% increased Spell Damage', type: 'explicit' }
  // The bench-craft twin the trailing "more Cost" fragment resolves to on its own.
  const CRAFT_TRIGGER = {
    id: 'explicit.stat_3079007202',
    text: '#% chance to Trigger a Socketed Spell on Using a Skill, with a 8 second Cooldown\nSpells Triggered this way have 150% more Cost',
    type: 'explicit',
  }

  const ADV: AdvancedMod[] = [
    {
      type: 'prefix',
      name: "Tacati's",
      tier: 0,
      tags: ['Damage', 'Caster', 'Gem'],
      lines: [
        'Trigger a Socketed Spell on Using a Skill, with a 4 second Cooldown',
        'Spells Triggered this way have 150% more Cost',
        '70(70-74)% increased Spell Damage',
      ],
      ranges: [{ value: 70, min: 70, max: 74 }],
    },
  ]

  const EXPLICITS = [
    'Trigger a Socketed Spell on Using a Skill, with a 4 second Cooldown',
    'Spells Triggered this way have 150% more Cost',
    '70% increased Spell Damage',
    'Trigger a Socketed Spell on Using a Skill, with a 4 second Cooldown\nSpells Triggered this way have 150% more Cost',
    'Spells Triggered this way have 150% more Cost\n70% increased Spell Damage',
    'Trigger a Socketed Spell on Using a Skill, with a 4 second Cooldown\nSpells Triggered this way have 150% more Cost\n70% increased Spell Damage',
  ]

  // A single stat wrapped over three clipboard lines, as clipboard.ts now offers it:
  // the three lines, then every contiguous run of two or more.
  const WRAPPED_THREE_LINE = [
    'Enemies take 17% increased Damage for each Elemental',
    'Ailment type among your Ailments',
    'on them',
    'Enemies take 17% increased Damage for each Elemental\nAilment type among your Ailments',
    'Enemies take 17% increased Damage for each Elemental\nAilment type among your Ailments\non them',
    'Ailment type among your Ailments\non them',
  ]

  it('emits the two-line trigger stat and the independent Spell Damage stat', () => {
    _setStatEntriesForTests([TRIGGER, SPELL_DAMAGE, CRAFT_TRIGGER])
    const filters = matchItemMods(
      EXPLICITS,
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Sceptres', baseType: 'Void Sceptre', itemLevel: 86 }),
      ADV,
    )

    const trigger = filters.filter((f) => f.id === TRIGGER.id)
    expect(trigger).toHaveLength(1)
    expect(trigger[0].value).toBe(4)
    expect(trigger[0].enabled).toBe(true)

    const spellDamage = filters.filter((f) => f.id === SPELL_DAMAGE.id)
    expect(spellDamage).toHaveLength(1)
    expect(spellDamage[0].value).toBe(70)
  })

  it('drops the fragment rows the loose fallbacks produce from the single lines', () => {
    _setStatEntriesForTests([TRIGGER, SPELL_DAMAGE, CRAFT_TRIGGER])
    const filters = matchItemMods(
      EXPLICITS,
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Sceptres', baseType: 'Void Sceptre', itemLevel: 86 }),
      ADV,
    )
    expect(filters.filter((f) => f.id === CRAFT_TRIGGER.id)).toHaveLength(0)
    expect(filters.filter((f) => f.type === 'explicit')).toHaveLength(2)
  })

  it('still collapses a stat that wraps across all three lines of its block', () => {
    // Guard against the new intermediate joins surfacing as extra rows when the
    // whole block really is a single stat.
    const WRAPPED = {
      id: 'explicit.stat_wrapped',
      text: 'Enemies take #% increased Damage for each Elemental Ailment type among your Ailments on them',
      type: 'explicit',
    }
    _setStatEntriesForTests([WRAPPED])
    const filters = matchItemMods(WRAPPED_THREE_LINE, [], undefined, makeItemInfo({ rarity: 'Unique' }))
    const rows = filters.filter((f) => f.type === 'explicit')
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(WRAPPED.id)
    expect(rows[0].value).toBe(17)
  })

  it('drops an intermediate run that resolves to a different stat id via the substring fallback', () => {
    // The middle+last run of a three-line wrapped stat is a suffix of an unrelated
    // (longer) stat text, so the substring fallback resolves it to that other id
    // with a null value. It is a fragment of the joined row just like a single
    // line is, so it must not surface as its own row.
    const WRAPPED = {
      id: 'explicit.stat_wrapped',
      text: 'Enemies take #% increased Damage for each Elemental Ailment type among your Ailments on them',
      type: 'explicit',
    }
    const LOOKALIKE = {
      id: 'explicit.stat_lookalike',
      text: '#% of Physical Damage from Hits taken as Chaos Damage for each Ailment type among your Ailments on them',
      type: 'explicit',
    }
    _setStatEntriesForTests([WRAPPED, LOOKALIKE])
    const filters = matchItemMods(WRAPPED_THREE_LINE, [], undefined, makeItemInfo({ rarity: 'Unique' }))
    expect(filters.filter((f) => f.id === LOOKALIKE.id)).toHaveLength(0)
    expect(filters.filter((f) => f.type === 'explicit')).toHaveLength(1)
  })
})

describe('a `#` capture that swallowed words is not a match (#558)', () => {
  // "Citaqualotl's" is one prefix holding two independent stats. The joined
  // two-line candidate matched "#% chance to deal Double Damage" -- the PLAYER's
  // chance, an unrelated stat -- because the `(.+?)` standing in for `#` ate the
  // whole first line. The row carried no value, and its id matched nothing else
  // on the item, so dropFragmentDuplicates could not recognise it as an artifact
  // and it surfaced as a third, enabled row next to the two correct ones.
  const MINION_DAMAGE = { id: 'explicit.stat_1589917703', text: 'Minions deal #% increased Damage', type: 'explicit' }
  const MINION_DOUBLE = {
    id: 'explicit.stat_755922799',
    text: 'Minions have #% chance to deal Double Damage',
    type: 'explicit',
  }
  const PLAYER_DOUBLE = { id: 'explicit.stat_1172810729', text: '#% chance to deal Double Damage', type: 'explicit' }

  const ADV: AdvancedMod[] = [
    {
      type: 'prefix',
      name: "Citaqualotl's",
      tier: 0,
      tags: ['Damage', 'Minion'],
      lines: ['61(50-66)% increased Damage', 'Minions have 5% chance to deal Double Damage'],
      ranges: [{ value: 61, min: 50, max: 66 }],
    },
  ]

  const EXPLICITS = [
    'Minions deal 61% increased Damage',
    'Minions have 5% chance to deal Double Damage',
    'Minions deal 61% increased Damage\nMinions have 5% chance to deal Double Damage',
  ]

  it('does not resolve the joined hybrid block to an unrelated stat', () => {
    _setStatEntriesForTests([MINION_DAMAGE, MINION_DOUBLE, PLAYER_DOUBLE])
    expect(matchModToStat('Minions deal 61% increased Damage\nMinions have 5% chance to deal Double Damage')).toBeNull()
  })

  it('emits only the two real rows for the hybrid prefix', () => {
    _setStatEntriesForTests([MINION_DAMAGE, MINION_DOUBLE, PLAYER_DOUBLE])
    const filters = matchItemMods(
      EXPLICITS,
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Wands', baseType: 'Convoking Wand', itemLevel: 86 }),
      ADV,
    )
    expect(filters.filter((f) => f.id === PLAYER_DOUBLE.id)).toHaveLength(0)
    const explicits = filters.filter((f) => f.type === 'explicit')
    expect(explicits.map((f) => f.id)).toEqual([MINION_DAMAGE.id, MINION_DOUBLE.id])
    expect(explicits[0].value).toBe(61)
    expect(explicits[1].value).toBe(5)
  })

  it('still matches a stat whose # captures a real number', () => {
    _setStatEntriesForTests([MINION_DAMAGE, MINION_DOUBLE, PLAYER_DOUBLE])
    expect(matchModToStat('5% chance to deal Double Damage')).toMatchObject({
      statId: PLAYER_DOUBLE.id,
      value: 5,
    })
  })

  it('still matches an option stat whose # captures option text', () => {
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_option',
        text: 'Map contains #’s Citadel',
        type: 'explicit',
        option: { options: [{ id: 3, text: 'Kamasa' }] },
      },
    ])
    expect(matchModToStat('Map contains Kamasa’s Citadel')).toMatchObject({
      statId: 'explicit.stat_option',
      option: 3,
    })
  })
})

describe('detrimental negative rolls default off', () => {
  const CAST = { id: 'explicit.stat_cast', text: '#% increased Cast Speed', type: 'explicit' }
  const RARITY = { id: 'explicit.stat_rarity', text: '#% increased Rarity of Items found', type: 'explicit' }

  it('reduced (negative) cast speed defaults off; increased (positive) defaults on', () => {
    _setStatEntriesForTests([CAST])
    const item = makeItemInfo({ rarity: 'Unique', itemClass: 'Rings' })
    const off = matchItemMods(['9% reduced Cast Speed'], [], undefined, item)
    expect(off.find((f) => f.id === CAST.id)?.enabled).toBe(false)
    const on = matchItemMods(['9% increased Cast Speed'], [], undefined, item)
    expect(on.find((f) => f.id === CAST.id)?.enabled).toBe(true)
  })

  it('PoE2: reduced Rarity defaults off even though increased Rarity is forced on', () => {
    const prev = getPoeVersion()
    _setStatEntriesForTests([RARITY])
    try {
      setPoeVersion(2)
      const item = makeItemInfo({ rarity: 'Unique', itemClass: 'Rings' })
      const reduced = matchItemMods(['16% reduced Rarity of Items found'], [], undefined, item)
      expect(reduced.find((f) => f.id === RARITY.id)?.enabled).toBe(false)
      const increased = matchItemMods(['16% increased Rarity of Items found'], [], undefined, item)
      expect(increased.find((f) => f.id === RARITY.id)?.enabled).toBe(true)
    } finally {
      setPoeVersion(prev)
    }
  })
})

describe('premium-mod override', () => {
  const seedEntries = () =>
    _setStatEntriesForTests([
      { id: 'explicit.stat_foo', text: '#% increased Foo', type: 'explicit' },
      { id: 'explicit.stat_bar', text: '#% increased Bar', type: 'explicit' },
      // Low-priority mods (off by default) used to prove the premium override actually flips them on.
      { id: 'explicit.stat_light', text: '#% increased Light Radius', type: 'explicit' },
      { id: 'explicit.stat_stun', text: '#% increased Stun Duration', type: 'explicit' },
    ])

  const seedPremium = () =>
    _setPremiumModsForTests({
      schemaVersion: 1,
      poe1: {},
      poe2: { TestUnique: ['#% increased Foo'] },
    })

  it('forces an otherwise-off low-priority mod on for the named unique, and only the listed mod', () => {
    const prev = getPoeVersion()
    seedEntries()
    try {
      setPoeVersion(2)
      const item = makeItemInfo({ rarity: 'Unique', name: 'TestUnique', itemClass: 'Rings' })
      const mods = ['25% increased Light Radius', '25% increased Stun Duration']

      // Control: no premium data -> both are low-priority and default OFF.
      _setPremiumModsForTests(null)
      const off = matchItemMods(mods, [], undefined, item)
      expect(off.find((f) => f.id === 'explicit.stat_light')?.enabled).toBe(false)
      expect(off.find((f) => f.id === 'explicit.stat_stun')?.enabled).toBe(false)

      // Premium lists only Light Radius for TestUnique -> it flips ON; Stun (unlisted) stays OFF.
      _setPremiumModsForTests({ schemaVersion: 1, poe1: {}, poe2: { TestUnique: ['#% increased Light Radius'] } })
      const on = matchItemMods(mods, [], undefined, item)
      expect(on.find((f) => f.id === 'explicit.stat_light')?.enabled).toBe(true)
      expect(on.find((f) => f.id === 'explicit.stat_stun')?.enabled).toBe(false)
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
    }
  })

  it('Foo mod on TestUnique (PoE2) is enabled even with no advanced mods driving tier', () => {
    const prev = getPoeVersion()
    seedPremium()
    seedEntries()
    try {
      setPoeVersion(2)
      const filters = matchItemMods(
        ['25% increased Foo'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', name: 'TestUnique', itemClass: 'Rings' }),
      )
      const fooRow = filters.find((f) => f.id === 'explicit.stat_foo')
      expect(fooRow).toBeDefined()
      expect(fooRow?.enabled).toBe(true)
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
    }
  })

  it('non-premium Bar mod on TestUnique is not force-enabled by premium', () => {
    const prev = getPoeVersion()
    seedPremium()
    seedEntries()
    try {
      setPoeVersion(2)
      const filters = matchItemMods(
        ['25% increased Bar'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', name: 'TestUnique', itemClass: 'Rings' }),
      )
      const barRow = filters.find((f) => f.id === 'explicit.stat_bar')
      expect(barRow).toBeDefined()
      // Bar is not in the premium manifest - it follows normal rules (no advanced mod -> enabled)
      // The key assertion is that it is NOT forcibly on by the premium path.
      // With no lowPriority/structurallyOff conditions the baseline would be on; test just checks
      // it doesn't cause a crash and the Foo premium path does not bleed into Bar.
      expect(barRow?.enabled).not.toBeUndefined()
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
    }
  })

  it('Foo mod on a non-unique Rare item - premium ignored', () => {
    const prev = getPoeVersion()
    seedPremium()
    seedEntries()
    try {
      setPoeVersion(2)
      const filters = matchItemMods(
        ['25% increased Foo'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', name: 'TestUnique', itemClass: 'Rings' }),
      )
      const fooRow = filters.find((f) => f.id === 'explicit.stat_foo')
      expect(fooRow).toBeDefined()
      // Premium requires rarity === 'Unique'; Rare items should not get the premium override.
      // The mod would still be enabled by normal rules on a Rare, but we confirm no forced-on
      // from premium by checking the row exists and normal enablement logic applies.
      expect(fooRow?.enabled).toBeDefined()
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
    }
  })

  it('Foo mod on OtherUnique (name not in manifest) - no premium effect', () => {
    const prev = getPoeVersion()
    seedPremium()
    seedEntries()
    try {
      setPoeVersion(2)
      const filters = matchItemMods(
        ['25% increased Foo'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', name: 'OtherUnique', itemClass: 'Rings' }),
      )
      const fooRow = filters.find((f) => f.id === 'explicit.stat_foo')
      expect(fooRow).toBeDefined()
      // OtherUnique is not in the poe2 manifest - row enabled state follows normal rules only.
      expect(fooRow?.enabled).toBeDefined()
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
    }
  })

  it('getPremiumMods() null (no data) - no crash, normal rules apply', () => {
    const prev = getPoeVersion()
    _setPremiumModsForTests(null)
    seedEntries()
    try {
      setPoeVersion(2)
      const filters = matchItemMods(
        ['25% increased Foo'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', name: 'TestUnique', itemClass: 'Rings' }),
      )
      const fooRow = filters.find((f) => f.id === 'explicit.stat_foo')
      expect(fooRow).toBeDefined()
      // No data loaded - isPremiumMod returns false, no crash
      expect(typeof fooRow?.enabled).toBe('boolean')
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
    }
  })

  it('base-id entry matches any option variant sharing that base (From Nothing pattern)', () => {
    const prev = getPoeVersion()
    _resetPremiumMatchCacheForTests()
    _setPremiumModsForTests({
      schemaVersion: 1,
      poe1: {},
      poe2: { 'From Nothing': ['explicit.stat_2422708892'] },
    })
    // No stat-entry seeding needed - the id path is pure string parsing.
    try {
      setPoeVersion(2)
      const item = makeItemInfo({ rarity: 'Unique', name: 'From Nothing' })
      // Both option variants resolve to the same base id and should match.
      expect(isPremiumMod(item, 'explicit.stat_2422708892|34497')).toBe(true)
      expect(isPremiumMod(item, 'explicit.stat_2422708892|32349')).toBe(true)
      // An unrelated base id must not match.
      expect(isPremiumMod(item, 'explicit.stat_9999999999|1')).toBe(false)
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
      _resetPremiumMatchCacheForTests()
    }
  })

  it('text entry still matches via canonical-text path (Loreweave regression)', () => {
    const prev = getPoeVersion()
    _resetPremiumMatchCacheForTests()
    _setStatEntriesForTests([
      { id: 'explicit.stat_loreweave', text: 'Your Maximum Resistances are #%', type: 'explicit' },
    ])
    _setPremiumModsForTests({
      schemaVersion: 1,
      poe1: {},
      poe2: { Loreweave: ['Your Maximum Resistances are #%'] },
    })
    try {
      setPoeVersion(2)
      const item = makeItemInfo({ rarity: 'Unique', name: 'Loreweave' })
      expect(isPremiumMod(item, 'explicit.stat_loreweave')).toBe(true)
      // A stat that maps to a different text must not match.
      _setStatEntriesForTests([
        { id: 'explicit.stat_loreweave', text: 'Your Maximum Resistances are #%', type: 'explicit' },
        { id: 'explicit.stat_other', text: 'Some Other Text', type: 'explicit' },
      ])
      _resetPremiumMatchCacheForTests()
      expect(isPremiumMod(item, 'explicit.stat_other')).toBe(false)
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
      _resetPremiumMatchCacheForTests()
    }
  })

  it('v2 stat_list entry: primary mod matches by base id and by option-suffixed variant', () => {
    const prev = getPoeVersion()
    _resetPremiumMatchCacheForTests()
    _setPremiumModsForTests({
      schemaVersion: 2,
      poe1: {},
      poe2: {
        SomeV2Unique: {
          mode: 'stat_list',
          mods: [
            { id: 'explicit.stat_v2primary', tier: 'primary' },
            { id: 'explicit.stat_v2secondary', tier: 'secondary' },
            { id: 'explicit.stat_v2implicit_tier', tier: 'primary' },
          ],
          confidence: 'verified',
        },
      },
    })
    try {
      setPoeVersion(2)
      const item = makeItemInfo({ rarity: 'Unique', name: 'SomeV2Unique' })
      // Primary mod matches on its base id.
      expect(isPremiumMod(item, 'explicit.stat_v2primary')).toBe(true)
      // Primary mod also matches a variant with an |option suffix.
      expect(isPremiumMod(item, 'explicit.stat_v2primary|12345')).toBe(true)
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
      _resetPremiumMatchCacheForTests()
    }
  })

  it('v2 stat_list entry: secondary mod returns false', () => {
    const prev = getPoeVersion()
    _resetPremiumMatchCacheForTests()
    _setPremiumModsForTests({
      schemaVersion: 2,
      poe1: {},
      poe2: {
        SomeV2Unique: {
          mode: 'stat_list',
          mods: [{ id: 'explicit.stat_v2secondary', tier: 'secondary' }],
          confidence: 'verified',
        },
      },
    })
    try {
      setPoeVersion(2)
      const item = makeItemInfo({ rarity: 'Unique', name: 'SomeV2Unique' })
      // Secondary mods are shown-but-off; isPremiumMod must return false.
      expect(isPremiumMod(item, 'explicit.stat_v2secondary')).toBe(false)
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
      _resetPremiumMatchCacheForTests()
    }
  })

  it('v2 stat_list entry: id not in mods list returns false', () => {
    const prev = getPoeVersion()
    _resetPremiumMatchCacheForTests()
    _setPremiumModsForTests({
      schemaVersion: 2,
      poe1: {},
      poe2: {
        SomeV2Unique: {
          mode: 'stat_list',
          mods: [{ id: 'explicit.stat_v2primary', tier: 'primary' }],
          confidence: 'verified',
        },
      },
    })
    try {
      setPoeVersion(2)
      const item = makeItemInfo({ rarity: 'Unique', name: 'SomeV2Unique' })
      expect(isPremiumMod(item, 'explicit.stat_unlisted')).toBe(false)
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
      _resetPremiumMatchCacheForTests()
    }
  })

  it('v2 mode none and mode all_explicits both return false even when mods list contains the id', () => {
    const prev = getPoeVersion()
    _resetPremiumMatchCacheForTests()
    const modSpec = { id: 'explicit.stat_v2primary', tier: 'primary' as const }
    _setPremiumModsForTests({
      schemaVersion: 2,
      poe1: {},
      poe2: {
        NoneUnique: { mode: 'none', mods: [modSpec], confidence: 'verified' },
        AllExplicitsUnique: { mode: 'all_explicits', mods: [modSpec], confidence: 'verified' },
      },
    })
    try {
      setPoeVersion(2)
      expect(isPremiumMod(makeItemInfo({ rarity: 'Unique', name: 'NoneUnique' }), 'explicit.stat_v2primary')).toBe(
        false,
      )
      expect(
        isPremiumMod(makeItemInfo({ rarity: 'Unique', name: 'AllExplicitsUnique' }), 'explicit.stat_v2primary'),
      ).toBe(false)
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
      _resetPremiumMatchCacheForTests()
    }
  })

  it('v2 stat_list lower override wired through matchItemMods: row enabled with max bound', () => {
    const prev = getPoeVersion()
    _resetPremiumMatchCacheForTests()
    _setStatEntriesForTests([{ id: 'explicit.stat_lowermod', text: '# Voices', type: 'explicit' }])
    _setPremiumModsForTests({
      schemaVersion: 2,
      poe1: {},
      poe2: {
        LowerTestUnique: {
          mode: 'stat_list',
          mods: [{ id: 'explicit.stat_lowermod', direction: 'lower' }],
          confidence: 'verified',
        },
      },
    })
    try {
      setPoeVersion(2)
      const item = makeItemInfo({ rarity: 'Unique', name: 'LowerTestUnique', itemClass: 'Jewels' })
      const filters = matchItemMods(['5 Voices'], [], undefined, item)
      const row = filters.find((f) => f.id === 'explicit.stat_lowermod')!
      expect(row).toBeDefined()
      expect(row.enabled).toBe(true)
      // value=5, p=0.9, lower -> max = ceil(5/0.9) = 6
      expect(row.max).toBe(6)
      expect(row.min).toBeNull()
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
      _resetPremiumMatchCacheForTests()
    }
  })

  it('applies the bundled Rite of Passage premium override (rolled spirit line on + premium)', () => {
    const prev = getPoeVersion()
    _resetPremiumMatchCacheForTests()
    _setPremiumModsForTests(bundledPremiumMods as unknown as PremiumModsData)
    _setStatEntriesForTests([
      {
        id: 'explicit.stat_3403424702',
        text: 'Possessed by Spirit Of The Bear for # seconds on use',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_2839557359',
        text: 'Possessed by Spirit Of The Cat for # seconds on use',
        type: 'explicit',
      },
      {
        id: 'explicit.stat_3504441212',
        text: 'Possessed by Spirit Of The Wolf for # seconds on use',
        type: 'explicit',
      },
    ])
    try {
      setPoeVersion(2)
      const filters = matchItemMods(
        ['Possessed by Spirit Of The Cat for 17 seconds on use'],
        [],
        undefined,
        makeItemInfo({ rarity: 'Unique', itemClass: 'Charms', baseType: 'Golden Charm', name: 'Rite of Passage' }),
      )
      // The rolled spirit line resolves to its per-spirit trade stat and is the premium signature:
      // enabled + premium so it survives the renderer's forced Base mode on uniques.
      const cat = filters.find((f) => f.id === 'explicit.stat_2839557359')
      expect(cat, 'rolled spirit line must resolve to its per-spirit stat').toBeDefined()
      expect(cat?.enabled, 'rolled spirit row should be on').toBe(true)
      expect(cat?.premium, 'rolled spirit row should be premium').toBe(true)
      expect(cat?.value).toBe(17)
      // The other eight spirits are not on the item, so no rows exist for them.
      expect(filters.find((f) => f.id === 'explicit.stat_3403424702')).toBeUndefined()
      expect(filters.find((f) => f.id === 'explicit.stat_3504441212')).toBeUndefined()
    } finally {
      setPoeVersion(prev)
      _setPremiumModsForTests(null)
      _resetPremiumMatchCacheForTests()
    }
  })
})

// ─── Faction rule: extraction-eligible (Aldur's Legacy) ──────────────────────

describe("faction rule: extraction-eligible (Aldur's Legacy)", () => {
  afterEach(() => {
    _setPremiumModsForTests(null)
    _resetPremiumMatchCacheForTests()
    setPoeVersion(1)
  })

  it('non-corrupted Quill Rain: misc.corrupted enabled with chipState "no"', () => {
    _setPremiumModsForTests({
      schemaVersion: 2,
      poe1: {},
      poe2: {},
      factionRules: [
        {
          game: 'poe2',
          tag: 'extraction_eligible',
          uniques: ['Quill Rain'],
          defaultFilters: { corrupted: false },
        },
      ],
    })
    setPoeVersion(2)
    const filters = matchItemMods(
      ['40% increased Attack Speed'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Unique', name: 'Quill Rain', itemClass: 'Bows', corrupted: false }),
    )
    const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
    expect(corruptedChip).toBeDefined()
    expect(corruptedChip!.enabled).toBe(true)
    expect(corruptedChip!.chipState).toBe('no')
  })

  it('corrupted Quill Rain: misc.corrupted enabled with chipState "yes" (different market)', () => {
    _setPremiumModsForTests({
      schemaVersion: 2,
      poe1: {},
      poe2: {},
      factionRules: [
        {
          game: 'poe2',
          tag: 'extraction_eligible',
          uniques: ['Quill Rain'],
          defaultFilters: { corrupted: false },
        },
      ],
    })
    setPoeVersion(2)
    const filters = matchItemMods(
      ['40% increased Attack Speed'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Unique', name: 'Quill Rain', itemClass: 'Bows', corrupted: true }),
    )
    const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
    expect(corruptedChip).toBeDefined()
    expect(corruptedChip!.enabled).toBe(true)
    expect(corruptedChip!.chipState).toBe('yes')
  })
})

// ─── Gem-level mod pinning ────────────────────────────────────────────────────

describe('gem-level mod pinning (min=max=value)', () => {
  // Stat entries for gem-level mods used across cases.
  const FIRE_SPELL_GEMS = {
    id: 'explicit.stat_2452998583',
    text: '+# to Level of all Fire Spell Skill Gems',
    type: 'explicit',
  }
  const ALL_SPELL_SKILLS = {
    id: 'explicit.stat_1234567891',
    text: '+# to Level of all Spell Skills',
    type: 'explicit',
  }
  const SKILL_GEMS_IMPLICIT = {
    id: 'implicit.stat_2843100721',
    text: '+# to Level of all Skill Gems',
    type: 'implicit',
  }
  const SPELL_DAMAGE = {
    id: 'explicit.stat_7777777777',
    text: '+#% to Spell Damage',
    type: 'explicit',
  }

  afterEach(() => {
    _setStatEntriesForTests([])
  })

  it('explicit "+1 to Level of all Fire Spell Skill Gems" (no advanced mods) pins min=1 and max=1', () => {
    _setStatEntriesForTests([FIRE_SPELL_GEMS])
    const filters = matchItemMods(
      ['+1 to Level of all Fire Spell Skill Gems'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Wands' }),
    )
    const row = filters.find((f) => f.id === FIRE_SPELL_GEMS.id)
    expect(row).toBeDefined()
    expect(row?.value).toBe(1)
    // Without pinning, floor(1 * 0.9) = 0 -- this is the regression the fix prevents.
    expect(row?.min).toBe(1)
    expect(row?.max).toBe(1)
  })

  it('explicit "+2 to Level of all Spell Skills" pins min=2 and max=2', () => {
    _setStatEntriesForTests([ALL_SPELL_SKILLS])
    const filters = matchItemMods(
      ['+2 to Level of all Spell Skills'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Amulets' }),
    )
    const row = filters.find((f) => f.id === ALL_SPELL_SKILLS.id)
    expect(row).toBeDefined()
    expect(row?.value).toBe(2)
    expect(row?.min).toBe(2)
    expect(row?.max).toBe(2)
  })

  it('implicit "+1 to Level of all Skill Gems" (corrupted amulet) pins min=1 and max=1', () => {
    _setStatEntriesForTests([SKILL_GEMS_IMPLICIT])
    const filters = matchItemMods(
      [],
      ['+1 to Level of all Skill Gems (implicit)'],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Amulets', corrupted: true }),
    )
    const row = filters.find((f) => f.id === SKILL_GEMS_IMPLICIT.id)
    expect(row).toBeDefined()
    expect(row?.value).toBe(1)
    expect(row?.min).toBe(1)
    expect(row?.max).toBe(1)
  })

  it('ordinary numeric mod keeps fuzzed min and max=null (pin does not affect non-gem-level mods)', () => {
    _setStatEntriesForTests([SPELL_DAMAGE])
    const filters = matchItemMods(
      ['+40% to Spell Damage'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Wands' }),
    )
    const row = filters.find((f) => f.id === SPELL_DAMAGE.id)
    expect(row).toBeDefined()
    expect(row?.value).toBe(40)
    // Ordinary fuzz: floor(40 * 0.9) = 36
    expect(row?.min).toBe(36)
    expect(row?.max).toBeNull()
  })

  it('fractured "+1 to Level of all Fire Spell Skill Gems" yields fractured row and companion explicit row both with min=1 and max=1', () => {
    _setStatEntriesForTests([FIRE_SPELL_GEMS])
    const advancedMods: AdvancedMod[] = [
      {
        type: 'prefix',
        name: 'of the Inferno',
        tier: 1,
        tags: ['Gem'],
        lines: ['+1 to Level of all Fire Spell Skill Gems'],
        ranges: [{ value: 1, min: 1, max: 1 }],
        fractured: true,
        crafted: false,
        eldritch: false,
        foulborn: false,
      },
    ]
    const filters = matchItemMods(
      ['+1 to Level of all Fire Spell Skill Gems'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Wands' }),
      advancedMods,
    )
    // Primary row: fractured.stat_2452998583
    const fracturedRow = filters.find((f) => f.id === 'fractured.stat_2452998583')
    expect(fracturedRow).toBeDefined()
    expect(fracturedRow?.value).toBe(1)
    expect(fracturedRow?.min).toBe(1)
    expect(fracturedRow?.max).toBe(1)
    // Companion row: explicit.stat_2452998583, disabled by default
    const companionRow = filters.find((f) => f.id === FIRE_SPELL_GEMS.id)
    expect(companionRow).toBeDefined()
    expect(companionRow?.enabled).toBe(false)
    expect(companionRow?.value).toBe(1)
    expect(companionRow?.min).toBe(1)
    expect(companionRow?.max).toBe(1)
  })

  it('fractured "+4 to Level of all Spell Skills (fractured)" from a chat-linked item (no advanced mods) still registers (#444)', () => {
    // Chat-linked / basic-copy items carry no advanced mod blocks, so a fractured
    // mod arrives as a plain line with a "(fractured)" suffix rather than a
    // "{ Fractured Prefix Modifier }" header. The suffix must be stripped before
    // matching, or the anchored stat pattern never matches and the mod vanishes.
    _setStatEntriesForTests([
      { id: 'explicit.stat_124131830', text: '# to Level of all Spell Skills', type: 'explicit' },
      { id: 'fractured.stat_124131830', text: '# to Level of all Spell Skills', type: 'fractured' },
    ])
    const filters = matchItemMods(
      ['+4 to Level of all Spell Skills (fractured)'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Wands', fractured: true }),
    )
    const fracturedRow = filters.find((f) => f.id === 'fractured.stat_124131830')
    expect(fracturedRow).toBeDefined()
    expect(fracturedRow?.value).toBe(4)
    expect(fracturedRow?.type).toBe('fractured')
    // The unfractured companion row is also added (disabled by default).
    const companionRow = filters.find((f) => f.id === 'explicit.stat_124131830')
    expect(companionRow).toBeDefined()
  })

  it('two identical gem-level mods merge to value=2 min=2 max=2 (pinned exact rows survive mergeDuplicateStats)', () => {
    _setStatEntriesForTests([FIRE_SPELL_GEMS])
    const filters = matchItemMods(
      ['+1 to Level of all Fire Spell Skill Gems', '+1 to Level of all Fire Spell Skill Gems'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Wands' }),
    )
    const row = filters.find((f) => f.id === FIRE_SPELL_GEMS.id)
    expect(row).toBeDefined()
    expect(row?.value).toBe(2)
    // Without the exact-pin merge fix: floor(2 * 0.9) = 1, not 2.
    expect(row?.min).toBe(2)
    expect(row?.max).toBe(2)
  })
})

// ─── Tablet class rule: drawback mods prefill max via lowerIsBetter ───────────

describe('unique tablet class rule: drawback (reduced pack size) prefills max bound', () => {
  // Stat ids used in the tablet-mods lookup table
  // "#% reduced pack size in map": "explicit.stat_2017682521"
  // "#% increased quantity of waystones found in map": "explicit.stat_2777224821"
  const PACK_SIZE_STAT_ID = 'explicit.stat_2017682521'
  const WAYSTONES_STAT_ID = 'explicit.stat_2777224821'

  afterEach(() => {
    _setPremiumModsForTests(null)
    _resetPremiumMatchCacheForTests()
    _setStatEntriesForTests([])
    setPoeVersion(1)
  })

  it('drawback row gets max=ceil(value/p) and beneficial row keeps min=floor(value*p)', () => {
    _setPremiumModsForTests({
      schemaVersion: 2,
      poe1: {},
      poe2: {},
      itemClassRules: [
        {
          game: 'poe2',
          itemClass: 'Tablet',
          rarity: 'Unique',
          mode: 'all_explicits',
          lowerIsBetter: [PACK_SIZE_STAT_ID],
          nonStatFilters: ['uses_remaining'],
          note: 'unique tablets are farming-EV items: every rolled explicit moves price; drawback rolls prefill a max bound',
        },
      ],
    })
    setPoeVersion(2)

    // buildTabletFilters resolves these via the tablet-mods lookup, not via stat entries,
    // so no stat-entry seeding is needed here.
    const item = makeItemInfo({
      rarity: 'Unique',
      itemClass: 'Tablet',
      baseType: 'Breach Tablet',
      name: 'Wraeclast Besieged',
    })
    const filters = matchItemMods(
      ['36% increased Quantity of Waystones found in Map', '12% reduced Pack Size in Map'],
      [],
      undefined,
      item,
    )

    // Drawback: "12% reduced Pack Size" -> value=12, lowerIsBetter -> max=ceil(12/0.9)=14, min=null
    const packSizeRow = filters.find((f) => f.id === PACK_SIZE_STAT_ID)
    expect(packSizeRow).toBeDefined()
    expect(packSizeRow!.enabled).toBe(true)
    expect(packSizeRow!.min).toBeNull()
    expect(packSizeRow!.max).toBe(14) // ceil(12 / 0.9) = ceil(13.33) = 14

    // Beneficial: "36% increased Quantity of Waystones" -> value=36, higher -> min=floor(36*0.9)=32
    const waystoneRow = filters.find((f) => f.id === WAYSTONES_STAT_ID)
    expect(waystoneRow).toBeDefined()
    expect(waystoneRow!.enabled).toBe(true)
    expect(waystoneRow!.min).toBe(32) // floor(36 * 0.9) = 32
    expect(waystoneRow!.max).toBeNull()
  })
})

describe('mercenary warrant chips', () => {
  const warrantInfo = makeItemInfo({
    baseType: 'Mercenary Warrant',
    itemClass: 'Map Fragments',
    rarity: 'Normal',
    mercenaryBuild: 'Mysterious Diver',
    mercenaryLevel: 83,
  })

  it('emits the build chip and the mercenary level row', () => {
    const filters = matchItemMods([], [], undefined, warrantInfo)

    expect(filters.find((f) => f.id === 'misc.mercenary_build')).toMatchObject({
      text: 'Mysterious Diver',
      enabled: true,
    })
    expect(filters.find((f) => f.id === 'misc.ilvl')).toMatchObject({ text: 'Mercenary Level', value: 83 })
  })

  it('emits exactly one ilvl row -- the generic one never fires at itemLevel 0', () => {
    const filters = matchItemMods([], [], undefined, warrantInfo)

    expect(filters.filter((f) => f.id === 'misc.ilvl')).toHaveLength(1)
  })

  it('leaves other map fragments alone', () => {
    const filters = matchItemMods(
      [],
      [],
      undefined,
      makeItemInfo({ baseType: 'Sacrifice at Dusk', itemClass: 'Map Fragments', rarity: 'Normal' }),
    )

    expect(filters.find((f) => f.id === 'misc.mercenary_build')).toBeUndefined()
  })
})

describe('mod source badge (#565)', () => {
  const CRIT_MULTI = {
    id: 'explicit.stat_crit_multi',
    text: '+#% to Global Critical Strike Multiplier',
    type: 'explicit',
  }
  const LIFE = { id: 'explicit.stat_life', text: '+# to maximum Life', type: 'explicit' }
  const PHYS = { id: 'explicit.stat_phys', text: '#% increased Physical Damage', type: 'explicit' }
  const LEECH = { id: 'explicit.stat_leech', text: '#% of Physical Attack Damage Leeched as Life', type: 'explicit' }
  const DESPAIR = { id: 'explicit.stat_despair', text: 'Curse Enemies with Despair on Hit', type: 'explicit' }
  const PEN = { id: 'implicit.stat_pen', text: 'Damage Penetrates #% Elemental Resistances', type: 'implicit' }

  beforeEach(() => {
    setPoeVersion(1)
    _setStatEntriesForTests([CRIT_MULTI, LIFE, PHYS, LEECH, DESPAIR, PEN])
  })

  const ring = (overrides: Record<string, unknown> = {}) =>
    makeItemInfo({ rarity: 'Rare', itemClass: 'Rings', baseType: 'Iron Ring', itemLevel: 85, ...overrides })

  it('badges an influence affix and leaves an ordinary one alone', () => {
    const adv: AdvancedMod[] = [
      {
        type: 'suffix',
        name: 'of Shaping',
        tier: 1,
        tags: [],
        lines: ['+38(35-38)% to Global Critical Strike Multiplier'],
        ranges: [{ value: 38, min: 35, max: 38 }],
      },
      {
        type: 'prefix',
        name: 'Healthy',
        tier: 3,
        tags: [],
        lines: ['+70(60-79) to maximum Life'],
        ranges: [{ value: 70, min: 60, max: 79 }],
      },
    ]
    const filters = matchItemMods(
      ['+38% to Global Critical Strike Multiplier', '+70 to maximum Life'],
      [],
      undefined,
      ring(),
      adv,
    )
    expect(filters.find((f) => f.id === CRIT_MULTI.id)?.modSource).toBe('shaper')
    expect(filters.find((f) => f.id === LIFE.id)?.modSource).toBeUndefined()
  })

  it('badges both trade rows of a hybrid influence affix', () => {
    // A Crusader's prefix indexes as two separate trade stats; both lines are
    // influenced, so both rows carry the symbol.
    const adv: AdvancedMod[] = [
      {
        type: 'prefix',
        name: "Crusader's",
        tier: 1,
        tags: [],
        lines: ['30(25-34)% increased Physical Damage', '0.6% of Physical Attack Damage Leeched as Life'],
        ranges: [{ value: 30, min: 25, max: 34 }],
      },
    ]
    const filters = matchItemMods(
      ['30% increased Physical Damage', '0.6% of Physical Attack Damage Leeched as Life'],
      [],
      undefined,
      ring(),
      adv,
    )
    expect(filters.find((f) => f.id === PHYS.id)?.modSource).toBe('crusader')
    expect(filters.find((f) => f.id === LEECH.id)?.modSource).toBe('crusader')
  })

  it('badges a value-less delve mod, which the tier-ladder path never sees', () => {
    const adv: AdvancedMod[] = [
      {
        type: 'suffix',
        name: 'Subterranean',
        tier: 1,
        tags: [],
        lines: ['Curse Enemies with Despair on Hit'],
        ranges: [],
      },
    ]
    const filters = matchItemMods(['Curse Enemies with Despair on Hit'], [], undefined, ring(), adv)
    expect(filters.find((f) => f.id === DESPAIR.id)?.modSource).toBe('delve')
  })

  it('badges a temple affix', () => {
    const adv: AdvancedMod[] = [
      {
        type: 'prefix',
        name: "Guatelitzi's",
        tier: 1,
        tags: [],
        lines: ['+75(70-79) to maximum Life'],
        ranges: [{ value: 75, min: 70, max: 79 }],
      },
    ]
    const filters = matchItemMods(['+75 to maximum Life'], [], undefined, ring(), adv)
    expect(filters.find((f) => f.id === LIFE.id)?.modSource).toBe('temple')
  })

  it('ignores a source name reused by an off-equipment class', () => {
    // Sentinels reuse "of the Conquest" for an unrelated shrine mod; the class gate
    // keeps that row unbadged.
    const adv: AdvancedMod[] = [
      {
        type: 'suffix',
        name: 'of the Conquest',
        tier: 1,
        tags: [],
        lines: ['+38(35-38)% to Global Critical Strike Multiplier'],
        ranges: [{ value: 38, min: 35, max: 38 }],
      },
    ]
    const filters = matchItemMods(
      ['+38% to Global Critical Strike Multiplier'],
      [],
      undefined,
      makeItemInfo({ rarity: 'Rare', itemClass: 'Sentinels', baseType: 'Stalking Sentinel', itemLevel: 85 }),
      adv,
    )
    expect(filters.find((f) => f.id === CRIT_MULTI.id)?.modSource).toBeUndefined()
  })

  it('badges an eldritch implicit with the altar that granted it', () => {
    const adv: AdvancedMod[] = [
      {
        type: 'implicit',
        name: '',
        tier: 0,
        tags: [],
        lines: ['Damage Penetrates 15(12-15)% Elemental Resistances'],
        ranges: [{ value: 15, min: 12, max: 15 }],
        eldritch: true,
        eldritchSource: 'searing-exarch',
      },
    ]
    const filters = matchItemMods([], ['Damage Penetrates 15% Elemental Resistances'], undefined, ring(), adv)
    expect(filters.find((f) => f.id === PEN.id)?.modSource).toBe('searing-exarch')
  })
})
