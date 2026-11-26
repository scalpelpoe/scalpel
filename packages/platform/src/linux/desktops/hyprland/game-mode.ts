import type { CompositorWindowInfo, PlatformEnv } from '@platform/types'
import { readHyprlandClients } from './ipc'

export type PlatformGameMode = 'x11' | 'wayland'

type ReadClients = () => readonly CompositorWindowInfo[]

/** Pure matching helper so tests and future compositors can reuse the policy. */
export function gameModeFromClients(
  clients: readonly CompositorWindowInfo[],
  titles: readonly string[],
): PlatformGameMode | null {
  const wanted = titles.map((title) => title.toLowerCase())
  const game = clients.find((client) => wanted.includes(client.title.toLowerCase()))
  if (!game || typeof game.xwayland !== 'boolean') return null
  return game.xwayland ? 'x11' : 'wayland'
}

/**
 * Compositor-backed detection for the PoE game-mode warning. Hyprland can say
 * whether the game window is XWayland; every other compositor returns null and
 * the user can still override the mode in settings.
 */
export function detectHyprlandGameMode(
  titles: readonly string[],
  env: PlatformEnv,
  readClients: ReadClients = readHyprlandClients,
): PlatformGameMode | null {
  if (!env.env.HYPRLAND_INSTANCE_SIGNATURE) return null
  try {
    return gameModeFromClients(readClients(), titles)
  } catch {
    return null
  }
}
