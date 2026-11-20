import type { HostFeatures } from 'electron-overlay-window'
import { describe, expect, it, vi } from 'vitest'
import { waylandLayerShellSupported } from './layer-shell'

const host = vi.hoisted(() => {
  const state: { features: HostFeatures | null } = { features: null }
  return state
})

vi.mock('electron', () => ({ app: {} }))
vi.mock('electron-overlay-window', () => ({
  layerShellUsable: (features: HostFeatures | null) => features?.layerShell === true,
  probeWaylandHost: () => host.features,
}))

const WLROOTS: HostFeatures = {
  layerShell: true,
  layerShellVersion: 4,
  foreignToplevel: true,
  dataControl: true,
  cursorShape: true,
  viewporter: true,
  virtualKeyboard: true,
  virtualPointer: true,
  screencopy: true,
}

describe('waylandLayerShellSupported', () => {
  it('runs natively where the game can be typed into', () => {
    host.features = WLROOTS
    expect(waylandLayerShellSupported()).toBe(true)
  })

  it('falls back to XWayland without a virtual keyboard, as on KWin', () => {
    host.features = { ...WLROOTS, foreignToplevel: false, virtualKeyboard: false, virtualPointer: false }
    expect(waylandLayerShellSupported()).toBe(false)
  })

  it('falls back to XWayland without layer-shell or a host', () => {
    host.features = { ...WLROOTS, layerShell: false }
    expect(waylandLayerShellSupported()).toBe(false)
    host.features = null
    expect(waylandLayerShellSupported()).toBe(false)
  })
})
