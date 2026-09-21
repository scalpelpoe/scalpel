#!/usr/bin/env node
// Import reviewed GGG trade-fetch responses; do not guess art from item names.
const fs = require('node:fs')
const path = require('node:path')
const { validateMap } = require('./validate')

function collectCandidates(response, bundle) {
  if (!Array.isArray(response.result)) throw new Error('Expected a GGG trade-fetch result array')
  const candidates = new Map()
  for (const row of response.result) {
    const item = row?.item
    if (!item) continue
    // Same identity rule as Scalpel's runtime cache: unique art must never be
    // stored under its base type, nor may a missing unique name fall back to it.
    const name = item.rarity === 'Unique' ? item.name : item.baseType
    if (!name || !item.icon || Object.hasOwn(bundle, name)) continue
    validateMap(JSON.stringify({ [name]: item.icon }))
    if (candidates.has(name) && candidates.get(name) !== item.icon)
      throw new Error(`Conflicting artwork for ${name}; review the input before importing`)
    candidates.set(name, item.icon)
  }
  return candidates
}

async function main() {
  const index = process.argv.indexOf('--input')
  if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: npm run sync:poe2 -- --input <trade-fetch.json> [--dry-run]')
  const file = path.join(__dirname, '..', 'poe2.json')
  const bundle = validateMap(fs.readFileSync(file, 'utf8'))
  const candidates = collectCandidates(JSON.parse(fs.readFileSync(process.argv[index + 1], 'utf8')), bundle)
  for (const [name, url] of candidates) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${name}; no changes written`)
    bundle[name] = url
    console.log(`+ ${name}: ${url}`)
  }
  if (process.argv.includes('--dry-run')) return
  const sorted = Object.fromEntries(Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b, 'en')))
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n')
}

module.exports = { collectCandidates }
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1 })
