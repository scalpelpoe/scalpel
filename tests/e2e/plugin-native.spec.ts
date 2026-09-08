import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { expect, test } from '@playwright/test'
import {
  AnalyzeItemRequestSchema,
  AnalyzeItemResponseSchema,
} from '../../plugin-service-examples/native-item-analyzer/src/generated/native_item_analyzer_pb'
import { launchScalpelE2E } from './helpers/electron'

const PLUGIN_ID = 'native-item-analyzer'
const SERVICE = 'scalpel.examples.item_analyzer.v1.NativeItemAnalyzer'
const METHOD = `/${SERVICE}/AnalyzeItem`
const projectDir = join(process.cwd(), 'plugin-service-examples', PLUGIN_ID)
const distDir = join(projectDir, 'dist')

test('calls an installed Rust backend through Electron IPC', async () => {
  test.setTimeout(180_000)
  test.skip(process.platform !== 'win32' || process.arch !== 'x64', 'RFC1 native backends support Windows x64 only')

  execFileSync(
    process.execPath,
    [join(process.cwd(), 'src', 'plugin-tools', 'cli', 'scalpel-plugin.mjs'), 'pack', '--project', projectDir],
    { timeout: 150_000 },
  )
  const [manifestText, pluginBytes, contractBytes, executable] = await Promise.all([
    readFile(join(distDir, 'manifest.json'), 'utf8'),
    readFile(join(distDir, 'plugin.js')),
    readFile(join(distDir, 'backend.binpb')),
    readFile(join(distDir, `${PLUGIN_ID}.exe`)),
  ])
  const packedManifest = JSON.parse(manifestText) as {
    scalpelMinVersion: string
    nativeBackend: { targets: { 'win32-x64': { sha256: string } } }
  }
  expect(packedManifest.scalpelMinVersion).toBe('>=1.1.0')
  expect(packedManifest.nativeBackend.targets['win32-x64'].sha256).toBe(
    createHash('sha256').update(executable).digest('hex'),
  )
  // This branch still identifies as 1.0.4; only relax the host gate in the
  // throwaway profile while preserving every packed release asset byte-for-byte.
  const testManifest = JSON.stringify({ ...packedManifest, scalpelMinVersion: '>=0.0.0' })
  const request = toBinary(
    AnalyzeItemRequestSchema,
    create(AnalyzeItemRequestSchema, {
      name: 'Doom',
      baseType: 'Spiral Ring',
      rarity: 'Rare',
      itemLevel: 84,
      implicits: ['+12% to Fire Resistance'],
      explicits: ['+75 to maximum Life', '+30% to Cold Resistance'],
    }),
  )
  const scalpel = await launchScalpelE2E({
    seedConfig: { onboardingCompleted: true, startInTray: false },
    seedFiles: {
      'plugins/installed.json': JSON.stringify([PLUGIN_ID]),
      [`plugins/${PLUGIN_ID}/manifest.json`]: testManifest,
      [`plugins/${PLUGIN_ID}/plugin.js`]: pluginBytes,
      [`plugins/${PLUGIN_ID}/backend.binpb`]: contractBytes,
      [`plugins/${PLUGIN_ID}/${PLUGIN_ID}.exe`]: executable,
    },
  })

  try {
    const loadable = await scalpel.window.evaluate(async (pluginId) => {
      const entry = await window.api.getLoadablePlugin(pluginId)
      return entry ? { id: entry.manifest.id, availability: entry.availability.status } : null
    }, PLUGIN_ID)
    expect(loadable).toEqual({ id: PLUGIN_ID, availability: 'available' })

    const hostWindow = scalpel.app.waitForEvent('window')
    const appPath = await scalpel.app.evaluate(({ app }) => app.getAppPath())
    await scalpel.app.evaluate(
      async ({ BrowserWindow }, paths) => {
        const win = new BrowserWindow({
          show: false,
          webPreferences: { preload: paths.preload, sandbox: false, contextIsolation: true },
        })
        ;(globalThis as unknown as Record<string, unknown>).__scalpelPluginE2EWindow = win
        await win.loadFile(paths.html)
      },
      {
        html: join(process.cwd(), 'out', 'renderer', 'index.html'),
        preload: join(process.cwd(), 'out', 'preload', 'index.js'),
      },
    )
    const hostPage = await hostWindow
    const hostErrors: string[] = []
    hostPage.on('pageerror', (error) => hostErrors.push(error.message))
    hostPage.on('console', (message) => {
      if (message.type() === 'error') hostErrors.push(message.text())
    })
    hostPage.on('response', (response) => {
      if (response.status() >= 400) hostErrors.push(`${response.status()} ${response.url()}`)
    })
    await hostPage.waitForLoadState('domcontentloaded')
    try {
      await expect
        .poll(() =>
          scalpel.window.evaluate(async (pluginId) => {
            const tabs = await window.api.pluginListRegisteredTabs()
            return tabs.some((tab) => tab.pluginId === pluginId)
          }, PLUGIN_ID),
        )
        .toBe(true)
    } catch {
      throw new Error(
        `packed plugin did not activate from ${appPath}: ${hostErrors.join(' | ') || 'no renderer error reported'}`,
      )
    }

    const responseBytes = await scalpel.window.evaluate(
      async ({ method, payload }) =>
        Array.from(await window.api.pluginNativeCall('native-item-analyzer', method, Uint8Array.from(payload))),
      { method: METHOD, payload: Array.from(request) },
    )
    const response = fromBinary(AnalyzeItemResponseSchema, Uint8Array.from(responseBytes))

    expect(response).toMatchObject({
      displayName: 'Doom Spiral Ring',
      totalMods: 3,
      numericTokens: 3,
    })
    expect(response.fingerprint).toHaveLength(64)
    await scalpel.close()
  } finally {
    await scalpel.cleanup()
  }
})
