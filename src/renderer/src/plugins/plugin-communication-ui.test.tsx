// @vitest-environment jsdom

import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPluginServiceClient, exposePluginService } from '../../../plugin-sdk/src/protobuf'
import type { PluginActivate, PluginManifest } from '../../../plugin-sdk/src/types'
import type { RegisteredTab } from './PluginHost'
import { GreetingProvider } from '../../../../plugin-service-examples/greeting-relay/src/generated/provider/greeting_pb'
import { GreetingRelay } from '../../../../plugin-service-examples/greeting-consumer/src/generated/greeting_relay_pb'

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

const relayManifest: PluginManifest = {
  manifestVersion: 1,
  id: 'greeting-relay',
  version: '1.0.0',
  name: 'Greeting Relay',
  description: 'test relay',
  author: 'test',
  scalpelMinVersion: '>=0.0.0',
  api: {
    version: '1.0.0',
    contract: 'api.binpb',
    service: 'scalpel.examples.greeting.relay.v1.GreetingRelay',
  },
  dependencies: [{ pluginId: 'greeting-provider', apiVersion: '1.0.0' }],
}

const consumerManifest: PluginManifest = {
  manifestVersion: 1,
  id: 'greeting-consumer',
  version: '1.0.0',
  name: 'Greeting Consumer',
  description: 'test consumer',
  author: 'test',
  scalpelMinVersion: '>=0.0.0',
  dependencies: [{ pluginId: 'greeting-relay', apiVersion: '1.0.0' }],
}

beforeEach(() => {
  vi.resetModules()
  ;(window as unknown as { api: unknown }).api = {
    listInstalledPlugins: vi.fn(async () => [
      { manifest: consumerManifest, entryUrl: 'plugin://consumer' },
      { manifest: relayManifest, entryUrl: 'plugin://relay' },
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
  it('loads a reverse-ordered provider-relay-consumer chain and renders both UI plugins', async () => {
    const activationOrder: string[] = []
    const provider: PluginActivate = (ctx) => {
      activationOrder.push(ctx.pluginId)
      exposePluginService(ctx.plugins, GreetingProvider, {
        getLastSeenCharacter() {
          return {
            result: {
              case: 'character',
              value: { name: 'Exile' },
            },
          }
        },
      })
    }
    const relay: PluginActivate = (ctx) => {
      activationOrder.push(ctx.pluginId)
      const providerClient = createPluginServiceClient(ctx.plugins, 'greeting-provider', GreetingProvider)
      exposePluginService(ctx.plugins, GreetingRelay, {
        async getGreeting() {
          const character = await providerClient.getLastSeenCharacter()
          const name = character.result.case === 'character' ? character.result.value.name : 'Unknown'
          return {
            result: {
              case: 'greeting',
              value: {
                message: `${name} says Stay sane`,
                characterName: name,
                submittedMessage: 'Stay sane',
              },
            },
          }
        },
      })
      ctx.registerTab({ label: 'Relay', icon: '<svg/>', render: () => {} })
    }
    const consumer: PluginActivate = (ctx) => {
      activationOrder.push(ctx.pluginId)
      const client = createPluginServiceClient(ctx.plugins, 'greeting-relay', GreetingRelay)
      ctx.registerTab({
        label: 'Consumer',
        icon: '<svg/>',
        render: (container) => {
          const button = document.createElement('button')
          const result = document.createElement('p')
          button.textContent = 'Ask relay'
          button.addEventListener('click', () => {
            void client.getGreeting().then((response) => {
              result.textContent = response.result.case === 'greeting' ? response.result.value.message : 'Unavailable'
            })
          })
          container.append(button, result)
        },
      })
    }
    ;(window as unknown as { __pluginImport: (url: string) => Promise<{ default: PluginActivate }> }).__pluginImport =
      vi.fn(async (url: string) => ({
        default: url.endsWith('provider') ? provider : url.endsWith('relay') ? relay : consumer,
      }))

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
    expect(activationOrder).toEqual(['greeting-provider', 'greeting-relay', 'greeting-consumer'])

    const view = render(<PluginTabHost pluginTabs={tabs} activeId="greeting-consumer" />)
    fireEvent.click(view.getByRole('button', { name: 'Ask relay' }))
    await act(async () => {})
    await waitFor(() => expect(view.getByText('Exile says Stay sane')).toBeInTheDocument())
  }, 15_000)
})
