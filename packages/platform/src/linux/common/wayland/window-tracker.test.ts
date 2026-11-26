import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WaylandHost } from 'electron-overlay-window/dist/wayland/host'
import type { WindowGeometryInfo, WindowGeometryProvider } from './geometry-provider'

vi.mock('node-gyp-build', () => ({
  default: () => ({ start: vi.fn(), setTargetTitles: vi.fn(), clearTarget: vi.fn(), stopHook: vi.fn() }),
}))
vi.mock('electron-overlay-window', () => ({
  FocusArbiter: class {
    isActive = false
    setGameFocused(): void {}
    reset(): void {}
    stop(): void {}
  },
  releaseLayerKeyboards: vi.fn(),
}))
vi.mock('electron-overlay-window/dist/wayland/host', () => ({}))
vi.mock('../../../common/diagnostics', () => ({ reportBreadcrumb: vi.fn() }))
vi.mock('../game-display-mode', () => ({
  clearLinuxGameDisplayMode: vi.fn(),
  getLinuxGameDisplayModeStatus: () => ({ mode: null, source: null }),
  reportLinuxGameDisplayMode: vi.fn(),
}))

import { WaylandWindowTracker } from './window-tracker'

const host = {
  toplevels: new Map(),
  outputs: [],
  onToplevel: () => () => {},
  onOutputs: () => () => {},
  onRestart: () => () => {},
} as unknown as WaylandHost

/** A provider whose reads settle only when the test resolves them. */
function pendingProvider() {
  const reads: Array<{ titles: readonly string[]; resolve: (info: WindowGeometryInfo | null) => void }> = []
  const provider: WindowGeometryProvider = {
    id: 'test',
    reportSource: 'sway',
    read: (titles) => new Promise((resolve) => reads.push({ titles, resolve })),
  }
  return { provider, reads }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('WaylandWindowTracker geometry polling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps one compositor query in flight across poll ticks', async () => {
    const { provider, reads } = pendingProvider()
    const tracker = new WaylandWindowTracker(host, ['Path of Exile'], vi.fn(), { geometryProviders: [provider] })

    vi.advanceTimersByTime(2000)
    expect(reads).toHaveLength(1)

    reads[0].resolve(null)
    await settle()
    vi.advanceTimersByTime(500)
    expect(reads).toHaveLength(2)
    tracker.stop()
  })

  it('drops an answer for old titles and queries again for the new ones', async () => {
    const { provider, reads } = pendingProvider()
    const tracker = new WaylandWindowTracker(host, ['Path of Exile'], vi.fn(), { geometryProviders: [provider] })

    tracker.setTitles(['Path of Exile 2'])
    reads[0].resolve({ bounds: { x: 0, y: 0, width: 800, height: 600 }, logical: true })
    await settle()

    expect(reads).toHaveLength(2)
    expect(reads[1].titles).toEqual(['Path of Exile 2'])
    tracker.stop()
  })
})
