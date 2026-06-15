import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import { isLocale, locales, overwriteGetLocale } from '@shared/paraglide/runtime.js'

type Locale = (typeof locales)[number]

/** Current UI locale for the main process. Paraglide's `getLocale()` override
 *  reads this at message-call time, so tray/dialog strings built after a change
 *  pick up the new language. The electron-store `locale` setting is the source
 *  of truth; this is the in-process cache. */
let current: Locale = 'en'

/** Install the Paraglide `getLocale()` override and keep it in sync with the
 *  persisted `locale` setting. `onChange` runs after `current` updates, so
 *  callers can rebuild already-rendered UI (e.g. the tray context menu). */
export function initMainLocale(store: Store<AppSettings>, onChange?: () => void): void {
  const initial = store.get('locale')
  if (typeof initial === 'string' && isLocale(initial)) current = initial
  overwriteGetLocale(() => current)
  store.onDidChange('locale', (value) => {
    if (typeof value !== 'string' || !isLocale(value)) return
    current = value
    onChange?.()
  })
}
