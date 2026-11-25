import { describe, expect, it } from 'vitest'
import {
  defaultLinuxLayerShellCapability,
  resolveLinuxWindowingMode,
  toLinuxWindowingMode,
  type LinuxWindowingFacts,
} from './windowing'

const facts = (overrides: Partial<LinuxWindowingFacts> = {}): LinuxWindowingFacts => ({
  displayMode: 'x11',
  nativeWayland: false,
  layerShell: defaultLinuxLayerShellCapability(),
  ...overrides,
})

describe('linux windowing mode', () => {
  it('normalizes unknown persisted values to auto', () => {
    expect(toLinuxWindowingMode('layer-shell')).toBe('layer-shell')
    expect(toLinuxWindowingMode('x11')).toBe('x11')
    expect(toLinuxWindowingMode('window')).toBe('window')
    expect(toLinuxWindowingMode('auto')).toBe('auto')
    expect(toLinuxWindowingMode('kwin-layer-shell')).toBe('auto')
    expect(toLinuxWindowingMode(undefined)).toBe('auto')
  })

  it('falls back quietly from Auto when layer shell is not ready', () => {
    expect(resolveLinuxWindowingMode('auto', facts())).toEqual({ mode: 'x11' })
    expect(resolveLinuxWindowingMode('auto', facts({ displayMode: 'wayland' }))).toEqual({ mode: 'window' })
    expect(
      resolveLinuxWindowingMode('auto', facts({ displayMode: 'wayland', layerShell: { available: true } })),
    ).toEqual({ mode: 'layer-shell' })
    expect(resolveLinuxWindowingMode('auto', facts({ nativeWayland: true, layerShell: { available: true } }))).toEqual({
      mode: 'layer-shell',
    })
  })

  it('uses the editable desktop default only for Auto and only when it is usable', () => {
    const ready = facts({ displayMode: 'wayland', nativeWayland: true, layerShell: { available: true } })

    expect(resolveLinuxWindowingMode('auto', { ...ready, defaultMode: 'layer-shell' })).toEqual({
      mode: 'layer-shell',
    })
    expect(resolveLinuxWindowingMode('auto', { ...ready, defaultMode: 'x11' })).toEqual({ mode: 'x11' })
    expect(
      resolveLinuxWindowingMode(
        'auto',
        facts({ displayMode: 'x11', defaultMode: 'layer-shell', layerShell: { available: true } }),
      ),
    ).toEqual({ mode: 'x11' })
    expect(
      resolveLinuxWindowingMode(
        'auto',
        facts({ displayMode: 'wayland', defaultMode: 'layer-shell', layerShell: { available: false } }),
      ),
    ).toEqual({ mode: 'window' })

    // Explicit choices are never overwritten by a desktop default.
    expect(resolveLinuxWindowingMode('x11', { ...ready, defaultMode: 'layer-shell' })).toEqual({ mode: 'x11' })
    expect(resolveLinuxWindowingMode('layer-shell', { ...ready, defaultMode: 'x11' })).toEqual({
      mode: 'layer-shell',
    })
  })

  it('keeps explicit X11 on X11 regardless of layer-shell capability', () => {
    expect(
      resolveLinuxWindowingMode(
        'x11',
        facts({ displayMode: 'wayland', nativeWayland: true, layerShell: { available: true } }),
      ),
    ).toEqual({ mode: 'x11' })
  })

  it('asks for Wayland before using an explicit layer-shell preference', () => {
    expect(
      resolveLinuxWindowingMode('layer-shell', facts({ displayMode: 'x11', layerShell: { available: true } })),
    ).toEqual({ mode: 'x11', warning: 'native-wayland-required' })
  })

  it('reports an unavailable layer-shell host and keeps the reason key', () => {
    expect(
      resolveLinuxWindowingMode(
        'layer-shell',
        facts({
          displayMode: 'wayland',
          layerShell: { available: false, reasonKey: 'settings_linux_unavailable_hint' },
        }),
      ),
    ).toEqual({
      mode: 'window',
      warning: 'layer-shell-unavailable',
      reasonKey: 'settings_linux_unavailable_hint',
    })
  })

  it('keeps an explicit regular-window preference on both display modes', () => {
    expect(resolveLinuxWindowingMode('window', facts())).toEqual({ mode: 'window' })
    expect(
      resolveLinuxWindowingMode(
        'window',
        facts({ displayMode: 'wayland', nativeWayland: true, layerShell: { available: true } }),
      ),
    ).toEqual({ mode: 'window' })
  })

  it('accepts an explicit layer-shell preference once Wayland and the host are ready', () => {
    expect(
      resolveLinuxWindowingMode(
        'layer-shell',
        facts({ displayMode: 'wayland', nativeWayland: true, layerShell: { available: true } }),
      ),
    ).toEqual({ mode: 'layer-shell' })
  })
})
