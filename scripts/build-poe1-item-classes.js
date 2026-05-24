#!/usr/bin/env node
/**
 * Build src/shared/data/items/item-classes-poe1.json from RePoE-fork's PoE1
 * base_items dataset.
 *
 * Source: https://repoe-fork.github.io/base_items.json
 *
 * Mirrors scripts/build-poe2-item-classes.js. Output shape matches the file
 * already shipped: `{ <ClassName>: { size: [w, h], bases: [...] } }` keyed by
 * the plural form the in-game clipboard uses ("Body Armours", "Helmets")
 * since RePoE itself uses singular ("Body Armour", "Helmet").
 *
 * Classes whose RePoE entries vary in inventory size pick the dominant size;
 * the schema assumes one size per class.
 *
 * Usage:
 *   node scripts/build-poe1-item-classes.js
 */

const fs = require('node:fs')
const path = require('node:path')

const SRC_URL = 'https://repoe-fork.github.io/base_items.json'
const CACHE = path.join(__dirname, 'local', 'poe1-base-items.json')
const OUT = path.join(__dirname, '..', 'src', 'shared', 'data', 'items', 'item-classes-poe1.json')

// RePoE singular class name -> in-game clipboard plural form. Anything not
// listed here is dropped; non-equipment classes (Currency, Gems, Maps,
// DivCards, etc.) live in the existing JSON without a `size` field and are
// preserved by merging the script's output back over the existing file.
const CLASS_NAME_MAP = {
  Amulet: 'Amulets',
  'Abyss Jewel': 'Abyss Jewels',
  Belt: 'Belts',
  'Body Armour': 'Body Armours',
  Boots: 'Boots',
  Bow: 'Bows',
  Claw: 'Claws',
  Dagger: 'Daggers',
  'Fishing Rod': 'Fishing Rods',
  Gloves: 'Gloves',
  Helmet: 'Helmets',
  Jewel: 'Jewels',
  'One Hand Axe': 'One Hand Axes',
  'One Hand Mace': 'One Hand Maces',
  'One Hand Sword': 'One Hand Swords',
  Quiver: 'Quivers',
  Ring: 'Rings',
  'Rune Dagger': 'Rune Daggers',
  Sceptre: 'Sceptres',
  Shield: 'Shields',
  Staff: 'Staves',
  'Thrusting One Hand Sword': 'Thrusting One Hand Swords',
  'Two Hand Axe': 'Two Hand Axes',
  'Two Hand Mace': 'Two Hand Maces',
  'Two Hand Sword': 'Two Hand Swords',
  Wand: 'Wands',
  Warstaff: 'Warstaves',
  Flask: 'Flasks',
}

async function loadCachedJson(url, cachePath) {
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
  }
  console.log(`fetching ${url}`)
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
  const src = await loadCachedJson(SRC_URL, CACHE)

  const grouped = {}
  for (const entry of Object.values(src)) {
    if (entry.release_state !== 'released') continue
    if (entry.domain !== 'item') continue
    if (!entry.name || !entry.item_class) continue
    const mapped = CLASS_NAME_MAP[entry.item_class]
    if (!mapped) continue
    if (!grouped[mapped]) grouped[mapped] = { sizes: {}, bases: new Set() }
    const key = `${entry.inventory_width}x${entry.inventory_height}`
    grouped[mapped].sizes[key] = (grouped[mapped].sizes[key] ?? 0) + 1
    grouped[mapped].bases.add(entry.name)
  }

  // Merge with existing file so non-equipment classes (Currency, Gems, Maps,
  // Divination Cards, etc.) are preserved untouched.
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf-8')) : {}
  // Legacy superclass entries that overlap with the real classes -- iteration
  // order in the renderer means these would overwrite the correct base->class
  // mapping with their bogus 1x1 size. No code references them.
  const LEGACY_DROP = new Set(['Axes', 'Maces', 'Swords'])
  const out = {}
  for (const [k, v] of Object.entries(existing)) {
    if (!LEGACY_DROP.has(k)) out[k] = v
  }

  const updates = []
  for (const cls of Object.keys(grouped).sort()) {
    const { sizes, bases } = grouped[cls]
    const newSize = pickDominantSize(sizes)
    const newBases = [...bases].sort()
    const oldSize = existing[cls]?.size
    const oldBases = existing[cls]?.bases ?? []
    const sizeChanged = !oldSize || oldSize[0] !== newSize[0] || oldSize[1] !== newSize[1]
    const basesAdded = newBases.filter((b) => !oldBases.includes(b))
    const basesRemoved = oldBases.filter((b) => !newBases.includes(b))
    if (sizeChanged) updates.push(`  ${cls}: size ${oldSize ? oldSize.join('x') : 'NEW'} -> ${newSize.join('x')}`)
    if (basesAdded.length)
      updates.push(
        `  ${cls}: +${basesAdded.length} bases (${basesAdded.slice(0, 3).join(', ')}${basesAdded.length > 3 ? ', ...' : ''})`,
      )
    if (basesRemoved.length)
      updates.push(
        `  ${cls}: -${basesRemoved.length} bases (${basesRemoved.slice(0, 3).join(', ')}${basesRemoved.length > 3 ? ', ...' : ''})`,
      )
    out[cls] = { bases: newBases, size: newSize }
  }

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)

  console.log(`wrote ${OUT}`)
  if (updates.length === 0) console.log('  (no changes)')
  else {
    console.log(`  ${updates.length} change(s):`)
    for (const u of updates) console.log(u)
  }
})()
