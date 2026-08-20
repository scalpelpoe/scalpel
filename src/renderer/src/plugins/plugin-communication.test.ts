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
      .expose(handler)
    const consumer = runtime.createApi(
      manifest('consumer', {
        dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
      }),
    )

    const client = consumer.get('provider')
    const request = { value: 42 }
    const pending = client!.call<{ echoed: { value: number } }>('echo', request)

    expect(handler).not.toHaveBeenCalled()
    await expect(pending).resolves.toEqual({ echoed: { value: 42 } })
    expect(handler).toHaveBeenCalledWith('echo', request)
  })

  it('rejects undeclared access and undeclared providers', () => {
    const runtime = new PluginCommunicationRuntime()
    expect(() => runtime.createApi(manifest('consumer')).get('provider')).toThrow(/not declared/)
    expect(() => runtime.createApi(manifest('provider')).expose(() => null)).toThrow(/not declared/)
  })

  it('returns null for an unavailable optional dependency', () => {
    const runtime = new PluginCommunicationRuntime()
    const consumer = runtime.createApi(
      manifest('consumer', {
        dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0', optional: true }],
      }),
    )
    expect(consumer.get('provider')).toBeNull()
  })

  it('invalidates clients when a provider unloads', async () => {
    const runtime = new PluginCommunicationRuntime()
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose(() => 'ok')
    const client = runtime
      .createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
        }),
      )
      .get('provider')!

    runtime.remove('provider')

    await expect(client.call('echo')).rejects.toThrow(/unavailable/)
  })

  it('rejects values that cannot cross a future transport boundary', async () => {
    const runtime = new PluginCommunicationRuntime()
    runtime
      .createApi(
        manifest('provider', {
          api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
        }),
      )
      .expose(() => null)
    const client = runtime
      .createApi(
        manifest('consumer', {
          dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
        }),
      )
      .get('provider')!

    await expect(client.call('echo', () => {})).rejects.toThrow(/structured-cloneable/)
  })
})
