import type Store from 'electron-store'
import type { PlatformSettingsView } from '@shared/contracts/platform-settings'
import type { AppSettings } from '@shared/types'
import {
  PLATFORM_SETTING_IDS,
  type PlatformPreferences,
  type PlatformSettingId,
  currentEnv,
  detectPlatformGameMode,
  getAllGameTitles,
  platformSettingsView,
} from '@scalpel/platform'

type SettingsReader = Pick<Store<AppSettings>, 'get'>

/** The only host-specific part: opaque descriptor ids mapped to neutral store keys. */
export const PLATFORM_SETTING_KEYS = {
  [PLATFORM_SETTING_IDS.displayMode]: 'platformDisplayMode',
  [PLATFORM_SETTING_IDS.gameDisplayMode]: 'platformGameDisplayMode',
  [PLATFORM_SETTING_IDS.desktopEnvironment]: 'platformDesktopEnvironment',
  [PLATFORM_SETTING_IDS.windowingMode]: 'platformWindowingMode',
  [PLATFORM_SETTING_IDS.inputBackend]: 'platformInputBackend',
  [PLATFORM_SETTING_IDS.clipboardBackend]: 'platformClipboardBackend',
  [PLATFORM_SETTING_IDS.shortcutBackend]: 'platformShortcutBackend',
} as const satisfies Readonly<Record<string, keyof AppSettings>>

const PLATFORM_SETTING_ID_BY_KEY: ReadonlyMap<keyof AppSettings, PlatformSettingId> = new Map(
  (Object.entries(PLATFORM_SETTING_KEYS) as Array<[PlatformSettingId, keyof AppSettings]>).map(([id, key]) => [
    key,
    id,
  ]),
)

/** The platform setting a store key persists, if any. Platform keys are written
 *  only through `SET_PLATFORM`, which checks the value against the live view. */
export function platformSettingIdForKey(key: keyof AppSettings): PlatformSettingId | undefined {
  return PLATFORM_SETTING_ID_BY_KEY.get(key)
}

export function isPlatformSettingKey(key: keyof AppSettings): boolean {
  return PLATFORM_SETTING_ID_BY_KEY.has(key)
}

/** Every saved platform preference, for `startPlatform`. */
export function readPlatformPreferences(store: SettingsReader): PlatformPreferences {
  return Object.fromEntries(Object.entries(PLATFORM_SETTING_KEYS).map(([id, key]) => [id, store.get(key)]))
}

export function readPlatformSettingsView(store: SettingsReader): PlatformSettingsView {
  return platformSettingsView({
    env: currentEnv(),
    displayMode: store.get('platformDisplayMode'),
    gameDisplayMode: store.get('platformGameDisplayMode'),
    desktopEnvironment: store.get('platformDesktopEnvironment'),
    windowingMode: store.get('platformWindowingMode'),
    inputBackend: store.get('platformInputBackend'),
    clipboardBackend: store.get('platformClipboardBackend'),
    shortcutBackend: store.get('platformShortcutBackend'),
    detectedGameMode: detectPlatformGameMode(getAllGameTitles()),
  })
}
