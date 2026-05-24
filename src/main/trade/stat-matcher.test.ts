import { describe, it, expect, vi } from 'vitest'

// Mock electron before importing stat-matcher
vi.mock('electron', () => ({
  net: {
    request: vi.fn(),
  },
}))

import { matchItemMods, matchModToStat, ITEM_CLASS_TO_CATEGORY, _setStatEntriesForTests } from './stat-matcher'
import type { AdvancedMod } from '../../shared/types'

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
    expect(ITEM_CLASS_TO_CATEGORY['Rings']).toBe('accessory.ring')
    expect(ITEM_CLASS_TO_CATEGORY['Body Armours']).toBe('armour.chest')
    expect(ITEM_CLASS_TO_CATEGORY['Wands']).toBe('weapon.wand')
    expect(ITEM_CLASS_TO_CATEGORY['Jewels']).toBe('jewel')
    expect(ITEM_CLASS_TO_CATEGORY['Flasks']).toBe('flask')
    // PoE2-specific classes that have live listings -- without these the
    // trade router falls back to searching a single base type instead of the
    // whole class.
    expect(ITEM_CLASS_TO_CATEGORY['Bucklers']).toBe('armour.buckler')
    expect(ITEM_CLASS_TO_CATEGORY['Crossbows']).toBe('weapon.crossbow')
    expect(ITEM_CLASS_TO_CATEGORY['Spears']).toBe('weapon.spear')
    expect(ITEM_CLASS_TO_CATEGORY['Foci']).toBe('armour.focus')
  })

  it('excludes PoE2 categories that have zero live listings (Claws, Daggers, Flails, 1H/2H Swords+Axes, Trap Tools)', () => {
    // These class names exist in RePoE-fork's metadata but PoE2 players never
    // get drops in them, so trade2/search returns nothing. Routing through
    // baseType (the fallback when the class has no category) is closer to
    // correct than pointing at an empty category.
    expect(ITEM_CLASS_TO_CATEGORY['Flails']).toBeUndefined()
    expect(ITEM_CLASS_TO_CATEGORY['Trap Tools']).toBeUndefined()
  })

  it('does not contain unknown classes', () => {
    expect(ITEM_CLASS_TO_CATEGORY['Maps']).toBeUndefined()
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
      expect(wardChip!.value).toBe(200)
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
      expect(blockChip!.text).toBe('Block: 30%')
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
  })

  describe('socket/link chips', () => {
    it('generates link chip for 5+ links', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: 'R-R-R-R-R', linkedSockets: 5 }))
      const linkChip = filters.find((f) => f.id === 'socket.links')
      expect(linkChip).toBeDefined()
      expect(linkChip!.text).toBe('5L')
      expect(linkChip!.min).toBe(5)
      expect(linkChip!.enabled).toBe(true)
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
      expect(whiteRow!.value).toBe(1)
      expect(whiteRow!.enabled).toBe(false)
    })

    it('generates abyssal socket chip', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: 'A-R', linkedSockets: 2 }))
      const abyssChip = filters.find((f) => f.id === 'implicit.stat_3527617737')
      expect(abyssChip).toBeDefined()
      expect(abyssChip!.value).toBe(1)
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
      expect(corruptedChip!.chipState).toBe('yes')
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
      expect(corruptedChip!.chipState).toBe('no')
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
      expect(mirroredChip!.chipState).toBe('yes')
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
      expect(unidChip!.text).toBe('Unidentified')
    })

    it('generates ilvl chip disabled by default', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ itemLevel: 84, sockets: '' }))
      const ilvlChip = filters.find((f) => f.id === 'misc.ilvl')
      expect(ilvlChip).toBeDefined()
      expect(ilvlChip!.value).toBe(84)
      expect(ilvlChip!.enabled).toBe(false)
    })

    it('generates quality chip disabled for non-base items', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ quality: 15, rarity: 'Rare', sockets: '' }))
      const qualityChip = filters.find((f) => f.id === 'misc.quality')
      expect(qualityChip).toBeDefined()
      expect(qualityChip!.value).toBe(15)
      expect(qualityChip!.enabled).toBe(false)
    })

    it('generates quality chip enabled for overqualitied bases', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ quality: 28, rarity: 'Normal', sockets: '' }))
      const qualityChip = filters.find((f) => f.id === 'misc.quality')
      expect(qualityChip).toBeDefined()
      expect(qualityChip!.enabled).toBe(true)
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
      expect(baseChip!.text).toBe('Titanium Spirit Shield')
      expect(baseChip!.enabled).toBe(false)
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
      expect(baseChip!.text).toBe('Large Cluster Jewel')
      expect(baseChip!.enabled).toBe(true)
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
      expect(baseChip!.enabled).toBe(false)
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
      expect(rarityChip!.text).toBe('Rare')
      expect(rarityChip!.enabled).toBe(false)
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
      expect(shaperChip!.enabled).toBe(true)
      expect(elderChip).toBeDefined()
      expect(elderChip!.enabled).toBe(true)
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
      expect(openPrefix!.value).toBe(2) // 3 max - 1 prefix = 2 open
      expect(openSuffix).toBeDefined()
      expect(openSuffix!.value).toBe(1) // 3 max - 2 suffixes = 1 open
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
      expect(openPrefix!.value).toBe(1) // 2 max - 1 prefix = 1 open
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
      expect(gemLevel!.value).toBe(21)
      expect(gemLevel!.min).toBe(21)
      expect(gemLevel!.type).toBe('gem')
      expect(gemLevel!.enabled).toBe(true)

      const qualityChip = filters.find((f) => f.id === 'misc.quality')
      expect(qualityChip).toBeDefined()
      expect(qualityChip!.type).toBe('gem')
      expect(qualityChip!.enabled).toBe(true) // quality >= 20
    })

    it('generates transfigured chip enabled when transfigured', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Skill Gems', gemLevel: 1, transfigured: true, sockets: '' }),
      )
      const transfigured = filters.find((f) => f.id === 'misc.gem_transfigured')
      expect(transfigured).toBeDefined()
      expect(transfigured!.enabled).toBe(true)
    })

    it('generates transfigured chip disabled when not transfigured', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ itemClass: 'Skill Gems', gemLevel: 1, transfigured: false, sockets: '' }),
      )
      const transfigured = filters.find((f) => f.id === 'misc.gem_transfigured')
      expect(transfigured).toBeDefined()
      expect(transfigured!.enabled).toBe(false)
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
      expect(rewardChip!.option).toBe('Divination Cards')
      expect(rewardChip!.enabled).toBe(true)
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
      expect(baseChip!.enabled).toBe(true)
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
      expect(eightMod!.value).toBe(8)
      expect(eightMod!.enabled).toBe(true)
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
      expect(areaLevel!.value).toBe(83)
      expect(areaLevel!.enabled).toBe(true)
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
      expect(wingsRevealed!.value).toBe(3)
      expect(wingsRevealed!.min).toBe(3)
      expect(wingsRevealed!.enabled).toBe(true)

      // Total wings uses min (not max) per trade site behavior
      const wingsTotal = filters.find((f) => f.id === 'heist.heist_max_wings')
      expect(wingsTotal).toBeDefined()
      expect(wingsTotal!.value).toBe(4)
      expect(wingsTotal!.min).toBe(4)
      expect(wingsTotal!.enabled).toBe(true)
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
      expect(jobFilter!.min).toBe(1)
      expect(jobFilter!.enabled).toBe(true)
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
      expect(ilvl!.enabled).toBe(true)
      expect(ilvl!.chipState).toBe('max')
      expect(ilvl!.min).toBeNull()
      expect(ilvl!.max).toBe(83)
    })

    it('generates ilvl chip with enabled=false and no chipState for regular rares', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ itemClass: 'Body Armours', itemLevel: 86 }))
      const ilvl = filters.find((f) => f.id === 'misc.ilvl')
      expect(ilvl).toBeDefined()
      expect(ilvl!.enabled).toBe(false)
      expect(ilvl!.chipState).toBeUndefined()
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
      expect(pseudo!.value).toBe(71)
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
      expect(pseudo!.value).toBe(43)
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
      expect(pseudo!.value).toBe(56)
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
      expect(atk!.value).toBe(55)
      // To-spells: fire-both (45) + lightning-spells (10) = 55
      const spl = filters.find((f) => f.id === PSEUDO_TO_SPL)
      expect(spl!.value).toBe(55)
    })

    it('does not regress existing pseudos with default minCount=1', () => {
      _setStatEntriesForTests([{ id: 'explicit.stat_1671376347', text: '+#% to Fire Resistance', type: 'explicit' }])
      const filters = matchItemMods(['+30% to Fire Resistance'], [], undefined, makeItemInfo({ rarity: 'Rare' }))
      // Single resistance roll still emits Total Ele Res pseudo (minCount default = 1)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')!.value).toBe(30)
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

  describe('memory strands', () => {
    it('generates memory strands chip', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: '', memoryStrands: 5 }))
      const strandChip = filters.find((f) => f.id === 'misc.memory_level')
      expect(strandChip).toBeDefined()
      expect(strandChip!.value).toBe(5)
      expect(strandChip!.min).toBe(5)
      expect(strandChip!.enabled).toBe(true)
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

    it('Strength contributes 0.5x to Total Life pseudo', () => {
      const filters = runWithStats([STR], ['+30 to Strength'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)!.value).toBe(15)
    })

    it('Intelligence contributes 0.5x to Total Mana pseudo', () => {
      const filters = runWithStats([INT], ['+40 to Intelligence'])
      expect(filters.find((f) => f.id === TOTAL_MANA)!.value).toBe(20)
    })

    it('Dexterity does not contribute to Life or Mana pseudo', () => {
      const filters = runWithStats([DEX], ['+50 to Dexterity'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
    })

    it('Str+Int hybrid contributes to both Life and Mana', () => {
      const filters = runWithStats([STR_INT], ['+20 to Strength and Intelligence'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)!.value).toBe(10)
      expect(filters.find((f) => f.id === TOTAL_MANA)!.value).toBe(10)
    })

    it('Str+Dex hybrid contributes to Life only', () => {
      const filters = runWithStats([STR_DEX], ['+24 to Strength and Dexterity'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)!.value).toBe(12)
      expect(filters.find((f) => f.id === TOTAL_MANA)).toBeUndefined()
    })

    it('Dex+Int hybrid contributes to Mana only', () => {
      const filters = runWithStats([DEX_INT], ['+24 to Dexterity and Intelligence'])
      expect(filters.find((f) => f.id === TOTAL_MANA)!.value).toBe(12)
      expect(filters.find((f) => f.id === TOTAL_LIFE)).toBeUndefined()
    })

    it('all Attributes contributes to both Life and Mana', () => {
      const filters = runWithStats([ALL_ATTR], ['+10 to all Attributes'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)!.value).toBe(5)
      expect(filters.find((f) => f.id === TOTAL_MANA)!.value).toBe(5)
    })

    it('floors the final Total Life value (single odd Str source)', () => {
      // 25 * 0.5 = 12.5 -> floor to 12
      const filters = runWithStats([STR], ['+25 to Strength'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)!.value).toBe(12)
    })

    it('pools Str sources before flooring (matches in-game pooling)', () => {
      // Game pools Str (38) then halves -> 19. Flooring per-contribution would give 12 + 6 = 18.
      const filters = runWithStats([STR], ['+25 to Strength', '+13 to Strength'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)!.value).toBe(19)
    })

    it('maximum Mana contributes 1:1 to Total Mana', () => {
      const filters = runWithStats([MAX_MANA], ['+50 to maximum Mana'])
      expect(filters.find((f) => f.id === TOTAL_MANA)!.value).toBe(50)
    })

    it('Str + maximum Life roll combine into a single Total Life pseudo', () => {
      // 60 (life) + 30 * 0.5 (Str) = 75
      const filters = runWithStats([STR, MAX_LIFE], ['+30 to Strength', '+60 to maximum Life'])
      expect(filters.find((f) => f.id === TOTAL_LIFE)!.value).toBe(75)
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
      expect(pseudoEle!.value).toBe(41)
      // The fractured row itself should still be tagged with the fractured stat id and type
      const fracturedRow = filters.find((f) => f.id === 'fractured.stat_3261801346')
      expect(fracturedRow).toBeDefined()
      expect(fracturedRow!.type).toBe('fractured')
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
      expect(ele!.value).toBe(14)
      expect(chaos).toBeDefined()
      expect(chaos!.value).toBe(14)
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
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')!.value).toBe(22)
      expect(filters.find((f) => f.id === 'pseudo.pseudo_total_chaos_resistance')!.value).toBe(22)
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
      expect(pseudo!.value).toBe(36)
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
      expect(fracturedChip!.text).toBe('Fractured')
      expect(fracturedChip!.chipState).toBeUndefined()
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
    expect(result!.value).toBe(50)
  })

  it('extracts percent value from "+#% to Cold Resistance" item against bare "#% to Cold Resistance" stat', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_4220027924', text: '#% to Cold Resistance', type: 'explicit' }])
    const result = matchModToStat('+47% to Cold Resistance')
    expect(result).not.toBeNull()
    expect(result!.value).toBe(47)
  })

  it('extracts negative value when stat text has no sign', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_x', text: '#% to Lightning Resistance', type: 'explicit' }])
    const result = matchModToStat('-50% to Lightning Resistance')
    expect(result).not.toBeNull()
    expect(result!.value).toBe(-50)
  })

  it('still works for unsigned PoE1-style mod text', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_y', text: '#% increased Spell Damage', type: 'explicit' }])
    const result = matchModToStat('20% increased Spell Damage')
    expect(result).not.toBeNull()
    expect(result!.value).toBe(20)
  })

  it('averages multiple signed numeric captures (PoE2 "Adds #-#" hybrid case)', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_z', text: 'Adds # to # Cold Damage', type: 'explicit' }])
    const result = matchModToStat('Adds +5 to +15 Cold Damage')
    expect(result).not.toBeNull()
    expect(result!.value).toBe(10)
  })

  it('rejects non-numeric captures', () => {
    _setStatEntriesForTests([{ id: 'explicit.stat_q', text: 'Causes # additional Effects', type: 'explicit' }])
    const result = matchModToStat('Causes random additional Effects')
    // "random" isn't numeric -- value stays null even though the pattern matches
    expect(result).not.toBeNull()
    expect(result!.value).toBeNull()
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
    expect(result!.statId).toBe('explicit.stat_2222186378')
    expect(result!.value).toBe(1)
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
    expect(result!.statId).toBe('explicit.stat_2989883253')
    expect(result!.value).toBeNull()
  })

  it('still matches when clipboard text is the leading portion of the stat (existing prefix case)', () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_xxx', text: 'Bladefall deals extra Damage by #% of their value', type: 'explicit' },
    ])
    const result = matchModToStat('Bladefall deals extra Damage')
    expect(result).not.toBeNull()
    expect(result!.statId).toBe('explicit.stat_xxx')
    expect(result!.value).toBeNull()
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
    expect(result!.statId).toBe('explicit.stat_2388360415')
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
    expect(result!.statId).toBe('explicit.indexable_support_98')
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
    expect(supportChip!.id).toBe('explicit.indexable_support_98')
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
    expect(supportChip!.id).toBe('explicit.stat_2388360415')
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
    expect(item!.advancedMods).toBeDefined()
    const supportMods = item!.advancedMods!.filter((am) =>
      am.lines.some((l) => /Socketed Gems are Supported by/i.test(l)),
    )
    expect(supportMods.length).toBe(2)
    expect(supportMods.every((m) => m.randomSupport === true)).toBe(true)
    // Attribute mod should NOT be flagged (no Unscalable Value).
    const attrMod = item!.advancedMods!.find((am) => am.lines.some((l) => /to all Attributes/.test(l)))
    expect(attrMod).toBeDefined()
    expect(attrMod!.randomSupport).toBeUndefined()
  })
})
