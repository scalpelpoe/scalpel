import { describe, expect, it } from 'vitest'
import { endgameAreaLevel } from '../../shared/poe-item'
import { getPoeVersion } from '../game-state'
import { parseItemText } from './clipboard'

describe('parseItemText', () => {
  // ---------------------------------------------------------------------------
  // Basic parsing
  // ---------------------------------------------------------------------------

  describe('basic parsing', () => {
    it('returns null for empty string', () => {
      expect(parseItemText('')).toBeNull()
    })

    it('returns null for arbitrary text without separators', () => {
      expect(parseItemText('just some random text')).toBeNull()
    })

    it('returns null for text with separator but no Item Class / Rarity', () => {
      expect(parseItemText('hello\n--------\nworld')).toBeNull()
    })

    it('parses item class and rarity from header', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '+27% to Fire Resistance (implicit)',
        '--------',
        '+42 to maximum Life',
      ].join('\n')

      const item = parseItemText(text)
      expect(item).not.toBeNull()
      expect(item?.itemClass).toBe('Rings')
      expect(item?.rarity).toBe('Rare')
    })

    it('parses name and base type for Rare items', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '+27% to Fire Resistance (implicit)',
        '--------',
        '+42 to maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.name).toBe('Storm Knuckle')
      expect(item.baseType).toBe('Ruby Ring')
    })

    it('parses name for Normal items (name equals base type)', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Normal',
        'Ruby Ring',
        '--------',
        'Item Level: 12',
        '--------',
        '+27% to Fire Resistance (implicit)',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.name).toBe('Ruby Ring')
      expect(item.baseType).toBe('Ruby Ring')
    })

    it('parses item level', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Normal',
        'Ruby Ring',
        '--------',
        'Item Level: 83',
        '--------',
        '+27% to Fire Resistance (implicit)',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemLevel).toBe(83)
    })

    it('parses quality', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'Doom Shell',
        'Astral Plate',
        '--------',
        'Quality: +20% (augmented)',
        'Armour: 711 (augmented)',
        '--------',
        'Requirements:',
        'Level: 62',
        'Str: 180',
        '--------',
        'Item Level: 86',
        '--------',
        '+42 to maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.quality).toBe(20)
    })

    it('parses sockets and linked sockets', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'Doom Shell',
        'Astral Plate',
        '--------',
        'Sockets: R-R-G-B R-B',
        '--------',
        'Item Level: 86',
        '--------',
        '+42 to maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.sockets).toBe('R-R-G-B R-B')
      expect(item.linkedSockets).toBe(4)
    })
  })

  // ---------------------------------------------------------------------------
  // Item types
  // ---------------------------------------------------------------------------

  describe('item types', () => {
    it('parses a Rare ring', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Requirements:',
        'Level: 48',
        '--------',
        'Item Level: 75',
        '--------',
        '+27% to Fire Resistance (implicit)',
        '--------',
        '+42 to maximum Life',
        '+31% to Fire Resistance',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemClass).toBe('Rings')
      expect(item.rarity).toBe('Rare')
      expect(item.name).toBe('Storm Knuckle')
      expect(item.baseType).toBe('Ruby Ring')
      expect(item.itemLevel).toBe(75)
      expect(item.identified).toBe(true)
    })

    it('parses a Rare body armour with defenses', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'Doom Shell',
        'Astral Plate',
        '--------',
        'Armour: 711 (augmented)',
        '--------',
        'Requirements:',
        'Level: 62',
        'Str: 180',
        '--------',
        'Item Level: 86',
        '--------',
        '+42 to maximum Life',
        '+35% to Fire Resistance',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemClass).toBe('Body Armours')
      expect(item.baseType).toBe('Astral Plate')
      expect(item.armour).toBe(711)
      expect(item.reqStr).toBe(180)
    })

    it('parses a Unique item', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Unique',
        'Praxis',
        'Paua Ring',
        '--------',
        'Requirements:',
        'Level: 22',
        '--------',
        'Item Level: 68',
        '--------',
        '+30 to maximum Mana (implicit)',
        '--------',
        '+25 to maximum Mana',
        '-8 to Total Mana Cost of Skills',
        '6% of Damage taken Recouped as Mana',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.rarity).toBe('Unique')
      expect(item.name).toBe('Praxis')
      expect(item.baseType).toBe('Paua Ring')
    })

    it('parses a Magic item and strips affixes to find base type', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Magic',
        'Heated Ruby Ring of the Penguin',
        '--------',
        'Requirements:',
        'Level: 11',
        '--------',
        'Item Level: 25',
        '--------',
        '+27% to Fire Resistance (implicit)',
        '--------',
        '+15% to Fire Resistance',
        '+12% to Cold Resistance',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.rarity).toBe('Magic')
      expect(item.baseType).toBe('Ruby Ring')
    })

    it('strips magic affixes for bases not in the static list using the advanced-mod header names', () => {
      // PoE2 "Layered Vest" isn't in our shipped Body Armours base list, but
      // the advanced-mod headers tell us which words are the prefix/suffix so
      // cleanBaseType can peel them off as a last resort.
      const text = [
        'Item Class: Body Armours',
        'Rarity: Magic',
        'Sanguine Layered Vest of the Troll',
        '--------',
        'Evasion Rating: 285',
        '--------',
        'Requires: Level 54, 86 Dex',
        '--------',
        'Item Level: 66',
        '--------',
        '{ Prefix Modifier "Sanguine" (Tier: 11) -- Life }',
        '+38(30-39) to maximum Life',
        '{ Suffix Modifier "of the Troll" (Tier: 6) -- Life }',
        '12.4(9.1-13) Life Regeneration per second',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.baseType).toBe('Layered Vest')
    })

    it('strips just the prefix when the magic item has no suffix', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Magic',
        'Sanguine Layered Vest',
        '--------',
        'Evasion Rating: 285',
        '--------',
        'Item Level: 66',
        '--------',
        '{ Prefix Modifier "Sanguine" (Tier: 11) -- Life }',
        '+38(30-39) to maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.baseType).toBe('Layered Vest')
    })

    it('strips just the suffix when the magic item has no prefix', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Magic',
        'Layered Vest of the Troll',
        '--------',
        'Evasion Rating: 285',
        '--------',
        'Item Level: 66',
        '--------',
        '{ Suffix Modifier "of the Troll" (Tier: 6) -- Life }',
        '12.4(9.1-13) Life Regeneration per second',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.baseType).toBe('Layered Vest')
    })

    it('parses a Normal item', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Normal',
        'Ruby Ring',
        '--------',
        'Item Level: 1',
        '--------',
        '+27% to Fire Resistance (implicit)',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.rarity).toBe('Normal')
      expect(item.name).toBe('Ruby Ring')
      expect(item.baseType).toBe('Ruby Ring')
    })

    it('parses a PoE2 Uncut Skill Gem with level in the name', () => {
      // PoE2 pastes report the gem level inline on the name line ("Uncut Skill
      // Gem (Level 20)") rather than in a body "Level:" line. `name` keeps the
      // leveled suffix so bulk-exchange ID lookups can use it; `baseType` is
      // stripped so filter `BaseType "Uncut Skill Gem"` still matches.
      const text = [
        'Item Class: Uncut Skill Gems',
        'Rarity: Currency',
        'Uncut Skill Gem (Level 20)',
        '--------',
        'Creates a Skill Gem or Level an existing gem to level 20',
        '--------',
        'Right Click to engrave a Skill Gem.',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.name).toBe('Uncut Skill Gem (Level 20)')
      expect(item.baseType).toBe('Uncut Skill Gem')
      expect(item.gemLevel).toBe(20)
    })

    it('parses a regular Gem', () => {
      const text = [
        'Item Class: Active Skill Gems',
        'Rarity: Gem',
        'Fireball',
        '--------',
        'Fire, Projectile, Spell, AoE',
        'Level: 20',
        'Cost & Reservation Multiplier: 110% Mana',
        '--------',
        'Requirements:',
        'Level: 70',
        'Int: 155',
        '--------',
        'Deals 1095 to 1643 Fire Damage',
        '--------',
        'Place into an item socket of the right colour to gain this skill.',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemClass).toBe('Active Skill Gems')
      expect(item.name).toBe('Fireball')
      expect(item.gemLevel).toBe(20)
    })

    it('parses a Vaal Gem', () => {
      const text = [
        'Item Class: Active Skill Gems',
        'Rarity: Gem',
        'Fireball',
        '--------',
        'Vaal, Fire, Projectile, Spell, AoE',
        'Level: 20',
        '--------',
        'Requirements:',
        'Level: 70',
        'Int: 155',
        '--------',
        'Deals 1095 to 1643 Fire Damage',
        '--------',
        'Vaal Fireball',
        '--------',
        'Souls Per Use: 48',
        '--------',
        'Corrupted',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.name).toBe('Vaal Fireball')
      expect(item.baseType).toBe('Vaal Fireball')
      expect(item.corrupted).toBe(true)
    })

    it('parses a Transfigured Gem', () => {
      const text = [
        'Item Class: Active Skill Gems',
        'Rarity: Gem',
        'Fireball of Conflagration',
        '--------',
        'Fire, Projectile, Spell, AoE',
        'Level: 20',
        '--------',
        'Requirements:',
        'Level: 70',
        'Int: 155',
        '--------',
        'Deals 1095 to 1643 Fire Damage',
        '--------',
        'Transfigured',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.transfigured).toBe(true)
      expect(item.name).toBe('Fireball of Conflagration')
    })

    it('sets vaalGem=true when the gem has a Vaal alt skill (Souls Per Use section)', () => {
      const text = [
        'Item Class: Skill Gems',
        'Rarity: Gem',
        'Spark of Unpredictability',
        '--------',
        'Spell, Projectile, Duration, Vaal, Lightning',
        'Level: 20 (Max)',
        '--------',
        'Deals 104 to 1983 Lightning Damage',
        '--------',
        'Vaal Spark',
        '--------',
        'Souls Per Use: 30',
        'Can Store 1 Use',
        'Soul Gain Prevention: 5 sec',
        '--------',
        'Corrupted',
        '--------',
        'Transfigured',
      ].join('\n')
      const item = parseItemText(text)!
      expect(item.name).toBe('Spark of Unpredictability')
      expect(item.baseType).toBe('Spark of Unpredictability')
      expect(item.transfigured).toBe(true)
      expect(item.vaalGem).toBe(true)
      expect(item.corrupted).toBe(true)
    })

    it('does not flag Vaal-related Support gems as vaalGem (regression: Vaal Temptation Support)', () => {
      // Support gems carry a "Vaal" tag because they *support* Vaal skills, but they are
      // not themselves Vaal skills -- no "Souls Per Use" mechanic, no Vaal-prefixed name
      // should be applied.
      const text = [
        'Item Class: Support Gems',
        'Rarity: Gem',
        'Vaal Temptation Support',
        '--------',
        'Exceptional, Support, Vaal',
        'Level: 1',
        '--------',
        'Supports Vaal skills.',
        '--------',
        'Using Supported Vaal Skills inflicts Vaal Temptation on you dealing 1500 Physical Damage per Second, instead of applying Soul Gain Prevention',
      ].join('\n')
      const item = parseItemText(text)!
      expect(item.name).toBe('Vaal Temptation Support')
      expect(item.baseType).toBe('Vaal Temptation Support')
      expect(item.vaalGem).toBeFalsy()
    })

    it('parses a Map with tier', () => {
      const text = [
        'Item Class: Maps',
        'Rarity: Normal',
        'Strand Map (Tier 11)',
        '--------',
        'Map Tier: 11',
        'Monster Level: 78',
        '--------',
        'Item Level: 78',
        '--------',
        'Travel to this Map by using it in a personal Map Device.',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemClass).toBe('Maps')
      expect(item.mapTier).toBe(11)
      expect(item.monsterLevel).toBe(78)
    })

    it('parses a Nightmare Map base type', () => {
      const text = [
        'Item Class: Maps',
        'Rarity: Rare',
        'Torment Barrows',
        'Nightmare Map (Tier 16)',
        '--------',
        'Map Tier: 16',
        'Monster Level: 83',
        '--------',
        'Item Level: 83',
        '--------',
        '+35% Monster Life',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.baseType).toBe('Nightmare Map (Tier 16)')
      expect(item.mapTier).toBe(16)
    })

    it('normalizes DivinationCard to Divination Cards', () => {
      const text = [
        'Item Class: DivinationCard',
        'Rarity: Normal',
        'The Doctor',
        '--------',
        'Stack Size: 1/8',
        '--------',
        'Headhunter',
        '--------',
        'A very expensive card.',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemClass).toBe('Divination Cards')
      expect(item.name).toBe('The Doctor')
      expect(item.stackSize).toBe(1)
    })

    it('defaults areaLevel to the endgame level for currency with no item level', () => {
      const text = [
        'Item Class: Stackable Currency',
        'Rarity: Currency',
        'Chromatic Orb',
        '--------',
        'Stack Size: 1/20',
        '--------',
        'Reforges the colour of sockets on an item',
        '--------',
        'Right click this item then left click a socketed item to apply it.',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemClass).toBe('Stackable Currency')
      expect(item.itemLevel).toBe(0)
      // No item level and no known zone: fall back to endgame so AreaLevel-gated
      // leveling rules don't win for bulk currency inspected in stash/town.
      expect(item.areaLevel).toBe(endgameAreaLevel(getPoeVersion()))
    })

    it('uses item level as areaLevel for gear that has one', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Gloom Knuckle',
        'Iron Ring',
        '--------',
        'Item Level: 75',
        '--------',
        'Adds 3 to 7 Physical Damage to Attacks',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemLevel).toBe(75)
      expect(item.areaLevel).toBe(75)
    })

    it('parses a Flask', () => {
      const text = [
        'Item Class: Flasks',
        'Rarity: Magic',
        "Chemist's Divine Life Flask of Staunching",
        '--------',
        'Quality: +10%',
        '--------',
        'Requirements:',
        'Level: 60',
        '--------',
        'Item Level: 73',
        '--------',
        'Recovers 2400 Life over 7.00 Seconds',
        '--------',
        '25% reduced Charges per use',
        'Immunity to Bleeding during Effect',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.itemClass).toBe('Flasks')
      expect(item.quality).toBe(10)
    })

    it('parses an Expedition Logbook with factions and bosses', () => {
      const text = [
        'Item Class: Expedition Logbooks',
        'Rarity: Normal',
        'Expedition Logbook',
        '--------',
        'Area Level: 81',
        '--------',
        'Item Level: 81',
        '--------',
        'Knights of the Sun',
        '--------',
        'Area contains Medved, Feller of Heroes (implicit)',
        '--------',
        'Right click this item then left click on a location on your Atlas to visit that location.',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.logbookFactions).toEqual(['knights'])
      expect(item.logbookBosses).toEqual(['Medved, Feller of Heroes'])
    })

    it('parses weapon physical damage with thousands-separator commas', () => {
      const text = [
        'Item Class: Crossbows',
        'Rarity: Rare',
        'Victory Core',
        'Desolate Crossbow',
        '--------',
        'Quality: +20% (augmented)',
        'Physical Damage: 425-1,148 (augmented)',
        'Critical Hit Chance: 5.00%',
        'Attacks per Second: 2.00 (augmented)',
        'Reload Time: 0.64 (augmented)',
        '--------',
        'Item Level: 82',
        '--------',
        '76% increased Physical Damage',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.physDamageMin).toBe(425)
      expect(item.physDamageMax).toBe(1148)
    })
  })

  // ---------------------------------------------------------------------------
  // Flags
  // ---------------------------------------------------------------------------

  describe('flags', () => {
    const makeRing = (extraLines: string[]) =>
      [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '+27% to Fire Resistance (implicit)',
        '--------',
        '+42 to maximum Life',
        ...extraLines,
      ].join('\n')

    it('detects Corrupted flag', () => {
      const item = parseItemText(makeRing(['--------', 'Corrupted']))!
      expect(item.corrupted).toBe(true)
    })

    it('detects Twice Corrupted as twiceCorrupted and corrupted', () => {
      const item = parseItemText(makeRing(['--------', 'Twice Corrupted']))!
      expect(item.twiceCorrupted).toBe(true)
      expect(item.corrupted).toBe(true)
    })

    it('a plain Corrupted item is not twiceCorrupted', () => {
      const item = parseItemText(makeRing(['--------', 'Corrupted']))!
      expect(item.corrupted).toBe(true)
      expect(item.twiceCorrupted).toBeFalsy()
    })

    it('does not flag an uncorrupted PoE2 Headhunter (2 natural belt implicits) as corrupted', () => {
      const text = [
        'Item Class: Belts',
        'Rarity: Unique',
        'Headhunter',
        'Heavy Belt',
        '--------',
        'Requires: Level 50',
        '--------',
        'Item Level: 64',
        '--------',
        '{ Implicit Modifier }',
        '27(20-30)% increased Stun Threshold',
        '{ Implicit Modifier — Charm }',
        'Has 2(1-3) Charm Slots',
        '--------',
        '{ Unique Modifier — Attribute }',
        '+39(20-40) to Strength',
        '{ Unique Modifier — Life }',
        '+46(40-60) to maximum Life',
        '{ Unique Modifier }',
        'When you kill a Rare monster, you gain its Modifiers for 60 seconds',
      ].join('\n')
      const item = parseItemText(text)!
      expect(item.corrupted).toBe(false)
      expect(item.twiceCorrupted).toBeFalsy()
      expect(item.hasVaalUniqueMod).toBeFalsy()
    })

    it('detects a Vaal Unique modifier annotation as hasVaalUniqueMod', () => {
      const item = parseItemText(makeRing(['--------', '{ Vaal Unique Modifier — Attribute }', '+10 to Strength']))!
      expect(item.hasVaalUniqueMod).toBe(true)
    })

    it('a plain unique mod is not a vaal unique mod', () => {
      const item = parseItemText(makeRing(['--------', '{ Unique Modifier }', '+10 to Strength']))!
      expect(item.hasVaalUniqueMod).toBeFalsy()
    })

    it('detects Mirrored flag', () => {
      const item = parseItemText(makeRing(['--------', 'Mirrored']))!
      expect(item.mirrored).toBe(true)
    })

    it('detects Fractured flag via (fractured) suffix', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '+27% to Fire Resistance (implicit)',
        '--------',
        '+42 to maximum Life (fractured)',
        '+31% to Fire Resistance',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.fractured).toBe(true)
    })

    it('detects Synthesised flag from base type prefix', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Synthesised Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '+27% to Fire Resistance (implicit)',
        '--------',
        '+42 to maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.synthesised).toBe(true)
      // Synthesised prefix should be stripped from baseType
      expect(item.baseType).toBe('Ruby Ring')
    })

    it('detects Identified items (no Unidentified line)', () => {
      const item = parseItemText(makeRing([]))!
      expect(item.identified).toBe(true)
    })

    it('detects Unidentified items', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        'Unidentified',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.identified).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Advanced mods (Ctrl+Alt+C format)
  // ---------------------------------------------------------------------------

  describe('advanced mods', () => {
    it('parses { Prefix Modifier } headers', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Requirements:',
        'Level: 48',
        '--------',
        'Item Level: 75',
        '--------',
        '{ Implicit Modifier -- Fire }',
        '+27% to Fire Resistance',
        '--------',
        '{ Prefix Modifier "Athlete\'s" (Tier: 3) -- Life }',
        '+42 to maximum Life',
        '{ Suffix Modifier "of the Furnace" (Tier: 2) -- Fire, Elemental, Resistance }',
        '+31% to Fire Resistance',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.advancedMods).toBeDefined()
      expect(item.advancedMods?.length).toBe(3)
      expect(item.advancedMods?.[0].type).toBe('implicit')
      expect(item.advancedMods?.[1].type).toBe('prefix')
      expect(item.advancedMods?.[1].name).toBe("Athlete's")
      expect(item.advancedMods?.[1].tier).toBe(3)
      expect(item.advancedMods?.[1].tags).toEqual(['Life'])
      expect(item.advancedMods?.[2].type).toBe('suffix')
      expect(item.advancedMods?.[2].name).toBe('of the Furnace')
    })

    it('strips roll ranges from mod text', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'Doom Shell',
        'Astral Plate',
        '--------',
        'Item Level: 86',
        '--------',
        '{ Prefix Modifier "Hummingbird\'s" (Tier: 1) -- Defences, Evasion }',
        '41(39-42)% increased Evasion and Energy Shield',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.advancedMods).toBeDefined()
      // The stripped version in explicits
      expect(item.explicits).toContain('41% increased Evasion and Energy Shield')
      // The raw range data in advancedMods
      expect(item.advancedMods?.[0].ranges).toEqual([{ value: 41, min: 39, max: 42 }])
    })

    it('strips variant alternatives like Ghost Reaver()', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'Doom Shell',
        'Astral Plate',
        '--------',
        'Item Level: 86',
        '--------',
        '{ Prefix Modifier "Test" (Tier: 1) -- Life }',
        'Ghost Reaver()',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.explicits).toContain('Ghost Reaver')
    })

    it('strips variant alternatives like Bladefall(Fireball-Divine Blast)', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'Doom Shell',
        'Astral Plate',
        '--------',
        'Item Level: 86',
        '--------',
        '{ Prefix Modifier "Test" (Tier: 1) -- Life }',
        'Bladefall(Fireball-Divine Blast) deals extra Damage',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.explicits).toContain('Bladefall deals extra Damage')
    })

    it('strips "Unscalable Value" suffix', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '{ Prefix Modifier "Test" (Tier: 1) -- Life }',
        '+50 to maximum Life - Unscalable Value',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.explicits).toContain('+50 to maximum Life')
    })

    it('pushes both individual and joined versions for multi-line mods', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '{ Prefix Modifier "Test" (Tier: 1) -- Life }',
        'Passives granting Fire Resistance',
        'also grant increased Maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      // Should have both individual lines and the joined version
      expect(item.explicits).toContain('Passives granting Fire Resistance')
      expect(item.explicits).toContain('also grant increased Maximum Life')
      expect(item.explicits).toContain('Passives granting Fire Resistance\nalso grant increased Maximum Life')
    })

    it('handles hybrid mods (socketed gem + bonus under one header)', () => {
      const text = [
        'Item Class: Helmets',
        'Rarity: Rare',
        'Test Helm',
        'Royal Burgonet',
        '--------',
        'Item Level: 85',
        '--------',
        '{ Prefix Modifier "The Elder\'s" (Tier: 1) }',
        'Socketed Gems are Supported by Level 20 Concentrated Effect \u2014 Unscalable Value',
        '25(23-25)% increased Area Damage',
        '{ Suffix Modifier "of the Magma" (Tier: 2) }',
        '+44(42-45)% to Fire Resistance',
      ].join('\n')

      const item = parseItemText(text)!
      // Both the socketed gem line and the hybrid bonus should be individual explicits
      expect(item.explicits).toContain('Socketed Gems are Supported by Level 20 Concentrated Effect')
      expect(item.explicits).toContain('25% increased Area Damage')
      expect(item.explicits).toContain('+44% to Fire Resistance')
    })

    it('handles eldritch mods (Searing Exarch)', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'Doom Shell',
        'Astral Plate',
        '--------',
        'Item Level: 86',
        '--------',
        '{ Searing Exarch Implicit Modifier (Grand) }',
        '+2% to maximum Fire Resistance',
        '--------',
        '{ Prefix Modifier "Test" (Tier: 1) -- Life }',
        '+50 to maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      const eldritchMod = item.advancedMods?.find((m) => m.eldritch)
      expect(eldritchMod).toBeDefined()
      expect(eldritchMod?.type).toBe('implicit')
      expect(item.implicits).toContain('+2% to maximum Fire Resistance')
    })

    it('handles Eater of Worlds eldritch mods', () => {
      const text = [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'Doom Shell',
        'Astral Plate',
        '--------',
        'Item Level: 86',
        '--------',
        '{ Eater of Worlds Implicit Modifier (Exquisite) }',
        '+1% to all maximum Resistances',
        '--------',
        '{ Prefix Modifier "Test" (Tier: 1) -- Life }',
        '+50 to maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      const eldritchMod = item.advancedMods?.find((m) => m.eldritch)
      expect(eldritchMod).toBeDefined()
      expect(eldritchMod?.type).toBe('implicit')
    })

    it('stops collecting mod lines at section separators', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Unique',
        'Praxis',
        'Paua Ring',
        '--------',
        'Item Level: 68',
        '--------',
        '{ Implicit Modifier }',
        '+30 to maximum Mana',
        '--------',
        '{ Unique Modifier }',
        '+25 to maximum Mana',
        '{ Unique Modifier }',
        '-8 to Total Mana Cost of Skills',
        '--------',
        'This is flavour text that should not leak into mods.',
      ].join('\n')

      const item = parseItemText(text)!
      // Flavour text should not appear in any mod lines
      const allModLines = item.advancedMods?.flatMap((m) => m.lines)
      expect(allModLines).not.toContain('This is flavour text that should not leak into mods.')
    })

    it('handles fractured mods in advanced format', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '{ Implicit Modifier -- Fire }',
        '+27% to Fire Resistance',
        '--------',
        '{ Fractured Prefix Modifier "Athlete\'s" (Tier: 3) -- Life }',
        '+42 to maximum Life',
        '{ Suffix Modifier "of the Furnace" (Tier: 2) -- Fire }',
        '+31% to Fire Resistance',
      ].join('\n')

      const item = parseItemText(text)!
      const fracturedMod = item.advancedMods?.find((m) => m.fractured)
      expect(fracturedMod).toBeDefined()
      expect(fracturedMod?.name).toBe("Athlete's")
    })

    it('handles crafted (Master Crafted) mods in advanced format', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '{ Implicit Modifier -- Fire }',
        '+27% to Fire Resistance',
        '--------',
        '{ Master Crafted Prefix Modifier "of Craft" (Rank: 1) -- Life }',
        '+35 to maximum Life',
      ].join('\n')

      const item = parseItemText(text)!
      const craftedMod = item.advancedMods?.find((m) => m.crafted)
      expect(craftedMod).toBeDefined()
    })

    it('rebuilds implicits and explicits from advanced mods', () => {
      const text = [
        'Item Class: Rings',
        'Rarity: Rare',
        'Storm Knuckle',
        'Ruby Ring',
        '--------',
        'Item Level: 75',
        '--------',
        '{ Implicit Modifier -- Fire }',
        '+27% to Fire Resistance',
        '--------',
        '{ Prefix Modifier "Athlete\'s" (Tier: 3) -- Life }',
        '+42 to maximum Life',
        '{ Suffix Modifier "of the Furnace" (Tier: 2) -- Fire }',
        '+31% to Fire Resistance',
      ].join('\n')

      const item = parseItemText(text)!
      expect(item.implicits).toEqual(['+27% to Fire Resistance'])
      expect(item.explicits).toContain('+42 to maximum Life')
      expect(item.explicits).toContain('+31% to Fire Resistance')
    })
  })

  describe('heist parsing', () => {
    it('parses heist job requirement from a contract (no unmet suffix)', () => {
      const text = [
        'Item Class: Contracts',
        'Rarity: Normal',
        'Contract: Bunker',
        '--------',
        'Requires Engineering (Level 3)',
        '--------',
        'Item Level: 83',
      ].join('\n')
      const item = parseItemText(text)!
      expect(item.heistJob).toEqual({ skill: 'Engineering', level: 3 })
    })

    it('parses heist job requirement from a contract with "(unmet)" suffix', () => {
      const text = [
        'Item Class: Contracts',
        'Rarity: Normal',
        'Contract: Bunker',
        '--------',
        'Requires Engineering (Level 3 (unmet))',
        '--------',
        'Item Level: 83',
      ].join('\n')
      const item = parseItemText(text)!
      expect(item.heistJob).toEqual({ skill: 'Engineering', level: 3 })
    })

    it('parses wings revealed and total from a blueprint', () => {
      const text = [
        'Item Class: Blueprints',
        'Rarity: Magic',
        'Shocking Blueprint: Bunker of Drought',
        '--------',
        'Area Level: 83',
        'Wings Revealed: 1/3',
        '--------',
        'Item Level: 84',
      ].join('\n')
      const item = parseItemText(text)!
      expect(item.wingsRevealed).toBe(1)
      expect(item.wingsTotal).toBe(3)
    })
  })
})
