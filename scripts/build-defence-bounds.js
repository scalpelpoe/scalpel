#!/usr/bin/env node
/**
 * Build src/shared/data/items/defence-bounds-poe1.json from RePoE-fork.
 *
 * PoE1 armour bases roll their base defences within a per-base range
 * (randomised base defences). base_items.json exposes the range as
 * properties.{armour,evasion,energy_shield,ward} = { min, max }.
 *
 * Emits a compact map: displayBaseType -> { ar/ev/es/ward: [min, max] }.
 * Only released bases with at least one rolling range (min < max) are kept.
 *
 * Source: https://repoe-fork.github.io/ (PoE1). Build-time only; the emitted
 * JSON is bundled. Attribution to RePoE-fork.
 *
 * Usage: node scripts/build-defence-bounds.js
 */

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')

const SOURCE = 'https://repoe-fork.github.io/base_items.json'
const OUT_PATH = path.join(__dirname, '..', 'src', 'shared', 'data', 'items', 'defence-bounds-poe1.json')

// RePoE property key -> compact sheet key (trade API naming: ar/ev/es/ward).
const DEFENCE_KEYS = [
  ['armour', 'ar'],
  ['evasion', 'ev'],
  ['energy_shield', 'es'],
  ['ward', 'ward'],
]

/** Deep-equal check for two bounds objects (shallow key set, tuple values). */
function boundsEqual(a, b) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => b[k] && b[k][0] === a[k][0] && b[k][1] === a[k][1])
}

/** Pure: base_items.json object -> { baseName: { ar?: [min,max], ... } }.
 *
 * Some display names are shared by multiple released metadata paths with
 * DIFFERENT defence ranges (e.g. "Two-Toned Boots" has separate Armour/Evasion,
 * Armour/Energy Shield, and Evasion/Energy Shield variants). The clipboard base
 * name alone can't disambiguate which variant an item is, so a conflicting
 * duplicate is dropped entirely rather than guessing - no bounds is safer than
 * wrong bounds. A duplicate whose bounds are identical to the kept entry is
 * harmless and kept silently. */
function buildBounds(baseItems) {
  const out = {}
  const conflicted = new Set() // names dropped for a bounds conflict; never resurface
  for (const meta of Object.keys(baseItems)) {
    const entry = baseItems[meta]
    if (!entry || entry.release_state !== 'released') continue
    const props = entry.properties || {}
    const bounds = {}
    for (const [propKey, outKey] of DEFENCE_KEYS) {
      const p = props[propKey]
      if (!p || typeof p.min !== 'number' || typeof p.max !== 'number') continue
      if (p.min >= p.max) continue // fixed value, nothing rolls
      bounds[outKey] = [p.min, p.max]
    }
    if (Object.keys(bounds).length === 0) continue
    const name = entry.name
    if (conflicted.has(name)) continue // already dropped for this name, stay dropped
    if (out[name]) {
      if (boundsEqual(out[name], bounds)) continue // identical duplicate, harmless
      console.warn(`conflicting bounds for duplicate base name "${name}", dropping`)
      delete out[name]
      conflicted.add(name)
      continue
    }
    out[name] = bounds
  }
  return out
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'scalpel-build-defence-bounds' } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`${url}: HTTP ${res.statusCode}`))
          res.resume()
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      })
      .on('error', reject)
  })
}

async function main() {
  const body = await httpGet(SOURCE)
  const bounds = buildBounds(JSON.parse(body))
  const json = `${JSON.stringify(bounds)}\n`
  fs.writeFileSync(OUT_PATH, json, 'utf8')
  console.log(`wrote ${OUT_PATH}: ${Object.keys(bounds).length} bases, ${(json.length / 1024).toFixed(1)}KB`)
}

module.exports = { buildBounds }

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
