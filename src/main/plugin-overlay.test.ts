import type { OverlayAnchor } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const registered: Array<{ id: string; htmlEntry: string }> = []
type CapturedSpec = {
  id: string
  htmlEntry: string
  defaultAnchor: () => unknown
  storedAnchor?: () => unknown
  onAnchorChanged?: (anchor: unknown) => void
  onVisibilityChange?: (visible: boolean) => void
  onFirstShow?: (win: unknown) => void
  defaultUserPinned?: boolean
  onDidFinishLoad?: (win: unknown) => void
}
const registeredSpecs: CapturedSpec[] = []
const fakeOverlay = {
  show: vi.fn(),
  hide: vi.fn(),
  toggle: vi.fn(),
  isVisible: vi.fn(() => false),
  send: vi.fn(),
  getWindow: vi.fn(() => null),
  destroy: vi.fn(),
  setBoundsProgrammatic: vi.fn(),
  setBoundsProgrammaticOnce: vi.fn(),
  setSizeProgrammatic: vi.fn(),
  hideKeepingRestore: vi.fn(),
  setPersistOverOthers: vi.fn(),
}

vi.mock('./windowing', () => ({
  registerSecondaryOverlay: (spec: CapturedSpec) => {
    registered.push({ id: spec.id, htmlEntry: spec.htmlEntry })
    registeredSpecs.push(spec)
    return fakeOverlay
  },
}))
vi.mock('./client-log', () => ({
  forwardLogLinesTo: vi.fn(),
  onZoneChanged: vi.fn(),
  sendCurrentZoneTo: vi.fn(),
}))

import {
  _resetForTests,
  getPluginOverlay,
  registerPluginAnnotationOverlay,
  registerPluginOverlay,
  disposePluginOverlay,
  reloadPluginOverlay,
  togglePluginOverlay,
} from './plugin-overlay'

describe('plugin-overlay registry', () => {
  beforeEach(() => {
    _resetForTests()
    registered.length = 0
    registeredSpecs.length = 0
    vi.clearAllMocks()
  })

  it('registers a secondary overlay keyed by plugin id with the shared html entry', () => {
    registerPluginOverlay('demo', { title: 'Demo' })
    expect(registered).toEqual([{ id: 'plugin-overlay:demo', htmlEntry: 'plugin-overlay.html' }])
  })

  it('windowed overlays default the user pin on so game-Esc does not dismiss them', () => {
    registerPluginOverlay('demo-pin', { title: 'Demo' })
    expect(registeredSpecs[0]?.defaultUserPinned).toBe(true)
  })

  it('is idempotent per plugin id', () => {
    registerPluginOverlay('demo2', { title: 'Demo2' })
    registerPluginOverlay('demo2', { title: 'Demo2' })
    expect(registered.filter((r) => r.id === 'plugin-overlay:demo2')).toHaveLength(1)
  })

  it('toggle is a no-op when the plugin has no registered overlay', () => {
    expect(() => togglePluginOverlay('never-registered')).not.toThrow()
  })

  it('toggle calls through to the overlay handle', () => {
    registerPluginOverlay('demo3', { title: 'Demo3' })
    togglePluginOverlay('demo3')
    expect(fakeOverlay.toggle).toHaveBeenCalled()
  })

  it('exposes the overlay handle via getPluginOverlay', () => {
    registerPluginOverlay('demo4', { title: 'Demo4' })
    expect(getPluginOverlay('demo4')).toBe(fakeOverlay)
    expect(getPluginOverlay('nope')).toBeNull()
  })

  it('re-sends plugin initialization after every renderer load', () => {
    const send = vi.fn()
    const win = { webContents: { send } }
    registerPluginOverlay('reload-demo', { title: 'Reload' })

    registeredSpecs.at(-1)?.onDidFinishLoad?.(win)
    registeredSpecs.at(-1)?.onDidFinishLoad?.(win)

    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith('plugin-overlay:init', 'reload-demo')
  })

  it('reloads an existing plugin overlay renderer', () => {
    const reload = vi.fn()
    fakeOverlay.getWindow.mockReturnValue({ webContents: { reload } } as never)
    registerPluginOverlay('hot-reload-demo', { title: 'Reload' })

    reloadPluginOverlay('hot-reload-demo')

    expect(reload).toHaveBeenCalledOnce()
  })

  it('destroys and unregisters an overlay on uninstall', () => {
    registerPluginOverlay('dispose-demo', { title: 'Dispose' })

    disposePluginOverlay('dispose-demo')

    expect(fakeOverlay.destroy).toHaveBeenCalledOnce()
    expect(getPluginOverlay('dispose-demo')).toBeNull()
  })

  it('registers an annotation overlay with a full-game anchor and the annotation html entry', () => {
    registerPluginAnnotationOverlay('anno-demo')
    const spec = registeredSpecs.at(-1)
    expect(spec?.htmlEntry).toBe('plugin-annotation-overlay.html')
    expect(spec?.defaultAnchor()).toEqual({ fracX: 0, fracY: 0, fracW: 1, fracH: 1 })
  })

  it('annotation overlays register as persistent so the Esc sweep never hides them', () => {
    registerPluginAnnotationOverlay('anno-persist')
    expect(fakeOverlay.setPersistOverOthers).toHaveBeenCalledWith(true)
  })

  it('window-mode overlays are not persist-flagged (the user pins them via chrome)', () => {
    registerPluginOverlay('win-demo', { title: 'Win' })
    expect(fakeOverlay.setPersistOverOthers).not.toHaveBeenCalled()
  })

  it('uses defaultPosition for the anchor origin, keeping size from defaultSize', () => {
    registerPluginOverlay('pos-demo', {
      title: 'Pos',
      defaultSize: { width: 307, height: 432 },
      defaultPosition: { fracX: 0.505, fracY: 0.4 },
    })
    const spec = registeredSpecs.at(-1)
    expect(spec?.defaultAnchor()).toEqual({
      fracX: 0.505,
      fracY: 0.4,
      fracW: 307 / 1920,
      fracH: 432 / 1080,
    })
  })

  it('centers when defaultPosition is omitted', () => {
    registerPluginOverlay('center-demo', { title: 'Center', defaultSize: { width: 384, height: 216 } })
    const spec = registeredSpecs.at(-1)
    expect(spec?.defaultAnchor()).toEqual({
      fracX: (1 - 0.2) / 2,
      fracY: (1 - 0.2) / 2,
      fracW: 0.2,
      fracH: 0.2,
    })
  })

  it('clamps out-of-range fractions to the window staying fully on-screen', () => {
    registerPluginOverlay('clamp-demo', {
      title: 'Clamp',
      defaultSize: { width: 192, height: 108 },
      defaultPosition: { fracX: 4, fracY: -2 },
    })
    const anchor = registeredSpecs.at(-1)?.defaultAnchor() as { fracX: number; fracY: number }
    // fracW/fracH are 0.1 each (192/1920, 108/1080), so the max origin is 0.9.
    expect(anchor.fracX).toBe(0.9)
    expect(anchor.fracY).toBe(0)
  })

  it('keeps a far-edge declared position fully inside the game window', () => {
    registerPluginOverlay('far-edge-demo', {
      title: 'FarEdge',
      defaultSize: { width: 900, height: 800 },
      defaultPosition: { fracX: 1, fracY: 1 },
    })
    const anchor = registeredSpecs.at(-1)?.defaultAnchor() as {
      fracX: number
      fracY: number
      fracW: number
      fracH: number
    }
    expect(anchor.fracX + anchor.fracW).toBeLessThanOrEqual(1)
    expect(anchor.fracY + anchor.fracH).toBeLessThanOrEqual(1)
  })

  it('floors a zero-or-negative defaultSize so fracW/fracH stay positive', () => {
    registerPluginOverlay('zero-size-demo', {
      title: 'ZeroSize',
      defaultSize: { width: 0, height: -50 },
    })
    const anchor = registeredSpecs.at(-1)?.defaultAnchor() as { fracW: number; fracH: number }
    expect(anchor.fracW).toBeGreaterThan(0)
    expect(anchor.fracH).toBeGreaterThan(0)
  })

  it('falls back to centering when a fraction is not finite', () => {
    registerPluginOverlay('nan-demo', {
      title: 'NaN',
      defaultSize: { width: 384, height: 216 },
      defaultPosition: { fracX: Number.NaN, fracY: 0.25 },
    })
    const anchor = registeredSpecs.at(-1)?.defaultAnchor() as { fracX: number; fracY: number }
    expect(anchor.fracX).toBe((1 - 0.2) / 2)
    expect(anchor.fracY).toBe(0.25)
  })

  it('annotation overlays ignore defaultPosition and still span the game window', () => {
    registerPluginAnnotationOverlay('anno-pos')
    expect(registeredSpecs.at(-1)?.defaultAnchor()).toEqual({ fracX: 0, fracY: 0, fracW: 1, fracH: 1 })
  })

  it('forwards the stored-anchor getter onto the overlay spec', () => {
    const stored = { fracX: 0.1, fracY: 0.2, fracW: 0.3, fracH: 0.4 }
    registerPluginOverlay('stored-demo', {
      title: 'Stored',
      defaultPosition: { fracX: 0.505, fracY: 0.4 },
      storedAnchor: () => stored,
    })
    const spec = registeredSpecs.at(-1)
    expect(spec?.storedAnchor?.()).toEqual(stored)
  })

  it('reads the stored anchor lazily on every call, not once at registration', () => {
    let current: OverlayAnchor | undefined
    registerPluginOverlay('lazy-demo', { title: 'Lazy', storedAnchor: () => current })
    const spec = registeredSpecs.at(-1)
    expect(spec?.storedAnchor?.()).toBeUndefined()
    current = { fracX: 0.5, fracY: 0.5, fracW: 0.1, fracH: 0.1 }
    expect(spec?.storedAnchor?.()).toEqual(current)
  })

  it('forwards onAnchorChanged so a user move can be persisted', () => {
    const onAnchorChanged = vi.fn()
    registerPluginOverlay('persist-demo', { title: 'Persist', onAnchorChanged })
    const moved = { fracX: 0.7, fracY: 0.1, fracW: 0.16, fracH: 0.4 }
    registeredSpecs.at(-1)?.onAnchorChanged?.(moved)
    expect(onAnchorChanged).toHaveBeenCalledWith(moved)
  })

  it('annotation overlays get no anchor persistence', () => {
    registerPluginAnnotationOverlay('anno-nopersist')
    const spec = registeredSpecs.at(-1)
    expect(spec?.storedAnchor).toBeUndefined()
    expect(spec?.onAnchorChanged).toBeUndefined()
  })

  // The overlay window is opacity-hidden, never destroyed, so the plugin's
  // renderer sees no DOM-level open/close signal. These forward one.
  it('tells the plugin window when the user opens or closes it', () => {
    const send = vi.fn()
    fakeOverlay.getWindow.mockReturnValue({ isDestroyed: () => false, webContents: { send } } as never)
    registerPluginOverlay('vis-demo', { title: 'Vis' })

    registeredSpecs.at(-1)?.onVisibilityChange?.(false)
    expect(send).toHaveBeenCalledWith('plugin-overlay:visibility', false)

    registeredSpecs.at(-1)?.onVisibilityChange?.(true)
    expect(send).toHaveBeenCalledWith('plugin-overlay:visibility', true)
  })

  it('annotation overlays report visibility too', () => {
    const send = vi.fn()
    fakeOverlay.getWindow.mockReturnValue({ isDestroyed: () => false, webContents: { send } } as never)
    registerPluginAnnotationOverlay('anno-vis')

    registeredSpecs.at(-1)?.onVisibilityChange?.(false)
    expect(send).toHaveBeenCalledWith('plugin-overlay:visibility', false)
  })

  it('drops the visibility signal when the window is gone rather than throwing', () => {
    fakeOverlay.getWindow.mockReturnValue(null)
    registerPluginOverlay('vis-nowin', { title: 'NoWin' })
    expect(() => registeredSpecs.at(-1)?.onVisibilityChange?.(true)).not.toThrow()

    const send = vi.fn()
    fakeOverlay.getWindow.mockReturnValue({ isDestroyed: () => true, webContents: { send } } as never)
    expect(() => registeredSpecs.at(-1)?.onVisibilityChange?.(false)).not.toThrow()
    expect(send).not.toHaveBeenCalled()
  })
})
