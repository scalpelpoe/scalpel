import { describe, it, expect } from 'vitest'
import type { RegistrySnapshot } from '@shared/plugin-registry-types'
import { selectAutoUpdateCandidates } from './plugin-auto-update'

function entry(id: string, latestVersion: string) {
  return {
    id,
    name: id,
    author: 'a',
    description: 'd',
    repo: `a/${id}`,
    latestVersion,
    scalpelMinVersion: '>=0.0.0',
    sha256: '0'.repeat(64),
  }
}
function snapshot(...entries: ReturnType<typeof entry>[]): RegistrySnapshot {
  return { schemaVersion: 1, plugins: entries } as unknown as RegistrySnapshot
}
function installed(id: string, version: string) {
  return { manifest: { id, version, name: id, author: 'a' } as never }
}

const ON = { enabled: true, customRegistry: false }

describe('selectAutoUpdateCandidates', () => {
  it('returns the registry entry for an outdated installed plugin', () => {
    const out = selectAutoUpdateCandidates(snapshot(entry('demo', '2.0.0')), [installed('demo', '1.0.0')], ON)
    expect(out.map((e) => e.id)).toEqual(['demo'])
    expect(out[0].latestVersion).toBe('2.0.0')
  })

  it('ignores up-to-date plugins', () => {
    const out = selectAutoUpdateCandidates(snapshot(entry('demo', '1.0.0')), [installed('demo', '1.0.0')], ON)
    expect(out).toEqual([])
  })

  it('ignores plugins absent from the registry (unpacked/dev)', () => {
    const out = selectAutoUpdateCandidates(snapshot(entry('other', '2.0.0')), [installed('demo', '1.0.0')], ON)
    expect(out).toEqual([])
  })

  it('returns nothing when disabled', () => {
    const out = selectAutoUpdateCandidates(snapshot(entry('demo', '2.0.0')), [installed('demo', '1.0.0')], {
      enabled: false,
      customRegistry: false,
    })
    expect(out).toEqual([])
  })

  it('returns nothing on a custom (non-curated) registry', () => {
    const out = selectAutoUpdateCandidates(snapshot(entry('demo', '2.0.0')), [installed('demo', '1.0.0')], {
      enabled: true,
      customRegistry: true,
    })
    expect(out).toEqual([])
  })

  it('returns nothing when the registry snapshot is null (offline)', () => {
    const out = selectAutoUpdateCandidates(null, [installed('demo', '1.0.0')], ON)
    expect(out).toEqual([])
  })
})
