import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./game-state', () => ({
  getPoeVersion: vi.fn(() => 2 as const),
}))

vi.mock('./plugins/manager', () => ({
  getInstalledPlugins: vi.fn(() => [{ manifest: { id: 'demo.tool', name: 'Demo Tool' } }]),
}))

vi.mock('./plugins/hotkey-registry', () => ({
  getRegisteredOverlayHotkeys: vi.fn(
    () =>
      new Map([
        ['demo.tool', { label: 'Overlay' }],
        ['other', { label: '' }],
      ]),
  ),
}))

vi.mock('./plugins/tab-registry', () => ({
  getRegisteredPluginTabs: vi.fn(
    () =>
      new Map([
        ['demo.tool', { label: 'Demo Tab', icon: '<svg data-testid="demo-icon"/>' }],
        ['other', { label: 'Other Tab', icon: '<svg data-testid="tab-icon"/>' }],
      ]),
  ),
}))

vi.mock('./windowing', () => ({
  registerSecondaryOverlay: vi.fn(() => ({
    show: vi.fn(),
    hide: vi.fn(),
    toggle: vi.fn(),
    isVisible: vi.fn(() => false),
    send: vi.fn(),
    setBoundsProgrammaticOnce: vi.fn(),
    getWindow: vi.fn(() => null),
    setBoundsProgrammatic: vi.fn(),
    setSizeProgrammatic: vi.fn(),
    hideKeepingRestore: vi.fn(),
    setPersistOverOthers: vi.fn(),
    getPersistOverOthers: vi.fn(() => false),
  })),
}))

import { buildLauncherItems, buildLauncherPayload, initLauncher } from './launcher'

describe('buildLauncherItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initLauncher({
      dispatch: vi.fn(),
      getSliceMode: () => 'icons',
      getStyle: () => 'hub',
    })
  })

  it('includes PoE2-safe built-ins and plugin overlays', () => {
    const labels = buildLauncherItems().map((i) => i.label)
    expect(labels).toContain('Settings')
    expect(labels).toContain('Whiteboard')
    expect(labels).not.toContain('Dust')
    expect(labels).toContain('Demo Tool — Overlay')
    expect(labels).toContain('other')
  })

  it('attaches icons for built-ins and plugins (tab icon when registered, else fallback)', () => {
    const byAction = new Map(buildLauncherItems().map((i) => [i.action, i]))
    expect(byAction.get('openSettings')?.icon).toContain('<svg')
    expect(byAction.get('plugin-overlay:demo.tool')?.icon).toContain('demo-icon')
    expect(byAction.get('plugin-overlay:other')?.icon).toContain('tab-icon')
  })

  it('buildLauncherPayload includes slice mode and style from init', () => {
    const payload = buildLauncherPayload()
    expect(payload.sliceMode).toBe('icons')
    expect(payload.style).toBe('hub')
  })

  it('assigns categories to built-ins and plugins', () => {
    const byAction = new Map(buildLauncherItems().map((i) => [i.action, i]))
    expect(byAction.get('openSettings')?.category).toBe('app')
    expect(byAction.get('openRegex')?.category).toBe('devtools')
    expect(byAction.get('plugin-overlay:demo.tool')?.category).toBeTruthy()
  })
})
