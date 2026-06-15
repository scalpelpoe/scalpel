import { createContext, Fragment, type ReactNode, useContext, useSyncExternalStore } from 'react'
import type { Api } from '../../../preload/index'
import { baseLocale, isLocale, locales, overwriteGetLocale, overwriteSetLocale } from '@shared/paraglide/runtime.js'

/** The set of locales compiled into the Paraglide runtime (see project.inlang). */
export type Locale = (typeof locales)[number]

/** Human-readable, self-referential display names for the language picker. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
}

export const SUPPORTED_LOCALES = locales as readonly Locale[]

/** localStorage mirror of the persisted `locale` setting. Read synchronously on
 *  cold start (before React mounts) so the first paint is already translated --
 *  the i18n analog of the theme system's `scalpel:theme-vars` cache. The
 *  electron-store `locale` setting remains the source of truth; this is a cache. */
const MIRROR_KEY = 'scalpel:locale'

type LocaleApi = Pick<Api, 'getSettings' | 'onSettingUpdated' | 'setSetting'>

/** Current locale, read by Paraglide's `getLocale()` override at message-call time. */
let current: Locale = baseLocale

/** Subscribers (LocaleProvider instances) re-rendered when the locale changes. */
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function readMirror(): Locale | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY)
    return raw && isLocale(raw) ? (raw as Locale) : null
  } catch {
    return null
  }
}

function writeMirror(locale: Locale): void {
  try {
    localStorage.setItem(MIRROR_KEY, locale)
  } catch {
    // localStorage can throw in private mode / on quota; in-memory locale still applies.
  }
}

/** Apply a locale in-memory, refresh the mirror, and re-render subscribers.
 *  Never reloads the window (the overlay must not blink). When `persist` is set
 *  -- i.e. the change originated in this window -- it is also written back to
 *  settings, which broadcasts to the *other* windows (the originating window is
 *  excluded from that broadcast, so it must apply locally here). */
function applyLocale(locale: Locale, persist: boolean): void {
  writeMirror(locale)
  if (persist) {
    const api = (window as unknown as { api?: LocaleApi }).api
    void api?.setSetting?.('locale', locale)
  }
  if (locale === current) return
  current = locale
  notify()
}

/** Change the active language. Call from UI (e.g. the settings dropdown). */
export function setAppLocale(locale: Locale): void {
  applyLocale(locale, true)
}

/** Synchronous: seed the locale from the localStorage mirror and install the
 *  Paraglide get/set overrides BEFORE React mounts. Call once per renderer entry,
 *  immediately before `createRoot`. */
export function bootstrapLocaleSync(): void {
  const mirrored = readMirror()
  if (mirrored) current = mirrored
  overwriteGetLocale(() => current)
  overwriteSetLocale((next) => {
    if (isLocale(next)) applyLocale(next as Locale, true)
  })
}

/** Async: reconcile with the persisted setting and subscribe to cross-window
 *  locale changes. Mirrors `bootstrapTheme`; safe no-op when IPC is unavailable. */
export async function bootstrapLocale(): Promise<void> {
  const api = (window as unknown as { api?: LocaleApi }).api
  if (!api?.getSettings) return
  try {
    const settings = await api.getSettings()
    if (typeof settings.locale === 'string' && isLocale(settings.locale)) {
      applyLocale(settings.locale as Locale, false)
    }
  } catch {
    return // IPC unavailable; the synchronous mirror seed already applied.
  }
  api.onSettingUpdated((key, value) => {
    if (key !== 'locale') return
    if (typeof value === 'string' && isLocale(value)) applyLocale(value as Locale, false)
  })
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

/** Reactive read of the current locale. */
export function useLocale(): Locale {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  )
}

const LocaleContext = createContext<Locale>(baseLocale)

/** Re-renders its subtree whenever the locale changes. Paraglide's `m.*()`
 *  functions read the locale at call time, so a change must force the tree to
 *  re-run. The `key` remounts children on switch -- this bypasses `React.memo`
 *  boundaries (a plain re-render would bail out on referentially-stable
 *  `children`) without a full window reload. */
export function LocaleProvider({ children }: { children: ReactNode }): JSX.Element {
  const locale = useLocale()
  return (
    <LocaleContext.Provider value={locale}>
      <Fragment key={locale}>{children}</Fragment>
    </LocaleContext.Provider>
  )
}

export function useCurrentLocale(): Locale {
  return useContext(LocaleContext)
}

/** Test-only: reset module state (active locale, subscribers, localStorage
 *  mirror) back to baseLocale so each case starts clean. Mirrors the reset hooks
 *  used elsewhere in the codebase (e.g. `_setStatEntriesForTests`). */
export function _resetLocaleForTests(): void {
  current = baseLocale
  listeners.clear()
  try {
    localStorage.removeItem(MIRROR_KEY)
  } catch {
    // ignore - nothing to reset if storage is unavailable
  }
}
