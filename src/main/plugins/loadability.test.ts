import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import type { PluginLoadEntry } from '@shared/plugin-dependencies'
import { resolvePluginLoadability } from './loadability'

function entry(id: string, extra: Partial<PluginManifest> = {}): PluginLoadEntry {
  return {
    manifest: {
      manifestVersion: 1,
      id,
      version: '1.0.0',
      name: id,
      description: id,
      author: 'test',
      scalpelMinVersion: '>=0.0.0',
      ...extra,
    },
    entryUrl: `scalpel-plugin://${id}/plugin.js`,
  }
}

describe('resolvePluginLoadability', () => {
  it('retains dangling plugins in installed results and excludes them from loadable results', () => {
    const consumer = entry('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    })

    const result = resolvePluginLoadability([consumer], '1.0.0')

    expect(result.installed).toHaveLength(1)
    expect(result.installed[0].availability).toMatchObject({
      status: 'unavailable',
      reason: { code: 'missing-required-dependency' },
    })
    expect(result.loadable).toEqual([])
  })

  it('makes a previously dangling consumer loadable after its provider appears', () => {
    const consumer = entry('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    })
    const provider = entry('provider', {
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.v1.Provider',
      },
    })

    const result = resolvePluginLoadability([consumer, provider], '1.0.0')

    expect(result.loadable.map((plugin) => plugin.manifest.id)).toEqual(['provider', 'consumer'])
    expect(result.installed.every((plugin) => plugin.availability.status === 'available')).toBe(true)
  })

  it('retains a host-incompatible plugin as installed but excludes it from activation', () => {
    const plugin = entry('future-plugin', { scalpelMinVersion: '>=2.0.0 <3.0.0' })

    const result = resolvePluginLoadability([plugin], '1.9.9')

    expect(result.installed).toHaveLength(1)
    expect(result.installed[0].availability).toEqual({
      status: 'unavailable',
      reason: {
        code: 'scalpel-version-incompatible',
        requiredVersion: '>=2.0.0 <3.0.0',
        currentVersion: '1.9.9',
        message: 'requires Scalpel version >=2.0.0 <3.0.0 (running 1.9.9)',
      },
    })
    expect(result.loadable).toEqual([])
  })

  it('propagates host incompatibility through required plugin dependencies', () => {
    const provider = entry('provider', {
      scalpelMinVersion: '^2.0.0',
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.v1.Provider',
      },
    })
    const consumer = entry('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    })

    const result = resolvePluginLoadability([consumer, provider], '1.9.9')

    expect(result.installed.find((plugin) => plugin.manifest.id === 'consumer')?.availability).toMatchObject({
      status: 'unavailable',
      reason: {
        code: 'required-dependency-unavailable',
        dependencyId: 'provider',
        cause: { code: 'scalpel-version-incompatible' },
      },
    })
    expect(result.loadable).toEqual([])
  })
})
