import { net } from 'electron'
import type Store from 'electron-store'
import { getTradeUrls } from '@shared/endpoints'
import { getProfileStore } from '../profiles/store'
import { listProfilesByGameVariant, type ProfileChangedSetting } from '../profiles/profile-settings'
import { getGameFeatures } from '@shared/game-features'
import { currentTradeLeague, isHardcoreLeague } from '@shared/leagues'
import type { AppSettings } from '@shared/types'

interface LeaguesResponse {
  result?: Array<{ id?: string; text?: string; realm?: string }>
}

/** GGG tags every league with the realm it belongs to and returns all of them
 *  in one response. PoE1 uses `pc` alongside `xbox`/`sony`; PoE2's trade2
 *  endpoint tags its PC leagues `poe2`. Filtering both games on `pc` dropped
 *  every PoE2 entry, so that fetch always came back empty and PoE2 silently sat
 *  on the bundled fallback list forever. */
const PC_REALM: Record<1 | 2, string> = { 1: 'pc', 2: 'poe2' }

function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Match trade.ts's request shape: never attach Electron's session cookie
    // jar. GGG's API mints an anonymous POESESSID and Cloudflare bot-challenges
    // any request that echoes it back (#429); with the default jar a challenged
    // league fetch fails silently and strands users on the stale bundled list,
    // worst of all on league-launch day. See commonRequestOpts in trade.ts.
    const request = net.request({ url, useSessionCookies: false, referrerPolicy: 'no-referrer-when-downgrade' })
    let data = ''
    const timer = setTimeout(() => {
      try {
        request.abort()
      } catch {
        /* already aborted */
      }
      reject(new Error('timeout'))
    }, timeoutMs)
    request.on('response', (response) => {
      response.on('data', (chunk) => {
        data += chunk.toString()
      })
      response.on('end', () => {
        clearTimeout(timer)
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    })
    request.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    request.end()
  })
}

/** Pulls the PC league ids out of a /data/leagues response, in order and
 *  deduplicated. Exported for tests -- the fetch itself needs Electron's net. */
export function parseLeagueList(json: unknown, version: 1 | 2): string[] | null {
  const result = (json as LeaguesResponse | null)?.result ?? []
  const realm = PC_REALM[version]
  const entries = result.filter((l) => !l.realm || l.realm.toLowerCase() === realm)
  const rawIds = entries.map((l) => l.id).filter((s): s is string => typeof s === 'string' && s.length > 0)
  const seen = new Set<string>()
  const ids: string[] = []
  for (const id of rawIds) {
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids.length > 0 ? ids : null
}

export async function fetchLeagueList(version: 1 | 2): Promise<string[] | null> {
  try {
    return parseLeagueList(await fetchJson(getTradeUrls(version).leagues), version)
  } catch (err) {
    console.error(`[leagues] fetch poe${version} failed:`, err)
    return null
  }
}

export function migrateLeague(current: string, fresh: readonly string[]): string | null {
  if (!current || fresh.includes(current)) return null
  // Private leagues are absent from the public league list. Their PL id
  // distinguishes them from public challenge leagues that have rotated out.
  if (/\(PL\d+\)\s*$/.test(current)) return null
  return currentTradeLeague(fresh, { hardcore: isHardcoreLeague(current) }) ?? current
}

export type LeagueFetcher = (version: 1 | 2) => Promise<string[] | null>

function migrateProfileLeagues(
  store: Store<AppSettings>,
  version: 1 | 2,
  list: readonly string[],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  const activeId = store.get('activeProfileId')
  const profiles = listProfilesByGameVariant(version)

  if (profiles.length === 0) return changed

  let activeProfileChanged = false
  const profileStore = getProfileStore()

  for (const profile of profiles) {
    const next = migrateLeague(profile.league, list)
    if (!next || next === profile.league) continue

    console.warn(`[leagues] migrating profile ${profile.id}: ${profile.league} -> ${next}`)
    profile.league = next
    profile.updatedAt = new Date().toISOString()
    profileStore.saveProfile(profile)

    if (profile.id === activeId) activeProfileChanged = true
  }

  if (activeProfileChanged && activeId) {
    const activeProfile = profileStore.getProfile(activeId)
    if (activeProfile) {
      changed.push({ key: 'activeProfile', value: activeProfile, reason: 'migration' })
    }
  }

  return changed
}

export async function refreshLeagues(
  store: Store<AppSettings>,
  fetcher: LeagueFetcher = fetchLeagueList,
  options: { force?: boolean } = {},
): Promise<Array<keyof AppSettings | 'activeProfile'>> {
  const COOLDOWN_MS = 60 * 60 * 1000
  const lastFetched = store.get('leaguesFetchedAt') ?? 0
  if (!options.force && Date.now() - lastFetched < COOLDOWN_MS) return []

  const changed: Array<keyof AppSettings | 'activeProfile'> = []

  const [poe1, poe2] = await Promise.all([fetcher(1), fetcher(2)])

  const apply = (
    fetched: string[] | null,
    listKey: 'leaguesPoe1' | 'leaguesPoe2',
    fallback: readonly string[],
    version: 1 | 2,
  ): void => {
    const list = fetched ?? fallback.slice()
    const prevList = store.get(listKey) ?? []
    if (JSON.stringify(prevList) !== JSON.stringify(list)) {
      store.set(listKey, list)
      changed.push(listKey)
    }
    const profileChanges = migrateProfileLeagues(store, version, list)
    for (const change of profileChanges) {
      if (!changed.includes(change.key)) changed.push(change.key)
    }
  }

  apply(poe1, 'leaguesPoe1', getGameFeatures(1).leagues, 1)
  apply(poe2, 'leaguesPoe2', getGameFeatures(2).leagues, 2)

  if (poe1 || poe2) store.set('leaguesFetchedAt', Date.now())

  return changed
}
