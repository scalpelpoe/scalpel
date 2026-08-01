/**
 * Generate src/shared/data/cheat-sheet-prefabs.ts from the contents of
 * cheat-sheet-prefabs/. Each subdirectory becomes one starter pack; each
 * image inside it becomes one sheet in that pack. The runtime fetches each
 * image from its raw.githubusercontent.com URL when the user imports the
 * pack from the cheat-sheet settings tab.
 *
 *   cheat-sheet-prefabs/betrayal/aisling.png
 *      -> pack: { name: 'Betrayal', images: [{ path: 'betrayal/aisling.png', areaCodes: [] }] }
 *
 * Area codes are sourced from optional _zones.json sidecars in each pack
 * directory. PoE1 packs are validated against src/shared/data/poe1-zones.json,
 * PoE2 packs against src/shared/data/poe2-zones.json.
 *
 * Run manually: npm run sync-prefabs
 * The images directory is gitignored from the packaged build (electron-
 * builder only includes src/), so adding/removing prefab images doesn't
 * bloat the installer.
 */

const fs = require('node:fs')
const path = require('node:path')

const PREFAB_DIR = path.join(__dirname, '..', 'cheat-sheet-prefabs')
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'shared', 'data', 'cheat-sheet-prefabs.ts')
const REGISTRY_FILES = {
  1: path.join(__dirname, '..', 'src', 'shared', 'data', 'poe1-zones.json'),
  2: path.join(__dirname, '..', 'src', 'shared', 'data', 'poe2-zones.json'),
}

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

/** Build a Set of all valid area codes from a zone registry file. */
function buildValidAreaCodes(registryFile) {
  const registry = require(registryFile)
  const codes = new Set()
  for (const act of registry.zonesByAct) {
    for (const zone of act.zones) {
      codes.add(zone.id)
    }
  }
  return codes
}

const VALID_AREA_CODES = {
  1: buildValidAreaCodes(REGISTRY_FILES[1]),
  2: buildValidAreaCodes(REGISTRY_FILES[2]),
}

/** Convert a directory name like 'path-of-building' to 'Path Of Building'.
 *  For overrides, drop a `_name.txt` file inside the pack directory containing
 *  the desired display name (e.g. 'Path of Building'). */
function packDisplayName(dir, slug) {
  const overridePath = path.join(dir, '_name.txt')
  if (fs.existsSync(overridePath)) return fs.readFileSync(overridePath, 'utf8').trim()
  return slug
    .split(/[-_]/g)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Optional PoE version filter: drop a `_poe.txt` containing "1" or "2" in
 *  the pack directory to scope it to that game. No file = visible in both. */
function packPoeVersion(dir) {
  const overridePath = path.join(dir, '_poe.txt')
  if (!fs.existsSync(overridePath)) return undefined
  const raw = fs.readFileSync(overridePath, 'utf8').trim()
  if (raw === '1' || raw === '2') return Number(raw)
  return undefined
}

const VALID_GROUPS = new Set(['leveling-complete', 'leveling-simple'])

/** Optional picker section: drop a `_group.txt` containing "leveling-complete"
 *  or "leveling-simple" in the pack directory. No file = the Other section. */
function packGroup(dir, slug) {
  const overridePath = path.join(dir, '_group.txt')
  if (!fs.existsSync(overridePath)) return undefined
  const raw = fs.readFileSync(overridePath, 'utf8').trim()
  if (!VALID_GROUPS.has(raw)) {
    console.error(`_group.txt in pack "${slug}" has unknown group "${raw}"`)
    process.exit(1)
  }
  return raw
}

/** Load _zones.json for a pack directory if it exists. Returns a Map from
 *  filename to areaCodes array, or null if no sidecar exists. */
function loadZonesSidecar(packDir) {
  const zonesPath = path.join(packDir, '_zones.json')
  if (!fs.existsSync(zonesPath)) return null
  const raw = fs.readFileSync(zonesPath, 'utf8')
  return JSON.parse(raw)
}

function main() {
  if (!fs.existsSync(PREFAB_DIR)) {
    console.error(`No prefab directory at ${PREFAB_DIR}`)
    process.exit(1)
  }

  const packs = []
  const slugs = fs
    .readdirSync(PREFAB_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  for (const slug of slugs) {
    const packDir = path.join(PREFAB_DIR, slug)
    const poeVersion = packPoeVersion(packDir)
    const validCodes = poeVersion ? VALID_AREA_CODES[poeVersion] : undefined

    const imageFiles = fs
      .readdirSync(packDir)
      .filter((f) => ALLOWED_EXTS.has(path.extname(f).toLowerCase()))
      .sort()

    if (imageFiles.length === 0) continue

    const zonesMap = loadZonesSidecar(packDir)

    // Validate _zones.json entries if present
    if (zonesMap !== null) {
      const imageSet = new Set(imageFiles)
      for (const [filename, areaCodes] of Object.entries(zonesMap)) {
        if (!imageSet.has(filename)) {
          console.error(`_zones.json in pack "${slug}" references missing file "${filename}"`)
          process.exit(1)
        }
        if (validCodes) {
          for (const code of areaCodes) {
            if (!validCodes.has(code)) {
              console.error(
                `_zones.json in pack "${slug}" references unknown area code "${code}" (not in poe${poeVersion}-zones.json)`,
              )
              process.exit(1)
            }
          }
        }
      }
    }

    const images = imageFiles.map((f) => {
      const relPath = `${slug}/${f}`
      const areaCodes = zonesMap?.[f] || []
      return { path: relPath, areaCodes }
    })

    const pack = { slug, name: packDisplayName(packDir, slug), images }
    if (poeVersion) pack.poeVersion = poeVersion
    const group = packGroup(packDir, slug)
    if (group) pack.group = group
    packs.push(pack)
  }

  const body = `// AUTO-GENERATED by scripts/sync-prefabs.js. Do not edit by hand.
// Run \`npm run sync-prefabs\` after adding/removing files in /cheat-sheet-prefabs/.
//
// Image URLs are built at runtime by joining CHEAT_SHEET_PREFAB_BASE_URL (in
// shared/endpoints.ts) with each entry's relative \`path\` field.
// Area codes per image come from _zones.json sidecars in each pack directory.

export interface PrefabPackImage {
  /** Repo-relative path under cheat-sheet-prefabs/. */
  path: string
  /** Area codes from Client.txt that this image's zone maps to. Empty when
   *  the image has no zone metadata (packs without a _zones.json sidecar,
   *  or images lacking an entry in it). */
  areaCodes: string[]
}

export interface PrefabPack {
  /** Stable id, derived from the directory name. */
  slug: string
  /** Display name shown in the settings UI. */
  name: string
  /** Images in this pack with optional zone metadata. */
  images: PrefabPackImage[]
  /** When set, the pack only appears for users on the matching PoE version.
   *  Unset = visible in both. Configured via _poe.txt in the pack directory. */
  poeVersion?: 1 | 2
  /** Picker section the pack is listed under. Unset = the Other section.
   *  Configured via _group.txt in the pack directory. */
  group?: 'leveling-complete' | 'leveling-simple'
}

export const PREFAB_PACKS: PrefabPack[] = ${JSON.stringify(packs, null, 2)}
`

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, body)
  const totalImages = packs.reduce((sum, p) => sum + p.images.length, 0)
  console.log(`Wrote ${packs.length} pack(s), ${totalImages} image(s) -> ${path.relative(process.cwd(), OUTPUT_FILE)}`)
}

main()
