// Scrapes the current atlas and each map's divination card drops from poedb.
//
// Maps of Exile (sync-league-data.js) lags behind atlas rotations: after 3.30
// it still listed the 3.29 100-map atlas and the old per-map card pools
// (Graveyard kept Azyran's Reward / Damnation / The One With All). poedb is
// datamined per patch, so this walks its "Atlas Linked" graph from a seed map
// to discover the live atlas, and reads each map's "Divination Card" row.
//
// The output overlays the Maps of Exile data in
// src/renderer/src/features/div-card-explorer/constants.ts: it decides which
// maps are on the atlas and which cards drop in them. Re-run on every atlas
// rotation: npm run sync-div-map-drops
const fs = require('node:fs')
const path = require('node:path')

const BASE = 'https://poedb.tw/us/'
const SEED = { id: 'MapWorldsGraveyard', href: 'Graveyard' }
const OUT = path.join(__dirname, '..', 'src', 'shared', 'data', 'economy', 'div-map-drops.json')
// A 3.x atlas is 100-150 maps; far outside that means the page layout changed.
const MIN_MAPS = 90
const MAX_MAPS = 200

const decode = (s) =>
  s
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim()

/** The <td> that follows a row label in poedb's area info table. */
function rowCell(html, label) {
  const m = html.match(new RegExp(`<tr><td>${label}</td><td>([\\s\\S]*?)</td></tr>`))
  return m ? m[1] : null
}

function parsePage(html) {
  const linked = []
  const linkedCell = rowCell(html, 'Atlas Linked')
  if (linkedCell) {
    for (const m of linkedCell.matchAll(/data-hover="\?s=Data%5CWorldAreas%2F([^"]+)" href="([^"]+)"/g)) {
      linked.push({ id: decodeURIComponent(m[1]), href: m[2] })
    }
  }
  const cards = []
  const cardCell = rowCell(html, 'Divination Card')
  if (cardCell) {
    for (const m of cardCell.matchAll(/<a class="divination[^"]*"[^>]*>([\s\S]*?)<\/a>\s*(?:\(tier (\d+)\+\))?/g)) {
      const card = { name: decode(m[1]) }
      if (m[2]) card.min_tier = Number(m[2])
      cards.push(card)
    }
  }
  const title = html.match(/<title>([^<|]+)/)
  return { name: title ? decode(title[1]).replace(/\s*-\s*PoEDB.*$/i, '') : null, linked, cards }
}

async function fetchPage(href) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + href, { headers: { 'User-Agent': 'Mozilla/5.0 (scalpel data sync)' } })
    if (res.ok) return res.text()
    if (attempt >= 3) throw new Error(`${href}: HTTP ${res.status}`)
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
}

async function main() {
  const seen = new Map([[SEED.id, SEED.href]])
  const queue = [SEED]
  const maps = {}
  const skipped = new Set()
  while (queue.length) {
    const { id, href } = queue.shift()
    const page = parsePage(await fetchPage(href))
    if (!page.linked.length) throw new Error(`${href}: no "Atlas Linked" row -- poedb layout changed?`)
    maps[id] = { name: page.name, cards: page.cards }
    for (const l of page.linked) {
      // Atlas links also reach league content (Simulacrum, Synthesis); only
      // regular maps carry the MapWorlds* area id.
      if (!/^MapWorlds/.test(l.id) || /Unique$/.test(l.id)) {
        skipped.add(`${l.id} (${l.href})`)
        continue
      }
      if (!seen.has(l.id)) {
        seen.set(l.id, l.href)
        queue.push(l)
      }
    }
    process.stdout.write(`\r  ${Object.keys(maps).length} maps, ${queue.length} queued `)
    await new Promise((r) => setTimeout(r, 250))
  }
  process.stdout.write('\n')

  const count = Object.keys(maps).length
  if (count < MIN_MAPS || count > MAX_MAPS) throw new Error(`walked ${count} maps, expected ${MIN_MAPS}-${MAX_MAPS}`)

  const sorted = Object.fromEntries(Object.entries(maps).sort(([a], [b]) => a.localeCompare(b)))
  const out = { source: 'poedb.tw', generated_at: new Date().toISOString().slice(0, 10), maps: sorted }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf-8')
  const cardCount = Object.values(sorted).reduce((n, m) => n + m.cards.length, 0)
  console.log(`Saved ${path.basename(OUT)}: ${count} atlas maps, ${cardCount} map/card pairs`)
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
