import { describe, it, expect } from 'vitest'
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
      expect(item!.itemClass).toBe('Rings')
      expect(item!.rarity).toBe('Rare')
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
      expect(item.advancedMods!.length).toBe(3)
      expect(item.advancedMods![0].type).toBe('implicit')
      expect(item.advancedMods![1].type).toBe('prefix')
      expect(item.advancedMods![1].name).toBe("Athlete's")
      expect(item.advancedMods![1].tier).toBe(3)
      expect(item.advancedMods![1].tags).toEqual(['Life'])
      expect(item.advancedMods![2].type).toBe('suffix')
      expect(item.advancedMods![2].name).toBe('of the Furnace')
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
      expect(item.advancedMods![0].ranges).toEqual([{ value: 41, min: 39, max: 42 }])
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
      const eldritchMod = item.advancedMods!.find((m) => m.eldritch)
      expect(eldritchMod).toBeDefined()
      expect(eldritchMod!.type).toBe('implicit')
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
      const eldritchMod = item.advancedMods!.find((m) => m.eldritch)
      expect(eldritchMod).toBeDefined()
      expect(eldritchMod!.type).toBe('implicit')
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
      const allModLines = item.advancedMods!.flatMap((m) => m.lines)
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
      const fracturedMod = item.advancedMods!.find((m) => m.fractured)
      expect(fracturedMod).toBeDefined()
      expect(fracturedMod!.name).toBe("Athlete's")
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
      const craftedMod = item.advancedMods!.find((m) => m.crafted)
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
})
