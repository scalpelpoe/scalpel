import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  host: null as unknown,
  lastArgs: null as unknown[] | null,
}))

vi.mock('electron-overlay-window/dist/wayland/host', () => ({
  WaylandHost: { get: () => state.host },
}))
vi.mock('../wayland/window-tracker', () => ({
  WaylandWindowTracker: class {
    constructor(...args: unknown[]) {
      state.lastArgs = args
    }
  },
}))

import { createDefaultLayerShellTracker } from './default-tracker'

const context = {
  titles: ['Path of Exile'],
  emit: () => {},
  geometryProviders: [],
}

describe('createDefaultLayerShellTracker', () => {
  it('reads the native host when the tracker is created, not at init time', () => {
    // The host is started by OverlayController.useLayerShell, after backend
    // init. A cached host is null there and the overlay never opens.
    state.host = null
    expect(() => createDefaultLayerShellTracker(context)).toThrow('Wayland host unavailable')

    const host = { outputs: [] }
    state.host = host
    createDefaultLayerShellTracker(context)
    expect(state.lastArgs?.[0]).toBe(host)
    expect(state.lastArgs?.[1]).toEqual(context.titles)
    expect(state.lastArgs?.[3]).toEqual({ geometryProviders: context.geometryProviders })
  })
})
