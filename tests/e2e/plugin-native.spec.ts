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
const nativeDir = join(process.cwd(), 'plugin-service-examples', PLUGIN_ID, 'native')
const executablePath = join(nativeDir, 'target', 'debug', `${PLUGIN_ID}.exe`)

test('calls an installed Rust backend through Electron IPC', async () => {
  test.setTimeout(150_000)
  test.skip(process.platform !== 'win32' || process.arch !== 'x64', 'RFC1 native backends support Windows x64 only')

  execFileSync('cargo', ['build', '--quiet', '--manifest-path', join(nativeDir, 'Cargo.toml')], {
    timeout: 120_000,
  })
  const executable = await readFile(executablePath)
  const manifest = JSON.stringify({
    manifestVersion: 1,
    id: PLUGIN_ID,
    version: '1.0.0',
    name: 'Native Item Analyzer',
    description: 'native Electron E2E fixture',
    author: 'scalpel',
    scalpelMinVersion: '>=0.0.0',
    nativeBackend: {
      protocolVersion: 1,
      contract: 'backend.binpb',
      service: SERVICE,
      targets: {
        'win32-x64': {
          file: `${PLUGIN_ID}.exe`,
          sha256: createHash('sha256').update(executable).digest('hex'),
        },
      },
    },
  })
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
      [`plugins/${PLUGIN_ID}/manifest.json`]: manifest,
      [`plugins/${PLUGIN_ID}/plugin.js`]: 'export default function activate() {}',
      [`plugins/${PLUGIN_ID}/backend.binpb`]: new Uint8Array(),
      [`plugins/${PLUGIN_ID}/${PLUGIN_ID}.exe`]: executable,
    },
  })

  try {
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
