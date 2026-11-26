import { describe, expect, it, vi } from 'vitest'
import { PLATFORM_SETTING_KEYS, isPlatformSettingKey, readPlatformSettingsView } from './platform-settings'

const detect = vi.fn((_titles?: readonly string[]): 'wayland' | 'x11' | null => null)
const makeView = vi.fn((_input: unknown = {}) => ({ available: true, sections: [] }))

vi.mock('@scalpel/platform', async () => ({
  PLATFORM_SETTING_IDS: (await import('@scalpel/platform/settings')).PLATFORM_SETTING_IDS,
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
  it('reserves every platform store key for the validated write path', () => {
    for (const key of Object.values(PLATFORM_SETTING_KEYS)) expect(isPlatformSettingKey(key)).toBe(true)
    expect(isPlatformSettingKey('openSide')).toBe(false)
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
