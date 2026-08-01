/** Shared types and URL builder for "Open in poewiki / poedb" buttons and
 *  app macros. Used by both main (macro routing) and renderer (button onClick,
 *  preload IPC subscription). */
import { hasGeneratedName, SKILL_GEM_CLASSES } from './poe-item'
import type { PriceInfo } from './types'

export type ExternalLinkTarget = 'wiki' | 'poedb'

/** Pick the lookup string the external site indexes by. Magic and Rare items
 *  show a randomized name (e.g. "Mind Locket Chain Belt") that has no page --
 *  see hasGeneratedName for why -- so the wiki/poedb keys those off the base
 *  type. Foulborn uniques carry a "Foulborn " prefix the page doesn't, so
 *  strip it. Everything else (Normal, Unique, Gem, Currency, Divination
 *  Cards, ...) is keyed by the displayed name. */
function externalLookupName(item: { name: string; baseType: string; rarity: string }): string {
  if (hasGeneratedName(item.rarity)) return item.baseType
  if (item.rarity === 'Unique' && item.name.startsWith('Foulborn ')) {
    return item.name.slice('Foulborn '.length)
  }
  return item.name
}

/** One config entry per target: hosts split by game version, the path prefix,
 *  and the per-target slug rule. wiki accepts URI-encoded names directly
 *  (MediaWiki 301s %20 to underscore, %27 round-trips). poedb is stricter --
 *  apostrophes get stripped and spaces become underscores before encoding. */
const TARGETS: Record<
  ExternalLinkTarget,
  {
    hostByVersion: Record<1 | 2, string>
    path: string
    slug: (rawName: string) => string
  }
> = {
  wiki: {
    hostByVersion: { 1: 'www.poewiki.net', 2: 'www.poe2wiki.net' },
    path: '/wiki/',
    slug: (raw) => encodeURIComponent(raw),
  },
  poedb: {
    hostByVersion: { 1: 'poedb.tw', 2: 'poe2db.tw' },
    path: '/us/',
    slug: (raw) => encodeURIComponent(raw.replace(/'/g, '').replace(/\s+/g, '_')),
  },
}

export function externalLinkUrl(
  target: ExternalLinkTarget,
  item: { name: string; baseType: string; rarity: string },
  poeVersion: 1 | 2,
): string {
  const cfg = TARGETS[target]
  return `https://${cfg.hostByVersion[poeVersion]}${cfg.path}${cfg.slug(externalLookupName(item))}`
}

// ─── poe.ninja deep-linking ──────────────────────────────────────────────────
//
// poe.ninja URLs look like https://poe.ninja/poe1/economy/<league>/<category>/<slug>.
// We mirror APT's algorithm verbatim (renderer/src/web/background/Prices.ts in
// awakened-poe-trade): slug is built from `${name}, ${variant}` (or just name if
// no variant), normalized + stripped + lowercased + spaces-to-hyphens. Variant
// carries the disambiguating data ninja's overview API exposes -- base type for
// uniques, level/quality/corrupted for gems, link count for 5L/6L uniques, etc.
//
// The category list is also taken from APT's NAMESPACE_MAP. We map our PoeItem
// shape into that taxonomy via ninjaCategory below.

/** Item shape needed for ninja URL/lookup derivation. Subset of PoeItem -- defining
 *  it locally so non-renderer callers (the prices module, future tests) don't have
 *  to depend on the full PoeItem type. */
export interface NinjaItemRef {
  name: string
  baseType: string
  rarity: string
  itemClass: string
  gemLevel?: number
  quality?: number
  corrupted?: boolean
  linkedSockets?: number
}

const NINJA_HOST_BY_VERSION: Record<1 | 2, string> = {
  1: 'https://poe.ninja/poe1/economy',
  2: 'https://poe.ninja/poe2/economy',
}

/** Item classes that map to "unique-armours" on poe.ninja. */
const NINJA_ARMOUR_CLASSES = new Set(['Body Armours', 'Helmets', 'Gloves', 'Boots', 'Shields', 'Quivers'])
/** Item classes that map to "unique-accessories". */
const NINJA_ACCESSORY_CLASSES = new Set(['Belts', 'Amulets', 'Rings'])
/** Item classes that map to "unique-weapons" (anything you swing or shoot). */
const NINJA_WEAPON_CLASSES = new Set([
  'Bows',
  'Wands',
  'Daggers',
  'Rune Daggers',
  'Claws',
  'Sceptres',
  'Staves',
  'Warstaves',
  'One Hand Maces',
  'One Hand Axes',
  'One Hand Swords',
  'Thrusting One Hand Swords',
  'Two Hand Maces',
  'Two Hand Axes',
  'Two Hand Swords',
  'Fishing Rods',
  // PoE2-only classes the unique-weapons bucket on ninja still accepts:
  'Crossbows',
  'Spears',
  'Flails',
  'Foci',
  'Quarterstaves',
])
/** Currency-like classes (everything that the clipboard buckets as "Stackable
 *  Currency" plus the Map Fragments / Delve socketables). Subcategorized
 *  downstream by baseType pattern -- the Class field alone isn't granular enough. */
const NINJA_CURRENCY_LIKE_CLASSES = new Set([
  'Currency',
  'Stackable Currency',
  'Map Fragments',
  'Misc Map Items',
  'Delve Socketable Currency',
  'Delve Stackable Socketable Currency',
  'Essences',
  'Scarabs',
])

/** APT's `denseInfoToDetailsId`, ported verbatim. The `: -` characters survive
 *  the strip (no real examples use them in our data today, but keeping them
 *  future-proofs the slug). The gem-variant separator is a SPACE (e.g. `21 20c`),
 *  which the trailing space-to-hyphen pass turns into `21-20c` in the URL. The
 *  slash in "21/20c" would be stripped, so that notation is NOT used. */
function ninjaSlug(name: string, variant?: string): string {
  const combined = variant ? `${name}, ${variant}` : name
  return combined
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9:\- ]/g, '')
    .toLowerCase()
    .replace(/ /g, '-')
}

/** Look up the poe.ninja URL slug for a league name using the provided map.
 *  Returns null when the league name has no entry (caller should hide the button). */
export function ninjaLeagueSegment(league: string, leagueSlugMap: Record<string, string>): string | null {
  return leagueSlugMap[league] ?? null
}

/** Map an item to its poe.ninja category segment, or null if the item isn't
 *  the kind of thing poe.ninja prices (rare equipment, magic flasks, etc.).
 *  Returned slugs are taken from APT's NAMESPACE_MAP -- the source of truth. */
function ninjaCategory(item: { name: string; baseType: string; rarity: string; itemClass: string }): string | null {
  const cls = item.itemClass
  if (item.rarity === 'Unique') {
    if (cls === 'Maps') return 'unique-maps'
    if (cls === 'Stackable Currency') return 'beasts' // captured beasts are Stackable Currency + Unique
    if (cls === 'Tinctures') return 'unique-tinctures'
    if (cls === 'Flasks') return 'unique-flasks'
    if (cls === 'Relics') return 'unique-relics'
    if (cls === 'Jewels' || cls === 'Abyss Jewels') return 'unique-jewels'
    if (NINJA_ARMOUR_CLASSES.has(cls)) return 'unique-armours'
    if (NINJA_ACCESSORY_CLASSES.has(cls)) return 'unique-accessories'
    if (NINJA_WEAPON_CLASSES.has(cls)) return 'unique-weapons'
    return null
  }
  if (cls === 'Divination Cards') return 'divination-cards'
  if (cls === 'Maps') return 'maps'
  if (SKILL_GEM_CLASSES.has(cls)) return 'skill-gems'
  // The clipboard's Class field is a single bucket "Stackable Currency" for nearly
  // every stackable currency-like item -- essences, scarabs, oils, etc. all arrive
  // tagged that way, not under their named classes. So we route subcategories by
  // baseType pattern instead. Map Fragments / Misc Map Items get the same treatment.
  if (NINJA_CURRENCY_LIKE_CLASSES.has(cls)) {
    const bt = item.baseType
    if (/Essence of /.test(bt)) return 'essences'
    if (/Scarab$/.test(bt)) return 'scarabs'
    if (/Fossil$/.test(bt)) return 'fossils'
    if (/Resonator$/.test(bt)) return 'resonators'
    if (/ Oil$/.test(bt)) return 'oils'
    if (/^Omen of /.test(bt)) return 'omens'
    if (/^Tattoo of /.test(bt)) return 'tattoos'
    if (/ Incubator$/.test(bt)) return 'incubators'
    if (/Delirium Orb$|^Simulacrum$|^Simulacrum Splinter$/.test(bt)) return 'delirium-orbs'
    if (/^Vial of /.test(bt)) return 'vials'
    if (/Coffin$/.test(bt)) return 'coffins'
    if (/^Allflame Ember/.test(bt)) return 'allflame-embers'
    if (/^Runegraft of /.test(bt)) return 'runegrafts'
    if (/Lifeforce$/.test(bt) || /^(Astragali|Burial Medallion|Exotic Coinage|Scrap Metal)$/.test(bt))
      return 'artifacts'
    if (/^The .* Invitation$|Invitation$/.test(bt)) return 'invitations'
    // Map Fragments / Misc Map Items default to /fragments when no specific
    // baseType pattern matched (sacrifice frags, breach splinters, timeless
    // emblems, etc.); everything else falls through to /currency, which also
    // acts as ninja's hub-with-cross-links page.
    if (cls === 'Map Fragments' || cls === 'Misc Map Items') return 'fragments'
    return 'currency'
  }
  return null
}

// ─── Gem-tier snapping rules ────────────────────────────────────────────────
//
// poe.ninja only prices a fixed set of (level, corrupted) combos per gem family.
// Anything between those gets snapped to the closest priced variant so the
// generated URL/lookup hits a real entry instead of 404'ing or returning null.
//
// Rules (per user spec):
//   - "Other" gems: levels 1, 20, 21 (21 = corrupted +1).
//   - Regular Exceptional (Empower/Enhance/Enlighten Support): 1, 3, 4.
//   - Awakened Exceptional (Awakened Empower/Enhance/Enlighten Support): 1, 5.
//     Ninja doesn't list a separate corrupted variant for these.
//   - Brand Recall: 1, 6, 7 (special max level).
// Quality:
//   - < 20: omit entirely (ninja URL has no `/quality` segment, e.g.
//     `vaal-haste-21c` for a 21 corrupted with no quality).
//   - 20-22: snap to 20.
//   - 23: keep 23.

interface GemTier {
  /** Level for unleveled / low-level gems. Always 1. */
  base: number
  /** Top non-corrupted level for this gem family. */
  normal: number
  /** Corrupted +1 max, if ninja prices a separate corrupted variant. */
  corrupted?: number
}

const EXCEPTIONAL_GEMS = new Set(['Empower Support', 'Enhance Support', 'Enlighten Support'])
const AWAKENED_EXCEPTIONAL_GEMS = new Set([
  'Awakened Empower Support',
  'Awakened Enhance Support',
  'Awakened Enlighten Support',
])

function gemTier(name: string): GemTier {
  if (name === 'Brand Recall') return { base: 1, normal: 6, corrupted: 7 }
  if (AWAKENED_EXCEPTIONAL_GEMS.has(name)) return { base: 1, normal: 5 }
  if (EXCEPTIONAL_GEMS.has(name)) return { base: 1, normal: 3, corrupted: 4 }
  return { base: 1, normal: 20, corrupted: 21 }
}

function snapGemLevel(rawLevel: number, tier: GemTier, corrupted: boolean): { level: number; corruptSuffix: boolean } {
  // Use the corrupted +1 slot only if ninja actually prices it for this family
  // and the gem is at-or-above the normal max (a corrupted level 4 Hatred
  // doesn't exist; only the post-corrupt 21 does).
  if (corrupted && tier.corrupted != null && rawLevel >= tier.normal) {
    return { level: tier.corrupted, corruptSuffix: true }
  }
  if (rawLevel >= tier.normal) return { level: tier.normal, corruptSuffix: false }
  return { level: tier.base, corruptSuffix: false }
}

function snapGemQuality(rawQuality: number): number | undefined {
  if (rawQuality >= 23) return 23
  if (rawQuality >= 20) return 20
  return undefined
}

function gemVariant(item: {
  name: string
  gemLevel?: number
  quality?: number
  corrupted?: boolean
}): string | undefined {
  const lvl = item.gemLevel ?? 0
  const q = item.quality ?? 0
  if (lvl === 0 && q === 0 && !item.corrupted) return undefined
  const tier = gemTier(item.name)
  const { level, corruptSuffix } = snapGemLevel(lvl, tier, !!item.corrupted)
  const snappedQuality = snapGemQuality(q)
  const suffix = corruptSuffix ? 'c' : ''
  // Ninja's slug formula strips "/" but preserves spaces (then turns them to
  // hyphens), so use a space separator -- "21 20c" becomes "21-20c" in the URL.
  return snappedQuality != null ? `${level} ${snappedQuality}${suffix}` : `${level}${suffix}`
}

/** Compute the variant string ninja's dense API uses to disambiguate items of
 *  the same name. Single source of truth -- both the URL builder and the price
 *  lookup pull from this so they always agree.
 *   - Uniques: variant = baseType (e.g. "Heavy Belt"), with optional ", NL"
 *     link suffix for 5L/6L items.
 *   - Skill gems: snapped (level, quality, corrupted) per gemVariant rules.
 *   - Beasts (name == baseType), currency, div cards, etc.: no variant.
 */
export function deriveItemVariant(item: NinjaItemRef): string | undefined {
  if (SKILL_GEM_CLASSES.has(item.itemClass)) return gemVariant(item)
  if (item.rarity === 'Unique' && item.baseType && item.baseType !== item.name) {
    const links = item.linkedSockets ?? 0
    return links >= 5 ? `${item.baseType}, ${links}L` : item.baseType
  }
  return undefined
}

/** Build a poe.ninja deep-link for the given item under the given league, or
 *  null if we don't know how to classify it or the league slug isn't in the map.
 *
 * For PoE2, the category is read from priceInfo.ninjaCategory (tagged at fetch
 * time from the source API type). If priceInfo is absent or has no ninjaCategory,
 * we return null so the button hides -- PoE2's catalogue is incomplete and the
 * base-type routing logic is unreliable for PoE2 items.
 *
 * For PoE1, priceInfo is ignored and the existing baseType-pattern routing applies. */
export function ninjaLinkUrl(
  item: NinjaItemRef,
  poeVersion: 1 | 2,
  league: string,
  leagueSlugMap: Record<string, string>,
  priceInfo?: PriceInfo,
): string | null {
  const leagueSegment = ninjaLeagueSegment(league, leagueSlugMap)
  if (!leagueSegment) return null

  const category = poeVersion === 2 ? (priceInfo?.ninjaCategory ?? null) : ninjaCategory(item)
  if (!category) return null

  const variant = deriveItemVariant(item)
  const slug = ninjaSlug(item.name, variant)
  if (!slug) return null
  return `${NINJA_HOST_BY_VERSION[poeVersion]}/${leagueSegment}/${category}/${slug}`
}
