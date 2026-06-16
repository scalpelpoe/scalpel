import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import type { GameVariant } from '@shared/contracts/game-variant'
import {
  type GameSwitchCoordinator,
  type OverlayAttachStrategy,
  type StartupGameResolver,
  type AutoGameWatcher,
  type ProfileSwitchResult,
} from './contracts'
import { isExperimentalMultiWindowEnabled } from './feature-gates'
import { stableGameSwitchCoordinator, stableOverlayStrategy, stableStartupResolver, stableAutoWatcher } from './stable'
import { ensureCorrectGameForHotkey, setGameSwitchRequest } from '../evaluation'
import { performGameSwitch, switchGameContext } from './game-switch-coordinator'
import {
  getActiveProfile,
  getEffectiveSettings,
  getProfileById,
  switchActiveProfileById,
  hydrateActiveProfileSettings,
} from '../profiles/profile-settings'
import { applyProfileHydrationSideEffects, broadcastSettingUpdates } from '../settings-write'
import { createOverlayWindow, getOverlayAttachedVersion, retargetForGame } from '../overlay'

/** Resolved once on first access from the store's updateChannel at that point.
 *  Changing updateChannel mid-session has no effect — the multi-window
 *  architecture (overlay attachment strategy, game-switch path, watcher) is
 *  fixed at process start. A restart is required to switch modes. */
let enabledAtBoot: boolean | null = null
let cachedCoordinator: GameSwitchCoordinator | null = null
let cachedOverlay: OverlayAttachStrategy | null = null
let cachedResolver: StartupGameResolver | null = null
let cachedWatcher: AutoGameWatcher | null = null

function resolveEnabled(store: Store<AppSettings>): boolean {
  if (enabledAtBoot === null) enabledAtBoot = isExperimentalMultiWindowEnabled(store)
  return enabledAtBoot
}

function buildExperimentalCoordinator(): GameSwitchCoordinator {
  // Route hotkey-driven game switches through the in-process path instead of
  // the stable restart-based requestGameSwitch. This avoids evaluation.ts
  // importing from experimental/ (which would create a cycle).
  setGameSwitchRequest(async (store, target) => {
    performGameSwitch(store, target)
  })

  return {
    ensureCorrectGameForHotkey,
    requestGameSwitch: async (store, target) => {
      performGameSwitch(store, target)
    },
    applyProfileSwitch: async (store, id, restartIfNeeded, sender) => {
      const previous = getEffectiveSettings(store)
      const current = store.get('poeVersion') === 2 ? 2 : 1
      const targetProfile = getProfileById(id)
      const target = targetProfile?.gameVariant ?? current

      if (target !== current) {
        switchActiveProfileById(store, id)
        const result = performGameSwitch(store, target, sender)
        return { ok: true as const, settings: result.current }
      }

      // Same-game profile switch: apply side effects and broadcast so
      // renderers pick up the new filter, cheat sheets, league, etc.
      const changes = switchActiveProfileById(store, id)
      if (changes.length === 0) {
        const hydrated = hydrateActiveProfileSettings(store)
        changes.push(...hydrated)
      }
      applyProfileHydrationSideEffects(changes, previous)
      const currentSettings = getEffectiveSettings(store)
      broadcastSettingUpdates(sender, changes, previous, currentSettings)
      return { ok: true as const, settings: currentSettings }
    },
  }
}

const experimentalOverlayStrategy: OverlayAttachStrategy = {
  createInitialOverlay: (version: GameVariant) => createOverlayWindow(version, { multiTitle: true }),
  retargetForGame: (target: GameVariant) => retargetForGame(target),
  getOverlayAttachedVersion,
}

export function getGameSwitchCoordinator(store: Store<AppSettings>): GameSwitchCoordinator {
  if (!cachedCoordinator) {
    cachedCoordinator = resolveEnabled(store) ? buildExperimentalCoordinator() : stableGameSwitchCoordinator
  }
  return cachedCoordinator
}

export function getOverlayAttachStrategy(store: Store<AppSettings>): OverlayAttachStrategy {
  if (!cachedOverlay) {
    cachedOverlay = resolveEnabled(store) ? experimentalOverlayStrategy : stableOverlayStrategy
  }
  return cachedOverlay
}

export function getStartupGameResolver(store: Store<AppSettings>): StartupGameResolver {
  if (!cachedResolver) {
    cachedResolver = resolveEnabled(store) ? stableStartupResolver : stableStartupResolver
  }
  return cachedResolver
}

export function getAutoGameWatcher(store: Store<AppSettings>): AutoGameWatcher {
  if (!cachedWatcher) {
    cachedWatcher = resolveEnabled(store) ? stableAutoWatcher : stableAutoWatcher
  }
  return cachedWatcher
}
