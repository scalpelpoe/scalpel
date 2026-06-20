// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { fireEvent, waitFor } from '@testing-library/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeveloperSection } from './DeveloperSection'
import type { AppSettings } from '@shared/types'

function installApi(
  unpackedPlugins: Array<{ manifest: { id: string; name: string; version: string }; entryUrl: string }>,
  overrides: Record<string, unknown> = {},
): void {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    listUnpackedPlugins: vi.fn(async () => unpackedPlugins),
    pluginInstallUnpacked: vi.fn(async () => ({ ok: false, error: 'cancelled' })),
    pluginUninstall: vi.fn(async () => ({ ok: true })),
    onPluginInstalled: vi.fn(() => () => {}),
    onPluginUninstalled: vi.fn(() => () => {}),
    restartApp: vi.fn(),
    ...overrides,
  }
}

const settings = { developerMode: true } as unknown as AppSettings
const noop = (): void => {}

describe('DeveloperSection unpacked plugins list', () => {
  beforeEach(() => installApi([]))

  it('shows "None loaded." when no unpacked plugins are installed', async () => {
    installApi([])
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    expect(await findByText('None loaded.')).toBeTruthy()
  })

  it('renders the plugin name when one unpacked plugin is installed', async () => {
    installApi([{ manifest: { id: 'test-plugin', name: 'Test Plugin', version: '2.0.0' }, entryUrl: '' }])
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    expect(await findByText('Test Plugin')).toBeTruthy()
  })

  it('calls pluginUninstall with the plugin id when Remove is clicked', async () => {
    const pluginUninstall = vi.fn(async () => ({ ok: true as const }))
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      listUnpackedPlugins: vi.fn(async () => [
        { manifest: { id: 'test-plugin', name: 'Test Plugin', version: '2.0.0' }, entryUrl: '' },
      ]),
      pluginInstallUnpacked: vi.fn(async () => ({ ok: false, error: 'cancelled' })),
      pluginUninstall,
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUninstalled: vi.fn(() => () => {}),
    }
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    const removeBtn = await findByText('Remove')
    fireEvent.click(removeBtn)
    await waitFor(() => expect(pluginUninstall).toHaveBeenCalledWith('test-plugin'))
  })
})

describe('DeveloperSection restart button', () => {
  beforeEach(() => installApi([]))

  it('renders the Restart now button when dev mode is on', async () => {
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    expect(await findByText('Restart now')).toBeTruthy()
  })

  it('calls window.api.restartApp when Restart now is clicked', async () => {
    const restartApp = vi.fn()
    installApi([], { restartApp })
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    fireEvent.click(await findByText('Restart now'))
    await waitFor(() => expect(restartApp).toHaveBeenCalledTimes(1))
  })

  it('does not render the Restart button when dev mode is off', () => {
    const offSettings = { developerMode: false } as unknown as AppSettings
    const { queryByText } = render(<DeveloperSection settings={offSettings} update={noop} onError={noop} />)
    expect(queryByText('Restart now')).toBeNull()
  })
})
