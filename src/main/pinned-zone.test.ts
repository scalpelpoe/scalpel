import { beforeEach, describe, expect, it, vi } from 'vitest'

type FakeSpec = {
  id: string
  htmlEntry: string
  gateShow?: () => boolean
  onFirstShow?: (win: unknown) => void
}

const registeredSpecs: FakeSpec[] = []
const fakeOverlay = {
  show: vi.fn(),
  hide: vi.fn(),
  toggle: vi.fn(),
  isVisible: vi.fn(() => false),
  send: vi.fn(),
  getWindow: vi.fn(() => null),
  setBoundsProgrammatic: vi.fn(),
  setBoundsProgrammaticOnce: vi.fn(),
  setSizeProgrammatic: vi.fn(),
  hideKeepingRestore: vi.fn(),
  setPersistOverOthers: vi.fn(),
  getPersistOverOthers: vi.fn(() => false),
}

vi.mock('./windowing', () => ({
  registerSecondaryOverlay: (spec: FakeSpec) => {
    registeredSpecs.push(spec)
    return fakeOverlay
  },
}))
vi.mock('./client-log', () => ({
  forwardZoneChangesTo: vi.fn(),
  sendCurrentZoneTo: vi.fn(),
}))

describe('pinned-zone gateShow', () => {
  beforeEach(() => {
    vi.resetModules()
    registeredSpecs.length = 0
    vi.clearAllMocks()
  })

  it('gateShow reflects the last renderer visibility report', async () => {
    const { registerPinnedZoneOverlay, setPinnedZoneRendererVisible } = await import('./pinned-zone')
    registerPinnedZoneOverlay({ storedAnchor: () => undefined, onAnchorChanged: () => {} })
    const spec = registeredSpecs[0]

    expect(spec.gateShow?.()).toBe(false)

    setPinnedZoneRendererVisible(true)
    expect(spec.gateShow?.()).toBe(true)

    setPinnedZoneRendererVisible(false)
    expect(spec.gateShow?.()).toBe(false)
  })

  it('does not call overlay.show() when pinning is disabled, but gateShow still flips true', async () => {
    const { registerPinnedZoneOverlay, setPinnedZoneRendererVisible } = await import('./pinned-zone')
    registerPinnedZoneOverlay({ storedAnchor: () => undefined, onAnchorChanged: () => {} })
    const spec = registeredSpecs[0]

    setPinnedZoneRendererVisible(true)

    expect(fakeOverlay.show).not.toHaveBeenCalled()
    expect(spec.gateShow?.()).toBe(true)
  })

  it('setPinnedZoneRendererVisible(false) calls hideKeepingRestore, not hide', async () => {
    const { registerPinnedZoneOverlay, applyPinnedZoneEnabled, setPinnedZoneRendererVisible } = await import(
      './pinned-zone'
    )
    registerPinnedZoneOverlay({ storedAnchor: () => undefined, onAnchorChanged: () => {} })
    applyPinnedZoneEnabled(true)
    vi.clearAllMocks()

    setPinnedZoneRendererVisible(false)

    expect(fakeOverlay.hideKeepingRestore).toHaveBeenCalled()
    expect(fakeOverlay.hide).not.toHaveBeenCalled()
  })

  it('applyPinnedZoneEnabled(false) calls overlay.hide()', async () => {
    const { registerPinnedZoneOverlay, applyPinnedZoneEnabled } = await import('./pinned-zone')
    registerPinnedZoneOverlay({ storedAnchor: () => undefined, onAnchorChanged: () => {} })
    vi.clearAllMocks()

    applyPinnedZoneEnabled(false)

    expect(fakeOverlay.hide).toHaveBeenCalled()
  })

  it('registers as a persistent overlay so Esc never dismisses it', async () => {
    const { registerPinnedZoneOverlay } = await import('./pinned-zone')
    registerPinnedZoneOverlay({ storedAnchor: () => undefined, onAnchorChanged: () => {} })

    expect(fakeOverlay.setPersistOverOthers).toHaveBeenCalledWith(true)
  })
})
