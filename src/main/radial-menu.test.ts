import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pluginSliceIcon,
  RADIAL_BACKDROP_HALF_PX,
  type RadialBackdropImage,
  type RadialOpenPayload,
  type RadialSlice,
} from '@shared/contracts/radial'

// Hoisted so the mock factory (which runs during the module import below) can
// hand the spec and the PoE-leave hook back to the tests without a plain `let`
// declaration re-initialising them to null afterwards.
const captured = vi.hoisted(() => ({
  spec: null as null | { interaction?: () => string; onVisibilityChange?: (visible: boolean) => void },
  poeLeave: null as null | (() => void),
}))

const fakeOverlay = {
  show: vi.fn(),
  hide: vi.fn(),
  toggle: vi.fn(),
  isVisible: vi.fn(() => false),
  send: vi.fn(),
  getWindow: vi.fn(() => null),
  setPersistOverOthers: vi.fn(),
  getPersistOverOthers: vi.fn(() => false),
  setBoundsProgrammatic: vi.fn(),
  setBoundsProgrammaticOnce: vi.fn(),
  setSizeProgrammatic: vi.fn(),
  hideKeepingRestore: vi.fn(),
}
vi.mock('./windowing', () => ({
  registerSecondaryOverlay: vi.fn((spec) => {
    captured.spec = spec
    return fakeOverlay
  }),
  registerOnPoeLeave: vi.fn((cb) => {
    captured.poeLeave = cb
    return () => {}
  }),
}))

import {
  cancelRadialMenu,
  fireRadialSlice,
  getPendingRadialPayload,
  getPendingRadialState,
  registerRadialMenuOverlay,
  toggleRadialMenu,
  type RadialMenuDeps,
} from './radial-menu'

function slice(id: string, action: RadialSlice['action']): RadialSlice {
  return { id, icon: 'Filter', label: id, action }
}

function makeDeps(overrides?: Partial<RadialMenuDeps>): RadialMenuDeps & {
  fired: string[]
} {
  const fired: string[] = []
  return {
    fired,
    getSlices: () => [
      slice('a', { kind: 'filter' }),
      slice('b', { kind: 'chat', command: '/hideout', autoSubmit: true }),
    ],
    getGameCursor: () => ({ x: 100, y: 200 }),
    getScreenCursor: () => ({ x: 1100, y: 1200 }),
    warpTo: vi.fn(),
    focusGame: vi.fn(),
    defer: (fn) => fn(),
    fire: {
      filter: () => fired.push('filter'),
      pricecheck: () => fired.push('pricecheck'),
      appmacro: (action, presetId) => fired.push(`appmacro:${action}:${presetId ?? ''}`),
      chat: (command, autoSubmit) => fired.push(`chat:${command}:${autoSubmit}`),
      cheatsheet: (categoryId) => fired.push(`cheatsheet:${categoryId ?? ''}`),
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fakeOverlay.isVisible.mockReturnValue(false)
  // clearAllMocks drops recorded calls, not implementations, so a test that
  // hands out a fake BrowserWindow would leak it into every test after it.
  fakeOverlay.getWindow.mockReturnValue(null)
})

describe('toggleRadialMenu', () => {
  it('shows and sends the payload with cursor center and slices', () => {
    const deps = makeDeps()
    registerRadialMenuOverlay(deps)
    toggleRadialMenu()
    expect(fakeOverlay.show).toHaveBeenCalled()
    expect(fakeOverlay.send).toHaveBeenCalledWith('radial:open', {
      center: { x: 100, y: 200 },
      slices: deps.getSlices(),
      scale: 1,
      nonce: expect.any(Number),
      dev: false,
    })
    expect(getPendingRadialPayload()).toMatchObject({
      center: { x: 100, y: 200 },
      slices: deps.getSlices(),
      scale: 1,
    })
  })

  it('carries the stored size scale, clamped, with no dep meaning default size', () => {
    registerRadialMenuOverlay(makeDeps({ getScale: () => 0.75 }))
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.scale).toBe(0.75)

    cancelRadialMenu()
    registerRadialMenuOverlay(makeDeps({ getScale: () => undefined }))
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.scale).toBe(1)

    // A hand-edited settings file can hold anything; the overlay must never be
    // asked to draw a ring outside the supported range.
    cancelRadialMenu()
    registerRadialMenuOverlay(makeDeps({ getScale: () => 9 }))
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.scale).toBe(1.4)

    cancelRadialMenu()
    registerRadialMenuOverlay(makeDeps({ getScale: () => 0.1 }))
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.scale).toBe(0.6)
  })

  it('no getScale dep: the payload still carries the default scale', () => {
    registerRadialMenuOverlay(makeDeps())
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.scale).toBe(1)
  })

  it('carries developer mode, and defaults it off with no dep', () => {
    registerRadialMenuOverlay(makeDeps({ isDev: () => true }))
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.dev).toBe(true)

    cancelRadialMenu()
    registerRadialMenuOverlay(makeDeps())
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.dev).toBe(false)
  })

  it('hides when already visible', () => {
    registerRadialMenuOverlay(makeDeps())
    fakeOverlay.isVisible.mockReturnValue(true)
    toggleRadialMenu()
    expect(fakeOverlay.hide).toHaveBeenCalled()
    expect(fakeOverlay.show).not.toHaveBeenCalled()
  })

  it('declares a dialog and refuses to open without a screen cursor', () => {
    registerRadialMenuOverlay(makeDeps({ getScreenCursor: () => null }))
    expect(captured.spec?.interaction?.()).toBe('dialog')
    toggleRadialMenu()
    expect(fakeOverlay.show).not.toHaveBeenCalled()
  })

  it('no-ops when the cursor is outside the game', () => {
    registerRadialMenuOverlay(makeDeps({ getGameCursor: () => null }))
    toggleRadialMenu()
    expect(fakeOverlay.show).not.toHaveBeenCalled()
  })

  it('no-ops with zero slices', () => {
    registerRadialMenuOverlay(makeDeps({ getSlices: () => [] }))
    toggleRadialMenu()
    expect(fakeOverlay.show).not.toHaveBeenCalled()
  })

  it('enriches plugin slices with the registered plugin icon and leaves the rest alone', () => {
    const deps = makeDeps({
      getSlices: () => [
        slice('p1', { kind: 'appmacro', action: 'plugin:acme.tool' }),
        slice('p2', { kind: 'appmacro', action: 'plugin-overlay:acme.tool' }),
        // Registered plugin, no icon of its own -> stays on its IconPark glyph.
        slice('p3', { kind: 'appmacro', action: 'plugin:no.icon' }),
        slice('m', { kind: 'appmacro', action: 'openSettings' }),
        slice('a', { kind: 'filter' }),
      ],
      getPluginIcon: (id) => (id === 'acme.tool' ? '<svg/>' : undefined),
    })
    registerRadialMenuOverlay(deps)
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.slices.map((s) => s.iconSvg)).toEqual([
      '<svg/>',
      '<svg/>',
      undefined,
      undefined,
      undefined,
    ])
  })

  it('resolves plugin art tab-first, then manifest, then nothing', () => {
    // The order lives in pluginSliceIcon; this pins that the enrichment actually
    // asks it, through whatever the host wires into getPluginIcon.
    expect(pluginSliceIcon('<svg id="tab"/>', 'http://x/manifest.png')).toBe('<svg id="tab"/>')
    expect(pluginSliceIcon(undefined, 'http://x/manifest.png')).toBe('http://x/manifest.png')
    expect(pluginSliceIcon(undefined, undefined)).toBeUndefined()
    // Empty strings are not art either - a manifest with `iconUrl: ""` must not
    // beat a real tab icon or masquerade as one.
    expect(pluginSliceIcon('', 'http://x/manifest.png')).toBe('http://x/manifest.png')
    expect(pluginSliceIcon('', '')).toBeUndefined()
  })

  it('an OVERLAY-ONLY plugin still gets its art, which is the bug this fixes', () => {
    // Registering a tab is what populates the tab registry, and an overlay-only
    // plugin never does - so the registry lookup misses and only the manifest
    // has anything to offer. The calculator is exactly this shape.
    const registry = new Map<string, string>() // nothing registered a tab
    const manifests = new Map([['acme.calc', 'http://x/calc.png']])
    registerRadialMenuOverlay(
      makeDeps({
        getSlices: () => [slice('p1', { kind: 'appmacro', action: 'plugin-overlay:acme.calc' })],
        getPluginIcon: (id) => pluginSliceIcon(registry.get(id), manifests.get(id)),
      }),
    )
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.slices[0].iconSvg).toBe('http://x/calc.png')
  })

  it('no getPluginIcon dep: plugin slices go out unenriched', () => {
    registerRadialMenuOverlay(makeDeps({ getSlices: () => [slice('p1', { kind: 'appmacro', action: 'plugin:x' })] }))
    toggleRadialMenu()
    expect(getPendingRadialPayload()?.slices[0].iconSvg).toBeUndefined()
  })
})

describe('backdrop capture', () => {
  const image: RadialBackdropImage = {
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    origin: { x: -180, y: -80 },
    width: 560,
    height: 560,
  }
  const sendsOn = (channel: string): unknown[][] =>
    fakeOverlay.send.mock.calls.filter((c: unknown[]) => c[0] === channel)
  const openNonce = (): number | undefined =>
    (sendsOn('radial:open').at(-1)?.[1] as RadialOpenPayload | undefined)?.nonce
  const backdropSends = (): unknown[][] => sendsOn('radial:backdrop')

  it('hides this window from the screen grab for exactly as long as the grab runs', async () => {
    const setContentProtection = vi.fn()
    fakeOverlay.getWindow.mockReturnValue({ setContentProtection } as never)
    let land: (img: RadialBackdropImage | null) => void = () => {}
    const captureBackdrop = vi.fn(
      () =>
        new Promise<RadialBackdropImage | null>((r) => {
          land = r
        }),
    )
    registerRadialMenuOverlay(makeDeps({ captureBackdrop }))
    toggleRadialMenu()

    // On before the grab. The overlay is already shown and painting its own
    // tinted disc over the very pixels being cropped, so an unprotected capture
    // comes back with the menu inside it and the renderer tints it twice.
    expect(setContentProtection.mock.calls).toEqual([[true]])

    land(image)
    await vi.waitFor(() => expect(setContentProtection).toHaveBeenCalledTimes(2))
    // ...and straight back off. Leaving the window permanently unrecordable
    // would be a far worse bug than the grey disc this fixes.
    expect(setContentProtection).toHaveBeenLastCalledWith(false)
    cancelRadialMenu()
  })

  it('releases content protection even when the capture rejects', async () => {
    const setContentProtection = vi.fn()
    fakeOverlay.getWindow.mockReturnValue({ setContentProtection } as never)
    registerRadialMenuOverlay(makeDeps({ captureBackdrop: () => Promise.reject(new Error('no frame')) }))
    toggleRadialMenu()
    await vi.waitFor(() => expect(setContentProtection).toHaveBeenLastCalledWith(false))
    cancelRadialMenu()
  })

  it('forwards a capture failure on the same channel instead of going quiet', async () => {
    // The ring ignores it; the developer panel names the gate. Before this, an
    // every-open failure and a slow capture looked identical from the renderer.
    registerRadialMenuOverlay(makeDeps({ captureBackdrop: async () => ({ failure: 'focus' as const }) }))
    toggleRadialMenu()
    const nonce = openNonce()
    await vi.waitFor(() => expect(backdropSends()).toHaveLength(1))
    expect(fakeOverlay.send).toHaveBeenCalledWith('radial:backdrop', { failure: 'focus', nonce })
    cancelRadialMenu()
  })

  it('keeps the answer for the pending pull, and drops it on close', async () => {
    // The send has no queue and this lands during the lazy window's first load,
    // so the stored copy is the only thing that gets the first menu of a session
    // its backdrop.
    registerRadialMenuOverlay(makeDeps({ captureBackdrop: async () => image }))
    toggleRadialMenu()
    const nonce = openNonce()
    await vi.waitFor(() => expect(getPendingRadialState().backdrop).not.toBeNull())
    expect(getPendingRadialState()).toEqual({
      payload: getPendingRadialPayload(),
      backdrop: { ...image, nonce },
    })

    cancelRadialMenu()
    expect(getPendingRadialState()).toEqual({ payload: null, backdrop: null })
  })

  it('keeps a failure for the pending pull too', async () => {
    registerRadialMenuOverlay(makeDeps({ captureBackdrop: async () => ({ failure: 'focus' as const }) }))
    toggleRadialMenu()
    const nonce = openNonce()
    await vi.waitFor(() => expect(getPendingRadialState().backdrop).toEqual({ nonce, failure: 'focus' }))
    cancelRadialMenu()
  })

  it('a new open never serves the previous menu pixels', async () => {
    let land: (img: RadialBackdropImage) => void = () => {}
    registerRadialMenuOverlay(
      makeDeps({
        captureBackdrop: () =>
          new Promise((r) => {
            land = r as typeof land
          }),
      }),
    )
    toggleRadialMenu()
    land(image)
    await vi.waitFor(() => expect(getPendingRadialState().backdrop).not.toBeNull())

    cancelRadialMenu()
    toggleRadialMenu()
    expect(getPendingRadialState().backdrop).toBeNull()
    cancelRadialMenu()
  })

  it('a window that does not exist yet is simply unprotected, not a skipped capture', async () => {
    const captureBackdrop = vi.fn(async () => image)
    fakeOverlay.getWindow.mockReturnValue(null)
    registerRadialMenuOverlay(makeDeps({ captureBackdrop }))
    toggleRadialMenu()
    await vi.waitFor(() => expect(backdropSends()).toHaveLength(1))
    cancelRadialMenu()
  })

  it('captures around the raw open point and tags the result with that open', async () => {
    const captureBackdrop = vi.fn(async () => image)
    registerRadialMenuOverlay(makeDeps({ captureBackdrop }))
    toggleRadialMenu()

    // The RAW cursor point, not a clamped one: only the renderer knows the
    // window size, so the crop is taken wide enough to survive the clamp.
    expect(captureBackdrop).toHaveBeenCalledWith({ x: 100, y: 200 }, RADIAL_BACKDROP_HALF_PX)
    // Nothing sent yet - the open must never wait on a screen grab.
    expect(backdropSends()).toHaveLength(0)

    const nonce = openNonce()
    await vi.waitFor(() => expect(backdropSends()).toHaveLength(1))
    expect(fakeOverlay.send).toHaveBeenCalledWith('radial:backdrop', { ...image, nonce })
    cancelRadialMenu()
  })

  it('drops a capture that lands after the menu it belongs to closed', async () => {
    let land: (img: RadialBackdropImage | null) => void = () => {}
    const captureBackdrop = vi.fn(
      () =>
        new Promise<RadialBackdropImage | null>((r) => {
          land = r
        }),
    )
    registerRadialMenuOverlay(makeDeps({ captureBackdrop }))
    toggleRadialMenu()
    cancelRadialMenu()

    land(image)
    await Promise.resolve()
    await Promise.resolve()
    expect(backdropSends()).toHaveLength(0)
  })

  it('a failed capture is silent - the ring keeps its plain disc', async () => {
    const captureBackdrop = vi.fn(() => Promise.reject(new Error('no frame')))
    registerRadialMenuOverlay(makeDeps({ captureBackdrop }))
    expect(() => toggleRadialMenu()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(backdropSends()).toHaveLength(0)
    cancelRadialMenu()
  })
})

describe('fireRadialSlice', () => {
  it('hides, refocuses the game, restores the captured pointer, then fires', () => {
    const deps = makeDeps()
    registerRadialMenuOverlay(deps)
    toggleRadialMenu()
    fireRadialSlice('a')
    expect(fakeOverlay.hide).toHaveBeenCalled()
    expect(deps.warpTo).toHaveBeenCalledWith({ x: 1100, y: 1200 })
    expect(deps.focusGame).toHaveBeenCalled()
    expect(vi.mocked(deps.focusGame).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.warpTo).mock.invocationCallOrder[0],
    )
    expect(deps.fired).toEqual(['filter'])
  })

  it('routes every action kind with its arguments', () => {
    const deps = makeDeps({
      getSlices: () => [
        slice('f', { kind: 'filter' }),
        slice('p', { kind: 'pricecheck' }),
        slice('m', { kind: 'appmacro', action: 'useSavedRegex', presetId: 'x1' }),
        slice('c', { kind: 'chat', command: '/kingsmarch', autoSubmit: false }),
        slice('s', { kind: 'cheatsheet', categoryId: 'cat-1' }),
      ],
    })
    registerRadialMenuOverlay(deps)
    toggleRadialMenu()
    for (const id of ['f', 'p', 'm', 'c', 's']) fireRadialSlice(id)
    expect(deps.fired).toEqual([
      'filter',
      'pricecheck',
      'appmacro:useSavedRegex:x1',
      'chat:/kingsmarch:false',
      'cheatsheet:cat-1',
    ])
  })

  it('unknown slice id hides without firing', () => {
    const deps = makeDeps()
    registerRadialMenuOverlay(deps)
    toggleRadialMenu()
    fireRadialSlice('nope')
    expect(fakeOverlay.hide).toHaveBeenCalled()
    expect(deps.fired).toEqual([])
  })

  it('clears the warp target, so a second fire without reopening does not warp', () => {
    const deps = makeDeps()
    registerRadialMenuOverlay(deps)
    toggleRadialMenu()
    fireRadialSlice('a')
    fireRadialSlice('a')
    expect(deps.fired).toEqual(['filter', 'filter'])
    expect(deps.warpTo).toHaveBeenCalledTimes(1)
  })
})

describe('cancelRadialMenu', () => {
  it('hides, clears the pending payload, and tells the renderer to unmount', () => {
    registerRadialMenuOverlay(makeDeps())
    toggleRadialMenu()
    cancelRadialMenu()
    expect(fakeOverlay.hide).toHaveBeenCalled()
    expect(getPendingRadialPayload()).toBeNull()
    expect(fakeOverlay.send).toHaveBeenCalledWith('radial:close')
  })
})

describe('main-initiated hides', () => {
  it('onVisibilityChange(false) closes, and is idempotent', () => {
    registerRadialMenuOverlay(makeDeps())
    toggleRadialMenu()
    captured.spec?.onVisibilityChange?.(false)
    expect(getPendingRadialPayload()).toBeNull()
    expect(fakeOverlay.send).toHaveBeenCalledWith('radial:close')
    const sends = fakeOverlay.send.mock.calls.filter((c) => c[0] === 'radial:close').length
    captured.spec?.onVisibilityChange?.(false)
    expect(fakeOverlay.send.mock.calls.filter((c) => c[0] === 'radial:close')).toHaveLength(sends)
  })

  it('the close triggered by a hide does not re-enter and double-send', () => {
    registerRadialMenuOverlay(makeDeps())
    // Real windowing: hide() fires onVisibilityChange(false), which closes again.
    fakeOverlay.hide.mockImplementationOnce(() => captured.spec?.onVisibilityChange?.(false))
    toggleRadialMenu()
    cancelRadialMenu()
    expect(fakeOverlay.send.mock.calls.filter((c) => c[0] === 'radial:close')).toHaveLength(1)
  })

  it('leaving PoE closes the menu so the alt-tab restore cannot resurrect it', () => {
    registerRadialMenuOverlay(makeDeps())
    toggleRadialMenu()
    expect(captured.poeLeave).toBeTypeOf('function')
    captured.poeLeave?.()
    expect(getPendingRadialPayload()).toBeNull()
    expect(fakeOverlay.send).toHaveBeenCalledWith('radial:close')
    // hide() is what clears wasVisibleBeforeFocusLoss in the windowing layer.
    expect(fakeOverlay.hide).toHaveBeenCalled()
  })
})
