import type { Api } from '../../../preload/index'
import type { AppSettings } from '@shared/types'
import type { ThemePalette } from '@shared/theme/palette'
import { resolveCssVars } from '@shared/theme/derive'
import { resolveActivePalette } from '@shared/theme/active'

export const THEME_CACHE_KEY = 'scalpel:theme-vars'

type ThemeApi = Pick<Api, 'getSettings' | 'onSettingUpdated'>

/** Apply resolved CSS vars to :root without writing the localStorage cache.
 *  Use this on live-drag paths (e.g. color picker onChange) to avoid
 *  synchronous disk-backed writes on every frame. */
export function applyVars(palette: ThemePalette): void {
  const vars = resolveCssVars(palette)
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}

/** Write a resolved palette to :root and cache it for the next cold start. */
export function applyPalette(palette: ThemePalette): void {
  const vars = resolveCssVars(palette)
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(vars))
  } catch {
    // localStorage can throw in private mode / quota; theme still applied.
  }
}

/** Synchronous pre-paint: apply the last cached var map before React mounts.
 *  Eliminates the default-theme flash for non-default themes. Safe no-op
 *  when there is no cache or it is corrupt. */
export function applyCachedVars(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(THEME_CACHE_KEY)
  } catch {
    return
  }
  if (!raw) return
  let vars: Record<string, string>
  try {
    vars = JSON.parse(raw) as Record<string, string>
  } catch {
    // corrupt cache - styles.css default fallback stays in effect.
    return
  }
  if (typeof vars !== 'object' || vars === null) return
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}

/** Run once per renderer entry. Pre-paints from cache, then reconciles with
 *  persisted settings, then re-applies on every relevant setting change. */
export async function bootstrapTheme(): Promise<void> {
  applyCachedVars()

  const apiCandidate = (window as unknown as { api?: ThemeApi }).api
  if (!apiCandidate?.getSettings) return
  const api = apiCandidate

  let snapshot: ThemeSettingsSnapshot = { themeId: 'default', customThemePalette: null }

  const reapply = (): void => {
    applyPalette(resolveActivePalette(snapshot.themeId, snapshot.customThemePalette))
  }

  let settings: AppSettings
  try {
    settings = await api.getSettings()
  } catch {
    return // IPC unavailable; the cached pre-paint already applied, that is sufficient.
  }
  snapshot = {
    themeId: settings.themeId ?? 'default',
    customThemePalette: settings.customThemePalette ?? null,
  }
  reapply()

  api.onSettingUpdated((key, value) => {
    if (key === 'themeId') snapshot = { ...snapshot, themeId: value as string }
    else if (key === 'customThemePalette') snapshot = { ...snapshot, customThemePalette: value as ThemePalette | null }
    else return
    reapply()
  })
}

interface ThemeSettingsSnapshot {
  themeId: string
  customThemePalette: ThemePalette | null
}
