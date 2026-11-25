/**
 * Compatibility of the published plugin catalogue with the plugin-services host.
 *
 * Every plugin in the curated registry predates plugin services, dependencies, and native
 * backends. This suite runs each one through the current host's real registry, install, and
 * load gates and compares the outcome with Scalpel 1.0.5's gates (`__fixtures__/legacy-plugin-host.ts`).
 *
 * Offline (default, CI): uses `__fixtures__/registry-snapshot.json`, a capture of the live
 * registry and each plugin's released manifest.json. The released plugin.js bundles are not
 * committed, so the install check serves a stand-in bundle and pins its hash in place of the
 * published one.
 *
 * Live (`npm run verify:plugin-registry`): downloads the current registry and every plugin's
 * released manifest.json and plugin.js, so the published sha256 pins are verified for real.
 * `npm run verify:plugin-registry -- --update` also rewrites the snapshot. Downloaded plugin code
 * is only hashed, never executed.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLUGIN_REGISTRY_URL, pluginReleaseAssetUrl } from '@shared/endpoints'
import type { RegistryEntry } from '@shared/plugin-registry-types'
import { minVersionSatisfied } from '@shared/version-match'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import { legacyValidateManifest, legacyVersionMatches } from './__fixtures__/legacy-plugin-host'

const host = vi.hoisted(() => ({
  version: '0.0.0',
  userData: '',
  fetch: (async () => {
    throw new Error('no fetch handler installed')
  }) as (url: string, init?: RequestInit) => Promise<Response>,
}))

vi.mock('electron', () => ({
  app: { getVersion: () => host.version, getPath: () => host.userData },
  net: { fetch: (url: string, init?: RequestInit) => host.fetch(url, init) },
}))

import { prepareRegistryInstall } from './install-from-registry'
import { resolvePluginLoadability } from './loadability'
import { validateManifest } from './manifest-validator'
import { fetchRegistry } from './registry'

const LIVE = process.env.SCALPEL_LIVE_REGISTRY === '1'
const UPDATE_SNAPSHOT = LIVE && process.env.SCALPEL_UPDATE_REGISTRY_SNAPSHOT === '1'
const SNAPSHOT_PATH = join(__dirname, '__fixtures__', 'registry-snapshot.json')
const CURRENT_VERSION = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string })
  .version
const WIN32_X64 = { platform: 'win32', arch: 'x64' } as const

/** Released Scalpel versions spanning the registry's minimums, pre-releases included. */
const RELEASED_VERSIONS = [
  '0.9.8-rc1',
  '0.9.8',
  '0.9.9-rc2',
  '0.9.9',
  '0.9.12-rc4',
  '0.9.12',
  '0.9.13-rc1',
  '0.9.13-rc3',
  '0.9.13-rc6',
  '0.9.13',
  '0.9.15',
  '0.9.16-rc1',
  '0.9.16',
  '0.9.17-exp.1',
  '0.9.17',
  '1.0.0-rc1',
  '1.0.0',
  '1.0.2-exp.4',
  '1.0.2',
  '1.0.3-rc1',
  '1.0.3',
  '1.0.4-rc1',
  '1.0.4',
  '1.0.5-rc6',
  '1.0.5',
]

interface RegistryFile {
  schemaVersion: number
  plugins: RegistryEntry[]
}

interface Snapshot {
  source: string
  capturedAt: string
  note: string
  registry: RegistryFile
  manifests: Record<string, PluginManifest>
  /** Registry entries whose release assets could not be downloaded when captured, with the reason. */
  unreachable: Record<string, string>
}

interface Corpus {
  registry: RegistryFile
  manifests: Map<string, PluginManifest>
  /** Released plugin.js bytes. Absent offline, where a stand-in bundle is served instead. */
  bundles: Map<string, Uint8Array> | null
  /** Entries whose release assets could not be downloaded. No Scalpel version can install these. */
  unreachable: Map<string, string>
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

async function download(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { 'user-agent': 'scalpel-registry-compat' } })
  if (response.status !== 200) throw new Error(`${url} returned ${response.status}`)
  return response
}

function loadSnapshotCorpus(): Corpus {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot
  return {
    registry: snapshot.registry,
    manifests: new Map(Object.entries(snapshot.manifests)),
    bundles: null,
    unreachable: new Map(Object.entries(snapshot.unreachable)),
  }
}

async function loadLiveCorpus(): Promise<Corpus> {
  const registry = (await (await download(PLUGIN_REGISTRY_URL)).json()) as RegistryFile
  const manifests = new Map<string, PluginManifest>()
  const bundles = new Map<string, Uint8Array>()
  const unreachable = new Map<string, string>()
  await Promise.all(
    registry.plugins.map(async (entry) => {
      try {
        const [manifest, bundle] = await Promise.all([
          download(pluginReleaseAssetUrl(entry.repo, entry.latestVersion, 'manifest.json')).then((r) => r.json()),
          download(pluginReleaseAssetUrl(entry.repo, entry.latestVersion, 'plugin.js')).then((r) => r.arrayBuffer()),
        ])
        manifests.set(entry.id, manifest as PluginManifest)
        bundles.set(entry.id, new Uint8Array(bundle))
      } catch (error) {
        unreachable.set(entry.id, (error as Error).message)
      }
    }),
  )
  if (UPDATE_SNAPSHOT) {
    const inRegistryOrder = (ids: Map<string, unknown>): string[] =>
      registry.plugins.map((entry) => entry.id).filter((id) => ids.has(id))
    const snapshot: Snapshot = {
      source: PLUGIN_REGISTRY_URL,
      capturedAt: new Date().toISOString().slice(0, 10),
      note: 'Captured by `npm run verify:plugin-registry -- --update`. Manifests are the released manifest.json of each latestVersion.',
      registry,
      manifests: Object.fromEntries(inRegistryOrder(manifests).map((id) => [id, manifests.get(id)!])),
      unreachable: Object.fromEntries(inRegistryOrder(unreachable).map((id) => [id, unreachable.get(id)!])),
    }
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
  }
  return { registry, manifests, bundles, unreachable }
}

/** Serve one plugin's release assets the way GitHub would, recording which files were requested. */
function serveRelease(entry: RegistryEntry, manifest: PluginManifest, bundle: Uint8Array): string[] {
  const requested: string[] = []
  host.fetch = async (url) => {
    const file = ['plugin.js', 'manifest.json'].find(
      (name) => url === pluginReleaseAssetUrl(entry.repo, entry.latestVersion, name),
    )
    requested.push(file ?? url)
    if (file === 'plugin.js') return new Response(new Uint8Array(bundle))
    if (file === 'manifest.json') return new Response(JSON.stringify(manifest))
    return new Response('not found', { status: 404 })
  }
  return requested
}

function compatSuite(name: string, loadCorpus: () => Promise<Corpus> | Corpus): void {
  describe(name, () => {
    let corpus: Corpus
    let hostVersions: string[]
    /** Entries with a downloadable release. The unreachable ones cannot be installed by any version. */
    const published = (): RegistryEntry[] => corpus.registry.plugins.filter((entry) => corpus.manifests.has(entry.id))

    beforeAll(async () => {
      corpus = await loadCorpus()
      const minimums = corpus.registry.plugins.map((entry) => entry.scalpelMinVersion.replace(/^[<>=^~\s]+/, ''))
      hostVersions = [...new Set([...RELEASED_VERSIONS, ...minimums, CURRENT_VERSION])]
    }, 120_000)

    beforeEach(() => {
      host.version = CURRENT_VERSION
    })

    it('has a released manifest matching every reachable registry entry', () => {
      expect(published().length).toBeGreaterThan(0)
      for (const entry of corpus.registry.plugins) {
        if (corpus.unreachable.has(entry.id)) continue
        expect(corpus.manifests.get(entry.id), entry.id).toMatchObject({ id: entry.id, version: entry.latestVersion })
      }
    })

    it.runIf(LIVE)('can download the release of every registry entry', () => {
      // A failure here is a registry problem (a deleted repo or release), not a host regression:
      // no Scalpel version can install these entries.
      expect(Object.fromEntries(corpus.unreachable)).toEqual({})
    })

    it('accepts every released manifest that 1.0.5 accepted, unchanged', () => {
      for (const [id, manifest] of corpus.manifests) {
        expect(legacyValidateManifest(manifest), `1.0.5 rejected ${id}`).toEqual({ ok: true })
        expect(validateManifest(manifest), id).toEqual({ ok: true, manifest })
      }
    })

    it('uses none of the new manifest fields in published plugins', () => {
      for (const [id, manifest] of corpus.manifests) {
        const { api, dependencies, nativeBackend } = manifest
        expect({ id, api, dependencies, nativeBackend }).toEqual({ id })
      }
    })

    it('gates every registry scalpelMinVersion exactly like 1.0.5 on every released Scalpel version', () => {
      // 1.0.5 gated the registry list and install on the registry entry's range. It never read the
      // installed manifest's range; the load-time check is covered by the load-order test below.
      const mismatches: string[] = []
      for (const entry of corpus.registry.plugins) {
        for (const version of hostVersions) {
          const before = legacyVersionMatches(entry.scalpelMinVersion, version)
          const now = minVersionSatisfied(entry.scalpelMinVersion, version)
          if (before !== now) {
            mismatches.push(`${entry.id} "${entry.scalpelMinVersion}" on ${version}: 1.0.5=${before} now=${now}`)
          }
        }
      }
      expect(mismatches).toEqual([])
    })

    it('lists the same registry entries as 1.0.5 on every released Scalpel version', async () => {
      host.userData = mkdtempSync(join(tmpdir(), 'scalpel-registry-compat-'))
      try {
        host.fetch = async (url) =>
          url === PLUGIN_REGISTRY_URL
            ? new Response(JSON.stringify(corpus.registry))
            : new Response('not found', { status: 404 })
        for (const version of hostVersions) {
          host.version = version
          const result = await fetchRegistry()
          if (!result.ok) throw new Error(result.error)
          const expected = corpus.registry.plugins
            .filter((entry) => legacyVersionMatches(entry.scalpelMinVersion, version))
            .map((entry) => entry.id)
          expect(
            result.snapshot.plugins.map((entry) => entry.id),
            `registry list on ${version}`,
          ).toEqual(expected)
        }
      } finally {
        rmSync(host.userData, { recursive: true, force: true })
      }
    })

    it('prepares a registry install of every plugin, downloading only plugin.js and manifest.json', async () => {
      for (const release of published()) {
        const manifest = corpus.manifests.get(release.id)!
        const bundle =
          corpus.bundles?.get(release.id) ?? new TextEncoder().encode(`export default function activate() {}\n`)
        // Offline the real bundle is unavailable, so pin the stand-in's hash instead.
        const entry = corpus.bundles ? release : { ...release, sha256: sha256(bundle) }
        const requested = serveRelease(entry, manifest, bundle)

        const result = await prepareRegistryInstall(entry, { allowNativeBackend: true, host: WIN32_X64 })
        if (!result.ok) throw new Error(`${entry.id}: ${result.error}`)
        expect(result.prepared.manifest, entry.id).toEqual(manifest)
        expect(result.prepared.contractBytes, entry.id).toBeNull()
        expect(result.prepared.nativeBytes, entry.id).toBeNull()
        expect([...requested].sort(), entry.id).toEqual(['manifest.json', 'plugin.js'])
      }
    })

    it('still refuses a registry install the running Scalpel is too old for, as 1.0.5 did', async () => {
      for (const release of published()) {
        const tooOld = hostVersions.find((version) => !legacyVersionMatches(release.scalpelMinVersion, version))
        if (!tooOld) continue
        host.version = tooOld
        serveRelease(release, corpus.manifests.get(release.id)!, new Uint8Array())
        const result = await prepareRegistryInstall(release)
        expect(result, `${release.id} on ${tooOld}`).toEqual({
          ok: false,
          error: `requires Scalpel version ${release.scalpelMinVersion} (running ${tooOld})`,
        })
      }
    })

    it('loads every installed plugin that 1.0.5 could install, in install order', () => {
      for (const version of hostVersions) {
        // 1.0.5 installed by the registry entry's range and then loaded unconditionally. The new
        // host also checks the installed manifest's range, which can differ from the registry's.
        const installable = published()
          .filter((entry) => legacyVersionMatches(entry.scalpelMinVersion, version))
          .map((entry) => ({
            manifest: corpus.manifests.get(entry.id)!,
            entryUrl: `scalpel-plugin://${entry.id}/plugin.js`,
          }))
        const { installed, loadable } = resolvePluginLoadability(installable, version, WIN32_X64)
        expect(
          loadable.map((entry) => entry.manifest.id),
          `load order on ${version}`,
        ).toEqual(installable.map((entry) => entry.manifest.id))
        expect(installed.every((entry) => entry.availability.status === 'available')).toBe(true)
      }
    })
  })
}

if (LIVE) {
  compatSuite('published registry plugins (live registry)', loadLiveCorpus)
} else {
  compatSuite('published registry plugins (snapshot)', loadSnapshotCorpus)
}

/** Behaviour that deliberately differs from 1.0.5. Each case states what an existing plugin sees. */
describe('intended differences from 1.0.5 for existing plugins', () => {
  const manifest = (scalpelMinVersion: string): PluginManifest => ({
    manifestVersion: 1,
    id: 'existing-plugin',
    version: '1.0.0',
    name: 'Existing Plugin',
    description: 'A plugin written before plugin services.',
    author: 'someone',
    scalpelMinVersion,
  })
  const loadabilityOn = (version: string, scalpelMinVersion: string) =>
    resolvePluginLoadability(
      [{ manifest: manifest(scalpelMinVersion), entryUrl: 'scalpel-plugin://existing-plugin/plugin.js' }],
      version,
      WIN32_X64,
    )

  it('keeps loading an installed plugin whose manifest declares a bare scalpelMinVersion', () => {
    // hideout-hunter 1.0.0 is published with registry range ">=0.9.13" but manifest "0.9.13".
    // 1.0.5 never re-checked the manifest; the new load-time check must not disable it.
    for (const version of ['0.9.13', '0.9.17', '1.0.5']) {
      const { loadable } = loadabilityOn(version, '0.9.13')
      expect(
        loadable.map((entry) => entry.manifest.id),
        version,
      ).toEqual(['existing-plugin'])
    }
  })

  it('reads a bare scalpelMinVersion as a minimum instead of an exact version', () => {
    expect(legacyVersionMatches('0.9.13', '1.0.5')).toBe(false)
    expect(minVersionSatisfied('0.9.13', '1.0.5')).toBe(true)
    expect(legacyVersionMatches('0.9.13', '0.9.13')).toBe(true)
    expect(minVersionSatisfied('0.9.13', '0.9.13')).toBe(true)
    expect(minVersionSatisfied('0.9.13', '0.9.12')).toBe(false)
  })

  it('honours compound ranges, which 1.0.5 documented but never matched', () => {
    for (const version of ['0.9.8', '0.9.13', '0.9.17']) {
      expect(legacyVersionMatches('>=0.9.8 <1.0', version)).toBe(false)
      expect(minVersionSatisfied('>=0.9.8 <1.0', version)).toBe(true)
    }
    expect(minVersionSatisfied('>=0.9.8 <1.0', '1.0.0')).toBe(false)
  })

  it('rejects a manifest whose scalpelMinVersion is not a version range, which 1.0.5 loaded when side-loaded', () => {
    for (const range of ['latest', '*', 'v1.0.0', '>=0.9.x']) {
      expect(legacyValidateManifest(manifest(range)), range).toEqual({ ok: true })
      expect(validateManifest(manifest(range)), range).toEqual({
        ok: false,
        error: 'scalpelMinVersion must be a valid version range',
      })
    }
  })

  it('keeps an installed plugin inactive while the running Scalpel is older than its minimum', () => {
    // 1.0.5 never re-checked installed plugins, so a downgrade kept loading them.
    const { installed, loadable } = loadabilityOn('1.0.4', '>=1.0.5')
    expect(loadable).toEqual([])
    expect(installed[0].availability).toMatchObject({
      status: 'unavailable',
      reason: { code: 'scalpel-version-incompatible', requiredVersion: '>=1.0.5', currentVersion: '1.0.4' },
    })
  })

  it('accepts a space after the operator, as 1.0.5 did', () => {
    expect(legacyVersionMatches('>= 0.9.8', '1.0.5')).toBe(true)
    expect(minVersionSatisfied('>= 0.9.8', '1.0.5')).toBe(true)
    expect(validateManifest(manifest('>= 0.9.8')).ok).toBe(true)
  })
})
