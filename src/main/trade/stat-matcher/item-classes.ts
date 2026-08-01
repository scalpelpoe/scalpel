// ─── Item Class to Trade Category ─────────────────────────────────────────────

export const ITEM_CLASS_TO_CATEGORY: Record<string, string> = {
  // Shared between PoE1 and PoE2 (clipboard plural form -> trade `category` id).
  Rings: 'accessory.ring',
  Amulets: 'accessory.amulet',
  Belts: 'accessory.belt',
  Helmets: 'armour.helmet',
  'Body Armours': 'armour.chest',
  Gloves: 'armour.gloves',
  Boots: 'armour.boots',
  Shields: 'armour.shield',
  Quivers: 'armour.quiver',
  Bows: 'weapon.bow',
  Claws: 'weapon.claw',
  Daggers: 'weapon.dagger',
  'One Hand Axes': 'weapon.oneaxe',
  'One Hand Maces': 'weapon.onemace',
  'One Hand Swords': 'weapon.onesword',
  Sceptres: 'weapon.sceptre',
  Staves: 'weapon.staff',
  'Thrusting One Hand Swords': 'weapon.onesword',
  'Two Hand Axes': 'weapon.twoaxe',
  'Two Hand Maces': 'weapon.twomace',
  'Two Hand Swords': 'weapon.twosword',
  Wands: 'weapon.wand',
  Warstaves: 'weapon.warstaff',
  'Rune Daggers': 'weapon.runedagger',
  Jewels: 'jewel',
  Flasks: 'flask',
  // PoE2-only classes that have live listings. Keeping them in the same map
  // is safe -- no key collides with PoE1, and stat-matcher / trade.ts both
  // look up by the exact class name the clipboard reports. Without these
  // entries the trade router falls back to `query.type = baseType`, which
  // constrains the search to one base type when the user wants the whole
  // class. Excluded classes that PoE2 players never see drops in (Claws,
  // Daggers, Flails, 1H/2H Swords + Axes, Trap Tools) -- adding them here
  // would point the router at a category with zero live listings.
  Bucklers: 'armour.buckler',
  Crossbows: 'weapon.crossbow',
  Spears: 'weapon.spear',
  Foci: 'armour.focus',
  'Fishing Rods': 'weapon.rod',
  Talismans: 'weapon.talisman',
  // PoE2 clipboard reports "Quarterstaves" where PoE1 reports "Warstaves";
  // both map to the same trade category.
  Quarterstaves: 'weapon.warstaff',
  // PoE2 Trial-of-the-Sekhemas relics. Their affixes live under the trade API's
  // sanctum.* stat family (see the relic producer), not explicit.*.
  Relics: 'sanctum.relic',
  // PoE2 precursor tablets. Affixes are explicit map mods but the clipboard
  // phrases them differently than the trade stat text (see the tablet producer).
  Tablet: 'map.tablet',
  // PoE2 waystones (the maps of PoE2). Property block (tier/rarity/packsize/...)
  // searches via map_filters; monster affixes via the normal explicit matcher.
  Waystones: 'map.waystone',
  // PoE1 charts (Allflame league). Routing through the category leaves
  // query.type unset so the zone chip can pin it to the discriminator form;
  // without this entry the generic branch would hard-set query.type to the
  // base type and the zone could not override it cleanly.
  Chart: 'chart',
}

// ─── Item Class to Trade-Stat Qualifier ───────────────────────────────────────

// Item class -> the trailing trade-stat qualifier its mods should prefer. The trade
// API tags otherwise-identical display text (e.g. "#% increased Duration") with
// "(Charm)"/"(Flask)"/"(Jewel)" to disambiguate; the clipboard carries only the bare
// text, so we tell the matcher which qualified variant to pick (issue #397).
export const QUALIFIER_BY_ITEM_CLASS: Record<string, string> = {
  Charms: 'Charm',
  // PoE1 flask copies say "Flasks"; PoE2 splits the class into "Life Flasks" /
  // "Mana Flasks", so all three must point at the "(Flask)" qualifier (issue #466).
  Flasks: 'Flask',
  'Life Flasks': 'Flask',
  'Mana Flasks': 'Flask',
  Jewels: 'Jewel',
  'Abyss Jewels': 'Jewel',
  // PoE1 staff-block twin is tagged "(Staves)" on the trade API; prefer it for
  // staves so unique staff searches don't land on the untagged jewel id.
  Staves: 'Staves',
  Warstaves: 'Staves',
  // A corrupted shield's "+#% Chance to Block" implicit is published only as
  // "+#% Chance to Block (Shields)" -- unlike the staff block implicit there is
  // no unqualified twin for the explicit-stat fallback to land on, so without
  // this the row is dropped entirely.
  Shields: 'Shields',
}

const ARMOUR_CLASSES = new Set([
  'Helmets',
  'Body Armours',
  'Gloves',
  'Boots',
  'Shields',
  // PoE2 offhand/armour classes that roll local block / energy-shield mods
  'Bucklers',
  'Foci',
])
// Item classes that have local weapon mods
const WEAPON_CLASSES = new Set([
  'Bows',
  'Claws',
  'Crossbows',
  'Daggers',
  'Fishing Rods',
  'One Hand Axes',
  'One Hand Maces',
  'One Hand Swords',
  'Quarterstaves',
  'Rune Daggers',
  'Sceptres',
  'Spears',
  'Staves',
  'Talismans',
  'Thrusting One Hand Swords',
  'Two Hand Axes',
  'Two Hand Maces',
  'Two Hand Swords',
  'Wands',
  'Warstaves',
])

export { ARMOUR_CLASSES, WEAPON_CLASSES }
