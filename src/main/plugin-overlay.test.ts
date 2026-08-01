import { beforeEach, describe, expect, it, vi } from 'vitest'

const registered: Array<{ id: string; htmlEntry: string }> = []
const registeredSpecs: Array<{ id: string; htmlEntry: string; defaultAnchor: () => unknown }> = []
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
}

vi.mock('./windowing', () => ({
  registerSecondaryOverlay: (spec: { id: string; htmlEntry: string; defaultAnchor: () => unknown }) => {
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
})
