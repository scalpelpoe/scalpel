// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { fireEvent, waitFor } from '@testing-library/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeveloperSection } from './DeveloperSection'
import type { AppSettings } from '@shared/types'

function installApi(
  unpackedPlugins: Array<{
    manifest: { id: string; name: string; version: string }
    entryUrl: string
    sourceDir?: string
    availability?:
      | { status: 'available' }
      | {
          status: 'unavailable'
          reason: { code: string; message: string; [key: string]: unknown }
        }
  }>,
  overrides: Record<string, unknown> = {},
): void {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    listUnpackedPlugins: vi.fn(async () => unpackedPlugins),
    pluginInstallUnpacked: vi.fn(async () => ({
      ok: false,
      error: 'cancelled',
    })),
    pluginReloadUnpacked: vi.fn(async () => ({ ok: true, id: 'test-plugin' })),
    pluginUninstallUnpacked: vi.fn(async () => ({ ok: true })),
    onPluginDevInstalled: vi.fn(() => () => {}),
    onPluginDevUpdated: vi.fn(() => () => {}),
    onPluginDevUninstalled: vi.fn(() => () => {}),
    restartApp: vi.fn(),
    ...overrides,
  }
}

const loaded = (
  sourceDir?: string,
): Array<{
  manifest: { id: string; name: string; version: string }
  entryUrl: string
  sourceDir?: string
}> => [
  {
    manifest: { id: 'test-plugin', name: 'Test Plugin', version: '2.0.0' },
    entryUrl: '',
    sourceDir,
  },
]

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
    installApi([
      {
        manifest: { id: 'test-plugin', name: 'Test Plugin', version: '2.0.0' },
        entryUrl: '',
      },
    ])
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    expect(await findByText('Test Plugin')).toBeTruthy()
  })

  it('calls pluginUninstallUnpacked with the plugin id when Remove is clicked', async () => {
    const pluginUninstallUnpacked = vi.fn(async () => ({ ok: true as const }))
    installApi(loaded('/src/test-plugin'), { pluginUninstallUnpacked })
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    const removeBtn = await findByText('Remove')
    fireEvent.click(removeBtn)
    await waitFor(() => expect(pluginUninstallUnpacked).toHaveBeenCalledWith('test-plugin'))
  })

  it('grays an unavailable plugin, shows its reason, and retains repair controls', async () => {
    installApi([
      {
        manifest: { id: 'test-plugin', name: 'Test Plugin', version: '2.0.0' },
        entryUrl: '',
        sourceDir: '/src/test-plugin',
        availability: {
          status: 'unavailable',
          reason: {
            code: 'missing-required-dependency',
            message: 'required plugin "provider" is not installed',
          },
        },
      },
    ])
    const { findByRole, findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)

    const reason = await findByRole('status')
    expect(reason.textContent).toContain('required plugin "provider" is not installed')
    expect(reason.closest('[data-plugin-availability]')?.getAttribute('data-plugin-availability')).toBe('unavailable')
    expect(((await findByText('Reload')) as HTMLButtonElement).disabled).toBe(false)
    expect(((await findByText('Remove')) as HTMLButtonElement).disabled).toBe(false)
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

describe('DeveloperSection reload button', () => {
  it('calls pluginReloadUnpacked with the plugin id when Reload is clicked', async () => {
    const pluginReloadUnpacked = vi.fn(async () => ({
      ok: true as const,
      id: 'test-plugin',
    }))
    installApi(loaded('/src/test-plugin'), { pluginReloadUnpacked })
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    fireEvent.click(await findByText('Reload'))
    await waitFor(() => expect(pluginReloadUnpacked).toHaveBeenCalledWith('test-plugin'))
  })

  it('disables Reload when the source directory is unknown', async () => {
    installApi(loaded(undefined))
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    const btn = (await findByText('Reload')) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('reports the error when a reload fails', async () => {
    const onError = vi.fn()
    installApi(loaded('/src/test-plugin'), {
      pluginReloadUnpacked: vi.fn(async () => ({
        ok: false as const,
        error: 'Source directory no longer exists',
      })),
    })
    const { findByText } = render(<DeveloperSection settings={settings} update={noop} onError={onError} />)
    fireEvent.click(await findByText('Reload'))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Source directory no longer exists'))
  })

  it('refreshes the list when a plugin is hot-updated', async () => {
    let fire: (() => void) | undefined
    installApi(loaded('/src/test-plugin'), {
      onPluginDevUpdated: vi.fn((cb: () => void) => {
        fire = cb
        return () => {}
      }),
    })
    render(<DeveloperSection settings={settings} update={noop} onError={noop} />)
    await waitFor(() => expect(window.api.listUnpackedPlugins).toHaveBeenCalledTimes(1))
    fire?.()
    await waitFor(() => expect(window.api.listUnpackedPlugins).toHaveBeenCalledTimes(2))
  })
})
