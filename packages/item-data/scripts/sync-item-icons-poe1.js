#!/usr/bin/env node
/**
 * Fill gaps in poe1.json.
 *
 * Two sources, in priority order:
 *
 *  1. https://www.pathofexile.com/api/trade/data/static -- the bulk-exchange
 *     lists. Every entry there carries GGG's own `/gen/image/...` URL, which is
 *     the pre-sized form the rest of the sheet already uses, so it always wins.
 *
 *  2. https://repoe-fork.github.io/base_items.json -- joined by item NAME to
 *     `visual_identity.dds_file`, which maps 1:1 onto `web.poecdn.com/image/<path>.png`.
 *     This covers everything the static lists don't sell in bulk (equipment
 *     bases, charts, enshrouded gear, gems). The direct-art form is unsized;
 *     every render site uses object-fit: contain, so that is fine.
 *
 * Scope is "currently tradeable": a name only qualifies if it appears in the
 * static lists or in /api/trade/data/items. That keeps dead league currency,
 * quest devices and [DNT] placeholders out of the sheet even though RePoE has
 * art for them.
 *
 * Never trust a CDN path to identify an item -- the join goes through RePoE's
 * `name` field in both directions, never through path-name plausibility.
 *
 * Every candidate URL is fetched before it is written; anything that doesn't
 * return 200 is dropped and reported. Existing entries are never overwritten.
 *
 * Usage:
 *   node scripts/sync-item-icons-poe1.js [--dry-run]
 */

const fs = require('node:fs')
const path = require('node:path')

const OUT = path.join(__dirname, '..', 'poe1.json')
const STATIC_URL = 'https://www.pathofexile.com/api/trade/data/static'
const ITEMS_URL = 'https://www.pathofexile.com/api/trade/data/items'
const REPOE_URL = 'https://repoe-fork.github.io/base_items.json'
const CDN = 'https://web.poecdn.com'

// pathofexile.com 403s anything that looks like a script. These are enough to
// get the public trade data endpoints; no session cookie is involved.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

const DRY_RUN = process.argv.includes('--dry-run')
const VERIFY_CONCURRENCY = 12

// Art under 2DItems/Effects/WrappingPaper/ is the only family RePoE names that
// the CDN refuses to serve at its direct path (404 on every variant), so the
// resolver can't reach it. These URLs were read off `item.icon` in a live
// trade fetch for the matching baseType -- GGG's own answer for the same item,
// which is why they're pinned rather than guessed. Verified like every other
// candidate before writing, so a stale pin drops out instead of shipping.
const PINNED = {
  'Enshrouded Body Armour':
    'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvRWZmZWN0cy9XcmFwcGluZ1BhcGVyL1Zlc3RpZ2lhbFNocm91ZGVkQm9keSIsInciOjIsImgiOjMsInNjYWxlIjoxfV0/3f2e22373f/VestigialShroudedBody.png',
  'Enshrouded Boots':
    'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvRWZmZWN0cy9XcmFwcGluZ1BhcGVyL1Zlc3RpZ2lhbFNocm91ZGVkQm9vdHMiLCJ3IjoyLCJoIjoyLCJzY2FsZSI6MX1d/d978d7514d/VestigialShroudedBoots.png',
  'Enshrouded Gloves':
    'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvRWZmZWN0cy9XcmFwcGluZ1BhcGVyL1Zlc3RpZ2lhbFNocm91ZGVkR2xvdmVzIiwidyI6MiwiaCI6Miwic2NhbGUiOjF9XQ/705391bad0/VestigialShroudedGloves.png',
  'Enshrouded Helmet':
    'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvRWZmZWN0cy9XcmFwcGluZ1BhcGVyL1Zlc3RpZ2lhbFNocm91ZGVkSGVsbWV0IiwidyI6MiwiaCI6Miwic2NhbGUiOjF9XQ/b194d87b2a/VestigialShroudedHelmet.png',
  'Enshrouded Shield':
    'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvRWZmZWN0cy9XcmFwcGluZ1BhcGVyL1Zlc3RpZ2lhbFNocm91ZGVkU2hpZWxkIiwidyI6MiwiaCI6Miwic2NhbGUiOjF9XQ/412ee9266d/VestigialShroudedShield.png',
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
  return res.json()
}

/** Names GGG currently lists as tradeable, plus the static lists' own art. */
function collectCandidates(staticData, itemsData, bundle) {
  const candidates = new Map()
  for (const group of staticData.result) {
    for (const entry of group.entries) {
      // `sep` rows are section headings ("Blueprints", "Maps"), not items.
      if (!entry.text || entry.id === 'sep' || bundle[entry.text]) continue
      if (!candidates.has(entry.text)) {
        candidates.set(entry.text, entry.image ? CDN + entry.image : null)
      }
    }
  }
  for (const group of itemsData.result) {
    for (const entry of group.entries) {
      // Bases only. Entries carrying `name` are uniques, and RePoE base_items
      // has no unique art -- looking one up by name silently joins against
      // whatever unrelated BASE shares that name (the unique jewel "Wildfire"
      // lands on an unreleased skill gem of the same name).
      if (entry.name || !entry.type) continue
      if (bundle[entry.type] || candidates.has(entry.type)) continue
      candidates.set(entry.type, null)
    }
  }
  return candidates
}

/** RePoE name -> direct CDN art URL. First entry wins: a handful of names are
 *  duplicated across metadata ids (GGG ships a "Copy" of some tattoos) and the
 *  duplicates share art anyway. */
function buildArtIndex(baseItems) {
  const index = new Map()
  for (const base of Object.values(baseItems)) {
    const dds = base.name && base.visual_identity && base.visual_identity.dds_file
    if (!dds || index.has(base.name)) continue
    // Internal placeholder bases are named after their own class and flagged
    // not_for_sale ("Ring" -> MirrorRing art). GGG's item list uses the same
    // bare word for "any ring", so the join looks valid and isn't. Real items
    // that happen to match their class name (Gold) aren't flagged.
    if (base.name === base.item_class && (base.tags || []).includes('not_for_sale')) continue
    index.set(base.name, `${CDN}/image/${dds.replace(/\.dds$/i, '.png')}`)
  }
  return index
}

async function verify(entries) {
  const ok = []
  const failed = []
  const queue = [...entries]
  const workers = Array.from({ length: VERIFY_CONCURRENCY }, async () => {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const [name, url] = next
      try {
        const res = await fetch(url, { method: 'GET', headers: BROWSER_HEADERS })
        if (res.ok) ok.push([name, url])
        else failed.push([name, url, `HTTP ${res.status}`])
      } catch (e) {
        failed.push([name, url, String(e.message || e)])
      }
    }
  })
  await Promise.all(workers)
  return { ok, failed }
}

async function main() {
  const bundle = JSON.parse(fs.readFileSync(OUT, 'utf8'))
  console.log(`bundle: ${Object.keys(bundle).length} icons`)

  const [staticData, itemsData, baseItems] = await Promise.all([
    getJson(STATIC_URL, BROWSER_HEADERS),
    getJson(ITEMS_URL, BROWSER_HEADERS),
    getJson(REPOE_URL),
  ])

  const candidates = collectCandidates(staticData, itemsData, bundle)
  const art = buildArtIndex(baseItems)

  const resolved = []
  const unresolved = []
  const bySource = { static: 0, pinned: 0, repoe: 0 }
  for (const [name, staticUrl] of candidates) {
    const url = staticUrl || PINNED[name] || art.get(name)
    if (!url) {
      unresolved.push(name)
      continue
    }
    bySource[staticUrl ? 'static' : PINNED[name] ? 'pinned' : 'repoe']++
    resolved.push([name, url])
  }
  console.log(
    `missing: ${candidates.size} | resolved: ${resolved.length} ` +
      `(${bySource.static} static, ${bySource.repoe} RePoE, ${bySource.pinned} pinned) ` +
      `| no art source: ${unresolved.length}`,
  )

  const { ok, failed } = await verify(resolved)
  if (failed.length) {
    console.log(`\ndropped ${failed.length} URL(s) that did not resolve:`)
    for (const [name, url, why] of failed) console.log(`  ${name} -- ${why} -- ${url}`)
  }

  ok.sort((a, b) => a[0].localeCompare(b[0]))
  console.log(`\nadding ${ok.length} icons`)
  for (const [name, url] of ok) console.log(`  + ${name}`)

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing')
    return
  }

  for (const [name, url] of ok) bundle[name] = url
  const sorted = {}
  for (const key of Object.keys(bundle).sort((a, b) => a.localeCompare(b))) sorted[key] = bundle[key]
  fs.writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
  console.log(`\nwrote ${Object.keys(sorted).length} icons to ${path.relative(process.cwd(), OUT)}`)
}

module.exports = { collectCandidates, buildArtIndex }

if (require.main === module) main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
