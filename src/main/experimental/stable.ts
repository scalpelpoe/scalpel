import type Store from 'electron-store'
import type { AppSettings, GameVariant } from '../../shared/types'
import type {
  AutoGameWatcher,
  GameSwitchCoordinator,
  OverlayAttachStrategy,
  ProfileSwitchResult,
  StartupGameResolver,
} from './contracts'
import { createOverlayWindow, getOverlayAttachedVersion } from '../overlay'
import { requestGameSwitch } from '../game-switch'
import { ensureCorrectGameForHotkey } from '../evaluation'

export const stableGameSwitchCoordinator: GameSwitchCoordinator = {
  ensureCorrectGameForHotkey,
  requestGameSwitch,
  applyProfileSwitch: async () => ({
    ok: false as const,
    error: 'Not applicable in stable mode',
  }),
}

export const stableOverlayStrategy: OverlayAttachStrategy = {
  createInitialOverlay: (version: GameVariant) => createOverlayWindow(version),
  retargetForGame: () => {},
  getOverlayAttachedVersion,
}

export const stableStartupResolver: StartupGameResolver = {
  resolve: async (store: Store<AppSettings>) => (store.get('poeVersion') === 2 ? 2 : 1),
}

export const stableAutoWatcher: AutoGameWatcher = {
  start: () => {},
  stop: () => {},
  onSwitch: () => () => {},
}
