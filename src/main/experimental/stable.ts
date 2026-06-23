import { app } from 'electron'
import type { GameVariant } from '@shared/types'
import type { GameSwitchCoordinator, OverlayAttachStrategy } from './contracts'
import { createOverlayWindow, getOverlayAttachedVersion } from '../overlay'
import { requestGameSwitch } from '../game-switch'
import { ensureCorrectGameForHotkey } from '../evaluation'
import { getEffectiveSettings, getProfileById, persistProfileSwitchForRestart } from '../profiles/profile-settings'
import { applySetting } from '../settings-write'

export const stableGameSwitchCoordinator: GameSwitchCoordinator = {
  ensureCorrectGameForHotkey,
  requestGameSwitch,
  applyProfileSwitch: async (store, id, restartIfNeeded, sender) => {
    const profile = getProfileById(id)
    if (!profile) return { ok: false as const, error: 'Profile not found' }

    const current = store.get('poeVersion') === 2 ? 2 : 1
    if (profile.gameVariant !== current) {
      if (!restartIfNeeded) {
        return { ok: false as const, requiresRestart: true as const, targetGame: profile.gameVariant }
      }

      if (!app.isPackaged) {
        applySetting(store, 'activeProfileId', id, sender)
        console.warn(`[profile-switch] target=PoE${profile.gameVariant}; restart dev to re-attach`)
        return { ok: true as const, settings: getEffectiveSettings(store), devRestartRequired: true as const }
      }

      persistProfileSwitchForRestart(store, profile)
      app.relaunch()
      app.quit()
      return { ok: true as const, restarting: true as const }
    }

    applySetting(store, 'activeProfileId', id, sender)
    return { ok: true as const, settings: getEffectiveSettings(store) }
  },
}

export const stableOverlayStrategy: OverlayAttachStrategy = {
  createInitialOverlay: (version: GameVariant) => createOverlayWindow(version),
  retargetForGame: () => {},
  getOverlayAttachedVersion,
}
