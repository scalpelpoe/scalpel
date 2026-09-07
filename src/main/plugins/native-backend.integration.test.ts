import { createHash } from 'node:crypto'
import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import {
  AnalyzeItemRequestSchema,
  AnalyzeItemResponseSchema,
} from '../../../plugin-service-examples/native-item-analyzer/src/generated/native_item_analyzer_pb'
import { PluginNativeBackendManager } from './native-backend'

const SERVICE = 'scalpel.examples.item_analyzer.v1.NativeItemAnalyzer'
const METHOD = `/${SERVICE}/AnalyzeItem`
const nativeDir = join(process.cwd(), 'plugin-service-examples', 'native-item-analyzer', 'native')
const executablePath = join(nativeDir, 'target', 'debug', 'native-item-analyzer.exe')
const windowsDescribe = process.platform === 'win32' ? describe : describe.skip

windowsDescribe('PluginNativeBackendManager Rust process integration', () => {
  it('calls and cleanly stops the checked-in native item analyzer', { timeout: 180_000 }, async () => {
    execFileSync('cargo', ['build', '--quiet', '--manifest-path', join(nativeDir, 'Cargo.toml')], {
      timeout: 120_000,
    })
    const executable = readFileSync(executablePath)
    let child: ChildProcessWithoutNullStreams | undefined
    const manager = new PluginNativeBackendManager(
      () => ({
        executablePath,
        sha256: createHash('sha256').update(executable).digest('hex'),
        service: SERVICE,
      }),
      (file) => {
        child = spawn(file, [], {
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        return child
      },
    )
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

    try {
      const response = fromBinary(
        AnalyzeItemResponseSchema,
        await manager.call('native-item-analyzer', METHOD, request),
      )
      expect(response).toMatchObject({
        displayName: 'Doom Spiral Ring',
        totalMods: 3,
        numericTokens: 3,
      })
      expect(response.fingerprint).toHaveLength(64)
    } finally {
      await manager.stop('native-item-analyzer')
    }

    expect(child?.exitCode).toBe(0)
  })
})
