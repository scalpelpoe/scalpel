/** Fetch + cache league lists from the official trade APIs and migrate the
 *  user's selected league when their challenge league rotates out.
 *
 *  Endpoints live in `src/shared/endpoints.ts` (`getTradeUrls(v).leagues`).
 *  Both versions return `{ result: [{ id, text }, ...] }`. The trade UI uses
 *  `id` as the league key in queries, which is what we persist + render in the
 *  dropdown. They're static-data endpoints with very generous quotas so this
 *  module deliberately doesn't share the search/fetch/exchange rate buckets. */

import { net } from 'electron'
import type Store from 'electron-store'
import { getTradeUrls } from '../../shared/endpoints'
import { getGameFeatures } from '../../shared/game-features'
import type { AppSettings } from '../../shared/types'

interface LeaguesResponse {
  result?: Array<{ id?: string; text?: string; realm?: string }>
}

function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
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

export async function fetchLeagueList(version: 1 | 2): Promise<string[] | null> {
  try {
    const json = (await fetchJson(getTradeUrls(version).leagues)) as LeaguesResponse
    // PoE trade API returns leagues per realm (pc, xbox, sony) -- we only
    // support PC. Older entries without a realm field are treated as pc.
    const entries = (json.result ?? []).filter((l) => !l.realm || l.realm.toLowerCase() === 'pc')
    const rawIds = entries.map((l) => l.id).filter((s): s is string => typeof s === 'string' && s.length > 0)
    // Dedupe defensively while preserving insertion order so the active SC
    // challenge stays first (which migrateLeague depends on).
    const seen = new Set<string>()
    const ids: string[] = []
    for (const id of rawIds) {
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    return ids.length > 0 ? ids : null
  } catch (err) {
    console.error(`[leagues] fetch poe${version} failed:`, err)
    return null
  }
}

function isHardcore(name: string): boolean {
  return name.startsWith('Hardcore ') || name.startsWith('HC ') || name === 'Hardcore'
}

/** "Standard" / "Hardcore" -- the never-rotating leagues every league cycle keeps. */
function isPermanentLeague(name: string): boolean {
  return name === 'Standard' || name === 'Hardcore'
}

/** Decide what `leagueX` should become when the previously-stored league no
 *  longer appears in the freshly-fetched list. Returns null if the current
 *  league is still valid. Preserves softcore/hardcore preference, and falls
 *  back to the equivalent permanent league (Standard/Hardcore) if the new
 *  list has no challenge entry of the matching type. */
export function migrateLeague(current: string, fresh: readonly string[]): string | null {
  if (!current || fresh.includes(current)) return null
  const wantsHC = isHardcore(current)
  const challenge = fresh.find((l) => isHardcore(l) === wantsHC && !isPermanentLeague(l))
  const permanent = fresh.find((l) => l === (wantsHC ? 'Hardcore' : 'Standard'))
  return challenge ?? permanent ?? fresh[0] ?? current
}

/** Test seam: refreshLeagues calls this to obtain each version's league list,
 *  defaulting to the live trade API. Tests inject a stub. */
export type LeagueFetcher = (version: 1 | 2) => Promise<string[] | null>

/** Fetch both PoE1 and PoE2 league lists, persist them, and migrate the user's
 *  selected leagues if their challenge league rotated out. Returns the set of
 *  setting keys that were actually changed so callers can broadcast updates.
 *
 *  Pass `force: false` (the default) to skip the network round-trip when the
 *  last successful refresh was within the cooldown window -- callers like the
 *  app-window mount fire on every reopen and don't need fresh data more than
 *  hourly. The launch-time call uses `force: true` so a long-running app
 *  picks up new leagues on next open even past cooldown. */
export async function refreshLeagues(
  store: Store<AppSettings>,
  fetcher: LeagueFetcher = fetchLeagueList,
  options: { force?: boolean } = {},
): Promise<Array<keyof AppSettings>> {
  const COOLDOWN_MS = 60 * 60 * 1000 // 1h
  const lastFetched = store.get('leaguesFetchedAt') ?? 0
  if (!options.force && Date.now() - lastFetched < COOLDOWN_MS) return []

  const changed: Array<keyof AppSettings> = []

  const [poe1, poe2] = await Promise.all([fetcher(1), fetcher(2)])

  const apply = (
    fetched: string[] | null,
    listKey: 'leaguesPoe1' | 'leaguesPoe2',
    leagueKey: 'leaguePoe1' | 'leaguePoe2',
    fallback: readonly string[],
    version: 1 | 2,
  ): void => {
    const list = fetched ?? fallback.slice()
    const prevList = store.get(listKey) ?? []
    if (JSON.stringify(prevList) !== JSON.stringify(list)) {
      store.set(listKey, list)
      changed.push(listKey)
    }
    const currentLeague = store.get(leagueKey)
    const next = migrateLeague(currentLeague, list)
    if (next && next !== currentLeague) {
      console.warn(`[leagues] migrating ${leagueKey}: ${currentLeague} -> ${next}`)
      store.set(leagueKey, next)
      changed.push(leagueKey)
      // Mirror to the flat 'league' if this is the active version
      if (store.get('poeVersion') === version && store.get('league') === currentLeague) {
        store.set('league', next)
        changed.push('league')
      }
    }
  }

  apply(poe1, 'leaguesPoe1', 'leaguePoe1', getGameFeatures(1).leagues, 1)
  apply(poe2, 'leaguesPoe2', 'leaguePoe2', getGameFeatures(2).leagues, 2)

  // Mark a successful round so the cooldown gate above can short-circuit
  // future calls. Only mark if at least one fetcher returned data, otherwise
  // we'd cement a permanent failure.
  if (poe1 || poe2) store.set('leaguesFetchedAt', Date.now())

  return changed
}
