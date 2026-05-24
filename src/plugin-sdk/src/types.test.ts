import { describe, expectTypeOf, it } from 'vitest'
import type {
  PluginActivate,
  PluginManifest,
  PluginStorage,
  RegisterHotkeyOptions,
  RegisterTabOptions,
  ScalpelPluginContext,
} from './types'

describe('PluginManifest', () => {
  it('has the required fields', () => {
    const m: PluginManifest = {
      manifestVersion: 1,
      id: 'jewel-economy',
      version: '1.0.0',
      name: 'Jewel Economy',
      description: 'desc',
      author: 'someone',
      scalpelMinVersion: '>=0.20.0',
    }
    expectTypeOf(m.id).toEqualTypeOf<string>()
    expectTypeOf(m.poeVersions).toEqualTypeOf<(1 | 2)[] | undefined>()
    expectTypeOf(m.homepage).toEqualTypeOf<string | undefined>()
    expectTypeOf(m.tabIcon).toEqualTypeOf<string | undefined>()
  })
})

describe('PluginActivate', () => {
  it('is callable with a context and returns void', () => {
    const fn: PluginActivate = (_ctx) => {}
    expectTypeOf(fn).toEqualTypeOf<(ctx: ScalpelPluginContext) => void | Promise<void>>()
  })

  it('accepts an async function', () => {
    const fn: PluginActivate = async (_ctx) => {
      await Promise.resolve()
    }
    expectTypeOf(fn).toMatchTypeOf<PluginActivate>()
  })
})

describe('ScalpelPluginContext', () => {
  it('exposes identity, game state, events, registration, and utilities', () => {
    const ctx = {} as ScalpelPluginContext
    expectTypeOf(ctx.pluginId).toEqualTypeOf<string>()
    expectTypeOf(ctx.pluginVersion).toEqualTypeOf<string>()
    expectTypeOf(ctx.getPoeVersion).returns.toEqualTypeOf<1 | 2>()
    expectTypeOf(ctx.getLeague).returns.toEqualTypeOf<string>()
    expectTypeOf(ctx.registerTab).toBeFunction()
    expectTypeOf(ctx.registerTab).parameter(0).toEqualTypeOf<RegisterTabOptions>()
    expectTypeOf(ctx.onCurrentItem).toBeFunction()
    expectTypeOf(ctx.openExternal).toBeFunction()
  })

  it('exposes registerHotkey', () => {
    const ctx = {} as ScalpelPluginContext
    expectTypeOf(ctx.registerHotkey).toBeFunction()
  })

  it('exposes a storage namespace', () => {
    const storage: PluginStorage = {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      keys: async () => [],
    }
    const ctx = { storage } as ScalpelPluginContext
    expectTypeOf(ctx.storage.get).toBeFunction()
    expectTypeOf(ctx.storage.set).toBeFunction()
    expectTypeOf(ctx.storage.delete).toBeFunction()
    expectTypeOf(ctx.storage.keys).toBeFunction()
    expectTypeOf(ctx.storage.get<number>('x')).resolves.toEqualTypeOf<number | null>()
  })
})

describe('RegisterHotkeyOptions', () => {
  it('requires a label', () => {
    const opts: RegisterHotkeyOptions = { label: 'Quick check' }
    expectTypeOf(opts.label).toEqualTypeOf<string>()
  })
})
