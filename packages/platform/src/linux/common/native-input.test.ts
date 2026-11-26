import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  tool: null as 'ydotool' | 'wtype' | null,
  overlay: null as object | null,
}))

vi.mock('electron-overlay-window', () => ({ waylandNative: {} }))
vi.mock('electron-overlay-window/dist/wayland/host', () => ({ WaylandHost: { get: () => null } }))
vi.mock('uiohook-napi', () => ({ uIOhook: {}, UiohookKey: {}, EventType: {}, WheelDirection: {} }))
vi.mock('../../common/diagnostics', () => ({ reportBreadcrumb: vi.fn(), reportDiagnostic: vi.fn() }))
vi.mock('./key-injection', () => ({ preferredTool: () => mock.tool }))
vi.mock('./native-overlay', () => ({ nativeOverlayServices: () => mock.overlay }))

import { setLinuxInputBackend } from './input-backend'
import { createLinuxInput } from './native-input'

const nativeWayland = { platform: 'linux', env: {}, argv: ['scalpel', '--ozone-platform=wayland'] } as const

describe('createLinuxInput holdsKeys', () => {
  beforeEach(() => {
    mock.tool = null
    mock.overlay = null
    setLinuxInputBackend('auto')
  })

  it('cannot hold keys when wtype injects on native Wayland', () => {
    mock.tool = 'wtype'
    expect(createLinuxInput(nativeWayland).holdsKeys).toBe(false)
  })

  it('cannot hold keys when wtype is the explicit tool under a native overlay', () => {
    mock.overlay = {}
    mock.tool = 'wtype'
    setLinuxInputBackend('wtype')
    expect(createLinuxInput(nativeWayland).holdsKeys).toBe(false)
  })

  it('holds keys through ydotool, the host keyboard, or uiohook on X11', () => {
    mock.tool = 'ydotool'
    expect(createLinuxInput(nativeWayland).holdsKeys).toBe(true)

    mock.overlay = {}
    expect(createLinuxInput(nativeWayland).holdsKeys).toBe(true)

    expect(createLinuxInput({ platform: 'linux', env: {}, argv: ['scalpel'] }).holdsKeys).toBe(true)
  })
})
