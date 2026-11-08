import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '../plugin-sdk/src/types'
import { apiVersionSatisfies, resolvePluginDependencies, type PluginLoadEntry } from './plugin-dependencies'

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

describe('apiVersionSatisfies', () => {
  it('accepts same-major providers at or above the required version', () => {
    expect(apiVersionSatisfies('1.2.0', '1.2.0')).toBe(true)
    expect(apiVersionSatisfies('1.2.0', '1.2.5')).toBe(true)
    expect(apiVersionSatisfies('1.2.0', '1.9.0')).toBe(true)
  })

  it('rejects older providers, other majors and missing APIs', () => {
    expect(apiVersionSatisfies('1.2.0', '1.1.9')).toBe(false)
    expect(apiVersionSatisfies('1.2.0', '2.0.0')).toBe(false)
    expect(apiVersionSatisfies('2.0.0', '1.9.9')).toBe(false)
    expect(apiVersionSatisfies('1.0.0', null)).toBe(false)
    expect(apiVersionSatisfies('1.0.0', undefined)).toBe(false)
  })

  it('treats each 0.y minor as its own major', () => {
    expect(apiVersionSatisfies('0.2.0', '0.2.7')).toBe(true)
    expect(apiVersionSatisfies('0.2.0', '0.3.0')).toBe(false)
  })
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

  it('returns structured missing and incompatible API version reasons', () => {
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

  it('accepts a newer compatible provider and rejects an older minor', () => {
    const result = resolvePluginDependencies([
      entry('compatible-consumer', {
        dependencies: [{ pluginId: 'provider', apiVersion: '1.2.0' }],
      }),
      entry('ahead-consumer', {
        dependencies: [{ pluginId: 'provider', apiVersion: '1.4.0' }],
      }),
      entry('provider', { api: api('1.3.1') }),
    ])

    expect(result.availability.get('compatible-consumer')).toEqual({ status: 'available' })
    expect(result.availability.get('ahead-consumer')).toMatchObject({
      status: 'unavailable',
      reason: { code: 'api-version-mismatch', requiredApiVersion: '1.4.0', installedApiVersion: '1.3.1' },
    })
    expect(result.entries.map((candidate) => candidate.manifest.id)).toEqual(['provider', 'compatible-consumer'])
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
