import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '../../../plugin-sdk/src/types'
import { createSecondaryPluginCommunicationApi } from './secondary-plugin-communication'

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

const provider = manifest('provider', {
  api: { version: '2.1.0', contract: 'api.binpb', service: 'example.v1.Provider' },
})

describe('createSecondaryPluginCommunicationApi', () => {
  it('accepts the declared expose call as a no-op', () => {
    const api = createSecondaryPluginCommunicationApi(provider)
    expect(api.expose('example.v1.Provider', () => null)).toBeUndefined()
    // A second window re-activating the same provider must not collide either.
    expect(() => api.expose('example.v1.Provider', () => null)).not.toThrow()
  })

  it('rejects an expose the manifest does not declare', () => {
    expect(() => createSecondaryPluginCommunicationApi(manifest('plain')).expose('example.v1.Provider', () => null)) //
      .toThrow(/not declared/)
    expect(() => createSecondaryPluginCommunicationApi(provider).expose('example.v1.Other', () => null)).toThrow(
      /cannot expose service "example.v1.Other"; manifest declares "example.v1.Provider"/,
    )
  })

  it('rejects a get for an undeclared dependency', () => {
    expect(() => createSecondaryPluginCommunicationApi(manifest('consumer')).get('provider', 'example.v1.Provider')) //
      .toThrow(/dependency "provider" is not declared/)
  })

  it('returns null for a declared optional dependency', () => {
    const api = createSecondaryPluginCommunicationApi(
      manifest('consumer', { dependencies: [{ pluginId: 'provider', apiVersion: '2.1.0', optional: true }] }),
    )
    expect(api.get('provider', 'example.v1.Provider')).toBeNull()
  })

  it('returns a client for a required dependency whose calls reject', async () => {
    const api = createSecondaryPluginCommunicationApi(
      manifest('consumer', { dependencies: [{ pluginId: 'provider', apiVersion: '2.1.0' }] }),
    )

    const client = api.get('provider', 'example.v1.Provider')

    expect(client).not.toBeNull()
    expect(client).toMatchObject({
      pluginId: 'provider',
      apiVersion: '2.1.0',
      serviceTypeName: 'example.v1.Provider',
    })
    await expect(client!.call('/example.v1.Provider/Echo', { value: 1 })).rejects.toThrow(
      /plugin API "provider" is not available in secondary overlay windows/,
    )
  })
})
