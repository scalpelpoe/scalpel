// @vitest-environment jsdom

import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import type { PoeItem, ScalpelPluginContext } from '@scalpelpoe/plugin-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AnalyzeItemRequestSchema,
  AnalyzeItemResponseSchema,
} from './generated/native_item_analyzer_pb'
import activate from './plugin'

type StoredState = {
  revision: number
  status: string
  result?: {
    displayName: string
    totalMods: number
    numericTokens: number
    fingerprint: string
  }
}

function item(): PoeItem {
  return {
    name: 'Doom Mantle',
    baseType: 'Vaal Regalia',
    rarity: 'Rare',
    itemLevel: 86,
    implicits: ['+12% to all Elemental Resistances'],
    explicits: ['+100 to maximum Energy Shield'],
  } as PoeItem
}

function setup(copyResult: PoeItem | null | Promise<PoeItem | null> = null) {
  let hotkeyHandler: (() => void) | undefined
  let overlayRender: ((container: HTMLElement) => (() => void) | void) | undefined
  let stored: StoredState | null = null
  const nativeCall = vi.fn(async (_method: string, _payload: Uint8Array) =>
    toBinary(
      AnalyzeItemResponseSchema,
      create(AnalyzeItemResponseSchema, {
        displayName: 'Doom Mantle Vaal Regalia',
        totalMods: 2,
        numericTokens: 112,
        fingerprint: 'abc123',
      }),
    ),
  )
  const storage = {
    get: vi.fn(async () => stored),
    set: vi.fn(async (_key: string, value: StoredState) => {
      stored = value
    }),
    delete: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
  }
  const ctx = {
    native: { call: nativeCall },
    storage,
    registerHotkey: vi.fn((_options: unknown, handler: () => void) => {
      hotkeyHandler = handler
    }),
    registerTab: vi.fn(),
    registerOverlay: vi.fn((_options: unknown, render: typeof overlayRender) => {
      overlayRender = render
    }),
    openOverlay: vi.fn(),
    copyAndEvaluateItem: vi.fn(async () => copyResult),
    log: vi.fn(),
  }

  activate(ctx as unknown as ScalpelPluginContext)

  return {
    ctx,
    nativeCall,
    storage,
    getStored: () => stored,
    hotkeyHandler: () => hotkeyHandler!,
    overlayRender: () => overlayRender!,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('native item analyzer action', () => {
  it('registers an action hotkey instead of an overlay toggle hotkey', () => {
    const harness = setup()

    expect(harness.ctx.registerHotkey).toHaveBeenCalledWith(
      { label: 'Analyze hovered item' },
      expect.any(Function),
    )
    expect(harness.ctx.registerOverlay.mock.calls[0][0]).not.toHaveProperty('hotkeyLabel')

    const popup = document.createElement('div')
    const cleanup = harness.overlayRender()(popup)
    expect(popup.querySelector('[data-analyze-item]')).toBeNull()
    cleanup?.()
  })

  it('shows the no-item status without calling Rust', async () => {
    const harness = setup(null)

    harness.hotkeyHandler()()

    await vi.waitFor(() => expect(harness.getStored()?.status).toBe('No item provided.'))
    expect(harness.ctx.copyAndEvaluateItem).toHaveBeenCalledWith({ showOverlay: false, dispatch: false })
    expect(harness.nativeCall).not.toHaveBeenCalled()
    expect(harness.ctx.openOverlay).toHaveBeenCalled()

    const popup = document.createElement('div')
    const cleanup = harness.overlayRender()(popup)
    await vi.waitFor(() =>
      expect(popup.querySelector('[data-analysis-status]')?.textContent).toBe('No item provided.'),
    )
    cleanup?.()
  })

  it('calls the native service and displays a valid result', async () => {
    const hoveredItem = item()
    const harness = setup(hoveredItem)

    harness.hotkeyHandler()()

    await vi.waitFor(() => expect(harness.getStored()?.result?.fingerprint).toBe('abc123'))
    expect(harness.nativeCall).toHaveBeenCalledOnce()
    const [method, payload] = harness.nativeCall.mock.calls[0]
    expect(method).toBe('/scalpel.examples.item_analyzer.v1.NativeItemAnalyzer/AnalyzeItem')
    expect(fromBinary(AnalyzeItemRequestSchema, payload)).toMatchObject({
      name: hoveredItem.name,
      baseType: hoveredItem.baseType,
      explicits: hoveredItem.explicits,
    })

    const popup = document.createElement('div')
    const cleanup = harness.overlayRender()(popup)
    await vi.waitFor(() =>
      expect(popup.querySelector('[data-result-fingerprint]')?.textContent).toBe('abc123'),
    )
    expect((popup.querySelector('[data-analysis-result]') as HTMLElement | null)?.style.display).toBe('grid')
    cleanup?.()
  })

  it('does not start a concurrent analysis', async () => {
    let resolveCopy: ((value: PoeItem | null) => void) | undefined
    const pendingCopy = new Promise<PoeItem | null>((resolve) => {
      resolveCopy = resolve
    })
    const harness = setup(pendingCopy)

    harness.hotkeyHandler()()
    harness.hotkeyHandler()()

    await vi.waitFor(() => expect(harness.ctx.copyAndEvaluateItem).toHaveBeenCalledOnce())
    resolveCopy!(null)
    await vi.waitFor(() => expect(harness.getStored()?.status).toBe('No item provided.'))
  })

  it('publishes asynchronous errors without leaking a rejected handler promise', async () => {
    const harness = setup(Promise.reject(new Error('Could not copy item.')))

    harness.hotkeyHandler()()

    await vi.waitFor(() => expect(harness.getStored()?.status).toBe('Could not copy item.'))
    expect(harness.nativeCall).not.toHaveBeenCalled()
  })
})

describe('native item analyzer popup handoff', () => {
  it('reads immediately, ignores older revisions, and stops polling on cleanup', async () => {
    vi.useFakeTimers()
    const harness = setup()
    const newest: StoredState = {
      revision: 20,
      status: 'Analysis complete.',
      result: {
        displayName: 'Newest',
        totalMods: 1,
        numericTokens: 2,
        fingerprint: 'new',
      },
    }
    const older: StoredState = { revision: 19, status: 'No item provided.' }
    harness.storage.get.mockResolvedValueOnce(newest).mockResolvedValue(older)
    const popup = document.createElement('div')

    const cleanup = harness.overlayRender()(popup)
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.storage.get).toHaveBeenCalledOnce()
    expect(popup.querySelector('[data-result-name]')?.textContent).toBe('Newest')

    await vi.advanceTimersByTimeAsync(250)
    expect(harness.storage.get).toHaveBeenCalledTimes(2)
    expect(popup.querySelector('[data-analysis-status]')?.textContent).toBe('Analysis complete.')

    cleanup?.()
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.storage.get).toHaveBeenCalledTimes(2)
  })
})
