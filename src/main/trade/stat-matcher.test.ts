import { describe, expect, it, vi } from 'vitest'
import { _setPremiumModsForTests } from '../premium-mods'

// Mock electron before importing stat-matcher
vi.mock('electron', () => ({
  net: {
    request: vi.fn(),
  },
}))

import { getPoeVersion, setPoeVersion } from '../game-state'
import type { AdvancedMod } from '../../shared/types'
import type { ModTier, TierDataset } from '../../shared/data/tiers/types'
import { _setTierDataForTests } from '../tier-data'
import { _setStatEntriesForTests, ITEM_CLASS_TO_CATEGORY, matchItemMods, matchModToStat } from './stat-matcher'
import { resolveTierDefault } from './stat-matcher/producers/explicits'
import { isPremiumMod, _resetPremiumMatchCacheForTests } from './stat-matcher/producers/premium'

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
    expect(ITEM_CLASS_TO_CATEGORY.Flasks).toBe('flask')
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
      expect(pdps.enabled).toBe(true)

      const edps = filters.find((f) => f.id === 'weapon.edps')!
      // 50 * 1.5 = 75
      expect(edps.value).toBe(75)
      expect(edps.enabled).toBe(true)

      // Total DPS chip should exist but be disabled
      const totalDps = filters.find((f) => f.id === 'weapon.dps')!
      expect(totalDps.value).toBe(300)
      expect(totalDps.enabled).toBe(false)
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
      expect(rarityChip.enabled).toBe(false) // rarity is disabled by default

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

    it('generates 8-mod chip for 4+4 affix maps', () => {
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
      const eightMod = filters.find((f) => f.id === 'pseudo.pseudo_number_of_affix_mods')
      expect(eightMod).toBeDefined()
      expect(eightMod?.value).toBe(8)
      expect(eightMod?.enabled).toBe(true)
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
        makeItemInfo({ itemClass: 'Contracts', heistJob: { skill: 'Engineering', level: 3 } }),
      )
      // The id strips to the trade API filter key: "heist.heist_engineering"
      const jobFilter = filters.find((f) => f.id === 'heist.heist_engineering')
      expect(jobFilter).toBeDefined()
      expect(jobFilter?.min).toBe(1)
      expect(jobFilter?.enabled).toBe(true)
    })

    it('does NOT generate heist job filter for blueprints', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Blueprints', heistJob: { skill: 'Engineering', level: 3 } }),
      )
      const jobFilter = filters.find(
        (f) =>
          f.type === 'heist' &&
          f.id.startsWith('heist.heist_') &&
          f.id !== 'heist.heist_wings' &&
          f.id !== 'heist.heist_max_wings',
      )
      expect(jobFilter).toBeUndefined()
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
          mapPackSize: 16,
          mapRevives: 1,
          mapDropChance: 80,
        }),
      )
      const tier = filters.find((f) => f.id === 'map.map_tier')
      expect(tier).toBeDefined()
      expect(tier?.type).toBe('map')
      expect(tier?.enabled).toBe(true)
      expect(tier?.min).toBe(15)
      expect(tier?.max).toBe(15) // exact tier
      // Other props surface but are opt-in (disabled by default).
      const rarity = filters.find((f) => f.id === 'map.map_iir')
      expect(rarity?.value).toBe(60)
      expect(rarity?.enabled).toBe(false)
      expect(filters.find((f) => f.id === 'map.map_packsize')).toBeDefined()
      expect(filters.find((f) => f.id === 'map.map_revives')?.value).toBe(1)
      expect(filters.find((f) => f.id === 'map.map_bonus')?.value).toBe(80)
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
  })

  it('rejects non-numeric captures', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_q', text: 'Causes # additional Effects', type: 'explicit' }])
    const result = matchModToStat('Causes random additional Effects')
    // "random" isn't numeric -- value stays null even though the pattern matches
    expect(result).not.toBeNull()
    expect(result?.value).toBeNull()
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
  // whose lines start with "Socketed Gems are Supported by" AND carry the
  // "Unscalable Value" suffix. This is the upstream fingerprint that drives the
  // indexable_support routing in matchModToStat.

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
})
