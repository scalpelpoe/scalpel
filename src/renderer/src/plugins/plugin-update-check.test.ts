import { describe, expect, it } from 'vitest'
import type { RegistrySnapshot } from '@shared/plugin-registry-types'
import type { PluginManifest } from '../../../plugin-sdk/src/types'
import { latestVersionFor, outdatedPluginIds } from './plugin-update-check'

function manifest(id: string, version: string): PluginManifest {
  return { manifestVersion: 1, id, version, name: id, description: 'd', author: 'a', scalpelMinVersion: '>=0.0.0' }
}

function snapshot(entries: Array<{ id: string; latestVersion: string }>): RegistrySnapshot {
  return {
    schemaVersion: 1,
    plugins: entries.map((e) => ({
      id: e.id,
      name: e.id,
      author: 'a',
      description: 'd',
      repo: `a/${e.id}`,
      latestVersion: e.latestVersion,
      scalpelMinVersion: '>=0.0.0',
      sha256: '0'.repeat(64),
    })),
  }
}

describe('outdatedPluginIds', () => {
  it('flags an installed plugin whose registry latestVersion is higher', () => {
    const reg = snapshot([{ id: 'foo', latestVersion: '1.2.0' }])
    const installed = [{ manifest: manifest('foo', '1.1.0') }]
    expect(outdatedPluginIds(reg, installed)).toEqual(new Set(['foo']))
  })

  it('ignores up-to-date and newer-than-registry installs', () => {
    const reg = snapshot([{ id: 'foo', latestVersion: '1.0.0' }])
    const installed = [{ manifest: manifest('foo', '1.0.0') }]
    expect(outdatedPluginIds(reg, installed).size).toBe(0)
  })

  it('skips installed plugins absent from the registry (unpacked/dev)', () => {
    const reg = snapshot([{ id: 'foo', latestVersion: '2.0.0' }])
    const installed = [{ manifest: manifest('bar', '0.1.0') }]
    expect(outdatedPluginIds(reg, installed).size).toBe(0)
  })

  it('returns an empty set when the registry is null', () => {
    expect(outdatedPluginIds(null, [{ manifest: manifest('foo', '1.0.0') }]).size).toBe(0)
  })

  it('latestVersionFor returns the registry version only when newer', () => {
    const reg = snapshot([{ id: 'foo', latestVersion: '1.2.0' }])
    expect(latestVersionFor(reg, manifest('foo', '1.1.0'))).toBe('1.2.0')
    expect(latestVersionFor(reg, manifest('foo', '1.2.0'))).toBeNull()
    expect(latestVersionFor(reg, manifest('foo', '1.3.0'))).toBeNull()
  })

  it('latestVersionFor returns null when the registry entry has no latestVersion', () => {
    const reg = {
      schemaVersion: 1 as const,
      plugins: [
        {
          id: 'foo',
          name: 'foo',
          author: 'a',
          description: 'd',
          repo: 'a/foo',
          scalpelMinVersion: '>=0.0.0',
          sha256: '0'.repeat(64),
        },
      ],
    }
    expect(latestVersionFor(reg as unknown as RegistrySnapshot, manifest('foo', '1.0.0'))).toBeNull()
  })
})
