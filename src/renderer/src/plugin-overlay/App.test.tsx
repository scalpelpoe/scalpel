// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

function installApi(): void {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getInstalledPlugin: vi.fn(async () => ({
      manifest: { id: 'demo', version: '1.0.0', name: 'Demo' },
      entryUrl: 'file:///demo/plugin.js',
    })),
    getOverlayState: vi.fn(async () => ({ poeVersion: 1 })),
    getSettings: vi.fn(async () => ({ activeProfile: { league: 'Std' } })),
    getIconCache: vi.fn(async () => ({})),
    onIconCacheUpdated: vi.fn(() => () => {}),
    onOverlayData: vi.fn(() => () => {}),
    onZoneChanged: vi.fn(() => () => {}),
    onLeagueUpdated: vi.fn(() => () => {}),
    onLogLine: vi.fn(() => () => {}),
    getRecentLogLines: vi.fn(async () => []),
    pluginStorageGet: vi.fn(async () => null),
    pluginStorageSet: vi.fn(async () => {}),
    pluginStorageDelete: vi.fn(async () => {}),
    pluginStorageKeys: vi.fn(async () => []),
    pluginTriggerMainHotkey: vi.fn(async () => null),
    pluginCloseOverlay: vi.fn(async () => {}),
    openExternal: vi.fn(),
  }
}

describe('plugin-overlay App', () => {
  beforeEach(() => installApi())

  it('imports the plugin module and mounts its overlay render', async () => {
    const renderFn = vi.fn((container: HTMLElement) => {
      container.textContent = 'HELLO FROM OVERLAY'
    })
    const activate = (ctx: { registerOverlay: (o: unknown, r: typeof renderFn) => void }): void => {
      ctx.registerOverlay({ title: 'Demo Overlay' }, renderFn)
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))

    const { findByText } = render(<App pluginId="demo" />)
    expect(await findByText('HELLO FROM OVERLAY')).toBeTruthy()
    await waitFor(() => expect(renderFn).toHaveBeenCalled())
  })

  it('makes registerTab and registerHotkey inert (no throw) and still mounts the overlay', async () => {
    const renderFn = vi.fn((container: HTMLElement) => {
      container.textContent = 'BODY'
    })
    const activate = (ctx: {
      registerTab: (o: unknown) => void
      registerHotkey: (o: unknown, h: () => void) => void
      registerOverlay: (o: unknown, r: typeof renderFn) => void
    }): void => {
      ctx.registerTab({ label: 'x', icon: '', render: () => {} })
      ctx.registerHotkey({ label: 'x' }, () => {})
      ctx.registerOverlay({ title: 'Demo' }, renderFn)
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))

    const { findByText } = render(<App pluginId="demo" />)
    expect(await findByText('BODY')).toBeTruthy()
  })
})
