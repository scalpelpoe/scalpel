/**
 * Sync regex data from poe-vendor-string (veiset/poe-vendor-string).
 * Used with permission, with attribution.
 *
 * Fetches generated data files from their GitHub repo and saves them locally.
 * Run manually: npm run sync-regex
 * Runs automatically in background on dev start.
 */

const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')

const REPO = 'veiset/poe-vendor-string'
const BRANCH = 'master'
const BASE_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/src/generated`

const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'shared', 'data', 'regex', 'vendor')
const META_FILE = path.join(OUTPUT_DIR, '.sync-meta.json')

const FILES = [
  'mapmods/Generated.MapModsV3.CHINESE.ts',
  'mapmods/Generated.MapModsV3.ENGLISH.ts',
  'mapmods/Generated.MapModsV3.FRENCH.ts',
  'mapmods/Generated.MapModsV3.GERMAN.ts',
  'mapmods/Generated.MapModsV3.JAPANESE.ts',
  'mapmods/Generated.MapModsV3.KOREAN.ts',
  'mapmods/Generated.MapModsV3.PORTUGUESE.ts',
  'mapmods/Generated.MapModsV3.RUSSIAN.ts',
  'mapmods/Generated.MapModsV3.SPANISH.ts',
  'mapmods/Generated.MapModsV3.THAI.ts',
  'mapmods/GeneratedTypes.ts',
  // Re-mapped on save: upstream stores it in src/generated/, we put it under flaskmods/.
  { from: 'GeneratedFlaskMods.ts', to: 'flaskmods/GeneratedFlaskMods.ts' },
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
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => resolve(data))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

async function getLatestCommit() {
  const url = `https://api.github.com/repos/${REPO}/commits?path=src/generated&per_page=1`
  const data = await fetch(url)
  const commits = JSON.parse(data)
  return commits[0]?.sha ?? null
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

  const latestCommit = await getLatestCommit()
  if (latestCommit && latestCommit === meta.commit) {
    console.log('[sync-regex] Data is up to date.')
    return false
  }

  console.log(`[sync-regex] Syncing from ${REPO} (${latestCommit?.slice(0, 7) ?? 'unknown'})...`)

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

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

  // Save meta
  fs.writeFileSync(
    META_FILE,
    JSON.stringify(
      {
        commit: latestCommit,
        timestamp: new Date().toISOString(),
        repo: REPO,
      },
      null,
      2,
    ),
  )

  if (updated > 0) {
    console.log(`[sync-regex] Updated ${updated} file(s).`)
  } else {
    console.log('[sync-regex] All files already current.')
  }
  return updated > 0
}

sync().catch((err) => {
  console.error('[sync-regex] Sync failed:', err.message)
  process.exit(0) // Don't fail the build
})
