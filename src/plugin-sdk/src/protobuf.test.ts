import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { describe, expect, it, vi } from 'vitest'
import {
  GetLastSeenCharacterRequestSchema,
  GetLastSeenCharacterResponseSchema,
  GreetingProvider,
} from '../../../plugin-service-examples/greeting-provider/src/generated/greeting_pb'
import {
  createNativeServiceClient,
  createPluginServiceClient,
  exposePluginService,
  getPluginServiceClient,
} from './protobuf'
import type { PluginApiHandler, PluginCommunicationApi, PluginNativeBackendApi } from './types'

describe('Protobuf service adapters', () => {
  it('maps a generated service to typed object provider and client calls', async () => {
    let handler: PluginApiHandler | null = null
    const provider: PluginCommunicationApi = {
      expose: (serviceTypeName, value) => {
        expect(serviceTypeName).toBe(GreetingProvider.typeName)
        handler = value
      },
      get: () => null,
    }
    exposePluginService(provider, GreetingProvider, {
      getLastSeenCharacter() {
        return { result: { case: 'character', value: { name: 'Exile' } } }
      },
    })
    const consumer: PluginCommunicationApi = {
      expose: vi.fn(),
      get: () => ({
        pluginId: 'greeting-provider',
        apiVersion: '2.0.0',
        serviceTypeName: GreetingProvider.typeName,
        call: async <TResult>(method: string, params?: unknown): Promise<TResult> =>
          Promise.resolve(handler!(method, params)) as Promise<TResult>,
      }),
    }

    const client = createPluginServiceClient(consumer, 'greeting-provider', GreetingProvider)
    await expect(client.getLastSeenCharacter()).resolves.toMatchObject({
      result: { case: 'character', value: { name: 'Exile' } },
    })
  })

  it('forwards the generated service type when resolving a client', () => {
    const get = vi.fn(() => null)
    getPluginServiceClient({ expose: vi.fn(), get }, 'greeting-provider', GreetingProvider)

    expect(get).toHaveBeenCalledWith('greeting-provider', GreetingProvider.typeName)
  })

  it('rejects incomplete implementations before exposing the service', () => {
    const expose = vi.fn()
    expect(() =>
      exposePluginService(
        { expose, get: vi.fn() },
        GreetingProvider,
        {} as Parameters<typeof exposePluginService<typeof GreetingProvider>>[2],
      ),
    ).toThrow(/not implemented/)
    expect(expose).not.toHaveBeenCalled()
  })

  it('encodes and decodes native service payloads', async () => {
    const native: PluginNativeBackendApi = {
      async call(method, payload) {
        expect(method).toBe('/scalpel.examples.greeting.v1.GreetingProvider/GetLastSeenCharacter')
        fromBinary(GetLastSeenCharacterRequestSchema, payload)
        return toBinary(
          GetLastSeenCharacterResponseSchema,
          create(GetLastSeenCharacterResponseSchema, {
            result: { case: 'character', value: { name: 'Native Exile' } },
          }),
        )
      },
    }

    const client = createNativeServiceClient(native, GreetingProvider)
    await expect(client.getLastSeenCharacter()).resolves.toMatchObject({
      result: { case: 'character', value: { name: 'Native Exile' } },
    })
  })
})
