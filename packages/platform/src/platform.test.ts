import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  version: vi.fn(() => '{"tag":"v0.56.0"}'),
  elevation: vi.fn(),
  hyprland: { warpTo: vi.fn(), capture: vi.fn(), compositorFocus: true },
  overlayWindow: { warpTo: vi.fn(), capture: vi.fn(), compositorFocus: false },
  controller: { events: { on: vi.fn() }, targetHasFocus: true },
}))
vi.mock('node:child_process', () => ({ execFileSync: mock.version, execSync: mock.elevation }))
vi.mock('electron-overlay-window', () => ({ OverlayController: mock.controller }))
vi.mock('./linux/desktops/hyprland/old/backend', () => ({
  createHyprlandBackend: () => ({
    traits: { compositorFocus: mock.hyprland.compositorFocus },
    cursor: { warpTo: mock.hyprland.warpTo },
    capture: { captureGame: mock.hyprland.capture },
  }),
}))
vi.mock('./overlay-window-backend', () => ({
  createOverlayWindowBackend: () => ({
    traits: { compositorFocus: mock.overlayWindow.compositorFocus },
    cursor: { warpTo: mock.overlayWindow.warpTo },
    capture: { captureGame: mock.overlayWindow.capture },
  }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.elevation.mockReset()
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

it('routes to the overlay-window backend outside a Hyprland session', async () => {
  vi.stubEnv('HYPRLAND_INSTANCE_SIGNATURE', '')
  const { platform } = await import('./platform')
  platform().cursor.warpTo({ x: 1, y: 2 })
  expect(mock.overlayWindow.warpTo).toHaveBeenCalledWith({ x: 1, y: 2 })
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
  ['', 'overlayWindow'],
] as const)('routes capture with its options to the selected backend (signature %j)', async (signature, routed) => {
  vi.stubEnv('HYPRLAND_INSTANCE_SIGNATURE', signature)
  const other = routed === 'hyprland' ? 'overlayWindow' : 'hyprland'
  const { platform } = await import('./platform')
  await platform().capture.captureGame({ skipFocusGate: true })
  expect(mock[routed].capture).toHaveBeenCalledWith({ skipFocusGate: true })
  expect(mock[other].capture).not.toHaveBeenCalled()
})

it.each(['linux', 'darwin'])('never starts the Windows admin check on %s', async (os) => {
  vi.stubGlobal('process', { ...process, platform: os })
  const { platform } = await import('./platform')
  expect(platform().isElevated()).toBe(false)
  expect(mock.elevation).not.toHaveBeenCalled()
})

it('routes elevation to the Windows implementation only on Windows', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32' })
  mock.elevation.mockReturnValue(Buffer.from(''))
  const { platform } = await import('./platform')
  expect(platform().isElevated()).toBe(true)
  expect(mock.elevation).toHaveBeenCalledWith('net session', { stdio: 'ignore' })
})
