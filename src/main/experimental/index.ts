import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import type { GameVariant } from '@shared/contracts/game-variant'
import { type GameSwitchCoordinator, type OverlayAttachStrategy } from './contracts'
import { isExperimentalMultiWindowEnabled } from './feature-gates'
import { stableGameSwitchCoordinator, stableOverlayStrategy } from './stable'
import { ensureCorrectGameForHotkey, setGameSwitchRequest } from '../evaluation'
import { performGameSwitch, switchGameContext } from './game-switch-coordinator'
import {
  getEffectiveSettings,
  getProfileById,
  switchActiveProfileById,
  hydrateActiveProfileSettings,
} from '../profiles/profile-settings'
import { applyProfileHydrationSideEffects, broadcastSettingUpdates } from '../settings-write'
import { createOverlayWindow, getOverlayAttachedVersion, retargetForGame } from '../overlay'

/** Resolved once on first access from the store's updateChannel at that point.
 *  Changing updateChannel mid-session has no effect - the multi-window
 *  architecture (overlay attachment strategy, game-switch path) is fixed at
 *  process start. A restart is required to switch modes. */
let enabledAtBoot: boolean | null = null
let cachedCoordinator: GameSwitchCoordinator | null = null
let cachedOverlay: OverlayAttachStrategy | null = null

function resolveEnabled(store: Store<AppSettings>): boolean {
  if (enabledAtBoot === null) enabledAtBoot = isExperimentalMultiWindowEnabled(store)
  return enabledAtBoot
}

const experimentalInProcessSwitch = async (store: Store<AppSettings>, target: GameVariant) => {
  performGameSwitch(store, target)
}

/** Wire the in-process game switch into the injectable requestGameSwitch slot.
 *  Called eagerly at startup from getOverlayAttachStrategy so that the first
 *  hotkey switch already uses the in-process path rather than the stable
 *  restart-based requestGameSwitch. */
function wireExperimentalHotkeySwitch(): void {
  setGameSwitchRequest(experimentalInProcessSwitch)
}

function buildExperimentalCoordinator(): GameSwitchCoordinator {
  return {
    ensureCorrectGameForHotkey,
    requestGameSwitch: experimentalInProcessSwitch,
    applyProfileSwitch: async (store, id, _restartIfNeeded, sender) => {
      const previous = getEffectiveSettings(store)
      const current = store.get('poeVersion') === 2 ? 2 : 1
      const targetProfile = getProfileById(id)
      if (!targetProfile) return { ok: false as const, error: 'Profile not found' }
      const target = targetProfile.gameVariant

      if (target !== current) {
        const result = performGameSwitch(store, target, sender, targetProfile)
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

export function getGameSwitchCoordinator(store: Store<AppSettings>): GameSwitchCoordinator {
  if (!cachedCoordinator) {
    cachedCoordinator = resolveEnabled(store) ? buildExperimentalCoordinator() : stableGameSwitchCoordinator
  }
  return cachedCoordinator
}

export function getOverlayAttachStrategy(store: Store<AppSettings>): OverlayAttachStrategy {
  if (!cachedOverlay) {
    if (resolveEnabled(store)) {
      // Wire hotkey switch eagerly so the first hotkey switch before
      // getGameSwitchCoordinator is called still uses the in-process path.
      wireExperimentalHotkeySwitch()
      cachedOverlay = {
        createInitialOverlay: (version: GameVariant) =>
          createOverlayWindow(version, {
            multiTitle: true,
            onAttachedGameVariant: (variant: 1 | 2) => {
              const result = switchGameContext(store, variant)
              broadcastSettingUpdates(null, result.changes, result.previous, result.current)
            },
          }),
        retargetForGame: (target: GameVariant) => retargetForGame(target),
        getOverlayAttachedVersion,
      }
    } else {
      cachedOverlay = stableOverlayStrategy
    }
  }
  return cachedOverlay
}
