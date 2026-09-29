import { describe, expect, it, vi } from 'vitest'
import { resolveRegistrySelection } from './registry-selection'

const trustedEntry = {
  id: 'native-demo',
  name: 'Native Demo',
  author: 'Scalpel',
  description: 'demo',
  repo: 'scalpelpoe/native-demo',
  latestVersion: '1.0.0',
  sha256: 'a'.repeat(64),
  assets: { 'worker.exe': 'b'.repeat(64) },
  scalpelMinVersion: '>=1.1.0',
}

describe('resolveRegistrySelection', () => {
  it('uses renderer input only as an id and returns main-fetched coordinates and hashes', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true as const,
      snapshot: { schemaVersion: 1 as const, plugins: [trustedEntry] },
    }))

    const result = await resolveRegistrySelection(
      {
        ...trustedEntry,
        repo: 'attacker/worker',
        sha256: 'c'.repeat(64),
        assets: { 'worker.exe': 'd'.repeat(64) },
      },
      'https://registry.example/registry.json',
      fetcher,
    )

    expect(result).toEqual({ ok: true, entry: trustedEntry })
    expect(fetcher).toHaveBeenCalledWith('https://registry.example/registry.json')
  })

  it('rejects ids absent from the trusted registry', async () => {
    const result = await resolveRegistrySelection({ id: 'other-plugin' }, undefined, async () => ({
      ok: true,
      snapshot: { schemaVersion: 1, plugins: [trustedEntry] },
    }))
    expect(result.ok).toBe(false)
  })
})
