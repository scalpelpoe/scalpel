/** Eligibility rules for the in-game Currency Exchange (Faustus on PoE1, Ange
 *  on PoE2). Used both for the price-check banner that nudges the user to the
 *  vendor and for the trade-router decision in main/trade/trade.ts on whether
 *  to issue a bulk-exchange query vs a regular search.
 *
 *  Add an item by dropping its class into the relevant set. Add a one-off base
 *  type to baseTypes when the class is too broad (e.g. Catalysts -- some on
 *  Faustus, some not, so we whitelist by name). Use exceptions to carve out
 *  classes that mostly qualify but have known holes. */

interface BulkExchangeRules {
  /** Display name of the in-game vendor running the exchange. */
  vendor: 'Faustus' | 'Ange'
  /** Classes whose items are exchangeable wholesale. */
  classes: ReadonlySet<string>
  /** Items in the matching class that aren't actually on the exchange. */
  exceptions: ReadonlySet<string>
  /** Specific base types eligible regardless of class. */
  baseTypes: ReadonlySet<string>
}

const POE1_RULES: BulkExchangeRules = {
  vendor: 'Faustus',
  classes: new Set([
    'Currency',
    'Stackable Currency',
    'Essences',
    'Delve Stackable Socketable Currency',
    'Delve Socketable Currency',
    'Scarabs',
    'Divination Cards',
    'Map Fragments',
  ]),
  exceptions: new Set([
    // Bound to a map area, so it has no fungible stack to exchange -- Faustus
    // does not carry it and the banner would be a dead end (#513).
    'Scrying Orb',
  ]),
  baseTypes: new Set([
    // Delirium
    'Delirium Orb',
    'Simulacrum',
    'Simulacrum Splinter',
    // Refracting
    'Refracting Fog',
    // Legion
    'Timeless Karui Emblem',
    'Timeless Maraketh Emblem',
    'Timeless Eternal Empire Emblem',
    'Timeless Templar Emblem',
    'Timeless Vaal Emblem',
    'Timeless Karui Splinter',
    'Timeless Maraketh Splinter',
    'Timeless Eternal Empire Splinter',
    'Timeless Templar Splinter',
    'Timeless Vaal Splinter',
    // Oils
    'Clear Oil',
    'Sepia Oil',
    'Amber Oil',
    'Verdant Oil',
    'Teal Oil',
    'Azure Oil',
    'Indigo Oil',
    'Violet Oil',
    'Crimson Oil',
    'Black Oil',
    'Opalescent Oil',
    'Silver Oil',
    'Golden Oil',
    // Catalysts
    'Turbulent Catalyst',
    'Imbued Catalyst',
    'Abrasive Catalyst',
    'Tempering Catalyst',
    'Fertile Catalyst',
    'Intrinsic Catalyst',
    'Prismatic Catalyst',
    // Omens
    'Omen of Amelioration',
    'Omen of Blanching',
    'Omen of Connections',
    'Omen of Corruption',
    'Omen of Damnation',
    "Omen of Death's Door",
    'Omen of Decimation',
    'Omen of Fortune',
    'Omen of Refreshment',
    'Omen of Return',
    'Omen of the Jeweller',
    'Omen of the Soul Devourer',
    'Omen of Whittling',
    // Tattoos
    'Tattoo of the Arohongui Moonwatcher',
    'Tattoo of the Hinekora Storyteller',
    'Tattoo of the Kitava Blood Drinker',
    'Tattoo of the Ramako Flint',
    'Tattoo of the Rongokurai War Striker',
    'Tattoo of the Tawhoa Shaman',
    'Tattoo of the Tukohama Warmonger',
    'Tattoo of the Valako Stormrider',
    // Expedition
    'Astragali',
    'Burial Medallion',
    'Exotic Coinage',
    'Scrap Metal',
    // Harvest
    'Vivid Lifeforce',
    'Wild Lifeforce',
    'Primal Lifeforce',
    'Sacred Lifeforce',
    // Runegrafts
    'Runegraft of the Dawn',
    'Runegraft of the Dusk',
    'Runegraft of the Eclipse',
    'Runegraft of the Equinox',
    'Runegraft of the Moon',
    'Runegraft of the Solstice',
    'Runegraft of the Stars',
    'Runegraft of the Sun',
    'Runegraft of the Twilight',
    // Allflames / Djinn
    'Allflame Ember',
    'Djinn Barya',
  ]),
}

const POE2_RULES: BulkExchangeRules = {
  vendor: 'Ange',
  classes: new Set([
    'Currency',
    'Stackable Currency',
    'Essences',
    'Runes',
    'Augment',
    'Idols',
    'Support Gems',
    'Uncut Skill Gems',
    'Uncut Spirit Gems',
    'Uncut Support Gems',
    'Map Fragments',
    'Pinnacle Keys',
    'Vault Keys',
    'Omen',
  ]),
  exceptions: new Set<string>(),
  baseTypes: new Set<string>(),
}

const RULES_BY_VERSION: Record<1 | 2, BulkExchangeRules> = { 1: POE1_RULES, 2: POE2_RULES }

/** True when the item is sold at the active game's in-game Currency Exchange
 *  vendor (Faustus on PoE1, Ange on PoE2). Distinct from the trade-router's
 *  `isBulkExchangeItem` in main/trade/trade.ts -- this one is "is the vendor
 *  the right place to price this", that one is "should we hit the bulk
 *  exchange API instead of regular search". */
export function isVendorExchangeItem(version: 1 | 2, itemClass: string, baseType: string, rarity?: string): boolean {
  const rules = RULES_BY_VERSION[version]
  if (rules.exceptions.has(baseType) || rules.exceptions.has(itemClass)) return false
  // Rare/Unique stackables (PoE1 beasts, anything analogous in PoE2) aren't
  // exchangeable wholesale even when their class would otherwise qualify.
  if ((rarity === 'Rare' || rarity === 'Unique') && itemClass === 'Stackable Currency') return false
  return rules.classes.has(itemClass) || rules.baseTypes.has(baseType)
}
