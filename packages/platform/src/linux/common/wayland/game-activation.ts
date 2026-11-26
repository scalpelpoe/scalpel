import { WaylandHost } from 'electron-overlay-window/dist/wayland/host'
import { getAllGameTitles, matchGameWindow } from '../../../common/game-window-identity'

/** Ask the compositor to activate a PoE toplevel through the generic
 *  foreign-toplevel host. Returns false when the protocol or game is absent. */
export function activateWaylandGame(): boolean {
  const host = WaylandHost.get()
  if (!host) return false
  const titles = getAllGameTitles()
  const game = [...host.toplevels.values()].find(
    (toplevel) => matchGameWindow({ title: toplevel.title, appId: toplevel.appId }, titles).accepted,
  )
  if (!game) return false
  host.activateToplevel(game.tid)
  return true
}
