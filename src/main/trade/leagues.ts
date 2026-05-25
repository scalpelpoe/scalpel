import { net } from 'electron'
import type Store from 'electron-store'
import { getTradeUrls } from '../../shared/endpoints'
import { getProfileStore } from '../profiles/store'
import { listProfilesByGameVariant, type ProfileChangedSetting } from '../profiles/profile-settings'
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
    const entries = (json.result ?? []).filter((l) => !l.realm || l.realm.toLowerCase() === 'pc')
    const rawIds = entries.map((l) => l.id).filter((s): s is string => typeof s === 'string' && s.length > 0)
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

function isPermanentLeague(name: string): boolean {
  return name === 'Standard' || name === 'Hardcore'
}

export function migrateLeague(current: string, fresh: readonly string[]): string | null {
  if (!current || fresh.includes(current)) return null
  const wantsHC = isHardcore(current)
  const challenge = fresh.find((l) => isHardcore(l) === wantsHC && !isPermanentLeague(l))
  const permanent = fresh.find((l) => l === (wantsHC ? 'Hardcore' : 'Standard'))
  return challenge ?? permanent ?? fresh[0] ?? current
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
