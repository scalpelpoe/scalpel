import type Store from 'electron-store'
import type { AppSettings } from '../../shared/types'
import {
  type GameSwitchCoordinator,
  type OverlayAttachStrategy,
  type StartupGameResolver,
  type AutoGameWatcher,
} from './contracts'
import { isExperimentalMultiWindowEnabled } from './feature-gates'
import { stableGameSwitchCoordinator, stableOverlayStrategy, stableStartupResolver, stableAutoWatcher } from './stable'

let cachedEnabled: boolean | null = null
let cachedCoordinator: GameSwitchCoordinator | null = null
let cachedOverlay: OverlayAttachStrategy | null = null
let cachedResolver: StartupGameResolver | null = null
let cachedWatcher: AutoGameWatcher | null = null

function resolveEnabled(store: Store<AppSettings>): boolean {
  if (cachedEnabled === null) cachedEnabled = isExperimentalMultiWindowEnabled(store)
  return cachedEnabled
}

export function getGameSwitchCoordinator(store: Store<AppSettings>): GameSwitchCoordinator {
  if (!cachedCoordinator) {
    cachedCoordinator = resolveEnabled(store) ? stableGameSwitchCoordinator : stableGameSwitchCoordinator
  }
  return cachedCoordinator
}

export function getOverlayAttachStrategy(store: Store<AppSettings>): OverlayAttachStrategy {
  if (!cachedOverlay) {
    cachedOverlay = resolveEnabled(store) ? stableOverlayStrategy : stableOverlayStrategy
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
