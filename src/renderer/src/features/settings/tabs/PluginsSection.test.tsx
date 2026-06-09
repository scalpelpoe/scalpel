// @vitest-environment jsdom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginsSection } from './PluginsSection'
import type { RuntimeSettings } from '../../../../../shared/types'

function installApi(hotkeys: Array<{ action: string; pluginId: string; label: string }>): void {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    listInstalledPlugins: vi.fn(async () => [
      { manifest: { id: 'demo', name: 'Demo', version: '1.0.0', author: 'me' }, entryUrl: '' },
    ]),
    pluginListRegisteredHotkeys: vi.fn(async () => hotkeys),
    pluginFetchRegistry: vi.fn(async () => ({ ok: false, error: 'offline' })),
    pluginUninstall: vi.fn(async () => ({ ok: true })),
    onPluginInstalled: vi.fn(() => () => {}),
    onPluginUpdated: vi.fn(() => () => {}),
    onPluginHotkeysChanged: vi.fn(() => () => {}),
  }
}

const settings = { appMacros: [] } as unknown as RuntimeSettings
const noop = (): void => {}
const tryHotkey = (): boolean => true

describe('PluginsSection hotkey rows', () => {
  beforeEach(() => installApi([]))

  it('shows a bind row labeled by the hotkey for a plugin with one registered hotkey', async () => {
    installApi([{ action: 'plugin-overlay:demo', pluginId: 'demo', label: 'Toggle Event Log' }])
    const { findByText } = render(
      <PluginsSection onError={noop} settings={settings} update={noop} tryHotkey={tryHotkey} />,
    )
    expect(await findByText('Toggle Event Log')).toBeTruthy()
  })

  it('shows two bind rows for a plugin with both an action and an overlay hotkey', async () => {
    installApi([
      { action: 'plugin:demo', pluginId: 'demo', label: 'Quick check' },
      { action: 'plugin-overlay:demo', pluginId: 'demo', label: 'Toggle Event Log' },
    ])
    const { findByText } = render(
      <PluginsSection onError={noop} settings={settings} update={noop} tryHotkey={tryHotkey} />,
    )
    expect(await findByText('Quick check')).toBeTruthy()
    expect(await findByText('Toggle Event Log')).toBeTruthy()
  })

  it('shows no hotkey label when the plugin registered none', async () => {
    installApi([])
    const { queryByText, findByText } = render(
      <PluginsSection onError={noop} settings={settings} update={noop} tryHotkey={tryHotkey} />,
    )
    await findByText('Demo')
    expect(queryByText('Toggle Event Log')).toBeNull()
  })
})

describe('PluginsSection installed icon', () => {
  it('falls back to the registry iconUrl when the installed manifest omits one', async () => {
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      listInstalledPlugins: vi.fn(async () => [
        { manifest: { id: 'demo', name: 'Demo', version: '1.0.0', author: 'me' }, entryUrl: '' },
      ]),
      pluginListRegisteredHotkeys: vi.fn(async () => []),
      pluginFetchRegistry: vi.fn(async () => ({
        ok: true,
        snapshot: { plugins: [{ id: 'demo', latestVersion: '1.0.0', iconUrl: 'http://example/demo-icon.png' }] },
      })),
      pluginUninstall: vi.fn(async () => ({ ok: true })),
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUpdated: vi.fn(() => () => {}),
      onPluginHotkeysChanged: vi.fn(() => () => {}),
    }
    const { container, findByText } = render(
      <PluginsSection onError={noop} settings={settings} update={noop} tryHotkey={tryHotkey} />,
    )
    await findByText('Demo')
    await waitFor(() => {
      expect(container.querySelector('img[src="http://example/demo-icon.png"]')).toBeTruthy()
    })
  })
})

describe('PluginsSection update button', () => {
  it('shows an Update button when the registry has a newer version and calls update', async () => {
    const pluginUpdateFromRegistry = vi.fn(async () => ({ ok: true as const, id: 'demo' }))
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      listInstalledPlugins: vi.fn(async () => [
        {
          manifest: {
            manifestVersion: 1,
            id: 'demo',
            name: 'Demo',
            version: '1.0.0',
            author: 'me',
            description: 'd',
            scalpelMinVersion: '>=0.0.0',
          },
          entryUrl: '',
        },
      ]),
      pluginListRegisteredHotkeys: vi.fn(async () => []),
      pluginFetchRegistry: vi.fn(async () => ({
        ok: true,
        snapshot: {
          schemaVersion: 1,
          plugins: [
            {
              id: 'demo',
              name: 'Demo',
              author: 'me',
              description: 'd',
              repo: 'me/demo',
              latestVersion: '2.0.0',
              scalpelMinVersion: '>=0.0.0',
              sha256: '0'.repeat(64),
            },
          ],
        },
      })),
      pluginUninstall: vi.fn(async () => ({ ok: true })),
      pluginUpdateFromRegistry,
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUpdated: vi.fn(() => () => {}),
      onPluginHotkeysChanged: vi.fn(() => () => {}),
    }
    const { findByText } = render(
      <PluginsSection onError={noop} settings={settings} update={noop} tryHotkey={tryHotkey} />,
    )
    const btn = await findByText('Update to v2.0.0')
    fireEvent.click(btn)
    await waitFor(() => expect(pluginUpdateFromRegistry).toHaveBeenCalled())
  })
})
