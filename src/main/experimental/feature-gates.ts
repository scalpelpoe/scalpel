import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'

/** In-process PoE1<->PoE2 game switching (no app relaunch). Promoted out of the
 *  experimental update channel in v0.9.17 - it is now on for every channel and in
 *  dev. Kept as a single choke point so the whole multi-window path can be
 *  re-gated in one place if a regression surfaces: restore the channel check
 *  (`_store.get('updateChannel') === 'experimental'`) to put it back behind the
 *  experimental channel. */
export function isExperimentalMultiWindowEnabled(_store: Store<AppSettings>): boolean {
  return true
}
