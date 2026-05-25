import { describe, expect, it, vi } from 'vitest'
import { getPoeVersion, setPoeVersion } from './game-state'
import { PROFILE_VERSION_KEY, type ProfileChangedSetting } from './profile-settings'

vi.mock('./filter-state', () => ({
  clearFilterState: vi.fn(),
  loadFilter: vi.fn(),
}))

vi.mock('./overlay', () => ({
  getOverlayWindow: vi.fn(() => null),
  setCloseOnClickOutside: vi.fn(),
}))

vi.mock('./app-macros', () => ({
  withPluginHotkeys: vi.fn((value) => value),
}))

vi.mock('./app-window', () => ({
  getAppWindow: vi.fn(() => null),
}))

vi.mock('./cheat-sheets', () => ({
  applyCheatSheetHotkeys: vi.fn(),
  getCheatSheetsOverlay: vi.fn(() => null),
}))

vi.mock('./evaluation', () => ({
  reEvaluateLastItem: vi.fn(),
  setOpenSide: vi.fn(),
}))

vi.mock('./hotkeys', () => ({
  setAppMacros: vi.fn(),
  setChatCommands: vi.fn(),
  setHotkey: vi.fn(),
  setPriceCheckHotkey: vi.fn(),
  setStashScrollEnabled: vi.fn(),
}))

vi.mock('./pinned-zone', () => ({
  applyPinnedZoneEnabled: vi.fn(),
  getPinnedZoneOverlay: vi.fn(() => null),
}))

vi.mock('./trade/prices', () => ({
  refreshPrices: vi.fn(),
}))

vi.mock('./update/updater', () => ({
  setUpdateChannel: vi.fn(),
}))

describe('settings-write side effects', () => {
  it('updates process game state before refreshing prices during profile hydration', async () => {
    const { refreshPrices } = await import('./trade/prices')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')
    const observedVersions: number[] = []
    vi.mocked(refreshPrices).mockImplementation(() => {
      observedVersions.push(getPoeVersion())
      return Promise.resolve()
    })

    setPoeVersion(2)

    const changes: ProfileChangedSetting[] = [
      { key: PROFILE_VERSION_KEY, value: 1 },
      { key: 'league', value: 'Mirage' },
    ]
    applyProfileHydrationSideEffects(changes, { [PROFILE_VERSION_KEY]: 2, league: 'Fate of the Vaal' })

    expect(observedVersions).toEqual([1])
  })
})
