import { describe, expect, it } from 'vitest'
import { validateManifest } from './manifest-validator'

const valid = {
  manifestVersion: 1,
  id: 'jewel-economy',
  version: '1.0.0',
  name: 'Jewel Economy',
  description: 'Explore jewel pricing',
  author: 'someone',
  scalpelMinVersion: '>=0.20.0',
}

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const r = validateManifest(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.id).toBe('jewel-economy')
  })

  it('rejects when manifestVersion is missing', () => {
    const r = validateManifest({ ...valid, manifestVersion: undefined })
    expect(r.ok).toBe(false)
  })

  it('rejects unsupported manifestVersion', () => {
    const r = validateManifest({ ...valid, manifestVersion: 99 })
    expect(r.ok).toBe(false)
  })

  it('rejects ids with bad characters', () => {
    for (const bad of ['UPPER', 'has space', 'a', 'ab', '-leading-dash', '1leading-digit']) {
      const r = validateManifest({ ...valid, id: bad })
      expect(r.ok, `expected ${bad} to fail`).toBe(false)
    }
  })

  it('accepts well-formed ids', () => {
    for (const good of ['abc', 'jewel-economy', 'a1b', 'plugin-name-with-dashes']) {
      const r = validateManifest({ ...valid, id: good })
      expect(r.ok, `expected ${good} to pass`).toBe(true)
    }
  })

  it('accepts poeVersions when present and well-typed', () => {
    const r = validateManifest({ ...valid, poeVersions: [1, 2] })
    expect(r.ok).toBe(true)
  })

  it('rejects poeVersions with bad values', () => {
    const r = validateManifest({ ...valid, poeVersions: [3] })
    expect(r.ok).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(validateManifest(null).ok).toBe(false)
    expect(validateManifest('hi').ok).toBe(false)
    expect(validateManifest(42).ok).toBe(false)
  })

  it('reports the failure reason', () => {
    const r = validateManifest({ ...valid, id: 'BAD' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/id/)
  })

  it('accepts a declared API and explicit dependencies', () => {
    const r = validateManifest({
      ...valid,
      api: { version: '1.0.0', contract: 'api.binpb', service: 'example.greeting.v1.GreetingProvider' },
      dependencies: [{ pluginId: 'greeting-provider', apiVersion: '1.0.0' }],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects malformed API declarations and dependencies', () => {
    expect(
      validateManifest({
        ...valid,
        api: { version: '^1.0.0', contract: 'api.binpb', service: 'example.greeting.v1.GreetingProvider' },
      }).ok,
    ).toBe(false)
    expect(validateManifest({ ...valid, api: { version: '1.0.0' } }).ok).toBe(false)
    for (const contract of [
      '../api.binpb',
      'contracts/api.binpb',
      'C:\\api.binpb',
      'https://x/api.binpb',
      'CON.binpb',
      'lpt1.binpb',
    ]) {
      expect(
        validateManifest({
          ...valid,
          api: { version: '1.0.0', contract, service: 'example.greeting.v1.GreetingProvider' },
        }).ok,
      ).toBe(false)
    }
    expect(
      validateManifest({ ...valid, api: { version: '1.0.0', contract: 'api.binpb', service: 'not-qualified' } }).ok,
    ).toBe(false)
    expect(validateManifest({ ...valid, dependencies: 'greeting-provider' }).ok).toBe(false)
    expect(validateManifest({ ...valid, dependencies: [{ pluginId: 'BAD', apiVersion: '1.0.0' }] }).ok).toBe(false)
    expect(
      validateManifest({
        ...valid,
        dependencies: [
          { pluginId: 'greeting-provider', apiVersion: '1.0.0' },
          { pluginId: 'greeting-provider', apiVersion: '1.0.0' },
        ],
      }).ok,
    ).toBe(false)
  })

  it('rejects self dependencies', () => {
    expect(
      validateManifest({
        ...valid,
        dependencies: [{ pluginId: valid.id, apiVersion: '1.0.0' }],
      }).ok,
    ).toBe(false)
  })

  it('accepts a pinned Windows native backend', () => {
    expect(
      validateManifest({
        ...valid,
        nativeBackend: {
          protocolVersion: 1,
          contract: 'backend.binpb',
          service: 'example.items.v1.ItemAnalyzer',
          targets: { 'win32-x64': { file: 'item-analyzer.exe', sha256: 'a'.repeat(64) } },
        },
      }).ok,
    ).toBe(true)
  })

  it('rejects unsafe or unpinned native backend declarations', () => {
    const backend = {
      protocolVersion: 1,
      contract: 'backend.binpb',
      service: 'example.items.v1.ItemAnalyzer',
      targets: { 'win32-x64': { file: 'item-analyzer.exe', sha256: 'a'.repeat(64) } },
    }
    expect(validateManifest({ ...valid, nativeBackend: { ...backend, protocolVersion: 2 } }).ok).toBe(false)
    expect(validateManifest({ ...valid, nativeBackend: { ...backend, contract: '../backend.binpb' } }).ok).toBe(false)
    expect(
      validateManifest({
        ...valid,
        nativeBackend: { ...backend, targets: { 'win32-x64': { file: '../worker.exe', sha256: 'a'.repeat(64) } } },
      }).ok,
    ).toBe(false)
    expect(
      validateManifest({
        ...valid,
        nativeBackend: { ...backend, targets: { 'win32-x64': { file: 'worker.exe', sha256: 'bad' } } },
      }).ok,
    ).toBe(false)
    expect(
      validateManifest({
        ...valid,
        nativeBackend: {
          ...backend,
          targets: { 'win32-x64': { file: 'plugin.js.', sha256: 'a'.repeat(64) } },
        },
      }).ok,
    ).toBe(false)
  })
})
