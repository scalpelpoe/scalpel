import type { StreamTheme } from '@scalpel/stream-contract'
import { resolveActivePalette } from '@shared/theme/active'
import type { AppSettings } from '@shared/types'

type ThemeSettings = Pick<AppSettings, 'themeId' | 'customThemePalette'>

/** The palette Scalpel renders in, as published to viewers. */
export function streamTheme(settings: Partial<ThemeSettings>): StreamTheme {
  return { ...resolveActivePalette(settings.themeId ?? 'default', settings.customThemePalette ?? null) }
}

/** The slice of electron-store the watcher needs. */
export interface ThemeStore {
  onDidChange(key: 'themeId' | 'customThemePalette', cb: () => void): () => void
}

/** Calls `push` once, `delayMs` after the last theme change, so dragging a custom colour
 *  doesn't flood the API. Returns a disposer that also cancels a pending push. */
export function watchThemeChanges(
  store: ThemeStore,
  push: () => void,
  delayMs = 1000,
  active: () => boolean = () => true,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const onChange = (): void => {
    if (!active()) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      push()
    }, delayMs)
  }
  const offs = [store.onDidChange('themeId', onChange), store.onDidChange('customThemePalette', onChange)]
  return () => {
    if (timer) clearTimeout(timer)
    for (const off of offs) off()
  }
}
