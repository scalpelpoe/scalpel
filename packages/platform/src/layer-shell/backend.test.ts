import type { HostFeatures } from 'electron-overlay-window'
import { describe, expect, it, vi } from 'vitest'
import { layerShellSupported } from './backend'

const probe = vi.hoisted(() => {
  const state: { features: HostFeatures | null } = { features: null }
  return state
})

vi.mock('electron-overlay-window', () => ({
  probeWaylandHost: () => probe.features,
  layerShellUsable: (features: HostFeatures | null) => !!features?.layerShell && features.layerShellVersion >= 4,
}))

const wlroots: HostFeatures = {
  layerShell: true,
  layerShellVersion: 4,
  foreignToplevel: true,
  dataControl: true,
  cursorShape: true,
  viewporter: true,
  virtualKeyboard: true,
  uinput: false,
  virtualPointer: true,
  screencopy: true,
}

describe('layerShellSupported', () => {
  it('accepts a compositor with a virtual keyboard', () => {
    probe.features = wlroots
    expect(layerShellSupported()).toBe(true)
  })

  it('types through uinput where the compositor has no virtual keyboard', () => {
    probe.features = { ...wlroots, virtualKeyboard: false, uinput: true }
    expect(layerShellSupported()).toBe(true)
    probe.features = { ...wlroots, virtualKeyboard: false }
    expect(layerShellSupported()).toBe(false)
  })

  it('rejects compositors that cannot track the game or host no layer-shell', () => {
    probe.features = { ...wlroots, foreignToplevel: false, virtualKeyboard: false, uinput: true }
    expect(layerShellSupported()).toBe(false)
    probe.features = null
    expect(layerShellSupported()).toBe(false)
  })
})
