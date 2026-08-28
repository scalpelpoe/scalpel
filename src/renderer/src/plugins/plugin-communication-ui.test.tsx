// @vitest-environment jsdom

import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPluginServiceClient, exposePluginService } from '../../../plugin-sdk/src/protobuf'
import type { PluginActivate, PluginManifest } from '../../../plugin-sdk/src/types'
import type { RegisteredTab } from './PluginHost'
import { GreetingProvider } from '../../../../plugin-service-examples/greeting-consumer/src/generated/greeting_pb'

const providerManifest: PluginManifest = {
  manifestVersion: 1,
  id: 'greeting-provider',
  version: '1.0.0',
  name: 'Greeting Provider',
  description: 'test provider',
  author: 'test',
  scalpelMinVersion: '>=0.0.0',
  api: {
    version: '1.0.0',
    contract: 'api.binpb',
    service: 'scalpel.examples.greeting.v1.GreetingProvider',
  },
}

const consumerManifest: PluginManifest = {
  manifestVersion: 1,
  id: 'greeting-consumer',
  version: '1.0.0',
  name: 'Greeting Consumer',
  description: 'test consumer',
  author: 'test',
  scalpelMinVersion: '>=0.0.0',
  dependencies: [{ pluginId: 'greeting-provider', apiVersion: '1.0.0' }],
}

beforeEach(() => {
  vi.resetModules()
  ;(window as unknown as { api: unknown }).api = {
    listInstalledPlugins: vi.fn(async () => [
      { manifest: consumerManifest, entryUrl: 'plugin://consumer' },
      { manifest: providerManifest, entryUrl: 'plugin://provider' },
    ]),
    getSettings: vi.fn(async () => null),
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
    onPluginDevInstalled: vi.fn(() => () => {}),
    onPluginDevUninstalled: vi.fn(() => () => {}),
    onPluginDevUpdated: vi.fn(() => () => {}),
  }
})

describe('plugin communication UI slice', () => {
  it('loads reverse-ordered plugins, renders the consumer, and calls the provider', async () => {
    const activationOrder: string[] = []
    const provider: PluginActivate = (ctx) => {
      activationOrder.push(ctx.pluginId)
      exposePluginService(ctx.plugins, GreetingProvider, {
        greet(request) {
          return { message: `Hello, ${request.name}!` }
        },
      })
      ctx.registerTab({ label: 'Provider', icon: '<svg/>', render: () => {} })
    }
    const consumer: PluginActivate = (ctx) => {
      activationOrder.push(ctx.pluginId)
      const client = createPluginServiceClient(ctx.plugins, 'greeting-provider', GreetingProvider)
      ctx.registerTab({
        label: 'Consumer',
        icon: '<svg/>',
        render: (container) => {
          const button = document.createElement('button')
          const result = document.createElement('p')
          button.textContent = 'Ask provider'
          button.addEventListener('click', () => {
            void client.greet({ name: 'Exile' }).then((response) => {
              result.textContent = response.message
            })
          })
          container.append(button, result)
        },
      })
    }
    ;(window as unknown as { __pluginImport: (url: string) => Promise<{ default: PluginActivate }> }).__pluginImport =
      vi.fn(async (url: string) => ({ default: url.endsWith('provider') ? provider : consumer }))

    const { PluginHost } = await import('./PluginHost')
    const { PluginTabHost } = await import('./PluginTabHost')
    let tabs: RegisteredTab[] = []
    render(
      <PluginHost
        ready
        poeVersion={1}
        league="Standard"
        currentItem={null}
        currentZone={null}
        onSubscribeCurrentItem={() => () => {}}
        onSubscribeCurrentZone={() => () => {}}
        onSubscribeLeagueChange={() => () => {}}
        onOpenExternal={() => {}}
        onTabsChange={(next) => {
          tabs = next
        }}
        onOpenPluginTab={() => {}}
        onCopyAndEvaluateItem={async () => null}
      />,
    )

    await waitFor(() => expect(tabs).toHaveLength(2))
    expect(activationOrder).toEqual(['greeting-provider', 'greeting-consumer'])

    const view = render(<PluginTabHost pluginTabs={tabs} activeId="greeting-consumer" />)
    fireEvent.click(view.getByRole('button', { name: 'Ask provider' }))
    await act(async () => {})
    await waitFor(() => expect(view.getByText('Hello, Exile!')).toBeInTheDocument())
  }, 15_000)
})
