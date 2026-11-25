import { describe, expect, it, vi } from 'vitest'
import type { PlatformEnv } from './types'

const mock = vi.hoisted(() => {
  const adapter = (desktop?: string) => ({
    desktop,
    geometryProviders: () => [],
    layerShell: { backendId: 'layer-shell', claimsFocusCache: false },
  })
  return {
    disableHardwareAcceleration: vi.fn(),
    setDesktopName: vi.fn(),
    enablePortalShortcuts: vi.fn(),
    startWaylandFocusTracking: vi.fn(),
    initLinuxLayerShellBackend: vi.fn(() => true),
    probeAndReportLinuxLayerShellSupport: vi.fn(() => ({ available: true, features: null })),
    setLinuxLayerShellCapability: vi.fn(),
    setLinuxGameDisplayModeOverride: vi.fn(),
    linuxDesktopAdapter: vi.fn((desktop?: string) => adapter(desktop)),
    linuxDesktopAdapterForSession: vi.fn(() => adapter()),
  }
})

vi.mock('electron', () => ({
  app: {
    disableHardwareAcceleration: mock.disableHardwareAcceleration,
    setDesktopName: mock.setDesktopName,
  },
}))
vi.mock('./linux/desktops', () => ({
  linuxDesktopAdapter: mock.linuxDesktopAdapter,
  linuxDesktopAdapterForSession: mock.linuxDesktopAdapterForSession,
}))
vi.mock('./linux/common/global-shortcuts', () => ({ enablePortalShortcuts: mock.enablePortalShortcuts }))
vi.mock('./linux/common/wayland/focus', () => ({ startWaylandFocusTracking: mock.startWaylandFocusTracking }))
vi.mock('./linux/common/layer-shell/backend', () => ({
  initLinuxLayerShellBackend: mock.initLinuxLayerShellBackend,
}))
vi.mock('./linux/common/layer-shell/support', () => ({
  probeAndReportLinuxLayerShellSupport: mock.probeAndReportLinuxLayerShellSupport,
}))
vi.mock('./linux/common/layer-shell/windowing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./linux/common/layer-shell/windowing')>()),
  setLinuxLayerShellCapability: mock.setLinuxLayerShellCapability,
}))
vi.mock('./linux/common/game-display-mode', () => ({
  setLinuxGameDisplayModeOverride: mock.setLinuxGameDisplayModeOverride,
}))

import { applyPlatformDefaults, preparePlatformLaunch, restartPlatformArgs, startNativeWaylandSupport } from './boot'
import { MANAGED_OZONE_ENV } from './linux/common/display'

const linuxEnv = (
  argv: string[] = ['scalpel'],
  env: Record<string, string | undefined> = { WAYLAND_DISPLAY: 'wayland-1' },
): PlatformEnv => ({
  platform: 'linux',
  env,
  argv,
})

describe('platform boot helpers', () => {
  it('marks an app-managed Ozone relaunch and strips stale flags', () => {
    const env = linuxEnv(['scalpel', '--ozone-platform=x11'], {
      WAYLAND_DISPLAY: 'wayland-1',
      [MANAGED_OZONE_ENV]: '1',
    })
    expect(preparePlatformLaunch(env, 'wayland')).toEqual(['--ozone-platform=wayland'])
    expect(env.env[MANAGED_OZONE_ENV]).toBe('1')
  })

  it('does not relaunch for a real user flag', () => {
    const env = linuxEnv(['scalpel', '--ozone-platform=wayland'])
    expect(preparePlatformLaunch(env, 'x11')).toBeNull()
    expect(env.env[MANAGED_OZONE_ENV]).toBeUndefined()
  })

  it('builds restart args from the saved mode and preserves a real flag', () => {
    const managed = linuxEnv(['scalpel', '--ozone-platform=x11'], {
      WAYLAND_DISPLAY: 'wayland-1',
      [MANAGED_OZONE_ENV]: '1',
    })
    expect(restartPlatformArgs(managed, 'wayland')).toEqual(['--ozone-platform=wayland'])
    expect(managed.env[MANAGED_OZONE_ENV]).toBe('1')

    const explicit = linuxEnv(['scalpel', '--ozone-platform=x11'])
    expect(restartPlatformArgs(explicit, 'wayland')).toEqual(['--ozone-platform=x11'])
    expect(explicit.env[MANAGED_OZONE_ENV]).toBeUndefined()
  })

  it('applies Electron defaults only on Linux', () => {
    mock.disableHardwareAcceleration.mockClear()
    mock.setDesktopName.mockClear()
    applyPlatformDefaults(linuxEnv())
    expect(mock.setDesktopName).toHaveBeenCalledWith('com.filterscalpel.app')
    expect(mock.disableHardwareAcceleration).toHaveBeenCalledOnce()

    applyPlatformDefaults({ ...linuxEnv(), platform: 'win32' })
    expect(mock.disableHardwareAcceleration).toHaveBeenCalledOnce()
    expect(mock.setDesktopName).toHaveBeenCalledOnce()
  })

  it('keeps hardware acceleration on native Wayland', () => {
    mock.disableHardwareAcceleration.mockClear()
    applyPlatformDefaults(linuxEnv(['scalpel', '--ozone-platform=wayland']))
    expect(mock.setDesktopName).toHaveBeenCalledWith('com.filterscalpel.app')
    expect(mock.disableHardwareAcceleration).not.toHaveBeenCalled()
  })

  it('starts native-Wayland services only on native Wayland Linux', () => {
    mock.enablePortalShortcuts.mockClear()
    mock.startWaylandFocusTracking.mockClear()
    mock.probeAndReportLinuxLayerShellSupport.mockClear()
    mock.initLinuxLayerShellBackend.mockClear()
    mock.setLinuxLayerShellCapability.mockClear()
    mock.initLinuxLayerShellBackend.mockReturnValue(true)

    startNativeWaylandSupport(linuxEnv())
    expect(mock.enablePortalShortcuts).not.toHaveBeenCalled()
    expect(mock.probeAndReportLinuxLayerShellSupport).not.toHaveBeenCalled()

    const native = linuxEnv(['scalpel', '--ozone-platform=wayland'])
    startNativeWaylandSupport(native)
    expect(mock.enablePortalShortcuts).toHaveBeenCalledWith(native)
    expect(mock.startWaylandFocusTracking).toHaveBeenCalledOnce()
    expect(mock.probeAndReportLinuxLayerShellSupport).toHaveBeenCalledOnce()
    expect(mock.initLinuxLayerShellBackend).toHaveBeenCalledOnce()

    startNativeWaylandSupport({ ...linuxEnv(['scalpel', '--ozone-platform=wayland']), platform: 'win32' })
    expect(mock.startWaylandFocusTracking).toHaveBeenCalledOnce()
    vi.mocked(mock.probeAndReportLinuxLayerShellSupport).mockReturnValue({ available: true, features: null })
    vi.mocked(mock.initLinuxLayerShellBackend).mockReturnValue(true)
  })

  it('honours an explicit X11 windowing preference on native Wayland', () => {
    mock.probeAndReportLinuxLayerShellSupport.mockClear()
    mock.initLinuxLayerShellBackend.mockClear()
    startNativeWaylandSupport(linuxEnv(['scalpel', '--ozone-platform=wayland']), { windowingMode: 'x11' })
    expect(mock.probeAndReportLinuxLayerShellSupport).toHaveBeenCalledOnce()
    expect(mock.initLinuxLayerShellBackend).not.toHaveBeenCalled()
  })

  it('marks layer-shell unavailable when initialization fails', () => {
    mock.probeAndReportLinuxLayerShellSupport.mockClear()
    mock.initLinuxLayerShellBackend.mockClear()
    mock.setLinuxLayerShellCapability.mockClear()
    mock.initLinuxLayerShellBackend.mockReturnValue(false)
    startNativeWaylandSupport(linuxEnv(['scalpel', '--ozone-platform=wayland']), { windowingMode: 'layer-shell' })
    expect(mock.setLinuxLayerShellCapability).toHaveBeenCalledWith({
      available: false,
      reasonKey: 'settings_linux_layer_shell_init_failed',
    })
  })

  it('uses the selected desktop profile for compositor geometry', () => {
    mock.initLinuxLayerShellBackend.mockClear()
    mock.initLinuxLayerShellBackend.mockReturnValue(true)
    const native = linuxEnv(['scalpel', '--ozone-platform=wayland'])
    startNativeWaylandSupport(native, { desktopEnvironment: 'sway' })
    expect(mock.initLinuxLayerShellBackend).toHaveBeenCalledWith(
      expect.objectContaining({ adapter: expect.objectContaining({ desktop: 'sway' }) }),
    )
  })

  it('falls back to the detected desktop when the selector is auto', () => {
    mock.initLinuxLayerShellBackend.mockClear()
    mock.initLinuxLayerShellBackend.mockReturnValue(true)
    const native = linuxEnv(['scalpel', '--ozone-platform=wayland'], {
      WAYLAND_DISPLAY: 'wayland-1',
      SWAYSOCK: '/run/user/1000/sway-ipc.sock',
    })
    startNativeWaylandSupport(native)
    expect(mock.initLinuxLayerShellBackend).toHaveBeenCalledWith(
      expect.objectContaining({ adapter: expect.objectContaining({ desktop: 'sway' }) }),
    )
  })

  it('seeds the PoE display mode override on every Linux session', () => {
    mock.setLinuxGameDisplayModeOverride.mockClear()
    startNativeWaylandSupport(linuxEnv(), { gameDisplayMode: 'wayland' })
    expect(mock.setLinuxGameDisplayModeOverride).toHaveBeenLastCalledWith('wayland')

    startNativeWaylandSupport(linuxEnv(['scalpel', '--ozone-platform=wayland']), { gameDisplayMode: 'x11' })
    expect(mock.setLinuxGameDisplayModeOverride).toHaveBeenLastCalledWith('x11')
  })
})
