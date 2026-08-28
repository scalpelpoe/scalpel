import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import { validateDependencyMutation } from './dependency-mutation'

const manifest = (id: string, extra: Partial<PluginManifest> = {}): PluginManifest => ({
  manifestVersion: 1,
  id,
  version: '1.0.0',
  name: id,
  description: id,
  author: 'test',
  scalpelMinVersion: '>=0.0.0',
  ...extra,
})

describe('validateDependencyMutation', () => {
  it('rejects uninstalling a required provider', () => {
    const provider = manifest('provider', { api: { version: 'v1', contract: 'api.binpb', service: 'demo.Api' } })
    const consumer = manifest('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: 'v1' }],
    })

    expect(validateDependencyMutation([provider, consumer], 'provider', null)).toMatch(
      /consumer.*requires plugin.*provider/,
    )
  })

  it('rejects an update that changes an API required by an installed consumer', () => {
    const provider = manifest('provider', { api: { version: 'v1', contract: 'api.binpb', service: 'demo.Api' } })
    const consumer = manifest('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: 'v1' }],
    })
    const incompatible = manifest('provider', {
      version: '2.0.0',
      api: { version: 'v2', contract: 'api.binpb', service: 'demo.Api' },
    })

    expect(validateDependencyMutation([provider, consumer], 'provider', incompatible)).toMatch(/requires API v1/)
  })

  it('accepts optional missing dependencies', () => {
    const consumer = manifest('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: 'v1', optional: true }],
    })

    expect(validateDependencyMutation([], 'consumer', consumer)).toBeNull()
  })

  it('rejects a required provider unavailable for one of the consumer games', () => {
    const provider = manifest('provider', {
      poeVersions: [2],
      api: { version: '1.0.0', contract: 'api.binpb', service: 'demo.Api' },
    })
    const consumer = manifest('consumer', {
      poeVersions: [1],
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    })

    expect(validateDependencyMutation([provider], 'consumer', consumer)).toMatch(/unsupported PoE version/)
  })

  it('rejects changing a consumed service without changing its API version', () => {
    const provider = manifest('provider', {
      api: { version: '1.0.0', contract: 'api.binpb', service: 'demo.Api' },
    })
    const consumer = manifest('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0', optional: true }],
    })
    const replacement = manifest('provider', {
      version: '2.0.0',
      api: { version: '1.0.0', contract: 'api.binpb', service: 'demo.OtherApi' },
    })

    expect(validateDependencyMutation([provider, consumer], 'provider', replacement)).toMatch(
      /cannot change service without changing its API version/,
    )
  })
})
