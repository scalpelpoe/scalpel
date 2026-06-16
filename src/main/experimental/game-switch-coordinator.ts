import type { WebContents } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, RuntimeSettings } from '@shared/types'
import type { GameVariant } from '@shared/contracts/game-variant'
import { getGameFeatures } from '@shared/game-features'
import { applyCheatSheetHotkeys } from '../cheat-sheets'
import { clearFilterState, loadFilter } from '../filter-state'
import { invalidateBaseToClassCache } from '../handlers/prices'
import { updateOnlineSyncDir } from '../online-sync'
import { retargetForGame } from '../overlay'
import { applyPinnedZoneEnabled } from '../pinned-zone'
import {
  getActiveProfile,
  getEffectiveSettings,
  switchActiveProfileByGameVariant,
  type ProfileChangedSetting,
} from '../profiles/profile-settings'
import { broadcastSettingUpdates } from '../settings-write'
import { initLearning } from '../learning'
import { refreshLeagues } from '../trade/leagues'
import { refreshPrices } from '../trade/prices'
import { invalidateStatsCache } from '../trade/stat-matcher/stats-cache'
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
 *  — callers that need overlay attachment changes must additionally call
 *  `retargetForGame`. */
export function switchGameContext(store: Store<AppSettings>, target: GameVariant): GameSwitchResult {
  const changed = target !== getPoeVersion()
  setPoeVersion(target)

  const previous = getEffectiveSettings(store)

  const changes = switchActiveProfileByGameVariant(store, target)

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

  invalidateStatsCache()
  invalidateBaseToClassCache()

  if (changed) {
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
 *  Do NOT call this from inside a native overlay attach callback — use
 *  `switchGameContext` directly instead. */
export function performGameSwitch(
  store: Store<AppSettings>,
  target: GameVariant,
  sender?: WebContents | null,
): GameSwitchResult {
  const result = switchGameContext(store, target)
  retargetForGame(target)
  broadcastSettingUpdates(sender ?? null, result.changes, result.previous, result.current)
  return result
}
