import { describe, expect, it, vi } from 'vitest'

vi.mock('./common/global-shortcuts/evdev', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./common/global-shortcuts/evdev')>()),
  evdevKeyboardsReadable: () => true,
}))

vi.mock('./common/key-injection', () => ({
  preferredTool: vi.fn(() => null),
}))

import { resolveLinuxEffectiveBackendsSnapshot } from './effective-backends'

const linuxEnv = (args: string[] = []) =>
  ({
    platform: 'linux',
    argv: ['scalpel', ...args],
    env: {},
    version: '1.0.0',
    execPath: '/usr/bin/scalpel',
    resourcesPath: '/opt/scalpel/resources',
  }) as const

describe('resolveLinuxEffectiveBackendsSnapshot', () => {
  it('returns null on non-linux', () => {
    expect(resolveLinuxEffectiveBackendsSnapshot({ env: { ...linuxEnv(), platform: 'win32' } as never })).toBeNull()
  })

  it('resolves x11 defaults', () => {
    expect(resolveLinuxEffectiveBackendsSnapshot({ env: linuxEnv() })).toMatchObject({
      platform: 'linux',
      nativeWayland: false,
      windowing: { preference: 'auto', resolved: 'x11' },
      shortcuts: { preference: 'auto', resolved: 'electron' },
      clipboard: { preference: 'auto', resolved: 'native' },
      input: { preference: 'auto', resolved: 'uiohook' },
    })
  })

  it('resolves native wayland portal defaults', () => {
    expect(
      resolveLinuxEffectiveBackendsSnapshot({
        env: linuxEnv(['--ozone-platform=wayland']),
        displayMode: 'wayland',
      }),
    ).toMatchObject({
      nativeWayland: true,
      shortcuts: { preference: 'auto', resolved: 'portal' },
      clipboard: { preference: 'auto', resolved: 'wl-clipboard' },
      input: { preference: 'auto', resolved: 'unavailable' },
    })
  })

  it('uses the selected desktop default for Auto shortcuts', () => {
    expect(
      resolveLinuxEffectiveBackendsSnapshot({
        env: linuxEnv(['--ozone-platform=wayland']),
        displayMode: 'wayland',
        desktopEnvironment: 'niri',
      })?.shortcuts,
    ).toEqual({ preference: 'auto', resolved: 'evdev' })
  })

  it('passes explicit selections through unchanged', () => {
    expect(
      resolveLinuxEffectiveBackendsSnapshot({
        env: linuxEnv(['--ozone-platform=wayland']),
        displayMode: 'wayland',
        desktopEnvironment: 'kde-plasma',
        windowingMode: 'window',
        shortcutBackend: 'portal',
        clipboardBackend: 'native',
        inputBackend: 'ydotool',
      }),
    ).toMatchObject({
      windowing: { preference: 'window', resolved: 'window' },
      shortcuts: { preference: 'portal', resolved: 'portal' },
      clipboard: { preference: 'native', resolved: 'native' },
      input: { preference: 'ydotool', resolved: 'ydotool' },
    })
  })

  it('reports the effective display mode when a launch flag overrides the saved one', () => {
    expect(
      resolveLinuxEffectiveBackendsSnapshot({
        env: linuxEnv(['--ozone-platform=wayland']),
        displayMode: 'x11',
      }),
    ).toMatchObject({
      displayMode: 'wayland',
      savedDisplayMode: 'x11',
      nativeWayland: true,
    })
  })
})
