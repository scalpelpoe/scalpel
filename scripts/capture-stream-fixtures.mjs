// Refreshes the poe.ninja fixtures behind the Scalpel Stream source tests
// (src/main/stream/__fixtures__). Re-run when poe.ninja changes a response shape.
//
//   npm run capture:stream-fixtures -- <twitchLogin> <account-with-dash> <character>
//
// The character JSON is trimmed to the fields the normalizer reads and its
// account/character names are replaced with placeholders.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [login = 'aer0__', account = 'aer0_-2690', character = 'GassiusClay'] = process.argv.slice(2)
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/main/stream/__fixtures__')
const base = 'https://poe.ninja/poe2/api'
const headers = { 'User-Agent': 'Scalpel-Stream-Fixtures', Accept: 'application/json' }

async function get(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res
}

const index = await (await get(`${base}/data/index-state`)).json()
const streamers = index.snapshotVersions.find((s) => s.url === 'streamers')
if (!streamers) throw new Error('index-state has no streamers snapshot')

const search = await get(
  `${base}/builds/${streamers.version}/search?streamer=${encodeURIComponent(login)}&overview=streamers`,
)
const searchBytes = new Uint8Array(await search.arrayBuffer())

const raw = await (
  await get(
    `${base}/builds/${streamers.version}/character?account=${encodeURIComponent(account)}&name=${encodeURIComponent(character)}&overview=streamers&timeMachine=`,
  )
).json()

const KEEP = [
  'account',
  'name',
  'league',
  'level',
  'class',
  'baseClass',
  'items',
  'flasks',
  'jewels',
  'skills',
  'keystones',
  'pathOfBuildingExport',
  'useSecondWeaponSet',
  'updatedUtc',
  'lastCheckedUtc',
]
const trimmed = Object.fromEntries(KEEP.filter((k) => k in raw).map((k) => [k, raw[k]]))
trimmed.account = 'Exile-0001'
trimmed.name = 'SampleExile'

mkdirSync(out, { recursive: true })
writeFileSync(
  resolve(out, 'ninja-index-state.json'),
  `${JSON.stringify({ snapshotVersions: [streamers] }, null, 2)}\n`,
)
writeFileSync(resolve(out, 'ninja-search.bin'), searchBytes)
writeFileSync(resolve(out, 'ninja-character.json'), `${JSON.stringify(trimmed, null, 2)}\n`)
console.log(`streamers version ${streamers.version}; search ${searchBytes.length} B; wrote ${out}`)
