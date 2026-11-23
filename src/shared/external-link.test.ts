import { describe, it, expect } from 'vitest'
import { externalLinkUrl, ninjaLinkUrl, ninjaLeagueSegment, ninjaUniqueDetailsUrl } from './external-link'

describe('externalLinkUrl', () => {
  it('uses baseType for Rare items (random name has no wiki page)', () => {
    const url = externalLinkUrl('wiki', { name: 'Mind Locket Chain Belt', baseType: 'Chain Belt', rarity: 'Rare' }, 1)
    expect(url).toBe('https://www.poewiki.net/wiki/Chain%20Belt')
  })

  it('uses baseType for Magic items', () => {
    const url = externalLinkUrl(
      'poedb',
      { name: 'Sanguine Layered Vest of the Troll', baseType: 'Layered Vest', rarity: 'Magic' },
      1,
    )
    expect(url).toBe('https://poedb.tw/us/Layered_Vest')
  })

  it('uses name for Unique items', () => {
    const url = externalLinkUrl('wiki', { name: 'Headhunter', baseType: 'Leather Belt', rarity: 'Unique' }, 1)
    expect(url).toBe('https://www.poewiki.net/wiki/Headhunter')
  })

  it('strips Foulborn prefix for Foulborn uniques', () => {
    const url = externalLinkUrl('wiki', { name: 'Foulborn Headhunter', baseType: 'Leather Belt', rarity: 'Unique' }, 1)
    expect(url).toBe('https://www.poewiki.net/wiki/Headhunter')
  })

  it('uses name for Normal items (where name == baseType anyway)', () => {
    const url = externalLinkUrl('wiki', { name: 'Chaos Orb', baseType: 'Chaos Orb', rarity: 'Currency' }, 1)
    expect(url).toBe('https://www.poewiki.net/wiki/Chaos%20Orb')
  })

  it('routes to PoE2 hosts for poeVersion 2', () => {
    const wiki = externalLinkUrl('wiki', { name: 'Foo Bar', baseType: 'Bar', rarity: 'Rare' }, 2)
    const poedb = externalLinkUrl('poedb', { name: 'Foo Bar', baseType: 'Bar', rarity: 'Rare' }, 2)
    expect(wiki).toBe('https://www.poe2wiki.net/wiki/Bar')
    expect(poedb).toBe('https://poe2db.tw/us/Bar')
  })

  it('strips apostrophes for poedb slugs', () => {
    const url = externalLinkUrl('poedb', { name: "Jeweller's Orb", baseType: "Jeweller's Orb", rarity: 'Currency' }, 1)
    expect(url).toBe('https://poedb.tw/us/Jewellers_Orb')
  })
})

const POE1_SLUGS: Record<string, string> = {
  Mirage: 'mirage',
  'Hardcore Mirage': 'miragehc',
  Standard: 'standard',
  Hardcore: 'hardcore',
}

const POE2_SLUGS: Record<string, string> = {
  'Fate of the Vaal': 'vaal',
  'HC Fate of the Vaal': 'vaalhc',
  Standard: 'standard',
  Hardcore: 'hardcore',
}

describe('ninjaLeagueSegment', () => {
  it('returns the slug from the map', () => {
    expect(ninjaLeagueSegment('Mirage', POE1_SLUGS)).toBe('mirage')
    expect(ninjaLeagueSegment('Hardcore Mirage', POE1_SLUGS)).toBe('miragehc')
  })

  it('returns null when the league is not in the map', () => {
    expect(ninjaLeagueSegment('Unknown League', POE1_SLUGS)).toBeNull()
  })
})

describe('ninjaLinkUrl', () => {
  const headhunter = { name: 'Headhunter', baseType: 'Leather Belt', rarity: 'Unique', itemClass: 'Belts' }

  it('routes a unique accessory to plural /unique-accessories/<name-and-base>', () => {
    expect(ninjaLinkUrl(headhunter, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/unique-accessories/headhunter-leather-belt',
    )
  })

  it('strips apostrophes from the slug', () => {
    const item = { name: "Volkuur's Guidance", baseType: 'Sorcerer Boots', rarity: 'Unique', itemClass: 'Boots' }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/unique-armours/volkuurs-guidance-sorcerer-boots',
    )
  })

  it('keeps Foulborn prefix in the slug (ninja lists Foulborn variants separately)', () => {
    const item = { name: 'Foulborn Mageblood', baseType: 'Heavy Belt', rarity: 'Unique', itemClass: 'Belts' }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/unique-accessories/foulborn-mageblood-heavy-belt',
    )
  })

  it('routes a unique weapon to /unique-weapons/<name-and-base>', () => {
    const item = { name: "Lioneye's Glare", baseType: 'Imperial Bow', rarity: 'Unique', itemClass: 'Bows' }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/unique-weapons/lioneyes-glare-imperial-bow',
    )
  })

  it('routes a unique flask to /unique-flasks/<name-and-base>', () => {
    const item = {
      name: 'Soul Catcher',
      baseType: 'Hallowed Hybrid Flask',
      rarity: 'Unique',
      itemClass: 'Flasks',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/unique-flasks/soul-catcher-hallowed-hybrid-flask',
    )
  })

  it('routes a regular jewel unique to /unique-jewels/<name-and-base>', () => {
    const item = {
      name: "Watcher's Eye",
      baseType: 'Prismatic Jewel',
      rarity: 'Unique',
      itemClass: 'Jewels',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/unique-jewels/watchers-eye-prismatic-jewel',
    )
  })

  it('routes a cluster jewel to /unique-jewels/<name-and-base> (ninja lumps clusters with regular jewels)', () => {
    const item = {
      name: 'Voices',
      baseType: 'Large Cluster Jewel',
      rarity: 'Unique',
      itemClass: 'Jewels',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/unique-jewels/voices-large-cluster-jewel',
    )
  })

  it('routes a captured beast to /beasts/<slug> and does not double the name when name == baseType', () => {
    const item = {
      name: 'Craiceann, First of the Deep',
      baseType: 'Craiceann, First of the Deep',
      rarity: 'Unique',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/beasts/craiceann-first-of-the-deep',
    )
  })

  it('routes currency to singular /currency/<slug>', () => {
    const item = { name: 'Chaos Orb', baseType: 'Chaos Orb', rarity: 'Currency', itemClass: 'Stackable Currency' }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe('https://poe.ninja/poe1/economy/mirage/currency/chaos-orb')
  })

  it('routes essences (real clipboard Class is Stackable Currency) to /essences/<slug>', () => {
    const item = {
      name: 'Shrieking Essence of Hatred',
      baseType: 'Shrieking Essence of Hatred',
      rarity: 'Currency',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/essences/shrieking-essence-of-hatred',
    )
  })

  it('routes scarabs (Stackable Currency baseType ending in " Scarab") to /scarabs/<slug>', () => {
    const item = {
      name: 'Winged Reliquary Scarab',
      baseType: 'Winged Reliquary Scarab',
      rarity: 'Normal',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/scarabs/winged-reliquary-scarab',
    )
  })

  it('routes Map Fragments class with no specific baseType pattern to /fragments/<slug>', () => {
    const item = {
      name: 'Sacrifice at Midnight',
      baseType: 'Sacrifice at Midnight',
      rarity: 'Normal',
      itemClass: 'Map Fragments',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/fragments/sacrifice-at-midnight',
    )
  })

  it('routes fossils (baseType ending in " Fossil") to /fossils/<slug>', () => {
    const item = {
      name: 'Pristine Fossil',
      baseType: 'Pristine Fossil',
      rarity: 'Currency',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/fossils/pristine-fossil',
    )
  })

  it('routes resonators (baseType ending in " Resonator") to /resonators/<slug>', () => {
    const item = {
      name: 'Powerful Chaotic Resonator',
      baseType: 'Powerful Chaotic Resonator',
      rarity: 'Currency',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/resonators/powerful-chaotic-resonator',
    )
  })

  it('routes oils (Stackable Currency, baseType ends in " Oil") to /oils/<slug>', () => {
    const item = { name: 'Golden Oil', baseType: 'Golden Oil', rarity: 'Currency', itemClass: 'Stackable Currency' }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe('https://poe.ninja/poe1/economy/mirage/oils/golden-oil')
  })

  it('routes omens (baseType starts with "Omen of") to /omens/<slug>', () => {
    const item = {
      name: 'Omen of Amelioration',
      baseType: 'Omen of Amelioration',
      rarity: 'Currency',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/omens/omen-of-amelioration',
    )
  })

  it('routes tattoos (baseType starts with "Tattoo of") to /tattoos/<slug>', () => {
    const item = {
      name: 'Tattoo of the Tukohama Warmonger',
      baseType: 'Tattoo of the Tukohama Warmonger',
      rarity: 'Currency',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/tattoos/tattoo-of-the-tukohama-warmonger',
    )
  })

  it('routes incubators to /incubators/<slug>', () => {
    const item = {
      name: "Geomancer's Incubator",
      baseType: "Geomancer's Incubator",
      rarity: 'Currency',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/incubators/geomancers-incubator',
    )
  })

  it('routes Delirium Orbs to /delirium-orbs/<slug>', () => {
    const item = {
      name: "Diviner's Delirium Orb",
      baseType: "Diviner's Delirium Orb",
      rarity: 'Currency',
      itemClass: 'Stackable Currency',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/delirium-orbs/diviners-delirium-orb',
    )
  })

  it('routes div cards to /divination-cards/<slug>', () => {
    const item = { name: 'The Doctor', baseType: 'The Doctor', rarity: 'Normal', itemClass: 'Divination Cards' }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/divination-cards/the-doctor',
    )
  })

  it('routes skill gems to /skill-gems/<name>-<level>-<quality> with optional corrupt suffix', () => {
    const item = {
      name: 'Lightning Strike',
      baseType: 'Lightning Strike',
      rarity: 'Gem',
      itemClass: 'Skill Gems',
      gemLevel: 21,
      quality: 20,
      corrupted: true,
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/lightning-strike-21-20c',
    )
  })

  it('omits the gem variant when level and quality are both zero (unknown)', () => {
    const item = { name: 'Lightning Strike', baseType: 'Lightning Strike', rarity: 'Gem', itemClass: 'Skill Gems' }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/lightning-strike',
    )
  })

  it('omits quality from the slug when quality < 20 (e.g. 21c with no quality)', () => {
    const item = {
      name: 'Vaal Haste',
      baseType: 'Vaal Haste',
      rarity: 'Gem',
      itemClass: 'Skill Gems',
      gemLevel: 21,
      quality: 0,
      corrupted: true,
    }
    // Matches the user's example URL: https://poe.ninja/poe1/economy/mirage/skill-gems/vaal-haste-21c
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/vaal-haste-21c',
    )
  })

  it('snaps quality 20-22 to 20 and keeps 23 as 23', () => {
    const at22 = {
      name: 'Lightning Strike',
      baseType: 'Lightning Strike',
      rarity: 'Gem',
      itemClass: 'Skill Gems',
      gemLevel: 20,
      quality: 22,
    }
    const at23 = { ...at22, quality: 23 }
    expect(ninjaLinkUrl(at22, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/lightning-strike-20-20',
    )
    expect(ninjaLinkUrl(at23, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/lightning-strike-20-23',
    )
  })

  it('snaps levels below the gem family normal-max down to 1 (e.g. level 17 Hatred -> level 1)', () => {
    const item = {
      name: 'Hatred',
      baseType: 'Hatred',
      rarity: 'Gem',
      itemClass: 'Skill Gems',
      gemLevel: 17,
      quality: 20,
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/hatred-1-20',
    )
  })

  it('uses level 4 for corrupted exceptional gems (Empower/Enhance/Enlighten +1)', () => {
    const item = {
      name: 'Empower Support',
      baseType: 'Empower Support',
      rarity: 'Gem',
      itemClass: 'Support Gems',
      gemLevel: 4,
      quality: 0,
      corrupted: true,
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/empower-support-4c',
    )
  })

  it('uses level 5 for awakened exceptional gems (no separate corrupted variant)', () => {
    const corruptedAt5 = {
      name: 'Awakened Empower Support',
      baseType: 'Awakened Empower Support',
      rarity: 'Gem',
      itemClass: 'Support Gems',
      gemLevel: 5,
      quality: 20,
      corrupted: true,
    }
    // Awakened only has 1 and 5 -- no "5c" or "6". Corruption suffix is dropped.
    expect(ninjaLinkUrl(corruptedAt5, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/awakened-empower-support-5-20',
    )
  })

  it('uses level 6 / 7 for Brand Recall (special max 6, corrupted +1 = 7)', () => {
    const at6 = {
      name: 'Brand Recall',
      baseType: 'Brand Recall',
      rarity: 'Gem',
      itemClass: 'Skill Gems',
      gemLevel: 6,
      quality: 20,
    }
    const at7Corrupt = { ...at6, gemLevel: 7, corrupted: true }
    expect(ninjaLinkUrl(at6, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/brand-recall-6-20',
    )
    expect(ninjaLinkUrl(at7Corrupt, 1, 'Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/mirage/skill-gems/brand-recall-7-20c',
    )
  })

  it('looks up standard leagues via the slug map', () => {
    const item = { name: 'Headhunter', baseType: 'Leather Belt', rarity: 'Unique', itemClass: 'Belts' }
    expect(ninjaLinkUrl(item, 1, 'Standard', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/standard/unique-accessories/headhunter-leather-belt',
    )
    expect(ninjaLinkUrl(item, 1, 'Hardcore', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/hardcore/unique-accessories/headhunter-leather-belt',
    )
  })

  it('looks up Hardcore challenge leagues via the slug map', () => {
    const item = { name: 'Headhunter', baseType: 'Leather Belt', rarity: 'Unique', itemClass: 'Belts' }
    expect(ninjaLinkUrl(item, 1, 'Hardcore Mirage', POE1_SLUGS)).toBe(
      'https://poe.ninja/poe1/economy/miragehc/unique-accessories/headhunter-leather-belt',
    )
  })

  it('routes a PoE2 currency item to the correct category via priceInfo.ninjaCategory', () => {
    const item = { name: 'Divine Orb', baseType: 'Divine Orb', rarity: 'Currency', itemClass: 'Stackable Currency' }
    const priceInfo = { chaosValue: 100, divineValue: 1, ninjaCategory: 'currency' }
    expect(ninjaLinkUrl(item, 2, 'Fate of the Vaal', POE2_SLUGS, priceInfo)).toBe(
      'https://poe.ninja/poe2/economy/vaal/currency/divine-orb',
    )
  })

  it('routes a PoE2 breach catalyst item to the correct category via priceInfo.ninjaCategory', () => {
    const item = {
      name: 'Neural Catalyst',
      baseType: 'Neural Catalyst',
      rarity: 'Currency',
      itemClass: 'Stackable Currency',
    }
    const priceInfo = { chaosValue: 10, divineValue: 0.1, ninjaCategory: 'breach-catalyst' }
    expect(ninjaLinkUrl(item, 2, 'Fate of the Vaal', POE2_SLUGS, priceInfo)).toBe(
      'https://poe.ninja/poe2/economy/vaal/breach-catalyst/neural-catalyst',
    )
  })

  it('routes a PoE2 unique to its category and base-disambiguated slug via priceInfo.ninjaCategory', () => {
    const item = { name: 'Grand Spectrum', baseType: 'Emerald', rarity: 'Unique', itemClass: 'Jewels' }
    const priceInfo = { chaosValue: 40250, divineValue: 402.5, ninjaCategory: 'unique-jewels' }
    expect(ninjaLinkUrl(item, 2, 'Fate of the Vaal', POE2_SLUGS, priceInfo)).toBe(
      'https://poe.ninja/poe2/economy/vaal/unique-jewels/grand-spectrum-emerald',
    )
  })

  it('returns null for PoE2 when priceInfo is absent', () => {
    const item = { name: 'Chaos Orb', baseType: 'Chaos Orb', rarity: 'Currency', itemClass: 'Stackable Currency' }
    expect(ninjaLinkUrl(item, 2, 'Fate of the Vaal', POE2_SLUGS, undefined)).toBeNull()
  })

  it('returns null for PoE2 when priceInfo has no ninjaCategory field', () => {
    const item = { name: 'Chaos Orb', baseType: 'Chaos Orb', rarity: 'Currency', itemClass: 'Stackable Currency' }
    const priceInfo = { chaosValue: 50, divineValue: 0.5 }
    expect(ninjaLinkUrl(item, 2, 'Fate of the Vaal', POE2_SLUGS, priceInfo)).toBeNull()
  })

  it('returns null when the league is not in the slug map', () => {
    const item = { name: 'Headhunter', baseType: 'Leather Belt', rarity: 'Unique', itemClass: 'Belts' }
    expect(ninjaLinkUrl(item, 1, 'Unknown League', POE1_SLUGS)).toBeNull()
  })

  it('returns null for items poe.ninja does not price (rare equipment)', () => {
    const item = {
      name: 'Mind Locket Chain Belt',
      baseType: 'Chain Belt',
      rarity: 'Rare',
      itemClass: 'Belts',
    }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBeNull()
  })

  it('returns null for unknown item classes', () => {
    const item = { name: 'Whatever', baseType: 'Whatever', rarity: 'Unique', itemClass: 'Hideout Decorations' }
    expect(ninjaLinkUrl(item, 1, 'Mirage', POE1_SLUGS)).toBeNull()
  })
})

describe('ninjaUniqueDetailsUrl', () => {
  it('builds the page from the type segment and ninja detailsId', () => {
    expect(
      ninjaUniqueDetailsUrl('Covens', { Covens: 'covens' }, 'UniqueAccessory', 'mageblood-4-flasks-heavy-belt'),
    ).toBe('https://poe.ninja/poe1/economy/covens/unique-accessories/mageblood-4-flasks-heavy-belt')
  })

  it('returns null for an unknown league or type', () => {
    expect(ninjaUniqueDetailsUrl('Nope', { Covens: 'covens' }, 'UniqueArmour', 'x')).toBeNull()
    expect(ninjaUniqueDetailsUrl('Covens', { Covens: 'covens' }, 'Currency', 'x')).toBeNull()
  })
})
