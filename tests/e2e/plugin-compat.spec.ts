/**
 * Existing plugins and plugin-services plugins in the real app.
 *
 * "classic-notes" is written the way every published plugin is: a 1.0.5-shape manifest and a
 * bundle that only touches the 1.0.5 context API. The greeting examples (provider -> relay ->
 * consumer) and a small probe use the new plugin APIs and dependency graph. Both kinds must run
 * side by side, and a broken dependency graph must never stop a classic plugin from loading.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchScalpelE2E, openPluginHostWindow, type ScalpelE2EApp } from './helpers/electron'

const CLASSIC_ID = 'classic-notes'
const PROVIDER_SERVICE = 'scalpel.examples.greeting.v1.GreetingProvider'
const RELAY_SERVICE = 'scalpel.examples.greeting.relay.v1.GreetingRelay'

/** The context API Scalpel 1.0.5 gave plugins (src/plugin-sdk/src/public-surface.test.ts at upstream ae42ad64). */
const CONTEXT_KEYS_IN_1_0_5 = [
  'captureGameWindow',
  'closeOverlay',
  'copyAndEvaluateItem',
  'fetch',
  'gameConfig',
  'getCurrentItem',
  'getCurrentZone',
  'getCursorPosition',
  'getLeague',
  'getLeagues',
  'getPoeVersion',
  'getRecentLogLines',
  'isOverlayVisible',
  'log',
  'media',
  'onCurrentItem',
  'onCurrentZone',
  'onLeagueChange',
  'onLogLine',
  'onOverlayVisibility',
  'openExternal',
  'openOverlay',
  'openTab',
  'pluginId',
  'pluginVersion',
  'prices',
  'registerHotkey',
  'registerOverlay',
  'registerTab',
  'setInteractiveRegion',
  'storage',
]

const classicManifest = JSON.stringify({
  manifestVersion: 1,
  id: CLASSIC_ID,
  version: '1.0.0',
  name: 'Classic Notes',
  description: 'A plugin written against the 1.0.5 SDK, before plugin services.',
  author: 'e2e',
  scalpelMinVersion: '>=0.9.8',
  poeVersions: [1, 2],
})

const classicPlugin = `
export default function activate(ctx) {
  ctx.registerTab({
    label: 'Classic Notes',
    icon: '<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="currentColor"/></svg>',
    render(container) {
      container.textContent = 'classic notes'
      return () => {}
    },
  })
  ctx.registerHotkey({ label: 'Classic hotkey' }, () => {})
  void ctx.storage.set('activated', {
    pluginId: ctx.pluginId,
    pluginVersion: ctx.pluginVersion,
    contextKeys: Object.keys(ctx).sort(),
  })
  return () => {}
}
`

const probeManifest = JSON.stringify({
  manifestVersion: 1,
  id: 'service-probe',
  version: '1.0.0',
  name: 'Service Probe',
  description: 'Calls the greeting services once and records the replies.',
  author: 'e2e',
  scalpelMinVersion: '>=0.0.0',
  dependencies: [
    { pluginId: 'greeting-provider', apiVersion: '2.0.0' },
    { pluginId: 'greeting-relay', apiVersion: '1.0.0' },
  ],
})

const probePlugin = `
export default function activate(ctx) {
  const provider = ctx.plugins.get('greeting-provider', '${PROVIDER_SERVICE}')
  const relay = ctx.plugins.get('greeting-relay', '${RELAY_SERVICE}')
  void (async () => {
    const calls = {}
    try {
      const character = await provider.call('/${PROVIDER_SERVICE}/GetLastSeenCharacter', {})
      calls.provider = character.result.case
      const greeting = await relay.call('/${RELAY_SERVICE}/GetGreeting', {})
      calls.relay = { case: greeting.result.case, message: greeting.result.value.message }
    } catch (error) {
      calls.error = String((error && error.message) || error)
    }
    await ctx.storage.set('calls', calls)
  })()
}
`

const EXAMPLE_FILES: Record<string, string[]> = {
  'greeting-provider': ['plugin.js', 'api.binpb'],
  'greeting-relay': ['plugin.js', 'api.binpb'],
  'greeting-consumer': ['plugin.js'],
}

/** A checked-in greeting example as package files. The examples target the first release with
 *  plugin services (>=1.1.0), so the throwaway profile relaxes only that gate. */
async function examplePackage(id: string): Promise<Record<string, string | Buffer>> {
  const dir = join(process.cwd(), 'plugin-service-examples', id)
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>
  const files: Record<string, string | Buffer> = {
    'manifest.json': JSON.stringify({ ...manifest, scalpelMinVersion: '>=0.0.0' }),
  }
  for (const file of EXAMPLE_FILES[id]) files[file] = await readFile(join(dir, file))
  return files
}

function seedInstalled(packages: Record<string, Record<string, string | Buffer>>): Record<string, string | Buffer> {
  const seed: Record<string, string | Buffer> = {
    'plugins/installed.json': JSON.stringify(Object.keys(packages)),
  }
  for (const [id, files] of Object.entries(packages)) {
    for (const [file, contents] of Object.entries(files)) seed[`plugins/${id}/${file}`] = contents
  }
  return seed
}

const classicPackage = { 'manifest.json': classicManifest, 'plugin.js': classicPlugin }

const registeredTabs = (scalpel: ScalpelE2EApp): Promise<string[]> =>
  scalpel.window.evaluate(async () => (await window.api.pluginListRegisteredTabs()).map((tab) => tab.pluginId).sort())

const availability = (scalpel: ScalpelE2EApp): Promise<Record<string, string>> =>
  scalpel.window.evaluate(async () =>
    Object.fromEntries(
      (await window.api.listInstalledPlugins()).map((entry) => [
        entry.manifest.id,
        entry.availability.status === 'available' ? 'available' : entry.availability.reason.code,
      ]),
    ),
  )

const storageValue = (scalpel: ScalpelE2EApp, pluginId: string, key: string): Promise<unknown> =>
  scalpel.window.evaluate(([id, k]) => window.api.pluginStorageGet(id, k), [pluginId, key] as const)

test('a classic plugin runs unchanged alongside plugins that expose and consume services', async () => {
  test.setTimeout(60_000)
  const scalpel = await launchScalpelE2E({
    seedConfig: { onboardingCompleted: true, startInTray: false },
    seedFiles: seedInstalled({
      [CLASSIC_ID]: classicPackage,
      'greeting-provider': await examplePackage('greeting-provider'),
      'greeting-relay': await examplePackage('greeting-relay'),
      'service-probe': { 'manifest.json': probeManifest, 'plugin.js': probePlugin },
    }),
  })
  try {
    const host = await openPluginHostWindow(scalpel)

    await expect.poll(() => registeredTabs(scalpel)).toEqual([CLASSIC_ID, 'greeting-relay'])
    expect(await availability(scalpel)).toEqual({
      [CLASSIC_ID]: 'available',
      'greeting-provider': 'available',
      'greeting-relay': 'available',
      'service-probe': 'available',
    })

    // The classic plugin got every 1.0.5 context member and its registrations reached main.
    await expect.poll(() => storageValue(scalpel, CLASSIC_ID, 'activated')).not.toBeNull()
    const activated = (await storageValue(scalpel, CLASSIC_ID, 'activated')) as {
      pluginId: string
      pluginVersion: string
      contextKeys: string[]
    }
    expect(activated).toMatchObject({ pluginId: CLASSIC_ID, pluginVersion: '1.0.0' })
    expect(activated.contextKeys).toEqual(expect.arrayContaining(CONTEXT_KEYS_IN_1_0_5))
    const hotkeys = await scalpel.window.evaluate(() => window.api.pluginListRegisteredHotkeys())
    expect(hotkeys).toContainEqual(expect.objectContaining({ pluginId: CLASSIC_ID, label: 'Classic hotkey' }))

    // The probe reached the provider directly and the provider again through the relay.
    await expect.poll(() => storageValue(scalpel, 'service-probe', 'calls')).not.toBeNull()
    const calls = (await storageValue(scalpel, 'service-probe', 'calls')) as {
      provider?: string
      relay?: { case: string; message: string }
      error?: string
    }
    expect(calls.error).toBeUndefined()
    // Whether a character is known depends on the machine's Client.txt; either reply is a valid round trip.
    expect(['character', 'unavailable']).toContain(calls.provider)
    expect(calls.relay).toEqual({
      case: 'unavailable',
      message: 'No message has been submitted in Greeting Relay yet.',
    })

    expect(host.errors).toEqual([])
    await scalpel.close()
  } finally {
    await scalpel.cleanup()
  }
})

test('a consumer waits for its providers without affecting classic plugins, then loads without a restart', async () => {
  test.setTimeout(60_000)
  const scalpel = await launchScalpelE2E({
    seedConfig: { onboardingCompleted: true, startInTray: false },
    seedFiles: seedInstalled({
      [CLASSIC_ID]: classicPackage,
      'greeting-consumer': await examplePackage('greeting-consumer'),
    }),
  })
  const sourceDirs: string[] = []
  try {
    const host = await openPluginHostWindow(scalpel)

    // The consumer's provider chain is missing: it stays installed but inactive, the classic plugin loads.
    await expect.poll(() => registeredTabs(scalpel)).toEqual([CLASSIC_ID])
    expect(await availability(scalpel)).toEqual({
      [CLASSIC_ID]: 'available',
      'greeting-consumer': 'missing-required-dependency',
    })

    // Load the providers through Settings > Developer > Load unpacked, provider first.
    for (const id of ['greeting-provider', 'greeting-relay']) {
      const dir = await mkdtemp(join(tmpdir(), `scalpel-${id}-`))
      sourceDirs.push(dir)
      for (const [file, contents] of Object.entries(await examplePackage(id)))
        await writeFile(join(dir, file), contents)
      await scalpel.app.evaluate(({ dialog }, picked) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
      }, dir)
      expect(await scalpel.window.evaluate(() => window.api.pluginInstallUnpacked())).toEqual({ ok: true, id })
    }

    await expect.poll(() => registeredTabs(scalpel)).toEqual([CLASSIC_ID, 'greeting-consumer', 'greeting-relay'])
    expect(await availability(scalpel)).toEqual({
      [CLASSIC_ID]: 'available',
      'greeting-consumer': 'available',
      'greeting-provider': 'available',
      'greeting-relay': 'available',
    })

    expect(host.errors).toEqual([])
    await scalpel.close()
  } finally {
    await scalpel.cleanup()
    await Promise.all(sourceDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  }
})
