import type { HostFeatures } from 'electron-overlay-window'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initLayerShell, waylandLayerShellSupported } from './layer-shell'
import { layerShellServices } from './layer-shell-state'

const host = vi.hoisted(() => ({
  features: null as HostFeatures | null,
  kwin: false,
  keyboard: false,
  ozone: 'wayland',
  useLayerShell: vi.fn((_createTracker?: unknown) => true),
}))

vi.mock('./kwin-input', () => ({
  kwinWaylandSession: () => host.kwin,
  kwinKeyboardAvailable: () => host.keyboard,
  sendKWinKey: vi.fn(),
}))
vi.mock('./kwin-tracker', () => ({ KWinTracker: vi.fn() }))
vi.mock('./native-shortcuts', () => ({ NativeShortcuts: vi.fn() }))

vi.mock('electron', () => ({
  app: { commandLine: { getSwitchValue: () => host.ozone }, once: vi.fn() },
}))
vi.mock('electron-overlay-window', () => ({
  layerShellUsable: (features: HostFeatures | null) => features?.layerShell === true && features.layerShellVersion >= 4,
  probeWaylandHost: () => host.features,
  OverlayController: { useLayerShell: host.useLayerShell },
  setLayerShortcutHandler: vi.fn(),
  getLayerPointer: () => null,
  waylandClipboard: {},
  waylandNative: { key: () => true },
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
const WLROOTS: HostFeatures = { ...PLASMA, foreignToplevel: true, virtualKeyboard: true, virtualPointer: true }

beforeEach(() => {
  host.features = PLASMA
  host.kwin = true
  host.keyboard = true
  host.ozone = 'wayland'
  host.useLayerShell.mockClear()
})

describe('waylandLayerShellSupported', () => {
  it('uses ydotool on KDE even without a Wayland virtual keyboard', () => {
    expect(waylandLayerShellSupported()).toBe(true)
    host.keyboard = false
    expect(waylandLayerShellSupported()).toBe(false)
  })

  it('needs a virtual keyboard on other compositors', () => {
    host.kwin = false
    host.features = WLROOTS
    expect(waylandLayerShellSupported()).toBe(true)
    host.features = PLASMA
    expect(waylandLayerShellSupported()).toBe(false)
  })

  it('requires layer-shell v4, and data-control on KDE', () => {
    host.features = { ...PLASMA, layerShellVersion: 3 }
    expect(waylandLayerShellSupported()).toBe(false)
    host.features = { ...PLASMA, dataControl: false }
    expect(waylandLayerShellSupported()).toBe(false)
    host.features = null
    expect(waylandLayerShellSupported()).toBe(false)
  })
})

describe('initLayerShell', () => {
  it('tracks the game with KWin on KDE', () => {
    expect(initLayerShell()).toBe(true)
    expect(host.useLayerShell.mock.calls[0][0]).toBeTypeOf('function')
    expect(layerShellServices()?.gameHasKeyboardFocus).toBeTypeOf('function')
  })

  it('keeps the library tracker and virtual keyboard on other compositors', () => {
    host.kwin = false
    host.features = WLROOTS
    expect(initLayerShell()).toBe(true)
    expect(host.useLayerShell.mock.calls[0][0]).toBeUndefined()
    expect(layerShellServices()?.gameHasKeyboardFocus).toBeUndefined()
  })

  it('does not start without the Wayland platform, or on KDE without ydotoold', () => {
    host.ozone = 'x11'
    expect(initLayerShell()).toBe(false)
    host.ozone = 'wayland'
    host.keyboard = false
    expect(initLayerShell()).toBe(false)
    expect(host.useLayerShell).not.toHaveBeenCalled()
  })
})
