import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFeatures } from 'electron-overlay-window'

const mock = vi.hoisted(() => ({
  layerShellUsable: vi.fn((features: HostFeatures | null) => {
    return !!features && features.layerShell && features.layerShellVersion >= 4
  }),
  probeWaylandHost: vi.fn(() => null as HostFeatures | null),
  hostExecutablePath: vi.fn(() => '/opt/scalpel/overlay-wayland-host' as string | null),
}))

vi.mock('electron-overlay-window', () => ({
  layerShellUsable: mock.layerShellUsable,
  probeWaylandHost: mock.probeWaylandHost,
}))
vi.mock('electron-overlay-window/dist/wayland/host', () => ({
  hostExecutablePath: mock.hostExecutablePath,
}))

import { probeAndReportLinuxLayerShellSupport, probeLinuxLayerShellSupport } from './support'

const features = (overrides: Partial<HostFeatures> = {}): HostFeatures => ({
  layerShell: true,
  layerShellVersion: 4,
  foreignToplevel: true,
  dataControl: true,
  cursorShape: true,
  viewporter: true,
  virtualKeyboard: true,
  virtualPointer: true,
  screencopy: true,
  ...overrides,
})

describe('probeLinuxLayerShellSupport', () => {
  beforeEach(() => {
    mock.layerShellUsable.mockClear()
    mock.probeWaylandHost.mockClear()
    mock.hostExecutablePath.mockClear()
    mock.hostExecutablePath.mockReturnValue('/opt/scalpel/overlay-wayland-host')
  })

  it('distinguishes a missing host from a failed probe', () => {
    mock.hostExecutablePath.mockReturnValue(null)
    expect(probeLinuxLayerShellSupport(null).reasonKey).toBe('settings_linux_layer_shell_host_missing')
    mock.hostExecutablePath.mockReturnValue('/opt/scalpel/overlay-wayland-host')
    expect(probeLinuxLayerShellSupport(null).reasonKey).toBe('settings_linux_layer_shell_probe_failed')
  })

  it('reports the first missing compositor capability', () => {
    expect(probeLinuxLayerShellSupport(features({ layerShell: false })).reasonKey).toBe(
      'settings_linux_layer_shell_protocol_unavailable',
    )
    expect(probeLinuxLayerShellSupport(features({ foreignToplevel: false })).reasonKey).toBe(
      'settings_linux_layer_shell_toplevel_unavailable',
    )
    expect(probeLinuxLayerShellSupport(features({ dataControl: false })).reasonKey).toBe(
      'settings_linux_layer_shell_clipboard_unavailable',
    )
  })

  it('accepts a compositor with the required globals', () => {
    const result = probeLinuxLayerShellSupport(features())
    expect(result.available).toBe(true)
    expect(result.reasonKey).toBeUndefined()
    expect(result.features?.screencopy).toBe(true)
  })

  it('turns a thrown probe into an unavailable capability', () => {
    mock.probeWaylandHost.mockImplementationOnce(() => {
      throw new Error('host exploded')
    })
    expect(probeAndReportLinuxLayerShellSupport().reasonKey).toBe('settings_linux_layer_shell_probe_failed')
  })

  it('keeps generic requirements when no desktop adapter applies', () => {
    // KWin exposes layer-shell v4 and data-control, but not foreign-toplevel,
    // wlr-screencopy or the virtual keyboard/pointer protocols.
    const kwinFeatures = features({
      foreignToplevel: false,
      screencopy: false,
      virtualKeyboard: false,
      virtualPointer: false,
    })
    const result = probeLinuxLayerShellSupport(kwinFeatures, { keyboardAvailable: true })
    expect(result.available).toBe(false)
    expect(result.reasonKey).toBe('settings_linux_layer_shell_toplevel_unavailable')
  })
})
