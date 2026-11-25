import type Store from 'electron-store'
import type { PlatformSettingsView } from '@shared/contracts/platform-settings'
import type { AppSettings } from '@shared/types'
import {
  PLATFORM_SETTING_IDS,
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
