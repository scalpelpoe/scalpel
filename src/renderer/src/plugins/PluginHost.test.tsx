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
    pluginTriggerMainHotkey: vi.fn(async () => null),
    onPluginMacro: vi.fn((h: (action: string) => void) => {
      pluginMacroListener = h
      return () => {
        pluginMacroListener = null
      }
    }),
    onPluginInstalled: vi.fn(() => () => {}),
    onPluginUninstalled: vi.fn(() => () => {}),
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
    ;(window as unknown as { api: unknown }).api = {
      listInstalledPlugins: vi.fn(async () => []),
      pluginStorageGet: vi.fn(async () => null),
      pluginStorageSet: vi.fn(async () => undefined),
      pluginStorageDelete: vi.fn(async () => undefined),
      pluginStorageKeys: vi.fn(async () => []),
      pluginRegisterHotkey: vi.fn(async () => undefined),
      pluginUnregisterHotkey: vi.fn(async () => undefined),
      onPluginMacro: vi.fn(() => () => {}),
      onPluginInstalled: vi.fn((h: (entry: unknown) => void) => {
        installedListener = h
        return () => {
          installedListener = null
        }
      }),
      onPluginUninstalled: vi.fn(() => () => {}),
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
    await waitFor(() => expect(onTabsChange.mock.calls.at(-1)?.[0]).toEqual([]))

    // Fire the install event.
    ;(installedListener as ((entry: unknown) => void) | null)?.({
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
    })

    await waitFor(() => expect(activate).toHaveBeenCalled())
    await waitFor(() => {
      const last = onTabsChange.mock.calls.at(-1)?.[0]
      expect(last).toHaveLength(1)
      expect(last[0].pluginId).toBe('late')
    })
  })

  it('unloads an uninstalled plugin without restart', async () => {
    const activate = vi.fn((ctx: ScalpelPluginContext) => {
      ctx.registerTab({ label: 'Hello', icon: '<svg/>', render: () => {} })
    })
    let uninstalledListener: ((pluginId: string) => void) | null = null
    ;(window as unknown as { api: unknown }).api = {
      listInstalledPlugins: vi.fn(async () => [{ manifest, entryUrl: 'file:///fake/plugin.js' }]),
      pluginStorageGet: vi.fn(async () => null),
      pluginStorageSet: vi.fn(async () => undefined),
      pluginStorageDelete: vi.fn(async () => undefined),
      pluginStorageKeys: vi.fn(async () => []),
      pluginRegisterHotkey: vi.fn(async () => undefined),
      pluginUnregisterHotkey: vi.fn(async () => undefined),
      onPluginMacro: vi.fn(() => () => {}),
      onPluginInstalled: vi.fn(() => () => {}),
      onPluginUninstalled: vi.fn((h: (pluginId: string) => void) => {
        uninstalledListener = h
        return () => {
          uninstalledListener = null
        }
      }),
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
      const last = onTabsChange.mock.calls.at(-1)?.[0]
      expect(last).toHaveLength(1)
      expect(last[0].pluginId).toBe('hello')
    })

    // Fire the uninstall event.
    ;(uninstalledListener as ((pluginId: string) => void) | null)?.('hello')

    await waitFor(() => {
      const last = onTabsChange.mock.calls.at(-1)?.[0]
      expect(last).toHaveLength(0)
    })
    expect(onPluginUnloaded).toHaveBeenCalledWith('hello')
    expect(window.api.pluginUnregisterHotkey).toHaveBeenCalledWith('hello')
  })
})
