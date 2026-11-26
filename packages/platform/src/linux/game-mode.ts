import { currentEnv, detectOperatingSystem } from '../select'
import type { CompositorWindowInfo, PlatformEnv } from '../types'
import { detectLinuxGameMode } from './desktops'

export type PlatformGameMode = 'x11' | 'wayland'

type ReadClients = () => readonly CompositorWindowInfo[]

export { gameModeFromClients } from './desktops/hyprland/game-mode'

/** Compositor-backed detection for the PoE game-mode warning. Desktop-specific
 *  probing lives behind the adapter registry; this is the neutral entry point
 *  used by the settings view. Returns null when the session cannot answer
 *  confidently. */
export function detectPlatformGameMode(
  titles: readonly string[],
  readClients?: ReadClients,
  env: PlatformEnv = currentEnv(),
): PlatformGameMode | null {
  if (detectOperatingSystem(env) !== 'linux') return null
  return detectLinuxGameMode(titles, env, readClients)
}
