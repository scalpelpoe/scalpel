import { describe, expect, it, vi } from 'vitest'
import type { PluginManifest } from '../../../plugin-sdk/src/types'
import { PluginCommunicationRuntime } from './plugin-communication'

function manifest(id: string, extra: Partial<PluginManifest> = {}): PluginManifest {
  return {
    manifestVersion: 1,
    id,
    version: '1.0.0',
    name: id,
    description: id,
    author: 'test',
    scalpelMinVersion: '>=0.0.0',
    ...extra,
  }
}

describe('PluginCommunicationRuntime', () => {
  it('routes asynchronous calls to a declared provider', async () => {
    const runtime = new PluginCommunicationRuntime()
    const handler = vi.fn((_method: string, params: unknown) => ({ echoed: params }))
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose('example.v1.Provider', handler)
    const consumer = runtime.createApi(
      manifest('consumer', {
        dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
      }),
    )

    const client = consumer.get('provider', 'example.v1.Provider')
    const request = { value: 42 }
    const pending = client!.call<{ echoed: { value: number } }>('/example.v1.Provider/Echo', request)

    expect(handler).not.toHaveBeenCalled()
    await expect(pending).resolves.toEqual({ echoed: { value: 42 } })
    expect(handler).toHaveBeenCalledWith('/example.v1.Provider/Echo', request)
  })

  it('rejects undeclared access and undeclared providers', () => {
    const runtime = new PluginCommunicationRuntime()
    expect(() => runtime.createApi(manifest('consumer')).get('provider', 'example.v1.Provider')).toThrow(/not declared/)
    expect(() => runtime.createApi(manifest('provider')).expose('example.v1.Provider', () => null)).toThrow(
      /not declared/,
    )
  })

  it('returns null for an unavailable optional dependency', () => {
    const runtime = new PluginCommunicationRuntime()
    const consumer = runtime.createApi(
      manifest('consumer', {
        dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0', optional: true }],
      }),
    )
    expect(consumer.get('provider', 'example.v1.Provider')).toBeNull()
  })

  it('invalidates clients when a provider unloads', async () => {
    const runtime = new PluginCommunicationRuntime()
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose('example.v1.Provider', () => 'ok')
    const client = runtime
      .createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
        }),
      )
      .get('provider', 'example.v1.Provider')!

    runtime.remove('provider')

    await expect(client.call('/example.v1.Provider/Echo')).rejects.toThrow(/unavailable/)
  })

  it('rejects values that cannot cross a future transport boundary', async () => {
    const runtime = new PluginCommunicationRuntime()
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose('example.v1.Provider', () => null)
    const client = runtime
      .createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
        }),
      )
      .get('provider', 'example.v1.Provider')!

    await expect(client.call('/example.v1.Provider/Echo', () => {})).rejects.toThrow(/structured-cloneable/)
  })

  it('validates exposed and requested services against provider declarations', () => {
    const runtime = new PluginCommunicationRuntime()
    const provider = runtime.createApi(
      manifest('provider', {
        api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
      }),
    )
    expect(() => provider.expose('example.v1.Other', () => null)).toThrow(/manifest declares/)
    provider.expose('example.v1.Provider', () => null)

    const consumer = runtime.createApi(
      manifest('consumer', {
        dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
      }),
    )
    expect(() => consumer.get('provider', 'example.v1.Other')).toThrow(/does not expose service/)
  })

  it('validates the service method path on every call', async () => {
    const runtime = new PluginCommunicationRuntime()
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose('example.v1.Provider', () => null)
    const client = runtime
      .createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
        }),
      )
      .get('provider', 'example.v1.Provider')!

    await expect(client.call('/example.v1.Other/Echo')).rejects.toThrow(/canonical path/)
    await expect(client.call('/example.v1.Provider/')).rejects.toThrow(/canonical path/)
    await expect(client.call('Echo')).rejects.toThrow(/canonical path/)
  })

  it('invalidates a client when the provider service identity changes', async () => {
    const runtime = new PluginCommunicationRuntime()
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose('example.v1.Provider', () => 'old')
    const client = runtime
      .createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
        }),
      )
      .get('provider', 'example.v1.Provider')!

    runtime.remove('provider')
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Replacement' },
        }),
      )
      .expose('example.v1.Replacement', () => 'new')

    await expect(client.call('/example.v1.Provider/Echo')).rejects.toThrow(/unavailable/)
  })

  it('invalidates a client when the provider API version changes', async () => {
    const runtime = new PluginCommunicationRuntime()
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose('example.v1.Provider', () => 'old')
    const client = runtime
      .createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
        }),
      )
      .get('provider', 'example.v1.Provider')!

    runtime.remove('provider')
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '2.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose('example.v1.Provider', () => 'new')

    await expect(client.call('/example.v1.Provider/Echo')).rejects.toThrow(/unavailable/)
  })

  it('rejects malformed communication manifest identity fields', () => {
    const runtime = new PluginCommunicationRuntime()
    expect(() => runtime.createApi(manifest('BAD'))).toThrow(/manifest id/)
    expect(() =>
      runtime.createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '^1.0.0' }],
        }),
      ),
    ).toThrow(/dependency API version/)
    expect(() =>
      runtime.createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'not-qualified' },
        }),
      ),
    ).toThrow(/service type name/)
    expect(() =>
      runtime.createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0', optional: 'yes' as unknown as boolean }],
        }),
      ),
    ).toThrow(/optional flag/)
  })
})
