import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  version: vi.fn(() => '{"tag":"v0.56.0"}'),
  hyprland: { warpTo: vi.fn(), compositorFocus: true },
  native: { warpTo: vi.fn(), compositorFocus: false },
}))
vi.mock('node:child_process', () => ({ execFileSync: mock.version }))
vi.mock('./hyprland/backend', () => ({
  createHyprlandBackend: () => ({
    traits: { compositorFocus: mock.hyprland.compositorFocus },
    cursor: { warpTo: mock.hyprland.warpTo },
  }),
}))
vi.mock('./native/backend', () => ({
  createNativeBackend: () => ({
    traits: { compositorFocus: mock.native.compositorFocus },
    cursor: { warpTo: mock.native.warpTo },
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
