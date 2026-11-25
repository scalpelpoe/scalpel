import { describe, expect, it, vi } from 'vitest'
import { PLATFORM_SETTING_IDS } from '@scalpel/platform'
import { PLATFORM_SETTING_KEYS, readPlatformSettingsView } from './platform-settings'

const detect = vi.fn((_titles?: readonly string[]): 'wayland' | 'x11' | null => null)
const makeView = vi.fn((_input: unknown = {}) => ({ available: true, sections: [] }))

vi.mock('@scalpel/platform', () => ({
  PLATFORM_SETTING_IDS: {
    displayMode: 'displayMode',
    gameDisplayMode: 'gameDisplayMode',
    desktopEnvironment: 'desktopEnvironment',
    windowingMode: 'windowingMode',
    shortcutBackend: 'shortcutBackend',
  },
  currentEnv: () => ({ platform: 'linux', env: {}, argv: ['scalpel'] }),
  detectPlatformGameMode: (titles: readonly string[]) => detect(titles),
  getAllGameTitles: () => ['Path of Exile', 'Path of Exile 2'],
  platformSettingsView: (input: unknown) => makeView(input),
}))

const store = {
  get: (key: string) =>
    ({
      platformDisplayMode: 'wayland',
      platformGameDisplayMode: 'x11',
      platformDesktopEnvironment: 'kde-plasma',
      platformWindowingMode: 'layer-shell',
      platformShortcutBackend: 'portal',
    })[key],
} as never

describe('platform settings host adapter', () => {
  it('maps only active descriptor ids to neutral persisted keys', () => {
    expect(PLATFORM_SETTING_KEYS[PLATFORM_SETTING_IDS.displayMode]).toBe('platformDisplayMode')
    expect(PLATFORM_SETTING_KEYS[PLATFORM_SETTING_IDS.gameDisplayMode]).toBe('platformGameDisplayMode')
    expect(PLATFORM_SETTING_KEYS[PLATFORM_SETTING_IDS.desktopEnvironment]).toBe('platformDesktopEnvironment')
    expect(PLATFORM_SETTING_KEYS[PLATFORM_SETTING_IDS.windowingMode]).toBe('platformWindowingMode')
    expect(PLATFORM_SETTING_KEYS[PLATFORM_SETTING_IDS.shortcutBackend]).toBe('platformShortcutBackend')
    expect(PLATFORM_SETTING_KEYS['unknown' as keyof typeof PLATFORM_SETTING_KEYS]).toBeUndefined()
  })

  it('feeds saved neutral values and live detection into the package view', () => {
    detect.mockReturnValue('wayland')
    const view = readPlatformSettingsView(store)
    expect(view).toEqual(makeView.mock.results[0]?.value)
    expect(makeView).toHaveBeenCalledWith(
      expect.objectContaining({
        displayMode: 'wayland',
        gameDisplayMode: 'x11',
        desktopEnvironment: 'kde-plasma',
        windowingMode: 'layer-shell',
        shortcutBackend: 'portal',
        detectedGameMode: 'wayland',
      }),
    )
  })
})
