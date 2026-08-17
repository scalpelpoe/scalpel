import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPluginServiceExamples } from './build-plugin-service-examples.mjs'
import { generatePluginClient, generatePluginClientFromFiles } from './generate-plugin-client.mjs'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'plugin-service-examples/greeting-provider/manifest.json'), 'utf8'))
const contract = JSON.parse(readFileSync(resolve(root, 'plugin-service-examples/greeting-provider/api.openrpc.json'), 'utf8'))

describe('generatePluginClient', () => {
  it('generates a typed client for the Scalpel plugin transport', () => {
    const generated = generatePluginClient(manifest, contract)
    expect(generated).toContain('export interface GreetParams')
    expect(generated).toContain('export interface GreetResult')
    expect(generated).toContain("this.rpc.call<GreetResult, GreetParams>('greet', params)")
    expect(generated).toContain('requireGreetingProviderClient')
  })

  it('rejects a contract version that differs from the manifest', () => {
    expect(() => generatePluginClient(manifest, { ...contract, info: { ...contract.info, version: '2.0.0' } })).toThrow(
      /must equal manifest API version/,
    )
  })

  it('rejects method and schema names that collide with generated members', () => {
    expect(() =>
      generatePluginClient(manifest, {
        ...contract,
        methods: [{ ...contract.methods[0], name: 'constructor' }],
      }),
    ).toThrow(/reserved OpenRPC method name/)
    expect(() =>
      generatePluginClient(manifest, {
        ...contract,
        methods: [{ ...contract.methods[0], name: 'then' }],
      }),
    ).toThrow(/reserved OpenRPC method name/)
    expect(() =>
      generatePluginClient(manifest, {
        ...contract,
        components: { schemas: { GreetingProviderClient: { type: 'string' } } },
      }),
    ).toThrow(/generated name collision/)
  })

  it('escapes summaries and supports dictionary schemas', () => {
    const generated = generatePluginClient(manifest, {
      ...contract,
      methods: [
        {
          ...contract.methods[0],
          summary: 'Close */ the comment',
          result: {
            name: 'values',
            schema: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
      ],
    })
    expect(generated).toContain('/** Close * / the comment */')
    expect(generated).toContain('Promise<Record<string, string>>')
  })

  it('preserves open object semantics and optional parameter sets', () => {
    const generated = generatePluginClient(manifest, {
      ...contract,
      methods: [
        {
          ...contract.methods[0],
          params: [{ ...contract.methods[0].params[0], required: false }],
          result: { name: 'values', schema: { type: 'object' } },
        },
      ],
    })
    expect(generated).toContain('greet(params?: GreetParams)')
    expect(generated).toContain('Promise<Record<string, unknown>>')
  })

  it('rejects named properties combined with typed additional properties', () => {
    expect(() =>
      generatePluginClient(manifest, {
        ...contract,
        components: {
          schemas: {
            MixedObject: {
              type: 'object',
              properties: { count: { type: 'number' } },
              additionalProperties: { type: 'string' },
            },
          },
        },
      }),
    ).toThrow(/typed additionalProperties are unsupported/)
  })

  it('rejects duplicate parameters and empty unions', () => {
    expect(() =>
      generatePluginClient(manifest, {
        ...contract,
        methods: [
          {
            ...contract.methods[0],
            params: [contract.methods[0].params[0], contract.methods[0].params[0]],
          },
        ],
      }),
    ).toThrow(/duplicate parameter/)
    expect(() =>
      generatePluginClient(manifest, {
        ...contract,
        methods: [{ ...contract.methods[0], result: { name: 'empty', schema: { oneOf: [] } } }],
      }),
    ).toThrow(/must not be empty/)
  })

  it('rejects unsafe contract paths before reading outside the package', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scalpel-contract-'))
    try {
      const unsafeManifest = { ...manifest, api: { ...manifest.api, contract: '../api.openrpc.json' } }
      const manifestPath = join(dir, 'manifest.json')
      writeFileSync(manifestPath, JSON.stringify(unsafeManifest))
      expect(() => generatePluginClientFromFiles(manifestPath, join(dir, 'client.ts'))).toThrow(/safe filename/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects invalid plugin IDs before emitting TypeScript names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scalpel-contract-'))
    try {
      const invalidManifest = { ...manifest, id: '1-provider' }
      const manifestPath = join(dir, 'manifest.json')
      writeFileSync(manifestPath, JSON.stringify(invalidManifest))
      writeFileSync(join(dir, manifest.api.contract), JSON.stringify(contract))
      expect(() => generatePluginClientFromFiles(manifestPath, join(dir, 'client.ts'))).toThrow(/valid plugin id/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps committed generated sources and bundles current', async () => {
    await expect(buildPluginServiceExamples(true)).resolves.toBeUndefined()
  })
})
