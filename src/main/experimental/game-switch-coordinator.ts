import type { WebContents } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, PoeProfile, RuntimeSettings } from '@shared/types'
import type { GameVariant } from '@shared/contracts/game-variant'
import { getGameFeatures } from '@shared/game-features'
import { applyCheatSheetHotkeys } from '../cheat-sheets'
import { clearLastEvaluatedItem } from '../evaluation'
import { clearFilterState, loadFilter } from '../filter-state'
import { invalidateBaseToClassCache, invalidateSearchableItemsCache } from '../handlers/prices'
import { updateOnlineSyncDir } from '../online-sync'
import { retargetForGame } from '../overlay'
import { applyPinnedZoneEnabled } from '../pinned-zone'
import { invalidateClipboardCaches } from '../trade/clipboard'
import { loadTierData, refreshTierData, resetTierDataRefreshGuard } from '../tier-data'
import {
  getActiveProfile,
  getEffectiveSettings,
  switchActiveProfileByGameVariant,
  switchActiveProfileById,
  hydrateActiveProfileSettings,
  type ProfileChangedSetting,
} from '../profiles/profile-settings'
import { broadcastSettingUpdates } from '../settings-write'
import { initLearning } from '../learning'
import { refreshLeagues } from '../trade/leagues'
import { refreshPrices } from '../trade/prices'
import { invalidateStatMatcherCaches } from '../trade/stat-matcher/cache-invalidation'
import { getPoeVersion, setPoeVersion } from '../game-state'

function isValidLeagueForGame(store: Store<AppSettings>, league: string, variant: GameVariant): boolean {
  const key = variant === 2 ? 'leaguesPoe2' : 'leaguesPoe1'
  const stored = store.get(key)
  if (stored && stored.length > 0) return stored.includes(league)
  return getGameFeatures(variant).leagues.includes(league)
}

export interface GameSwitchResult {
  changes: ProfileChangedSetting[]
  previous: RuntimeSettings
  current: RuntimeSettings
}

/** Single coordinator for every game-switch path. Updates the persistent
 *  settings / active profile synchronously, invalidates trade caches, then
 *  fires background network / disk work. Does NOT retarget the native overlay
 *  - callers that need overlay attachment changes must additionally call
 *  `retargetForGame`. */
export function switchGameContext(
  store: Store<AppSettings>,
  target: GameVariant,
  requestedProfile?: PoeProfile,
): GameSwitchResult {
  const changed = target !== getPoeVersion()
  setPoeVersion(target)

  // Drop the previous game's last-evaluated item before the filter (re)load
  // below fires onFilterLoaded -> reEvaluateLastItem, which would otherwise
  // re-open a closed overlay on the new game with the old game's item.
  if (changed) clearLastEvaluatedItem()

  const previous = getEffectiveSettings(store)

  const changes = requestedProfile
    ? switchActiveProfileById(store, requestedProfile.id)
    : switchActiveProfileByGameVariant(store, target)

  if (requestedProfile && changes.length === 0) {
    changes.push(...hydrateActiveProfileSettings(store))
  }

  const profile = getActiveProfile(store)
  if (profile) {
    if (profile.filterPath) loadFilter(profile.filterPath, 'Profile Activation')
    else clearFilterState()
    if (profile.league && isValidLeagueForGame(store, profile.league, target)) void refreshPrices(profile.league)
    updateOnlineSyncDir(profile.filterDir)
    if (profile.cheatSheets) applyCheatSheetHotkeys(profile.cheatSheets)
    applyPinnedZoneEnabled(profile.cheatSheets?.pinned === true)
  } else {
    clearFilterState()
    updateOnlineSyncDir('')
    applyPinnedZoneEnabled(false)
  }

  invalidateStatMatcherCaches()
  invalidateBaseToClassCache()

  if (changed) {
    // Version-keyed caches that survive in-process and would otherwise serve
    // the previous game's data: clipboard base-types/sizes, the searchable
    // item list, and the tier dataset (reload + drop the refresh-hash guard).
    invalidateClipboardCaches()
    invalidateSearchableItemsCache()
    resetTierDataRefreshGuard()
    void loadTierData(target)
      .then(() => refreshTierData(target))
      .catch((e) => {
        if (process.env.SCALPEL_DEBUG_LOG) console.warn('[tier-data] switch reload failed:', e)
      })
    initLearning(store, target)
  }

  const lastFetched = store.get('leaguesFetchedAt') ?? 0
  if (Date.now() - lastFetched > 60 * 60 * 1000) {
    void refreshLeagues(store)
  }

  const current = getEffectiveSettings(store)
  return { changes, previous, current }
}

/** Switch game context, retarget the native overlay to the new game, and
 *  broadcast setting/profile changes to all renderers. Use this for user-
 *  initiated or watcher-driven game switches that must move overlay attachment.
 *  Do NOT call this from inside a native overlay attach callback - use
 *  `switchGameContext` directly instead. */
export function performGameSwitch(
  store: Store<AppSettings>,
  target: GameVariant,
  sender?: WebContents | null,
  requestedProfile?: PoeProfile,
): GameSwitchResult {
  const result = switchGameContext(store, target, requestedProfile)
  retargetForGame(target)
  broadcastSettingUpdates(sender ?? null, result.changes, result.previous, result.current)
  return result
}
