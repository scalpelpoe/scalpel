import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  version: vi.fn(() => '{"tag":"v0.56.0"}'),
  hyprland: { warpTo: vi.fn(), capture: vi.fn(), compositorFocus: true },
  native: { warpTo: vi.fn(), capture: vi.fn(), compositorFocus: false },
  controller: { events: { on: vi.fn() }, targetHasFocus: true },
  layerShell: { available: true, keydown: [] as Array<(event: unknown) => void>, start: vi.fn(), readText: vi.fn() },
  uiohook: { on: vi.fn(), start: vi.fn() },
}))
vi.mock('node:child_process', () => ({ execFileSync: mock.version }))
vi.mock('electron-overlay-window', () => ({ OverlayController: mock.controller }))
vi.mock('./hyprland/backend', () => ({
  createHyprlandBackend: () => ({
    traits: { compositorFocus: mock.hyprland.compositorFocus, inputRegions: false },
    cursor: { warpTo: mock.hyprland.warpTo },
    capture: { captureGame: mock.hyprland.capture },
  }),
}))
vi.mock('./input', () => ({ uiohookInput: mock.uiohook }))
vi.mock('./electron', () => ({ electronClipboard: {}, electronShortcuts: {} }))
vi.mock('./layer-shell/backend', () => ({
  createLayerShellBackend: () =>
    mock.layerShell.available
      ? {
          traits: { compositorFocus: false, inputRegions: true },
          input: {
            on: (event: string, listener: (event: unknown) => void) => {
              if (event === 'keydown') mock.layerShell.keydown.push(listener)
            },
            start: mock.layerShell.start,
          },
          clipboard: { readText: mock.layerShell.readText },
        }
      : null,
}))
vi.mock('./native/backend', () => ({
  createNativeBackend: () => ({
    traits: { compositorFocus: mock.native.compositorFocus, inputRegions: false },
    cursor: { warpTo: mock.native.warpTo },
    capture: { captureGame: mock.native.capture },
  }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.layerShell.available = true
  mock.layerShell.keydown = []
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  vi.stubEnv('HYPRLAND_INSTANCE_SIGNATURE', 'test')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('defers the compositor query until a backend member is first used', async () => {
  const { platform } = await import('./platform')
  const { cursor, traits } = platform()
  expect(mock.version).not.toHaveBeenCalled()
  cursor.warpTo({ x: 1, y: 2 })
  expect(mock.hyprland.warpTo).toHaveBeenCalledWith({ x: 1, y: 2 })
  expect(traits.compositorFocus).toBe(true)
  expect(platform().id).toBe('hyprland')
  expect(mock.version).toHaveBeenCalledOnce()
})

it('routes to the native backend outside a Hyprland session', async () => {
  vi.stubEnv('HYPRLAND_INSTANCE_SIGNATURE', '')
  const { platform } = await import('./platform')
  platform().cursor.warpTo({ x: 1, y: 2 })
  expect(mock.native.warpTo).toHaveBeenCalledWith({ x: 1, y: 2 })
  expect(platform().traits.compositorFocus).toBe(false)
  expect(platform().id).toBe('x11')
  expect(mock.version).not.toHaveBeenCalled()
})

it('subscribes to game window events and reads target focus without a compositor query', async () => {
  const { platform } = await import('./platform')
  const listener = () => {}
  platform().windowTracker.events.on('focus', listener)
  expect(mock.controller.events.on).toHaveBeenCalledWith('focus', listener)
  expect(platform().windowTracker.targetHasFocus).toBe(true)
  expect(mock.version).not.toHaveBeenCalled()
})

it.each([
  ['test', 'hyprland'],
  ['', 'native'],
] as const)('routes capture with its options to the selected backend (signature %j)', async (signature, routed) => {
  vi.stubEnv('HYPRLAND_INSTANCE_SIGNATURE', signature)
  const other = routed === 'hyprland' ? 'native' : 'hyprland'
  const { platform } = await import('./platform')
  await platform().capture.captureGame({ skipFocusGate: true })
  expect(mock[routed].capture).toHaveBeenCalledWith({ skipFocusGate: true })
  expect(mock[other].capture).not.toHaveBeenCalled()
})

describe('as a native Wayland client', () => {
  beforeEach(() => {
    vi.stubGlobal('process', { ...process, platform: 'linux', argv: ['scalpel', '--ozone-platform=wayland'] })
  })

  it('takes input and the clipboard from the layer-shell backend', async () => {
    const { platform } = await import('./platform')
    const keydown = vi.fn()
    platform().input.on('keydown', keydown)
    platform().input.start()
    for (const listener of mock.layerShell.keydown) listener({ keycode: 1 })
    platform().clipboard.readText()

    expect(platform().id).toBe('layer-shell')
    expect(platform().traits.inputRegions).toBe(true)
    expect(mock.layerShell.start).toHaveBeenCalledOnce()
    expect(keydown).toHaveBeenCalledWith({ keycode: 1 })
    expect(mock.layerShell.readText).toHaveBeenCalledOnce()
    expect(mock.uiohook.start).not.toHaveBeenCalled()
    expect(mock.version).not.toHaveBeenCalled()
  })

  it('does not select a backend when input listeners subscribe', async () => {
    const { platform } = await import('./platform')
    platform().input.on('keydown', () => {})
    expect(mock.layerShell.keydown).toHaveLength(0)
    expect(mock.uiohook.on).not.toHaveBeenCalled()
  })

  it('falls back to the X11 backend when the layer-shell host is unavailable', async () => {
    mock.layerShell.available = false
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { platform } = await import('./platform')
    expect(platform().id).toBe('x11')
    expect(platform().traits.compositorFocus).toBe(false)
  })
})
