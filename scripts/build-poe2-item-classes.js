#!/usr/bin/env node
/**
 * Build src/shared/data/items/item-classes-poe2.json from RePoE-fork's PoE2
 * base_items dataset.
 *
 * Source: https://repoe-fork.github.io/poe2/base_items.min.json
 *
 * The shipped JSON shape is `{ <ClassName>: { size: [w, h], bases: [...] } }`
 * keyed by the plural form the in-game clipboard uses ("Body Armours",
 * "Helmets") -- RePoE uses singular ("Body Armour", "Helmet") so we map.
 *
 * For classes whose bases vary in inventory size (Shields, TrapTools), we pick
 * the dominant size; the schema assumes one size per class and the cost of
 * the minority being off by a cell is just listing-card inventory rendering.
 *
 * Usage:
 *   node scripts/build-poe2-item-classes.js
 */

const fs = require('node:fs')
const path = require('node:path')

const SRC_URL = 'https://repoe-fork.github.io/poe2/base_items.min.json'
const TRADE_ITEMS_URL = 'https://www.pathofexile.com/api/trade2/data/items'
const CACHE = path.join(__dirname, 'local', 'poe2-base-items.json')
const TRADE_CACHE = path.join(__dirname, 'local', 'poe2-trade-items.json')
const OUT = path.join(__dirname, '..', 'src', 'shared', 'data', 'items', 'item-classes-poe2.json')

// Item classes whose RePoE-fork entries pass `release_state: 'released'` and
// even appear in trade2's static items catalog, but which a live trade2/search
// reports zero active listings for -- they're metadata-only PoE1 holdovers /
// unreleased content that PoE2 players never encounter. Verified against the
// active league with status=online; re-test if a PoE2 patch reintroduces any.
const EMPTY_IN_LIVE_TRADE = new Set([
  'Claw',
  'Dagger',
  'Flail',
  'One Hand Axe',
  'One Hand Sword',
  'Two Hand Axe',
  'Two Hand Sword',
  'TrapTool',
])

// RePoE singular class name -> in-game clipboard plural form. Anything not
// listed here is dropped (most of those are PoE1-only mechanics that won't
// appear in PoE2 clipboard text anyway).
const CLASS_NAME_MAP = {
  Amulet: 'Amulets',
  Belt: 'Belts',
  'Body Armour': 'Body Armours',
  Boots: 'Boots',
  Bow: 'Bows',
  Buckler: 'Bucklers',
  Claw: 'Claws',
  Crossbow: 'Crossbows',
  Dagger: 'Daggers',
  FishingRod: 'Fishing Rods',
  Flail: 'Flails',
  Focus: 'Foci',
  Gloves: 'Gloves',
  Helmet: 'Helmets',
  'One Hand Axe': 'One Hand Axes',
  'One Hand Mace': 'One Hand Maces',
  'One Hand Sword': 'One Hand Swords',
  Quiver: 'Quivers',
  Ring: 'Rings',
  Sceptre: 'Sceptres',
  Shield: 'Shields',
  Spear: 'Spears',
  Staff: 'Staves',
  Talisman: 'Talismans',
  TrapTool: 'Trap Tools',
  'Two Hand Axe': 'Two Hand Axes',
  'Two Hand Mace': 'Two Hand Maces',
  'Two Hand Sword': 'Two Hand Swords',
  Wand: 'Wands',
  Warstaff: 'Warstaves',
}

async function loadCachedJson(url, cachePath) {
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
  }
  console.log(`fetching ${url}`)
  // GGG blocks the default Node/undici UA; mirror what the trade UI sends.
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Scalpel-Build-Script/1.0',
    },
  })
  if (!res.ok) throw new Error(`fetch failed: ${url} ${res.status}`)
  const text = await res.text()
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(cachePath, text)
  return JSON.parse(text)
}

async function loadSource() {
  return loadCachedJson(SRC_URL, CACHE)
}

/** Authoritative set of base type names actually searchable in PoE2 trade.
 *  RePoE-fork's base_items.json carries unreleased / PoE1-leftover entries
 *  that look "released" but never made it to the live game (Claws, Trap Tools,
 *  half the swords, etc) -- diffing against trade2's real catalog drops them. */
async function loadTradeBaseTypes() {
  const data = await loadCachedJson(TRADE_ITEMS_URL, TRADE_CACHE)
  const wanted = new Set(['Weapons', 'Armour', 'Accessories'])
  const bases = new Set()
  for (const cat of data.result || []) {
    if (!wanted.has(cat.label)) continue
    for (const e of cat.entries || []) {
      // Entries with a `name` are uniques; bases have only `type`.
      if (!e.name && e.type) bases.add(e.type)
    }
  }
  return bases
}

function pickDominantSize(sizeCounts) {
  let best = null
  let bestCount = -1
  for (const [size, count] of Object.entries(sizeCounts)) {
    if (count > bestCount) {
      best = size
      bestCount = count
    }
  }
  return best.split('x').map(Number)
}

;(async () => {
  const [src, tradeBases] = await Promise.all([loadSource(), loadTradeBaseTypes()])

  const grouped = {}
  let droppedAsUnreleased = 0
  let droppedAsEmpty = 0
  for (const entry of Object.values(src)) {
    if (entry.release_state !== 'released') continue
    if (entry.domain !== 'item') continue
    if (!entry.name || !entry.item_class) continue
    if (EMPTY_IN_LIVE_TRADE.has(entry.item_class)) {
      droppedAsEmpty++
      continue
    }
    const mapped = CLASS_NAME_MAP[entry.item_class]
    if (!mapped) continue
    if (!tradeBases.has(entry.name)) {
      droppedAsUnreleased++
      continue
    }
    if (!grouped[mapped]) grouped[mapped] = { sizes: {}, bases: new Set() }
    const key = `${entry.inventory_width}x${entry.inventory_height}`
    grouped[mapped].sizes[key] = (grouped[mapped].sizes[key] ?? 0) + 1
    grouped[mapped].bases.add(entry.name)
  }

  const out = {}
  const sortedClasses = Object.keys(grouped).sort()
  for (const cls of sortedClasses) {
    const { sizes, bases } = grouped[cls]
    out[cls] = {
      bases: [...bases].sort(),
      size: pickDominantSize(sizes),
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)

  let baseCount = 0
  for (const cls of sortedClasses) baseCount += out[cls].bases.length
  console.log(`wrote ${OUT}`)
  console.log(`  ${sortedClasses.length} classes, ${baseCount} bases`)
  console.log(`  dropped ${droppedAsUnreleased} bases that aren't in trade2's catalog (unreleased / PoE1 leftover)`)
  console.log(`  dropped ${droppedAsEmpty} bases in classes empty on the live PoE2 league`)
})()
