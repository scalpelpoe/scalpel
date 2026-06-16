import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'

export function isExperimentalMultiWindowEnabled(store: Store<AppSettings>): boolean {
  return store.get('updateChannel') === 'experimental'
}
