import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '../../../plugin-sdk/src/types'
import { planPluginLoad, type PluginEntry } from './plugin-dependencies'

function entry(id: string, extra: Partial<PluginManifest> = {}): PluginEntry {
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

describe('planPluginLoad', () => {
  it('orders providers before consumers regardless of install order', () => {
    const consumer = entry('consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: '1.0.0' }],
    })
    const provider = entry('provider', {
      api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
    })

    const plan = planPluginLoad([consumer, provider])

    expect(plan.errors.size).toBe(0)
    expect(plan.entries.map((candidate) => candidate.manifest.id)).toEqual(['provider', 'consumer'])
  })

  it('blocks missing and incompatible required dependencies', () => {
    const missing = entry('missing-consumer', {
      dependencies: [{ pluginId: 'missing-provider', apiVersion: '1.0.0' }],
    })
    const incompatible = entry('version-consumer', {
      dependencies: [{ pluginId: 'provider', apiVersion: '2.0.0' }],
    })
    const provider = entry('provider', {
      api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Provider' },
    })

    const plan = planPluginLoad([missing, incompatible, provider])

    expect(plan.errors.get('missing-consumer')?.message).toContain('not installed')
    expect(plan.errors.get('version-consumer')?.message).toContain('does not provide')
    expect(plan.entries.map((candidate) => candidate.manifest.id)).toEqual(['provider'])
  })

  it('allows unavailable optional dependencies', () => {
    const consumer = entry('consumer', {
      dependencies: [{ pluginId: 'optional-provider', apiVersion: '1.0.0', optional: true }],
    })

    const plan = planPluginLoad([consumer])

    expect(plan.errors.size).toBe(0)
    expect(plan.entries).toEqual([consumer])
  })

  it('rejects dependency cycles before activation', () => {
    const first = entry('first', {
      api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.First' },
      dependencies: [{ pluginId: 'second', apiVersion: '1.0.0' }],
    })
    const second = entry('second', {
      api: { version: '1.0.0', contract: 'api.binpb', service: 'example.v1.Second' },
      dependencies: [{ pluginId: 'first', apiVersion: '1.0.0' }],
    })

    const plan = planPluginLoad([first, second])

    expect(plan.entries).toEqual([])
    expect(plan.errors.get('first')?.message).toContain('cycle')
    expect(plan.errors.get('second')?.message).toContain('cycle')
  })
})
