import type { HostFeatures } from 'electron-overlay-window'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { waylandLayerShellSupported } from './layer-shell'

const host = vi.hoisted(() => ({
  features: null as HostFeatures | null,
  kwin: false,
  keyboard: false,
}))

vi.mock('./kwin-input', () => ({
  kwinWaylandSession: () => host.kwin,
  kwinKeyboardAvailable: () => host.keyboard,
}))

vi.mock('electron', () => ({ app: {} }))
vi.mock('electron-overlay-window', () => ({
  layerShellUsable: (features: HostFeatures | null) => features?.layerShell === true && features.layerShellVersion >= 4,
  probeWaylandHost: () => host.features,
}))

const PLASMA: HostFeatures = {
  layerShell: true,
  layerShellVersion: 4,
  foreignToplevel: false,
  dataControl: true,
  cursorShape: true,
  viewporter: true,
  virtualKeyboard: false,
  virtualPointer: false,
  screencopy: false,
}

describe('waylandLayerShellSupported', () => {
  beforeEach(() => {
    host.features = PLASMA
    host.kwin = true
    host.keyboard = true
  })

  it('uses ydotool on KDE even without a Wayland virtual keyboard', () => {
    expect(waylandLayerShellSupported()).toBe(true)
    host.keyboard = false
    expect(waylandLayerShellSupported()).toBe(false)
  })

  it('leaves platform selection to the existing path on other desktops', () => {
    host.kwin = false
    host.features = { ...PLASMA, virtualKeyboard: true, foreignToplevel: true }
    expect(waylandLayerShellSupported()).toBe(false)
  })

  it('requires layer-shell v4 and data-control', () => {
    host.features = { ...PLASMA, layerShellVersion: 3 }
    expect(waylandLayerShellSupported()).toBe(false)
    host.features = { ...PLASMA, dataControl: false }
    expect(waylandLayerShellSupported()).toBe(false)
    host.features = null
    expect(waylandLayerShellSupported()).toBe(false)
  })
})
