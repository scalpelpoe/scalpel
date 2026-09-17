import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '../plugin-sdk/src/types'
import { resolvePluginDependencies, type PluginLoadEntry } from './plugin-dependencies'

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

const api = (version: string): PluginManifest['api'] => ({
  version,
  contract: 'api.binpb',
  service: 'example.v1.Provider',
})

describe('resolvePluginDependencies', () => {
  it('orders providers first and gives every plugin an availability status', () => {
    const consumer = entry('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    })
    const provider = entry('provider', { api: api('1.0.0') })

    const result = resolvePluginDependencies([consumer, provider])

    expect(result.entries.map((candidate) => candidate.manifest.id)).toEqual(['provider', 'consumer'])
    expect(result.availability.get('consumer')).toEqual({
      status: 'available',
    })
  })

  it('returns structured missing and exact API mismatch reasons', () => {
    const result = resolvePluginDependencies([
      entry('missing-consumer', {
        dependencies: [{ pluginId: 'absent', apiVersion: '1.0.0' }],
      }),
      entry('mismatch-consumer', {
        dependencies: [{ pluginId: 'provider', apiVersion: '2.0.0' }],
      }),
      entry('provider', { api: api('1.0.0') }),
    ])

    expect(result.availability.get('missing-consumer')).toMatchObject({
      status: 'unavailable',
      reason: { code: 'missing-required-dependency', dependencyId: 'absent' },
    })
    expect(result.availability.get('mismatch-consumer')).toMatchObject({
      status: 'unavailable',
      reason: { code: 'api-version-mismatch', installedApiVersion: '1.0.0' },
    })
    expect(result.entries.map((candidate) => candidate.manifest.id)).toEqual(['provider'])
  })

  it('does not block for optional missing or mismatched providers', () => {
    const consumer = entry('consumer', {
      dependencies: [
        { pluginId: 'absent', apiVersion: '1.0.0', optional: true },
        { pluginId: 'provider', apiVersion: '2.0.0', optional: true },
      ],
    })
    const result = resolvePluginDependencies([consumer, entry('provider', { api: api('1.0.0') })])

    expect(result.availability.get('consumer')).toEqual({
      status: 'available',
    })
    expect(result.entries).toContain(consumer)
  })

  it('orders an installed compatible optional provider before its consumer', () => {
    const consumer = entry('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0', optional: true }],
    })
    const provider = entry('provider', { api: api('1.0.0') })

    const result = resolvePluginDependencies([consumer, provider])

    expect(result.entries.map((candidate) => candidate.manifest.id)).toEqual(['provider', 'consumer'])
  })

  it('marks cycle members and transitively blocked consumers', () => {
    const first = entry('first', {
      api: api('1.0.0'),
      dependencies: [{ pluginId: 'second', apiVersion: '1.0.0' }],
    })
    const second = entry('second', {
      api: api('1.0.0'),
      dependencies: [{ pluginId: 'first', apiVersion: '1.0.0' }],
    })
    const consumer = entry('consumer', {
      dependencies: [{ pluginId: 'first', apiVersion: '1.0.0' }],
    })

    const result = resolvePluginDependencies([consumer, first, second])

    expect(result.entries).toEqual([])
    expect(result.availability.get('first')).toMatchObject({
      status: 'unavailable',
      reason: { code: 'dependency-cycle' },
    })
    expect(result.availability.get('consumer')).toMatchObject({
      status: 'unavailable',
      reason: {
        code: 'required-dependency-unavailable',
        dependencyId: 'first',
        cause: { code: 'dependency-cycle' },
      },
    })
  })
})
