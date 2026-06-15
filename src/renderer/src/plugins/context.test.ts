// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { createPluginContext } from './context'
import type { PoeItem } from '@shared/types'

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
  onLogLine: () => () => {},
  getRecentLogLines: async () => [],
  openExternal: vi.fn(),
  registerTab: vi.fn(),
  registerHotkey: vi.fn(),
  openTab: vi.fn(),
  copyAndEvaluateItem: vi.fn(async () => null),
  captureGameWindow: vi.fn(async () => null),
  registerOverlay: vi.fn(),
  openOverlay: vi.fn(),
  closeOverlay: vi.fn(),
  storage: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
  },
  gameConfig: {
    read: vi.fn(async () => ({ content: '', path: '' })),
    write: vi.fn(async () => ({ backupPath: null })),
    onChange: vi.fn(() => () => {}),
  },
  prices: {
    getPrices: vi.fn(async () => ({ prices: [], updatedAt: null })),
    refresh: vi.fn(async () => undefined),
    onChange: vi.fn(() => () => {}),
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

  it('forwards onLogLine and getRecentLogLines to deps', async () => {
    const unsub = vi.fn()
    const onLogLine = vi.fn(() => unsub)
    const getRecentLogLines = vi.fn(async () => ['x'])
    const ctx = createPluginContext({ ...baseDeps(), onLogLine, getRecentLogLines })
    const handler = vi.fn()
    const off = ctx.onLogLine(handler)
    expect(onLogLine).toHaveBeenCalledWith(handler)
    off()
    expect(unsub).toHaveBeenCalled()
    await expect(ctx.getRecentLogLines(5)).resolves.toEqual(['x'])
    expect(getRecentLogLines).toHaveBeenCalledWith(5)
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

describe('createPluginContext prices', () => {
  it('routes getPrices/refresh/onChange through deps', async () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    await ctx.prices.getPrices({ category: 'currency' })
    expect(deps.prices.getPrices).toHaveBeenCalledWith({ category: 'currency' })
    await ctx.prices.refresh()
    expect(deps.prices.refresh).toHaveBeenCalled()
    ctx.prices.onChange(() => {})
    expect(deps.prices.onChange).toHaveBeenCalled()
  })
})

describe('createPluginContext registerOverlay', () => {
  it('routes registerOverlay through deps with the plugin id and ignores render on this side', () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    const render = vi.fn()
    ctx.registerOverlay({ title: 'T' }, render)
    expect(deps.registerOverlay).toHaveBeenCalledWith('test', expect.objectContaining({ title: 'T' }))
    expect(render).not.toHaveBeenCalled()
  })

  it('throws if registerOverlay is called twice', () => {
    const ctx = createPluginContext(baseDeps())
    ctx.registerOverlay({ title: 'T' }, () => {})
    expect(() => ctx.registerOverlay({ title: 'U' }, () => {})).toThrow(/already/i)
  })

  it('routes openOverlay/closeOverlay through deps with the plugin id', () => {
    const deps = baseDeps()
    const ctx = createPluginContext(deps)
    ctx.openOverlay()
    expect(deps.openOverlay).toHaveBeenCalledWith('test')
    ctx.closeOverlay()
    expect(deps.closeOverlay).toHaveBeenCalledWith('test')
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

describe('createPluginContext captureGameWindow', () => {
  it('forwards captureGameWindow to the dep', async () => {
    const captureGameWindow = vi.fn().mockResolvedValue(null)
    const ctx = createPluginContext({ ...baseDeps(), captureGameWindow })
    const region = { x: 1, y: 2, width: 3, height: 4 }
    await ctx.captureGameWindow(region)
    expect(captureGameWindow).toHaveBeenCalledWith(region)
  })
})
