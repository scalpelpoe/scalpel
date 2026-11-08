// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import type { PluginManifest } from '../../../plugin-sdk/src/types'
import type { ScalpelPluginContext } from '../../../plugin-sdk/src/types'

const manifest: PluginManifest = {
  manifestVersion: 1,
  id: 'hello',
  version: '1.0.0',
  name: 'Hello',
  description: 'd',
  author: 'a',
  scalpelMinVersion: '>=0.0.0',
}

const installedList: Array<{ manifest: PluginManifest; entryUrl: string }> = []

let pluginMacroListener: ((action: string) => void) | null = null

beforeEach(() => {
  installedList.length = 0
  pluginMacroListener = null
  vi.resetModules()
  ;(window as unknown as { api: unknown }).api = {
    listInstalledPlugins: vi.fn(async () => installedList),
    pluginStorageGet: vi.fn(async () => null),
    pluginStorageSet: vi.fn(async () => undefined),
    pluginStorageDelete: vi.fn(async () => undefined),
    pluginStorageKeys: vi.fn(async () => []),
    pluginRegisterHotkey: vi.fn(async () => undefined),
    pluginUnregisterHotkey: vi.fn(async () => undefined),
    pluginRegisterTab: vi.fn(async () => undefined),
    pluginUnregisterTab: vi.fn(async () => undefined),
    pluginTriggerMainHotkey: vi.fn(async () => null),
    onPluginMacro: vi.fn((h: (action: string) => void) => {
      pluginMacroListener = h
      return () => {
        pluginMacroListener = null
      }
    }),
    onLogLine: vi.fn(() => () => {}),
    onPluginInstalled: vi.fn(() => () => {}),
    onPluginUninstalled: vi.fn(() => () => {}),
    onPluginUpdated: vi.fn(() => () => {}),
  }
  // mock the dynamic import that the host will perform
  ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn()
})

describe('PluginHost', () => {
  it('renders no tabs when there are no installed plugins', async () => {
    const { PluginHost } = await import('./PluginHost')
    const onTabsChange = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={onTabsChange}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await waitFor(() => expect(onTabsChange).toHaveBeenCalled())
    expect(onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1][0]).toEqual([])
  })

  it('calls activate(ctx) on each installed plugin and surfaces the registered tab', async () => {
    installedList.push({ manifest, entryUrl: 'file:///fake/plugin.js' })
    const activate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.registerTab({ label: 'Hello', icon: '<svg/>', render: () => {} })
    })
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))
    const { PluginHost } = await import('./PluginHost')
    const onTabsChange = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={onTabsChange}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await waitFor(() => expect(activate).toHaveBeenCalled())
    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1][0]
      expect(last).toHaveLength(1)
      expect(last[0].pluginId).toBe('hello')
      expect(last[0].label).toBe('Hello')
    })
  })

  it('does not call activate before ready=true', async () => {
    installedList.push({ manifest, entryUrl: 'file:///fake/plugin.js' })
    const activate = vi.fn()
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))
    const { PluginHost } = await import('./PluginHost')
    render(
      <PluginHost
        ready={false}
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(activate).not.toHaveBeenCalled()
  })

  it('marks the plugin broken if activate throws', async () => {
    installedList.push({ manifest, entryUrl: 'file:///fake/plugin.js' })
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: () => {
        throw new Error('bad')
      },
    }))
    const { PluginHost } = await import('./PluginHost')
    const onError = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onPluginError={onError}
      />,
    )
    await waitFor(() => expect(onError).toHaveBeenCalledWith('hello', expect.any(Error)))
  })

  it.each([
    [
      'throws during activation',
      () => {
        throw new Error('provider failed')
      },
    ],
    ['does not expose its declared API', () => {}],
  ])('blocks required consumers when their provider %s', async (_label, providerActivate) => {
    const providerManifest: PluginManifest = {
      ...manifest,
      id: 'provider',
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.v1.Provider',
      },
    }
    const consumerManifest: PluginManifest = {
      ...manifest,
      id: 'consumer',
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    }
    installedList.push(
      { manifest: consumerManifest, entryUrl: 'plugin://consumer' },
      { manifest: providerManifest, entryUrl: 'plugin://provider' },
    )
    const consumerActivate = vi.fn()
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async (url) => ({
      default: url.endsWith('provider') ? providerActivate : consumerActivate,
    }))
    const { PluginHost } = await import('./PluginHost')
    const onError = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onPluginError={onError}
      />,
    )

    await waitFor(() => expect(onError).toHaveBeenCalledWith('provider', expect.any(Error)))
    expect(onError).not.toHaveBeenCalledWith('consumer', expect.any(Error))
    expect(consumerActivate).not.toHaveBeenCalled()
  })

  it('unregisters the tab and hotkey with main when a provider fails activation', async () => {
    const providerManifest: PluginManifest = {
      ...manifest,
      id: 'provider',
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.v1.Provider',
      },
    }
    const providerActivate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.registerTab({ label: 'P', icon: '<svg/>', render: () => {} })
      ctx.registerHotkey({ label: 'H' }, () => {})
      // never calls ctx.plugins.expose, so assertActivationComplete throws
    })
    installedList.push({ manifest: providerManifest, entryUrl: 'plugin://provider' })
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: providerActivate,
    }))
    const { PluginHost } = await import('./PluginHost')
    const onError = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onPluginError={onError}
      />,
    )

    await waitFor(() => expect(onError).toHaveBeenCalledWith('provider', expect.any(Error)))
    expect(window.api.pluginUnregisterTab).toHaveBeenCalledWith('provider')
    expect(window.api.pluginUnregisterHotkey).toHaveBeenCalledWith('provider')
  })

  it('does not label a statically unavailable plugin as crashed', async () => {
    installedList.push({
      manifest: {
        ...manifest,
        id: 'consumer',
        dependencies: [{ pluginId: 'missing-provider', apiVersion: '1.0.0' }],
      },
      entryUrl: 'plugin://consumer',
    })
    const onError = vi.fn()
    const pluginImport = vi.fn()
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = pluginImport
    const { PluginHost } = await import('./PluginHost')
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onPluginError={onError}
      />,
    )

    await waitFor(() => expect(window.api.listInstalledPlugins).toHaveBeenCalled())
    expect(pluginImport).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('reconciles the graph after install and activates a formerly dangling consumer', async () => {
    const providerManifest: PluginManifest = {
      ...manifest,
      id: 'provider',
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.v1.Provider',
      },
    }
    const consumerManifest: PluginManifest = {
      ...manifest,
      id: 'consumer',
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    }
    let loadable: Array<{ manifest: PluginManifest; entryUrl: string }> = []
    let installedListener: ((entry: { manifest: PluginManifest; entryUrl: string }) => void) | null = null
    const calls: string[] = []
    const providerActivate = vi.fn((ctx: ScalpelPluginContext) => {
      calls.push('provider')
      ctx.plugins.expose('example.v1.Provider', () => null)
    })
    const consumerActivate = vi.fn(() => calls.push('consumer'))
    const currentApi = window.api
    ;(window as unknown as { api: unknown }).api = {
      ...currentApi,
      listLoadablePlugins: vi.fn(async () => loadable),
      onPluginInstalled: vi.fn((listener: (entry: { manifest: PluginManifest; entryUrl: string }) => void) => {
        installedListener = listener
        return () => {
          installedListener = null
        }
      }),
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async (url) => ({
      default: url.includes('provider') ? providerActivate : consumerActivate,
    }))

    const { PluginHost } = await import('./PluginHost')
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await waitFor(() => expect(window.api.listLoadablePlugins).toHaveBeenCalledTimes(1))
    expect(consumerActivate).not.toHaveBeenCalled()

    loadable = [
      { manifest: consumerManifest, entryUrl: 'plugin://consumer' },
      { manifest: providerManifest, entryUrl: 'plugin://provider' },
    ]
    ;(installedListener as ((entry: { manifest: PluginManifest; entryUrl: string }) => void) | null)?.({
      manifest: providerManifest,
      entryUrl: 'plugin://provider?v=1',
    })

    await waitFor(() => expect(consumerActivate).toHaveBeenCalledTimes(1))
    expect(calls).toEqual(['provider', 'consumer'])
  })

  it('filters by poeVersions in the manifest', async () => {
    installedList.push({
      manifest: { ...manifest, poeVersions: [2] },
      entryUrl: 'file:///fake/plugin.js',
    })
    const activate = vi.fn()
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))
    const { PluginHost } = await import('./PluginHost')
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(activate).not.toHaveBeenCalled()
  })

  it('dispatches plugin-macro events to the matching plugin hotkey handler', async () => {
    installedList.push({ manifest, entryUrl: 'file:///fake/plugin.js' })
    const hotkeyHandler = vi.fn()
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: (ctx: ScalpelPluginContext) => {
        ctx.registerHotkey({ label: 'X' }, hotkeyHandler)
      },
    }))
    const { PluginHost } = await import('./PluginHost')
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await waitFor(() => expect(window.api.pluginRegisterHotkey).toHaveBeenCalled())
    expect(pluginMacroListener).toBeTruthy()
    pluginMacroListener!('plugin:hello')
    expect(hotkeyHandler).toHaveBeenCalled()
  })

  it('ignores plugin-macro events for unregistered plugins', async () => {
    installedList.push({ manifest, entryUrl: 'file:///fake/plugin.js' })
    const hotkeyHandler = vi.fn()
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: (ctx: ScalpelPluginContext) => {
        ctx.registerHotkey({ label: 'X' }, hotkeyHandler)
      },
    }))
    const { PluginHost } = await import('./PluginHost')
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await waitFor(() => expect(window.api.pluginRegisterHotkey).toHaveBeenCalled())
    pluginMacroListener!('plugin:nonexistent')
    expect(hotkeyHandler).not.toHaveBeenCalled()
  })

  it('loads a newly installed plugin without restart', async () => {
    const activate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.registerTab({ label: 'Late', icon: '<svg/>', render: () => {} })
    })
    let installedListener: ((entry: unknown) => void) | null = null
    let loadable: Array<{ manifest: PluginManifest; entryUrl: string }> = []
    ;(window as unknown as { api: unknown }).api = {
      listInstalledPlugins: vi.fn(async () => loadable),
      pluginStorageGet: vi.fn(async () => null),
      pluginStorageSet: vi.fn(async () => undefined),
      pluginStorageDelete: vi.fn(async () => undefined),
      pluginStorageKeys: vi.fn(async () => []),
      pluginRegisterHotkey: vi.fn(async () => undefined),
      pluginUnregisterHotkey: vi.fn(async () => undefined),
      pluginRegisterTab: vi.fn(async () => undefined),
      pluginUnregisterTab: vi.fn(async () => undefined),
      onPluginMacro: vi.fn(() => () => {}),
      onPluginInstalled: vi.fn((h: (entry: unknown) => void) => {
        installedListener = h
        return () => {
          installedListener = null
        }
      }),
      onPluginUninstalled: vi.fn(() => () => {}),
      onPluginUpdated: vi.fn(() => () => {}),
      pluginTriggerMainHotkey: vi.fn(async () => null),
      pluginShowOverlay: vi.fn(async () => undefined),
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))

    const { PluginHost } = await import('./PluginHost')
    const onTabsChange = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onTabsChange={onTabsChange}
      />,
    )

    // Initial state: no tabs.
    await waitFor(() => expect(onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1]?.[0]).toEqual([]))

    // Main has re-evaluated the graph by the time it broadcasts the event.
    const lateEntry: { manifest: PluginManifest; entryUrl: string } = {
      manifest: {
        manifestVersion: 1,
        id: 'late',
        version: '1.0.0',
        name: 'Late',
        description: 'd',
        author: 'a',
        scalpelMinVersion: '>=0.0.0',
      },
      entryUrl: 'file:///fake/late.js?v=1.0.0',
    }
    loadable = [lateEntry]
    ;(installedListener as ((entry: unknown) => void) | null)?.(lateEntry)

    await waitFor(() => expect(activate).toHaveBeenCalled())
    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1]?.[0]
      expect(last).toHaveLength(1)
      expect(last[0].pluginId).toBe('late')
    })
  })

  it('attaches overlay metadata to the tab when both tab and overlay are registered', async () => {
    installedList.push({ manifest, entryUrl: 'file:///fake/plugin.js' })
    const pluginRegisterOverlay = vi.fn(async () => undefined)
    ;(window as unknown as { api: unknown }).api = {
      listInstalledPlugins: vi.fn(async () => installedList),
      pluginStorageGet: vi.fn(async () => null),
      pluginStorageSet: vi.fn(async () => undefined),
      pluginStorageDelete: vi.fn(async () => undefined),
      pluginStorageKeys: vi.fn(async () => []),
      pluginRegisterHotkey: vi.fn(async () => undefined),
      pluginUnregisterHotkey: vi.fn(async () => undefined),
      pluginRegisterTab: vi.fn(async () => undefined),
      pluginUnregisterTab: vi.fn(async () => undefined),
      pluginRegisterOverlay,
      onPluginMacro: vi.fn(() => () => {}),
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUninstalled: vi.fn(() => () => {}),
      onPluginUpdated: vi.fn(() => () => {}),
      pluginTriggerMainHotkey: vi.fn(async () => null),
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: (ctx: ScalpelPluginContext) => {
        ctx.registerTab({ label: 'Demo', icon: '<svg/>', render: () => {} })
        ctx.registerOverlay({ title: 'Demo Overlay' }, () => {})
      },
    }))
    const { PluginHost } = await import('./PluginHost')
    const onTabsChange = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={onTabsChange}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await waitFor(() => expect(pluginRegisterOverlay).toHaveBeenCalled())
    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1][0]
      expect(last).toHaveLength(1)
      expect(last[0].pluginId).toBe('hello')
      expect(last[0].overlay).toEqual(expect.objectContaining({ title: 'Demo Overlay' }))
    })
    expect(pluginRegisterOverlay).toHaveBeenCalledWith('hello', expect.objectContaining({ title: 'Demo Overlay' }))
  })

  it('carries the overlay mode through to the tab state', async () => {
    installedList.push({ manifest, entryUrl: 'file:///fake/plugin.js' })
    const pluginRegisterOverlay = vi.fn(async () => undefined)
    ;(window as unknown as { api: unknown }).api = {
      listInstalledPlugins: vi.fn(async () => installedList),
      pluginStorageGet: vi.fn(async () => null),
      pluginStorageSet: vi.fn(async () => undefined),
      pluginStorageDelete: vi.fn(async () => undefined),
      pluginStorageKeys: vi.fn(async () => []),
      pluginRegisterHotkey: vi.fn(async () => undefined),
      pluginUnregisterHotkey: vi.fn(async () => undefined),
      pluginRegisterTab: vi.fn(async () => undefined),
      pluginUnregisterTab: vi.fn(async () => undefined),
      pluginRegisterOverlay,
      onPluginMacro: vi.fn(() => () => {}),
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUninstalled: vi.fn(() => () => {}),
      onPluginUpdated: vi.fn(() => () => {}),
      pluginTriggerMainHotkey: vi.fn(async () => null),
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: (ctx: ScalpelPluginContext) => {
        ctx.registerTab({ label: 'Demo', icon: '<svg/>', render: () => {} })
        ctx.registerOverlay({ title: 'Demo Overlay', mode: 'annotation' }, () => {})
      },
    }))
    const { PluginHost } = await import('./PluginHost')
    const onTabsChange = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={onTabsChange}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )
    await waitFor(() => expect(pluginRegisterOverlay).toHaveBeenCalled())
    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1][0]
      expect(last).toHaveLength(1)
      expect(last[0].overlay).toEqual(expect.objectContaining({ title: 'Demo Overlay', mode: 'annotation' }))
    })
  })

  it('unloads an uninstalled plugin without restart', async () => {
    const activate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.registerTab({ label: 'Hello', icon: '<svg/>', render: () => {} })
    })
    let installed = [{ manifest, entryUrl: 'file:///fake/plugin.js' }]
    let uninstalledListener: ((pluginId: string) => void) | null = null
    ;(window as unknown as { api: unknown }).api = {
      listInstalledPlugins: vi.fn(async () => installed),
      pluginStorageGet: vi.fn(async () => null),
      pluginStorageSet: vi.fn(async () => undefined),
      pluginStorageDelete: vi.fn(async () => undefined),
      pluginStorageKeys: vi.fn(async () => []),
      pluginRegisterHotkey: vi.fn(async () => undefined),
      pluginUnregisterHotkey: vi.fn(async () => undefined),
      pluginRegisterTab: vi.fn(async () => undefined),
      pluginUnregisterTab: vi.fn(async () => undefined),
      onPluginMacro: vi.fn(() => () => {}),
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUninstalled: vi.fn((h: (pluginId: string) => void) => {
        uninstalledListener = h
        return () => {
          uninstalledListener = null
        }
      }),
      onPluginUpdated: vi.fn(() => () => {}),
      pluginTriggerMainHotkey: vi.fn(async () => null),
      pluginShowOverlay: vi.fn(async () => undefined),
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))

    const { PluginHost } = await import('./PluginHost')
    const onTabsChange = vi.fn()
    const onPluginUnloaded = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onTabsChange={onTabsChange}
        onPluginUnloaded={onPluginUnloaded}
      />,
    )

    // Wait for the initial plugin to load.
    await waitFor(() => expect(activate).toHaveBeenCalled())
    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1]?.[0]
      expect(last).toHaveLength(1)
      expect(last[0].pluginId).toBe('hello')
    })

    // Fire the uninstall event. Main drops the plugin from the list before it
    // broadcasts the event.
    installed = []
    ;(uninstalledListener as ((pluginId: string) => void) | null)?.('hello')

    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1]?.[0]
      expect(last).toHaveLength(0)
    })
    expect(onPluginUnloaded).toHaveBeenCalledWith('hello')
    expect(window.api.pluginUnregisterHotkey).toHaveBeenCalledWith('hello')
  })

  it('reloads a plugin on plugin-updated with no duplicate tabs', async () => {
    const activate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.registerTab({ label: 'Hello', icon: '<svg/>', render: () => {} })
    })
    let updatedListener: ((entry: { manifest: PluginManifest; entryUrl: string }) => void) | null = null
    ;(window as unknown as { api: unknown }).api = {
      listInstalledPlugins: vi.fn(async () => [{ manifest, entryUrl: 'file:///fake/plugin.js?v=1.0.0' }]),
      pluginStorageGet: vi.fn(async () => null),
      pluginStorageSet: vi.fn(async () => undefined),
      pluginStorageDelete: vi.fn(async () => undefined),
      pluginStorageKeys: vi.fn(async () => []),
      pluginRegisterHotkey: vi.fn(async () => undefined),
      pluginUnregisterHotkey: vi.fn(async () => undefined),
      pluginRegisterTab: vi.fn(async () => undefined),
      pluginUnregisterTab: vi.fn(async () => undefined),
      onLogLine: vi.fn(() => () => {}),
      onPluginMacro: vi.fn(() => () => {}),
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUninstalled: vi.fn(() => () => {}),
      onPluginUpdated: vi.fn((h: (entry: { manifest: PluginManifest; entryUrl: string }) => void) => {
        updatedListener = h
        return () => {
          updatedListener = null
        }
      }),
      pluginTriggerMainHotkey: vi.fn(async () => null),
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))

    const { PluginHost } = await import('./PluginHost')
    const onTabsChange = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onTabsChange={onTabsChange}
      />,
    )

    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1))
    ;(updatedListener as ((entry: { manifest: PluginManifest; entryUrl: string }) => void) | null)?.({
      manifest: { ...manifest, version: '2.0.0' },
      entryUrl: 'file:///fake/plugin.js?v=2.0.0',
    })

    await waitFor(() => expect(activate).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1]?.[0]
      expect(last).toHaveLength(1)
      expect(last[0].pluginId).toBe('hello')
    })
  })

  it('reloads required dependents after a provider update', async () => {
    const providerManifest: PluginManifest = {
      ...manifest,
      id: 'provider',
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.v1.Provider',
      },
    }
    const consumerManifest: PluginManifest = {
      ...manifest,
      id: 'consumer',
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    }
    const entries = [
      { manifest: consumerManifest, entryUrl: 'plugin://consumer' },
      { manifest: providerManifest, entryUrl: 'plugin://provider' },
    ]
    let updatedListener: ((entry: { manifest: PluginManifest; entryUrl: string }) => void) | null = null
    const providerTeardown = vi.fn()
    const consumerTeardown = vi.fn()
    const providerActivate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.plugins.expose('example.v1.Provider', () => null)
      return providerTeardown
    })
    const consumerActivate = vi.fn(() => consumerTeardown)
    const currentApi = window.api
    ;(window as unknown as { api: unknown }).api = {
      ...currentApi,
      listLoadablePlugins: vi.fn(async () => entries),
      onPluginUpdated: vi.fn((listener: (entry: { manifest: PluginManifest; entryUrl: string }) => void) => {
        updatedListener = listener
        return () => {
          updatedListener = null
        }
      }),
    }
    ;(window as unknown as { __pluginImport: (url: string) => Promise<unknown> }).__pluginImport = vi.fn(
      async (url: string) => ({ default: url.includes('provider') ? providerActivate : consumerActivate }),
    )

    const { PluginHost } = await import('./PluginHost')
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )

    await waitFor(() => expect(consumerActivate).toHaveBeenCalledTimes(1))
    ;(updatedListener as ((entry: { manifest: PluginManifest; entryUrl: string }) => void) | null)?.({
      manifest: { ...providerManifest, version: '2.0.0' },
      entryUrl: 'plugin://provider?v=2',
    })

    await waitFor(() => expect(providerActivate).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(consumerActivate).toHaveBeenCalledTimes(2))
    expect(consumerTeardown).toHaveBeenCalledOnce()
    expect(providerTeardown).toHaveBeenCalledOnce()
  })

  it('hot-loads an installed provider and re-activates its optional consumer', async () => {
    const providerManifest: PluginManifest = {
      ...manifest,
      id: 'provider',
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.v1.Provider',
      },
    }
    const consumerManifest: PluginManifest = {
      ...manifest,
      id: 'consumer',
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0', optional: true }],
    }
    let loadable = [{ manifest: consumerManifest, entryUrl: 'plugin://consumer' }]
    let installedListener: ((entry: { manifest: PluginManifest; entryUrl: string }) => void) | null = null
    const providerActivate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.plugins.expose('example.v1.Provider', () => null)
    })
    const consumerTeardown = vi.fn()
    const clients: unknown[] = []
    const consumerActivate = vi.fn((ctx: ScalpelPluginContext) => {
      clients.push(ctx.plugins.get('provider', 'example.v1.Provider'))
      return consumerTeardown
    })
    const currentApi = window.api
    ;(window as unknown as { api: unknown }).api = {
      ...currentApi,
      listLoadablePlugins: vi.fn(async () => loadable),
      onPluginInstalled: vi.fn((listener: (entry: { manifest: PluginManifest; entryUrl: string }) => void) => {
        installedListener = listener
        return () => {
          installedListener = null
        }
      }),
    }
    ;(window as unknown as { __pluginImport: (url: string) => Promise<unknown> }).__pluginImport = vi.fn(
      async (url: string) => ({ default: url.includes('provider') ? providerActivate : consumerActivate }),
    )

    const { PluginHost } = await import('./PluginHost')
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )

    await waitFor(() => expect(consumerActivate).toHaveBeenCalledOnce())
    expect(clients[0]).toBeNull()

    const providerEntry = { manifest: providerManifest, entryUrl: 'plugin://provider?v=1' }
    loadable = [{ manifest: consumerManifest, entryUrl: 'plugin://consumer' }, providerEntry]
    ;(installedListener as ((entry: { manifest: PluginManifest; entryUrl: string }) => void) | null)?.(providerEntry)

    await waitFor(() => expect(consumerActivate).toHaveBeenCalledTimes(2))
    expect(providerActivate).toHaveBeenCalledOnce()
    expect(consumerTeardown).toHaveBeenCalledOnce()
    expect(clients[1]).not.toBeNull()
  })

  it('re-activates an optional consumer after its provider is uninstalled', async () => {
    const providerManifest: PluginManifest = {
      ...manifest,
      id: 'provider',
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.v1.Provider',
      },
    }
    const consumerManifest: PluginManifest = {
      ...manifest,
      id: 'consumer',
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0', optional: true }],
    }
    let loadable = [
      { manifest: consumerManifest, entryUrl: 'plugin://consumer' },
      { manifest: providerManifest, entryUrl: 'plugin://provider' },
    ]
    let uninstalledListener: ((pluginId: string) => void) | null = null
    const providerTeardown = vi.fn()
    const providerActivate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.plugins.expose('example.v1.Provider', () => null)
      return providerTeardown
    })
    const clients: unknown[] = []
    const consumerActivate = vi.fn((ctx: ScalpelPluginContext) => {
      clients.push(ctx.plugins.get('provider', 'example.v1.Provider'))
    })
    const currentApi = window.api
    ;(window as unknown as { api: unknown }).api = {
      ...currentApi,
      listLoadablePlugins: vi.fn(async () => loadable),
      onPluginUninstalled: vi.fn((listener: (pluginId: string) => void) => {
        uninstalledListener = listener
        return () => {
          uninstalledListener = null
        }
      }),
    }
    ;(window as unknown as { __pluginImport: (url: string) => Promise<unknown> }).__pluginImport = vi.fn(
      async (url: string) => ({ default: url.includes('provider') ? providerActivate : consumerActivate }),
    )

    const { PluginHost } = await import('./PluginHost')
    const onPluginUnloaded = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onPluginUnloaded={onPluginUnloaded}
      />,
    )

    await waitFor(() => expect(consumerActivate).toHaveBeenCalledOnce())
    expect(providerActivate).toHaveBeenCalledOnce()
    expect(clients[0]).not.toBeNull()

    loadable = [{ manifest: consumerManifest, entryUrl: 'plugin://consumer' }]
    ;(uninstalledListener as ((pluginId: string) => void) | null)?.('provider')

    await waitFor(() => expect(consumerActivate).toHaveBeenCalledTimes(2))
    expect(providerTeardown).toHaveBeenCalledOnce()
    expect(onPluginUnloaded).toHaveBeenCalledWith('provider')
    expect(clients[1]).toBeNull()
  })

  it('disposes subscriptions made before activate throws', async () => {
    const unsub = vi.fn()
    const activate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.onCurrentItem(() => {})
      throw new Error('boom')
    })
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))
    const onError = vi.fn()
    const { PluginHost } = await import('./PluginHost')
    installedList.push({ manifest, entryUrl: 'file:///fake/plugin.js' })
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => unsub}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onTabsChange={() => {}}
        onPluginError={onError}
      />,
    )
    await waitFor(() => expect(onError).toHaveBeenCalledWith('hello', expect.any(Error)))
    expect(unsub).toHaveBeenCalled()
  })

  it('disposes tracked subscriptions and the teardown fn on uninstall', async () => {
    const unsub = vi.fn()
    const teardown = vi.fn()
    const activate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.onCurrentItem(() => {})
      ctx.registerTab({ label: 'Hello', icon: '<svg/>', render: () => {} })
      return teardown
    })
    let installed = [{ manifest, entryUrl: 'file:///fake/plugin.js' }]
    let uninstalledListener: ((pluginId: string) => void) | null = null
    ;(window as unknown as { api: unknown }).api = {
      listInstalledPlugins: vi.fn(async () => installed),
      pluginStorageGet: vi.fn(async () => null),
      pluginStorageSet: vi.fn(async () => undefined),
      pluginStorageDelete: vi.fn(async () => undefined),
      pluginStorageKeys: vi.fn(async () => []),
      pluginRegisterHotkey: vi.fn(async () => undefined),
      pluginUnregisterHotkey: vi.fn(async () => undefined),
      pluginRegisterTab: vi.fn(async () => undefined),
      pluginUnregisterTab: vi.fn(async () => undefined),
      onLogLine: vi.fn(() => () => {}),
      onPluginMacro: vi.fn(() => () => {}),
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUpdated: vi.fn(() => () => {}),
      onPluginUninstalled: vi.fn((h: (pluginId: string) => void) => {
        uninstalledListener = h
        return () => {
          uninstalledListener = null
        }
      }),
      pluginTriggerMainHotkey: vi.fn(async () => null),
    }
    ;(window as unknown as { __pluginImport: (u: string) => Promise<unknown> }).__pluginImport = vi.fn(async () => ({
      default: activate,
    }))

    const { PluginHost } = await import('./PluginHost')
    const onTabsChange = vi.fn()
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Mirage"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => unsub}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
        onTabsChange={onTabsChange}
      />,
    )

    await waitFor(() => expect(activate).toHaveBeenCalled())
    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1]?.[0]
      expect(last).toHaveLength(1)
    })

    // Main drops the plugin from the list before it broadcasts the event.
    installed = []
    ;(uninstalledListener as ((pluginId: string) => void) | null)?.('hello')

    await waitFor(() => {
      const last = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1]?.[0]
      expect(last).toHaveLength(0)
    })
    expect(unsub).toHaveBeenCalled()
    expect(teardown).toHaveBeenCalled()
  })
})
