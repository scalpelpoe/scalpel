// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { createPluginContext } from './context'
import type { PoeItem } from '../../../shared/types'

const baseDeps = () => ({
  pluginId: 'test',
  pluginVersion: '1.0.0',
  getPoeVersion: () => 1 as const,
  getLeague: () => 'Mirage',
  getCurrentItem: () => null,
  getCurrentZone: () => null,
  subscribeCurrentItem: () => () => {},
  subscribeCurrentZone: () => () => {},
  subscribeLeagueChange: () => () => {},
  openExternal: vi.fn(),
  registerTab: vi.fn(),
  registerHotkey: vi.fn(),
  openTab: vi.fn(),
  copyAndEvaluateItem: vi.fn(async () => null),
  storage: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
  },
})

describe('createPluginContext', () => {
  it('exposes pluginId and pluginVersion', () => {
    const ctx = createPluginContext(baseDeps())
    expect(ctx.pluginId).toBe('test')
    expect(ctx.pluginVersion).toBe('1.0.0')
  })

  it('forwards getPoeVersion/getLeague/getCurrentItem/getCurrentZone', () => {
    const item = { name: 'foo' } as unknown as PoeItem
    const ctx = createPluginContext({ ...baseDeps(), getCurrentItem: () => item })
    expect(ctx.getCurrentItem()).toBe(item)
    expect(ctx.getPoeVersion()).toBe(1)
    expect(ctx.getLeague()).toBe('Mirage')
  })

  it('returns an unsubscribe function from onCurrentItem', () => {
    const unsub = vi.fn()
    const ctx = createPluginContext({ ...baseDeps(), subscribeCurrentItem: () => unsub })
    const r = ctx.onCurrentItem(() => {})
    r()
    expect(unsub).toHaveBeenCalled()
  })

  it('routes registerTab through deps', () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    const render = vi.fn()
    ctx.registerTab({ label: 'x', icon: '<svg/>', render })
    expect(deps.registerTab).toHaveBeenCalledWith('test', { label: 'x', icon: '<svg/>', render })
  })

  it('throws if registerTab is called twice', () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    ctx.registerTab({ label: 'x', icon: '<svg/>', render: () => {} })
    expect(() => ctx.registerTab({ label: 'y', icon: '<svg/>', render: () => {} })).toThrow(/already/i)
  })

  it('openExternal routes through deps', () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    ctx.openExternal('https://x')
    expect(deps.openExternal).toHaveBeenCalledWith('https://x')
  })

  it('routes fetch through window.fetch', () => {
    const spy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response())
    const ctx = createPluginContext(baseDeps())
    void ctx.fetch('https://example.test/')
    expect(spy).toHaveBeenCalledWith('https://example.test/')
    spy.mockRestore()
  })

  it('log is a function (no-op when SCALPEL_DEBUG_LOG unset)', () => {
    const ctx = createPluginContext(baseDeps())
    expect(typeof ctx.log).toBe('function')
    ctx.log('hi') // must not throw
  })
})

describe('createPluginContext registerHotkey', () => {
  it('routes through deps with the plugin id', () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    const handler = vi.fn()
    ctx.registerHotkey({ label: 'Quick' }, handler)
    expect(deps.registerHotkey).toHaveBeenCalledWith('test', { label: 'Quick' }, handler)
  })

  it('throws on second registration', () => {
    const ctx = createPluginContext(baseDeps())
    ctx.registerHotkey({ label: 'Quick' }, () => {})
    expect(() => ctx.registerHotkey({ label: 'Other' }, () => {})).toThrow(/already/i)
  })
})

describe('createPluginContext storage', () => {
  it('routes get/set/delete/keys through deps', async () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    await ctx.storage.set('k', { a: 1 })
    expect(deps.storage.set).toHaveBeenCalledWith('k', { a: 1 })
    await ctx.storage.get('k')
    expect(deps.storage.get).toHaveBeenCalledWith('k')
    await ctx.storage.delete('k')
    expect(deps.storage.delete).toHaveBeenCalledWith('k')
    await ctx.storage.keys()
    expect(deps.storage.keys).toHaveBeenCalled()
  })
})

describe('createPluginContext openTab + copyAndEvaluateItem', () => {
  it('routes openTab through deps with the plugin id', () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    ctx.openTab()
    expect(deps.openTab).toHaveBeenCalledWith('test')
  })

  it('routes copyAndEvaluateItem through deps', async () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    await ctx.copyAndEvaluateItem()
    expect(deps.copyAndEvaluateItem).toHaveBeenCalled()
  })
})
