import { describe, it, expect, vi } from 'vitest'

// Mock electron before importing stat-matcher
vi.mock('electron', () => ({
  net: {
    request: vi.fn(),
  },
}))

import { matchItemMods, ITEM_CLASS_TO_CATEGORY } from './stat-matcher'
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

    it('generates white socket chip', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: 'W-R-G', linkedSockets: 3 }))
      const whiteChip = filters.find((f) => f.id === 'socket.white_sockets')
      expect(whiteChip).toBeDefined()
      expect(whiteChip!.value).toBe(1)
      expect(whiteChip!.enabled).toBe(true)
    })

    it('generates abyssal socket chip', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: 'A-R', linkedSockets: 2 }))
      const abyssChip = filters.find((f) => f.id === 'explicit.stat_3527617737')
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
      expect(corruptedChip!.enabled).toBe(true)
    })

    it('generates corrupted chip disabled when item is not corrupted (equipment)', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ corrupted: false, itemClass: 'Rings', sockets: '' }),
      )
      const corruptedChip = filters.find((f) => f.id === 'misc.corrupted')
      expect(corruptedChip).toBeDefined()
      expect(corruptedChip!.enabled).toBe(false)
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
      expect(mirroredChip!.enabled).toBe(true)
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

    it('generates wings revealed/total chips for heist blueprints', () => {
      const filters = matchItemMods([], [], undefined, makeItemInfo({ sockets: '', wingsRevealed: 3, wingsTotal: 4 }))
      const wingsRevealed = filters.find((f) => f.id === 'heist.wings_revealed')
      expect(wingsRevealed).toBeDefined()
      expect(wingsRevealed!.value).toBe(3)

      const wingsTotal = filters.find((f) => f.id === 'heist.max_wings')
      expect(wingsTotal).toBeDefined()
      expect(wingsTotal!.value).toBe(4)
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

  describe('fractured chip', () => {
    it('generates include fractured chip for equipment', () => {
      const filters = matchItemMods(
        [],
        [],
        undefined,
        makeItemInfo({ rarity: 'Rare', itemClass: 'Boots', sockets: '' }),
      )
      const fracturedChip = filters.find((f) => f.id === 'misc.fractured')
      expect(fracturedChip).toBeDefined()
      expect(fracturedChip!.text).toBe('Include Fractured')
      // No fractured mods, so disabled
      expect(fracturedChip!.enabled).toBe(false)
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
