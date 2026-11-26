import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => {
  const shortcuts = () => ({
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(() => false),
  })
  return {
    env: { platform: 'linux', env: {}, argv: ['--ozone-platform=wayland'] } as Record<string, unknown>,
    nativeWayland: true,
    overlayServices: null as null | { globalShortcut: ReturnType<typeof shortcuts> },
    preference: 'auto' as string,
    evdevReadable: true,
    electron: shortcuts(),
    portal: shortcuts(),
    evdev: shortcuts(),
    overlay: shortcuts(),
  }
})

vi.mock('../../../common/electron', () => ({ electronShortcuts: mock.electron }))
vi.mock('../../../common/diagnostics', () => ({ reportBreadcrumb: vi.fn() }))
vi.mock('../../../select', () => ({ currentEnv: () => mock.env }))
vi.mock('../display', () => ({ isNativeWayland: () => mock.nativeWayland }))
vi.mock('../native-overlay', () => ({ nativeOverlayServices: () => mock.overlayServices }))
vi.mock('./backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./backend')>()
  return { ...actual, getLinuxShortcutBackend: () => mock.preference }
})
vi.mock('./evdev', () => ({
  createEvdevShortcuts: () => mock.evdev,
  evdevKeyboardsReadable: () => mock.evdevReadable,
}))
vi.mock('./portal', () => ({
  createPortalShortcuts: () => mock.portal,
  acceleratorToTrigger: (accelerator: string) => accelerator,
}))

import { __resetPlatformShortcutsForTests, enablePortalShortcuts, platformShortcuts } from './index'

beforeEach(() => {
  vi.clearAllMocks()
  mock.env = { platform: 'linux', env: {}, argv: ['--ozone-platform=wayland'] }
  mock.nativeWayland = true
  mock.overlayServices = null
  mock.preference = 'auto'
  mock.evdevReadable = true
  for (const impl of [mock.electron, mock.portal, mock.evdev, mock.overlay]) {
    impl.register.mockReturnValue(true)
  }
  __resetPlatformShortcutsForTests()
})

describe('platformShortcuts backend selection', () => {
  it('keeps an explicit evdev overlay primary exclusive', () => {
    mock.preference = 'evdev'
    mock.overlayServices = { globalShortcut: mock.overlay }
    enablePortalShortcuts()

    expect(platformShortcuts.register('Ctrl+A', () => {})).toBe(true)
    expect(mock.overlay.register).toHaveBeenCalledWith('Ctrl+A', expect.any(Function))
    expect(mock.portal.register).not.toHaveBeenCalled()
    expect(mock.evdev.register).not.toHaveBeenCalled()
    expect(mock.electron.register).not.toHaveBeenCalled()
  })

  it('keeps auto + native overlay on evdev without portal approval', () => {
    mock.preference = 'auto'
    mock.overlayServices = { globalShortcut: mock.overlay }
    enablePortalShortcuts()

    expect(platformShortcuts.register('Ctrl+A', () => {})).toBe(true)
    expect(mock.overlay.register).toHaveBeenCalled()
    expect(mock.portal.register).not.toHaveBeenCalled()
    expect(mock.evdev.register).not.toHaveBeenCalled()
  })

  it('uses the portal for auto when no keyboard is readable', () => {
    mock.preference = 'auto'
    mock.evdevReadable = false
    mock.overlayServices = { globalShortcut: mock.overlay }
    enablePortalShortcuts()

    expect(platformShortcuts.register('Ctrl+A', () => {})).toBe(true)
    expect(mock.portal.register).toHaveBeenCalledWith('Ctrl+A', expect.any(Function))
    expect(mock.overlay.register).not.toHaveBeenCalled()
  })

  it('keeps standalone evdev exclusive when no native overlay provides shortcuts', () => {
    mock.preference = 'evdev'
    enablePortalShortcuts()

    expect(platformShortcuts.register('Ctrl+A', () => {})).toBe(true)
    expect(mock.evdev.register).toHaveBeenCalled()
    expect(mock.portal.register).not.toHaveBeenCalled()
    expect(mock.electron.register).not.toHaveBeenCalled()
  })

  it('registers exactly one backend and never stacks fallbacks', () => {
    mock.preference = 'portal'
    enablePortalShortcuts()

    expect(platformShortcuts.register('Ctrl+A', () => {})).toBe(true)
    expect(mock.portal.register).toHaveBeenCalled()
    expect(mock.evdev.register).not.toHaveBeenCalled()
    expect(mock.electron.register).not.toHaveBeenCalled()
  })
})
