#!/usr/bin/env node
/**
 * Build src/shared/data/trade/tablet-mods.json -- a lookup from a PoE2 tablet's
 * clipboard mod phrasing to the trade API explicit stat id it should search.
 *
 * Why this exists: tablet (precursor tablet) affixes are regular `explicit.*`
 * map mods, but the in-game clipboard phrases them differently from the trade
 * API's stat text ("...Waystones found in Map" vs "...Waystones found", "Map is
 * inhabited by 1 additional Rogue Exile" vs "Your Maps are inhabited by #
 * additional Rogue Exile"). Scalpel matches clipboard text against the live
 * trade2 /data/stats text, which never contains the tablet phrasing, so the
 * normal matcher misses every tablet mod.
 *
 * Exiled-Exchange-2 (the sanctioned PoE2 reference, author kvan) already curates
 * every clipboard phrasing -> trade id mapping in its stats database under
 * `fromAreaMods` entries. We lift those matcher strings into a normalized
 * key -> explicit-stat-id map. The tablet producer normalizes each clipboard
 * line the same way and looks the id up directly.
 *
 * Source: <ee2>/dataParser/output/en/stats.ndjson  (one stat per line)
 *   GitHub: https://github.com/Kvan7/Exiled-Exchange-2
 *
 * Usage:
 *   node scripts/build-tablet-mods.js [path-to-ee2-stats.ndjson]
 */

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_SRC = 'C:/www/Exiled-Exchange-2/dataParser/output/en/stats.ndjson'
const SRC = process.argv[2] || DEFAULT_SRC
const OUT = path.join(__dirname, '..', 'src', 'shared', 'data', 'trade', 'tablet-mods.json')

/** Normalize a mod line to a lookup key: lowercase, collapse whitespace, and
 *  replace every number token with `#` so a rolled value matches the placeholder.
 *  MUST stay in sync with normalizeTabletModKey in
 *  src/main/trade/stat-matcher/producers/tablets.ts. */
function normalizeKey(s) {
  return s
    .toLowerCase()
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

// Tablet (precursor tablet) affixes are map mods. EE2's `fromAreaMods` flag
// undercounts (it misses e.g. "inhabited by additional Rogue Exile"), so select
// by the internal map_* id, plus any stat carrying a map-context phrasing in its
// matchers ("in Map", "Map is/has...", "in your Maps"). Over-inclusion is safe:
// the lookup only runs for Tablet-class items, and an unused key never matches.
const TABLET_PHRASING = /( in map\b| in your maps\b|^map |^maps |maps are |maps have )/i
function isTabletMod(entry) {
  if (typeof entry.id === 'string' && entry.id.startsWith('map_')) return true
  return (entry.matchers ?? []).some((m) => TABLET_PHRASING.test(m.string ?? ''))
}

if (!fs.existsSync(SRC)) {
  console.error(`source not found: ${SRC}`)
  console.error('Pass the path to Exiled-Exchange-2 stats.ndjson as the first argument.')
  process.exit(1)
}

const lines = fs.readFileSync(SRC, 'utf-8').split('\n').filter(Boolean)
const map = {}
const conflicts = []
let areaMods = 0

for (const line of lines) {
  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    continue
  }
  if (!isTabletMod(entry)) continue
  const statId = entry.trade?.ids?.explicit?.[0]
  if (!statId) continue
  areaMods++
  for (const matcher of entry.matchers ?? []) {
    if (!matcher.string) continue
    const key = normalizeKey(matcher.string)
    if (map[key] && map[key] !== statId) {
      conflicts.push({ key, existing: map[key], incoming: statId })
      continue
    }
    map[key] = statId
  }
}

// EE2 folds some logically-single mods that GGG actually splits into TWO trade stats
// under one ref, listing both ids in trade.ids.explicit. The `explicit[0]` pick above
// then lands on the wrong id for the tablet/map context. EE2's ndjson does not say
// which id carries which text variant, so re-point the affected keys explicitly (the
// correct id is sourced from the live trade2 /data/stats catalog).
const STAT_ID_OVERRIDES = {
  // Abyss: [0] is the numeric "# additional Abysses" (stat_3490187949); the dedicated
  // singular "an additional Abyss" is stat_1070816711. The numeric stat misses every
  // singular-Abyss tablet, so route the valueless singular phrasings to the singular id.
  'area contains an additional abyss': 'explicit.stat_1070816711',
  'map contains an additional abyss': 'explicit.stat_1070816711',
  'your maps contain an additional abyss': 'explicit.stat_1070816711',
  // Azmeri Spirit: same singular/numeric split as Abyss. [0] is the numeric "# additional
  // Azmeri Spirit" (stat_358129101); the singular "an additional Azmeri Spirit" is
  // stat_775597083 (live-probed: 210 tablet listings). Only the map/boss singular phrasings
  // move; the numeric "# additional" keys stay on [0]. (No "Area contains an additional
  // Azmeri Spirit" text exists, so there is no area-singular key to route.)
  'map contains an additional azmeri spirit': 'explicit.stat_775597083',
  'areas with powerful map bosses contain an additional azmeri spirit': 'explicit.stat_775597083',
  // Strongbox: [0]=stat_3240183538 carries the numeric "# additional Strongboxes" AND
  // the singular "an additional Strongbox" text on ALL tablet bases -- the singular is
  // this same numeric stat's value-1 display, live-probed on Breach (218) and Overseer
  // (168) listings. A June fix mistakenly re-routed the Map/Your-Maps singular to
  // stat_3040603554, which only indexes Overseer Tablets (0 listings on Breach etc.),
  // so it zeroed every non-Overseer search. stat_3040603554 is the SEPARATE Overseer
  // boss-pool mod (legacy "Areas with Powerful Map Bosses..." text); its shared-text
  // ambiguity with the regular mod is resolved at runtime in tablets.ts via the
  // advanced-mod suffix name ("of Compartments"), not by this flat text table.
  'areas with powerful map bosses contain an additional strongbox': 'explicit.stat_3040603554',
  // Experience gain: [0] is the generic stat_3666934677 (shared with the rune stat);
  // the map-scoped variant -- the id that carries the "...in Map" text and is the one
  // tablets/maps are indexed under -- is stat_57434274. Route every tablet experience
  // phrasing there so the price check searches the stat the item is actually indexed
  // under instead of the generic (non-map) one.
  '#% increased experience gain': 'explicit.stat_57434274',
  '#% increased experience gain in map': 'explicit.stat_57434274',
  '#% increased experience gain in your maps': 'explicit.stat_57434274',
  '#% reduced experience gain': 'explicit.stat_57434274',
  '#% reduced experience gain in map': 'explicit.stat_57434274',
  '#% reduced experience gain in your maps': 'explicit.stat_57434274',
  // Gold found: [0] is the generic stat_1133965702 ("...in this Area"); the map-scoped
  // "(Gold Piles)" variant -- the id that carries the "...in Map (Gold Piles)" text and
  // is the one tablets/maps are indexed under -- is stat_1276056105. Route every tablet
  // gold phrasing there so the price check searches the stat the item is indexed under.
  '#% increased gold found in map': 'explicit.stat_1276056105',
  '#% increased gold found in this area': 'explicit.stat_1276056105',
  '#% increased gold found in your maps': 'explicit.stat_1276056105',
  '#% reduced gold found in map': 'explicit.stat_1276056105',
  '#% reduced gold found in this area': 'explicit.stat_1276056105',
  '#% reduced gold found in your maps': 'explicit.stat_1276056105',
  // Delirium Fog duration (issue #471): GGG has two identical-text stats "Delirium Fog
  // in Map/Area lasts # additional seconds before dissipating"; EE2 folds both ids under
  // one ref and [0] = stat_1174954559 is a dead index (live-probed 0 listings); the
  // indexed twin is stat_3226351972 (1692 listings; also confirmed by the reporter's
  // working search).
  'delirium fog in area lasts # additional seconds before dissipating': 'explicit.stat_3226351972',
  'delirium fog in map lasts # additional seconds before dissipating': 'explicit.stat_3226351972',
  'delirium fog in your maps lasts # additional seconds before dissipating': 'explicit.stat_3226351972',
  // Summoning Circle chance (issue #471): EE2's stat_866117935 was delisted from the
  // live trade2 stats catalog (an unresolvable id makes the trade site open a BLANK
  // query); the live id is stat_267210597 (probed: 5123 tablet listings).
  'area has #% increased chance to contain a summoning circle': 'explicit.stat_267210597',
  'area has #% reduced chance to contain a summoning circle': 'explicit.stat_267210597',
  'map has #% increased chance to contain a summoning circle': 'explicit.stat_267210597',
  'map has #% reduced chance to contain a summoning circle': 'explicit.stat_267210597',
  // Legacy Overseer boss-pool phrasings for shrine/essence (the "Areas with [Map]
  // Powerful Map Bosses contain an additional X" texts live under the boss ids in the
  // catalog; note the first shrine key mirrors GGG's own typo "Areas with Map Powerful
  // Map Bosses").
  'areas with powerful map bosses contain an additional shrine': 'explicit.stat_3042527515',
  'areas with map powerful map bosses contain an additional shrine': 'explicit.stat_3042527515',
  'areas with powerful map bosses contain an additional essence': 'explicit.stat_2162684861',
}
for (const [key, id] of Object.entries(STAT_ID_OVERRIDES)) {
  if (map[key]) map[key] = id
  else console.log(`  override key absent from source (EE2 phrasing changed?): "${key}"`)
}

// These mods' trade stat ids were removed from the live trade2 /data/stats catalog in
// 0.3.x with no retext successor (verified 2026-07-03); an id the trade site cannot
// resolve kills the whole query (blank page), so drop the keys -- buildTabletFilters
// then falls back to the live-text matcher, misses, and skips the mod, leaving the rest
// of the search intact. Remove when EE2 drops them too (the "removed" log line goes quiet).
const DELISTED_KEYS = [
  // stat_1443457598 / stat_2885317882 (union of souls), stat_166883716 (monster defences), stat_2068415277 (player defences)
  'natural rare monsters in area are in a union of souls with the map boss',
  'natural monster packs in area are in a union of souls',
  'monsters have #% increased defences',
  'monsters have #% reduced defences',
  'players have #% less defences',
  'players have #% more defences',
]
for (const key of DELISTED_KEYS) {
  if (map[key]) {
    delete map[key]
    console.log(`  removed delisted key: "${key}"`)
  } else console.log(`  delisted key already absent from source: "${key}"`)
}

const sorted = {}
for (const key of Object.keys(map).sort()) sorted[key] = map[key]

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`)

console.log(`wrote ${OUT}`)
console.log(`  ${areaMods} area mods, ${Object.keys(sorted).length} clipboard phrasings`)
if (conflicts.length > 0) {
  console.log(`  ${conflicts.length} conflicting keys skipped (first-wins):`)
  for (const c of conflicts) console.log(`    "${c.key}": ${c.existing} (kept) vs ${c.incoming}`)
}
