import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  version: vi.fn(() => '{"tag":"v0.56.0"}'),
  hyprland: { warpTo: vi.fn(), capture: vi.fn(), compositorFocus: true },
  native: { warpTo: vi.fn(), capture: vi.fn(), compositorFocus: false },
  controller: { events: { on: vi.fn() }, targetHasFocus: true },
}))
vi.mock('node:child_process', () => ({ execFileSync: mock.version }))
vi.mock('electron-overlay-window', () => ({ OverlayController: mock.controller }))
vi.mock('./hyprland/backend', () => ({
  createHyprlandBackend: () => ({
    traits: { compositorFocus: mock.hyprland.compositorFocus },
    cursor: { warpTo: mock.hyprland.warpTo },
    capture: { captureGame: mock.hyprland.capture },
  }),
}))
vi.mock('./native/backend', () => ({
  createNativeBackend: () => ({
    traits: { compositorFocus: mock.native.compositorFocus },
    cursor: { warpTo: mock.native.warpTo },
    capture: { captureGame: mock.native.capture },
  }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
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
