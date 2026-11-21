/**
 * Sync regex data from poe-vendor-string (veiset/poe-vendor-string).
 * Used with permission, with attribution.
 *
 * Fetches generated data files from their GitHub repo and saves them locally.
 * Run manually: npm run sync-regex
 * Not part of `npm run dev`: upstream moved to veiset/poe.re and restructured, so the FILES paths 404.
 * Map mods are the exception: they sync from poe.re's JSON (see syncMapMods).
 */

const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')

const REPO = 'veiset/poe-vendor-string'
const BRANCH = 'master'
const BASE_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/src/generated`

const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'shared', 'data', 'regex', 'vendor')
const META_FILE = path.join(OUTPUT_DIR, '.sync-meta.json')

// Map mods moved to veiset/poe.re as JSON. Fetched from there and rendered back into
// the Generated.MapModsV3.<LANG>.ts shape the renderer imports.
const MAPMODS_REPO = 'veiset/poe.re'
const MAPMODS_BRANCH = 'master'
const MAPMODS_PATH = 'poe/generated/mapmods'
const MAPMODS_LANGUAGES = [
  'CHINESE',
  'ENGLISH',
  'FRENCH',
  'GERMAN',
  'JAPANESE',
  'KOREAN',
  'PORTUGUESE',
  'RUSSIAN',
  'SPANISH',
  'THAI',
]

const FILES = [
  'mapmods/GeneratedTypes.ts',
  // Re-mapped on save: upstream stores it in src/generated/, we put it under flaskmods/.
  { from: 'GeneratedFlaskMods.ts', to: 'flaskmods/GeneratedFlaskMods.ts' },
  // PoE1 vendor gems (Vendor tab gem list + gem regex tokens).
  'gems/Generated.Gems.English.ts',
  'gems/GeneratedTypes.ts',
  // PoE1 Items tab (rare crafting mods + magic name matching).
  { from: 'GeneratedItemBases.ts', to: 'item/GeneratedItemBases.ts' },
  { from: 'GeneratedItemMods.ts', to: 'item/GeneratedItemMods.ts' },
  // PoE1 Beasts tab (bestiary regex fragments + craft recipes).
  { from: 'GeneratedBeastRegex.ts', to: 'beast/GeneratedBeastRegex.ts' },
]

const ATTRIBUTION = `// Data sourced from poe-vendor-string (https://github.com/${REPO})
// Used with permission. All credit to veiset and contributors.
`

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Scalpel' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetch(res.headers.location).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        }
        // Without an explicit encoding, a multi-byte character split across two
        // chunk boundaries decodes as mojibake. Beast names carry the first
        // non-ASCII join key in synced data ("Black Morrigan" with an accented o),
        // and that name has to match poe.ninja's string exactly.
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => resolve(data))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

async function getLatestCommit(repo = REPO, dir = 'src/generated') {
  const url = `https://api.github.com/repos/${repo}/commits?path=${dir}&per_page=1`
  const data = await fetch(url)
  const commits = JSON.parse(data)
  return commits[0]?.sha ?? null
}

const str = (s) => JSON.stringify(s)

/** Render poe.re's Generated.Map.<LANG>.json in the old Generated.MapModsV3 TS layout. */
function renderMapMods(language, json) {
  const tokens = json.tokens.map((t) => {
    const o = t.options
    const rewards = o.rewards?.length ? `, rewards: [${o.rewards.map(str).join(', ')}]` : ''
    return `    {id: ${t.id}, regex: ${str(t.regex)}, rawText: ${str(t.rawText)}, generalizedText: ${str(t.generalizedText)}, options: {scary: ${o.scary}, nm: ${o.nm}, prefix: ${o.prefix}${rewards}}},`
  })
  const optimizations = Object.entries(json.optimizationTable).map(
    ([key, v]) =>
      `    ${str(key)}: {ids: [${v.ids.join(', ')}], regex: ${str(v.regex)}, weight: ${v.weight}, count: ${v.count}},`,
  )
  return [
    `// Data sourced from poe.re (https://github.com/${MAPMODS_REPO})`,
    '// Used with permission. All credit to veiset and contributors.',
    '// @formatter:off',
    'import {Regex, MapModsTokenOption} from "./GeneratedTypes";',
    '',
    `export const regexMapMods${language}: Regex<MapModsTokenOption> = {`,
    '  tokens: [',
    ...tokens,
    '  ],',
    '  optimizationTable: {',
    ...optimizations,
    '  },',
    '}',
    '',
  ].join('\n')
}

async function syncMapMods() {
  let updated = 0
  for (const language of MAPMODS_LANGUAGES) {
    const url = `https://raw.githubusercontent.com/${MAPMODS_REPO}/${MAPMODS_BRANCH}/${MAPMODS_PATH}/Generated.Map.${language}.json`
    const toPath = `mapmods/Generated.MapModsV3.${language}.ts`
    try {
      const content = renderMapMods(language, JSON.parse(await fetch(url)))
      const outputPath = path.join(OUTPUT_DIR, toPath)
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : null
      if (existing !== content) {
        fs.writeFileSync(outputPath, content)
        updated++
        console.log(`[sync-regex]   Updated ${toPath}`)
      }
    } catch (err) {
      console.warn(`[sync-regex]   Failed to fetch map mods ${language}: ${err.message}`)
    }
  }
  return updated
}

async function sync() {
  console.log('[sync-regex] Checking for updates...')

  // Check if we need to update
  let meta = { commit: null, timestamp: null }
  if (fs.existsSync(META_FILE)) {
    try {
      meta = JSON.parse(fs.readFileSync(META_FILE, 'utf-8'))
    } catch {}
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const mapModsCommit = await getLatestCommit(MAPMODS_REPO, MAPMODS_PATH).catch(() => null)
  const mapModsUpdated = await syncMapMods()
  if (mapModsUpdated > 0) {
    meta = { ...meta, mapModsCommit, mapModsRepo: MAPMODS_REPO, mapModsTimestamp: new Date().toISOString() }
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2))
    console.log(`[sync-regex] Updated ${mapModsUpdated} map mod file(s) from ${MAPMODS_REPO}.`)
  }

  const latestCommit = await getLatestCommit()
  if (latestCommit && latestCommit === meta.commit) {
    console.log('[sync-regex] Data is up to date.')
    return mapModsUpdated > 0
  }

  console.log(`[sync-regex] Syncing from ${REPO} (${latestCommit?.slice(0, 7) ?? 'unknown'})...`)

  // Download files. Entries can be a plain path (same path upstream and locally) or
  // { from, to } when the upstream layout differs from where we store it.
  let updated = 0
  for (const entry of FILES) {
    const fromPath = typeof entry === 'string' ? entry : entry.from
    const toPath = typeof entry === 'string' ? entry : entry.to
    try {
      const content = await fetch(`${BASE_URL}/${fromPath}`)
      const outputPath = path.join(OUTPUT_DIR, toPath)
      const outputDir = path.dirname(outputPath)
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
      const attributed = ATTRIBUTION + content
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : null
      if (existing !== attributed) {
        fs.writeFileSync(outputPath, attributed)
        updated++
        console.log(`[sync-regex]   Updated ${toPath}`)
      }
    } catch (err) {
      console.warn(`[sync-regex]   Failed to fetch ${fromPath}: ${err.message}`)
    }
  }

  // Save meta only when a file actually changed. Upstream commits to
  // src/generated regularly without touching the 18 files we pull, so writing
  // the sha unconditionally rewrote this tracked file on every dev start and
  // left a zero-data-change diff in the working tree. The cost of not caching
  // the checked-but-unchanged sha is re-fetching those files on the next dev
  // start, which runs in the background and costs nothing that matters.
  if (updated > 0) {
    fs.writeFileSync(
      META_FILE,
      JSON.stringify(
        {
          ...meta,
          commit: latestCommit,
          timestamp: new Date().toISOString(),
          repo: REPO,
        },
        null,
        2,
      ),
    )
    console.log(`[sync-regex] Updated ${updated} file(s).`)
  } else {
    console.log('[sync-regex] All files already current.')
  }
  return updated + mapModsUpdated > 0
}

sync().catch((err) => {
  console.error('[sync-regex] Sync failed:', err.message)
  process.exit(0) // Don't fail the build
})
