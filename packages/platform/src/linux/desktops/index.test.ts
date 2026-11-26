import { describe, expect, it, vi } from 'vitest'

vi.mock('electron-overlay-window', () => ({
  FocusArbiter: class {},
  releaseLayerKeyboards: () => {},
}))

import type { PlatformEnv } from '@platform/types'
import { linuxDesktopAdapter, linuxDesktopAdapterForSession } from './index'

const env = (vars: Record<string, string> = {}): PlatformEnv => ({
  platform: 'linux',
  env: vars,
  argv: ['scalpel', '--ozone-platform=wayland'],
})

const providerIds = (adapter: ReturnType<typeof linuxDesktopAdapter>): string[] =>
  (adapter.geometryProviders?.() ?? []).map((provider) => provider.id)

describe('linux desktop adapter registry', () => {
  it('returns the KWin adapter for kde-plasma', () => {
    const adapter = linuxDesktopAdapter('kde-plasma')
    expect(adapter.desktop).toBe('kde-plasma')
    expect(adapter.layerShell?.backendId).toBe('kwin-layer-shell')
  })

  it('contributes compositor geometry for tiling desktops', () => {
    expect(providerIds(linuxDesktopAdapter('sway'))).toEqual(['sway', 'umbriel'])
    expect(providerIds(linuxDesktopAdapter('niri'))).toEqual(['niri', 'umbriel'])
    expect(providerIds(linuxDesktopAdapter('umbriel'))).toEqual(['umbriel'])
  })

  it('keeps the generic fallback for an unknown or Auto profile', () => {
    const adapter = linuxDesktopAdapter(undefined)
    expect(adapter.desktop).toBeUndefined()
    expect(adapter.layerShell).toBeUndefined()
    expect(providerIds(adapter)).toEqual(['umbriel'])
  })

  it('lets a compositor adapter claim a generically detected session', () => {
    const kwin = linuxDesktopAdapterForSession(env({ WAYLAND_DISPLAY: 'wayland-1', KDE_FULL_SESSION: 'true' }))
    expect(kwin.layerShell?.backendId).toBe('kwin-layer-shell')

    const generic = linuxDesktopAdapterForSession(env({ WAYLAND_DISPLAY: 'wayland-1' }))
    expect(generic.layerShell).toBeUndefined()
    expect(generic.desktop).toBeUndefined()
  })

  it('contributes Auto defaults and game-mode probes', () => {
    expect(linuxDesktopAdapter('niri').defaults).toEqual({
      windowingMode: 'layer-shell',
      shortcutBackend: 'evdev',
    })
    expect(linuxDesktopAdapter('sway').defaults).toEqual({ windowingMode: 'layer-shell' })
    expect(linuxDesktopAdapter('kde-plasma').defaults).toEqual({ windowingMode: 'layer-shell' })
    expect(linuxDesktopAdapter(undefined).defaults).toBeUndefined()
    expect(linuxDesktopAdapter('hyprland').detectGameMode).toBeTypeOf('function')
    expect(linuxDesktopAdapter('niri').detectGameMode).toBeUndefined()
  })
})
