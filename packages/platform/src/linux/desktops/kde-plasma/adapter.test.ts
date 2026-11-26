import { describe, expect, it, vi } from 'vitest'
import type { HostFeatures } from 'electron-overlay-window'

vi.mock('electron-overlay-window', () => ({
  FocusArbiter: class {},
  releaseLayerKeyboards: () => {},
  layerShellUsable: (features: HostFeatures | null) =>
    !!features && features.layerShell && features.layerShellVersion >= 4,
  probeWaylandHost: () => null,
}))
vi.mock('electron-overlay-window/dist/wayland/host', () => ({
  hostExecutablePath: () => '/opt/scalpel/overlay-wayland-host',
}))

import { probeLinuxLayerShellSupport } from '@platform/linux/common/layer-shell/support'
import { kwinDesktopAdapter } from './adapter'

const features = (overrides: Partial<HostFeatures> = {}): HostFeatures => ({
  layerShell: true,
  layerShellVersion: 4,
  foreignToplevel: false,
  dataControl: true,
  cursorShape: true,
  viewporter: true,
  virtualKeyboard: false,
  uinput: false,
  virtualPointer: false,
  screencopy: false,
  ...overrides,
})

describe('KWin desktop adapter', () => {
  it('declares the KWin backend and owns the focus cache', () => {
    expect(kwinDesktopAdapter.desktop).toBe('kde-plasma')
    expect(kwinDesktopAdapter.layerShell?.backendId).toBe('kwin-layer-shell')
    expect(kwinDesktopAdapter.layerShell?.claimsFocusCache).toBe(true)
    expect(kwinDesktopAdapter.layerShell?.tracksLayerSurfaceFocus).toBe(false)
    expect(kwinDesktopAdapter.startFocusTracking).toBeTypeOf('function')
  })

  it('requires data-control and a reachable ydotoold, not foreign-toplevel', () => {
    const layerShell = kwinDesktopAdapter.layerShell
    expect(layerShell?.requirements?.(features(), { keyboardAvailable: true })).toBeNull()
    expect(layerShell?.requirements?.(features({ dataControl: false }), { keyboardAvailable: true })?.reasonKey).toBe(
      'settings_linux_layer_shell_clipboard_unavailable',
    )
    expect(layerShell?.requirements?.(features(), { keyboardAvailable: false })?.reasonKey).toBe(
      'settings_linux_layer_shell_input_unavailable',
    )
  })

  it('overrides capture and pointer capabilities without changing select popups', () => {
    const base = {
      screencopy: true,
      cursorRefresh: true,
      selectPopups: true,
      ydotoolInput: false,
      desktopCapturerSourcePickerUnsafe: false,
    }
    expect(kwinDesktopAdapter.layerShell?.features?.(base)).toEqual({
      screencopy: false,
      cursorRefresh: false,
      selectPopups: true,
      ydotoolInput: true,
      desktopCapturerSourcePickerUnsafe: true,
    })
  })

  it('drops synthetic presses while the game is not the keyboard focus owner', () => {
    const base = {
      listen: () => null,
      inputDevices: () => 0,
      key: () => true,
      warpPointer: () => true,
      probePointer: async () => null,
      canCapture: () => false,
      capture: async () => null,
    }
    const input = kwinDesktopAdapter.layerShell?.input?.(base)
    expect(input?.key(30, true)).toBe(false)
    expect(input?.warpPointer({ x: 1, y: 2 })).toBe(false)
    expect(kwinDesktopAdapter.layerShell?.gameHasKeyboardFocus?.()).toBe(false)
  })
})

describe('KWin layer-shell probe', () => {
  it('accepts KWin without foreign-toplevel, screencopy or virtual input', () => {
    const result = probeLinuxLayerShellSupport(features(), {
      adapter: kwinDesktopAdapter,
      keyboardAvailable: true,
    })
    expect(result.available).toBe(true)
    expect(result.backendId).toBe('kwin-layer-shell')
    expect(result.reasonKey).toBeUndefined()
  })

  it('fails the probe without data-control or a reachable ydotoold', () => {
    expect(
      probeLinuxLayerShellSupport(features({ dataControl: false }), {
        adapter: kwinDesktopAdapter,
        keyboardAvailable: true,
      }).reasonKey,
    ).toBe('settings_linux_layer_shell_clipboard_unavailable')
    expect(
      probeLinuxLayerShellSupport(features(), {
        adapter: kwinDesktopAdapter,
        keyboardAvailable: false,
      }).reasonKey,
    ).toBe('settings_linux_layer_shell_input_unavailable')
  })
})
