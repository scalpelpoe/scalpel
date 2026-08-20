import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { describe, expect, it, vi } from 'vitest'
import {
  GreetRequestSchema,
  GreetResponseSchema,
  GreetingProvider,
} from '../../../plugin-service-examples/greeting-provider/src/generated/greeting_pb'
import { createNativeServiceClient, createPluginServiceClient, exposePluginService } from './protobuf'
import type { PluginApiHandler, PluginCommunicationApi, PluginNativeBackendApi } from './types'

describe('Protobuf service adapters', () => {
  it('maps a generated service to typed object provider and client calls', async () => {
    let handler: PluginApiHandler | null = null
    const provider: PluginCommunicationApi = {
      expose: (value) => {
        handler = value
      },
      get: () => null,
    }
    exposePluginService(provider, GreetingProvider, {
      greet(request) {
        return { message: `Hello, ${request.name}`, calls: 1 }
      },
    })
    const consumer: PluginCommunicationApi = {
      expose: vi.fn(),
      get: () => ({
        pluginId: 'greeting-provider',
        apiVersion: '1.0.0',
        call: async <TResult>(method: string, params?: unknown): Promise<TResult> =>
          Promise.resolve(handler!(method, params)) as Promise<TResult>,
      }),
    }

    const client = createPluginServiceClient(consumer, 'greeting-provider', GreetingProvider)
    await expect(client.greet({ name: 'Exile' })).resolves.toMatchObject({ message: 'Hello, Exile', calls: 1 })
  })

  it('encodes and decodes native service payloads', async () => {
    const native: PluginNativeBackendApi = {
      async call(method, payload) {
        expect(method).toBe('/scalpel.examples.greeting.v1.GreetingProvider/Greet')
        const request = fromBinary(GreetRequestSchema, payload)
        return toBinary(
          GreetResponseSchema,
          create(GreetResponseSchema, { message: `Native ${request.name}`, calls: 2 }),
        )
      },
    }

    const client = createNativeServiceClient(native, GreetingProvider)
    await expect(client.greet({ name: 'Exile' })).resolves.toMatchObject({ message: 'Native Exile', calls: 2 })
  })
})
