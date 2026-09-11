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

  it('retains a native plugin as unavailable outside Windows x64', () => {
    const plugin = entry('native-plugin', {
      nativeBackend: {
        protocolVersion: 1,
        contract: 'backend.binpb',
        service: 'example.native.v1.Backend',
        targets: { 'win32-x64': { file: 'worker.exe', sha256: 'a'.repeat(64) } },
      },
    })

    const result = resolvePluginLoadability([plugin], '1.0.0', { platform: 'linux', arch: 'x64' })

    expect(result.installed[0].availability).toEqual({
      status: 'unavailable',
      reason: {
        code: 'native-platform-incompatible',
        supportedTarget: 'win32-x64',
        currentTarget: 'linux-x64',
        message: 'native backends require win32-x64 (running linux-x64)',
      },
    })
    expect(result.loadable).toEqual([])
  })

  it('propagates native platform incompatibility to required consumers', () => {
    const provider = entry('native-provider', {
      api: {
        version: '1.0.0',
        contract: 'api.binpb',
        service: 'example.native.v1.Provider',
      },
      nativeBackend: {
        protocolVersion: 1,
        contract: 'backend.binpb',
        service: 'example.native.v1.Backend',
        targets: { 'win32-x64': { file: 'worker.exe', sha256: 'a'.repeat(64) } },
      },
    })
    const consumer = entry('native-consumer', {
      dependencies: [{ pluginId: 'native-provider', apiVersion: '1.0.0' }],
    })

    const result = resolvePluginLoadability([consumer, provider], '1.0.0', { platform: 'darwin', arch: 'arm64' })

    expect(result.installed.find((plugin) => plugin.manifest.id === 'native-consumer')?.availability).toMatchObject({
      status: 'unavailable',
      reason: {
        code: 'required-dependency-unavailable',
        dependencyId: 'native-provider',
        cause: { code: 'native-platform-incompatible' },
      },
    })
    expect(result.loadable).toEqual([])
  })

  it('loads a native plugin on Windows x64', () => {
    const plugin = entry('native-plugin', {
      nativeBackend: {
        protocolVersion: 1,
        contract: 'backend.binpb',
        service: 'example.native.v1.Backend',
        targets: { 'win32-x64': { file: 'worker.exe', sha256: 'a'.repeat(64) } },
      },
    })

    const result = resolvePluginLoadability([plugin], '1.0.0', { platform: 'win32', arch: 'x64' })

    expect(result.loadable).toEqual([{ ...plugin, availability: { status: 'available' } }])
  })
})
