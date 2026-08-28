// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistryEntry } from '@shared/plugin-registry-types'
import { PluginsStep } from './PluginsStep'

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'demo',
    name: 'Demo',
    author: 'me',
    description: 'A demo plugin',
    repo: 'me/demo',
    latestVersion: '1.0.0',
    sha256: '0'.repeat(64),
    scalpelMinVersion: '>=0.0.0',
    ...overrides,
  }
}

function installApi({
  registry,
  installed = [],
  install,
}: {
  registry: { ok: true; snapshot: { schemaVersion: 1; plugins: RegistryEntry[] } } | { ok: false; error: string }
  installed?: Array<{ manifest: { id: string; name: string; version: string; author: string }; entryUrl: string }>
  install?: (
    entry: RegistryEntry,
  ) => Promise<{ ok: true; id: string; restartRequired: true } | { ok: false; error: string }>
}): void {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    pluginFetchRegistry: vi.fn(async () => registry),
    listInstalledPlugins: vi.fn(async () => installed),
    pluginInstallFromRegistry:
      install ?? vi.fn(async () => ({ ok: true as const, id: 'demo', restartRequired: true as const })),
  }
}

function renderStep(onNext = vi.fn()): ReturnType<typeof render> {
  return render(<PluginsStep onNext={onNext} onBack={vi.fn()} stepNum={1} totalSteps={5} />)
}

describe('PluginsStep failure handling', () => {
  it('renders the unavailable copy and never calls onNext when the registry fetch fails', async () => {
    installApi({ registry: { ok: false, error: 'offline' } })
    const onNext = vi.fn()
    const { findByText } = render(<PluginsStep onNext={onNext} onBack={vi.fn()} stepNum={1} totalSteps={5} />)

    await findByText("Couldn't reach the plugin registry. You can install plugins later from Settings.")

    // The whole point of this test: a failed registry fetch must never auto-advance,
    // or the Macros step's Back button (which lands on Plugins) would strand the
    // user with no way back to earlier steps.
    expect(onNext).not.toHaveBeenCalled()
  })

  it('renders the empty-state copy and never calls onNext when the registry has zero plugins', async () => {
    installApi({ registry: { ok: true, snapshot: { schemaVersion: 1, plugins: [] } } })
    const onNext = vi.fn()
    const { findByText } = render(<PluginsStep onNext={onNext} onBack={vi.fn()} stepNum={1} totalSteps={5} />)

    await findByText('No plugins available right now.')

    expect(onNext).not.toHaveBeenCalled()
  })
})

describe('PluginsStep listing', () => {
  it('splits featured entries under Featured Plugins and the rest under More plugins', async () => {
    installApi({
      registry: {
        ok: true,
        snapshot: {
          schemaVersion: 1,
          plugins: [
            entry({ id: 'star', name: 'Star Plugin', featured: true }),
            entry({ id: 'plain', name: 'Plain Plugin' }),
          ],
        },
      },
    })
    const { findByText } = renderStep()

    const featuredHeading = await findByText('Featured Plugins')
    const moreHeading = await findByText('More plugins')

    // "Star Plugin" should appear before "More plugins" heading, "Plain Plugin" after
    // "Featured Plugins" heading -- assert by container membership rather than DOM order
    // to keep this robust to layout changes.
    const featuredSection = featuredHeading.closest('section')
    const moreSection = moreHeading.closest('section')
    expect(featuredSection?.textContent).toContain('Star Plugin')
    expect(featuredSection?.textContent).not.toContain('Plain Plugin')
    expect(moreSection?.textContent).toContain('Plain Plugin')
    expect(moreSection?.textContent).not.toContain('Star Plugin')
  })

  it('installs a plugin on click and switches the row to the installed state', async () => {
    const pluginInstallFromRegistry = vi.fn(async () => ({
      ok: true as const,
      id: 'demo',
      restartRequired: true as const,
    }))
    installApi({
      registry: { ok: true, snapshot: { schemaVersion: 1, plugins: [entry()] } },
      install: pluginInstallFromRegistry,
    })
    const { findByText } = renderStep()

    const installBtn = await findByText('Install')
    fireEvent.click(installBtn)

    expect(pluginInstallFromRegistry).toHaveBeenCalledWith(entry())
    await findByText('Installed')
    await findByText(/Restart Scalpel after setup/)
  })

  it('shows an inline error and leaves the row installable when install fails', async () => {
    const pluginInstallFromRegistry = vi.fn(async () => ({ ok: false as const, error: 'boom' }))
    installApi({
      registry: { ok: true, snapshot: { schemaVersion: 1, plugins: [entry()] } },
      install: pluginInstallFromRegistry,
    })
    const { findByText, queryByText } = renderStep()

    const installBtn = await findByText('Install')
    fireEvent.click(installBtn)

    await findByText('Install failed: boom')
    expect(queryByText('Installed')).toBeNull()
    await findByText('Install')
  })
})

describe('PluginsStep installed on mount', () => {
  beforeEach(() => {
    installApi({
      registry: { ok: true, snapshot: { schemaVersion: 1, plugins: [entry()] } },
      installed: [{ manifest: { id: 'demo', name: 'Demo', version: '1.0.0', author: 'me' }, entryUrl: '' }],
    })
  })

  it('renders an already-installed plugin as installed rather than offering Install', async () => {
    const { findByText, queryByText } = renderStep()
    await findByText('Installed')
    expect(queryByText('Install')).toBeNull()
  })
})
