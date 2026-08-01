import { expect, test } from '@playwright/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchScalpelE2E } from './helpers/electron'

const PLUGIN_ID = 'reload-fixture'

const manifest = JSON.stringify({
  manifestVersion: 1,
  id: PLUGIN_ID,
  version: '1.0.0',
  name: 'Reload Fixture',
  description: 'unpacked reload e2e fixture',
  author: 'scalpel',
  scalpelMinVersion: '>=0.0.0',
})

const pluginSource = (marker: string): string => `export default function activate() { return () => {} } // ${marker}`

/** Wait for the next plugin-updated broadcast while triggering a reload. */
const reloadAndCaptureBroadcast = `
  new Promise((resolve) => {
    const off = window.api.onPluginUpdated((entry) => {
      off()
      resolve({ event: 'plugin-updated', entryUrl: entry.entryUrl, version: entry.manifest.version })
    })
    window.api.pluginReloadUnpacked('${PLUGIN_ID}').then((r) => {
      if (!r.ok) resolve({ event: 'error', error: r.error })
    })
    setTimeout(() => resolve({ event: 'timeout' }), 10000)
  })
`

test('reloads an unpacked plugin from its source dir, cache-busting the entry URL', async () => {
  const sourceDir = await mkdtemp(join(tmpdir(), 'scalpel-plugin-src-'))
  await writeFile(join(sourceDir, 'manifest.json'), manifest)
  await writeFile(join(sourceDir, 'plugin.js'), pluginSource('v1'))

  const scalpel = await launchScalpelE2E({
    seedConfig: { onboardingCompleted: true, startInTray: false },
    seedFiles: {
      'plugins/installed.json': JSON.stringify([PLUGIN_ID]),
      'plugins/unpacked.json': JSON.stringify([{ id: PLUGIN_ID, sourceDir }]),
      [`plugins/${PLUGIN_ID}/manifest.json`]: manifest,
      [`plugins/${PLUGIN_ID}/plugin.js`]: pluginSource('v1'),
    },
  })
  try {
    const page = scalpel.window
    await expect.poll(() => page.evaluate(() => typeof window.api?.pluginReloadUnpacked)).toBe('function')

    // The author rebuilds: same version, new code.
    await writeFile(join(sourceDir, 'plugin.js'), pluginSource('v2'))

    const result = (await page.evaluate(reloadAndCaptureBroadcast)) as {
      event: string
      entryUrl?: string
      version?: string
      error?: string
    }

    // The renderer is told to unload-then-reload, not to fresh-load.
    expect(result.event).toBe('plugin-updated')
    expect(result.version).toBe('1.0.0')
    // ...with a cache key that changes even though the version did not, so
    // dynamic import() cannot hand back the module it already has.
    expect(result.entryUrl).toMatch(new RegExp(`^scalpel-plugin://${PLUGIN_ID}/plugin\\.js\\?v=1\\.0\\.0-\\d+$`))

    // The new code really landed in Scalpel's copy.
    const installed = await readFile(join(scalpel.userDataDir, 'plugins', PLUGIN_ID, 'plugin.js'), 'utf-8')
    expect(installed).toBe(pluginSource('v2'))
  } finally {
    await scalpel.cleanup()
    await rm(sourceDir, { recursive: true, force: true })
  }
})

test('refuses to reload a plugin with no recorded source dir', async () => {
  const scalpel = await launchScalpelE2E({
    seedConfig: { onboardingCompleted: true, startInTray: false },
    seedFiles: {
      'plugins/installed.json': JSON.stringify([PLUGIN_ID]),
      // Legacy shape: id only, no source dir.
      'plugins/unpacked.json': JSON.stringify([PLUGIN_ID]),
      [`plugins/${PLUGIN_ID}/manifest.json`]: manifest,
      [`plugins/${PLUGIN_ID}/plugin.js`]: pluginSource('v1'),
    },
  })
  try {
    const page = scalpel.window
    await expect.poll(() => page.evaluate(() => typeof window.api?.pluginReloadUnpacked)).toBe('function')
    const r = (await page.evaluate(`window.api.pluginReloadUnpacked('${PLUGIN_ID}')`)) as {
      ok: boolean
      error?: string
    }
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Load it unpacked again')
  } finally {
    await scalpel.cleanup()
  }
})
