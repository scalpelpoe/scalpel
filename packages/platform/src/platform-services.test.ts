import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  version: vi.fn(() => '{"tag":"v0.56.0"}'),
  controller: { events: { on: vi.fn() } },
  electronReadText: vi.fn(() => 'electron clipboard'),
  backendReadText: vi.fn(() => 'backend clipboard'),
  services: vi.fn(() => null as { clipboard: { readText: () => string } } | null),
}))

vi.mock('node:child_process', () => ({ execFileSync: mock.version }))
vi.mock('electron-overlay-window', () => ({ OverlayController: mock.controller }))
vi.mock('./common/electron', () => ({
  electronClipboard: { readText: mock.electronReadText },
  electronShortcuts: {},
}))
vi.mock('./common/input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./common/input')>()),
  uiohookInput: {},
}))
vi.mock('./linux/desktops/hyprland/old/backend', () => ({
  createHyprlandBackend: () => ({
    traits: {},
    cursor: {},
    capture: {},
    services: mock.services() ?? undefined,
  }),
}))
vi.mock('./overlay-window-backend', () => ({
  createOverlayWindowBackend: () => ({
    traits: {},
    cursor: {},
    capture: {},
    services: mock.services() ?? undefined,
  }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('HYPRLAND_INSTANCE_SIGNATURE', 'test')
  mock.services.mockReturnValue(null)
})
afterEach(() => vi.unstubAllEnvs())

it('uses shared services and selects a backend only when a service is called', async () => {
  const { platform } = await import('./platform')
  const { clipboard, input, shortcuts } = platform()
  expect(input).toBeDefined()
  expect(shortcuts).toBeDefined()
  expect(mock.version).not.toHaveBeenCalled()
  expect(clipboard.readText()).toBe('electron clipboard')
  expect(mock.version).toHaveBeenCalledOnce()
})

it('uses a service supplied by the selected backend', async () => {
  mock.services.mockReturnValue({ clipboard: { readText: mock.backendReadText } })
  const { platform } = await import('./platform')
  expect(platform().clipboard.readText()).toBe('backend clipboard')
  expect(mock.backendReadText).toHaveBeenCalledOnce()
  expect(mock.electronReadText).not.toHaveBeenCalled()
})
