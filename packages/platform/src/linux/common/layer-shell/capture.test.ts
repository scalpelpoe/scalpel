import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSources: vi.fn(async () => [] as Array<Record<string, unknown>>),
  getDisplayNearestPoint: vi.fn(() => ({ scaleFactor: 1 })),
  targetHasFocus: true,
  targetBounds: { x: 0, y: 0, width: 100, height: 100 } as {
    x: number
    y: number
    width: number
    height: number
  } | null,
  services: null as {
    features: { screencopy: boolean; desktopCapturerSourcePickerUnsafe: boolean }
    native: { canCapture: () => boolean; capture?: (rect: unknown) => Promise<unknown> }
  } | null,
}))

vi.mock('electron', () => ({
  desktopCapturer: { getSources: mocks.getSources },
  screen: { getDisplayNearestPoint: mocks.getDisplayNearestPoint },
}))
vi.mock('electron-overlay-window', () => ({
  OverlayController: {
    get targetHasFocus() {
      return mocks.targetHasFocus
    },
    get targetBounds() {
      return mocks.targetBounds
    },
  },
}))
vi.mock('../native-overlay', () => ({
  nativeOverlayServices: () => mocks.services,
  overlayGameHasKeyboardFocus: () => false,
}))

import { captureLayerShellGame } from './capture'

beforeEach(() => {
  mocks.getSources.mockClear()
  mocks.targetHasFocus = true
  mocks.targetBounds = { x: 0, y: 0, width: 100, height: 100 }
  mocks.services = null
})

describe('captureLayerShellGame', () => {
  it('never asks desktopCapturer for sources when that would open an unsafe picker', async () => {
    mocks.services = {
      features: { screencopy: false, desktopCapturerSourcePickerUnsafe: true },
      native: { canCapture: () => false },
    }

    expect(await captureLayerShellGame()).toEqual({ frame: null, failure: 'no-source' })
    expect(mocks.getSources).not.toHaveBeenCalled()
  })

  it('uses compositor screencopy when it is available', async () => {
    const data = Buffer.from([1, 2, 3, 4])
    const capture = vi.fn(async () => ({ data, width: 200, height: 100 }))
    mocks.services = {
      features: { screencopy: true, desktopCapturerSourcePickerUnsafe: true },
      native: { canCapture: () => true, capture },
    }

    const result = await captureLayerShellGame()

    expect(capture).toHaveBeenCalledWith({ x: 0, y: 0, width: 100, height: 100 })
    expect(result).toEqual({
      frame: { data, width: 200, height: 100, gameSize: { width: 100, height: 100 }, scale: 2 },
    })
    expect(mocks.getSources).not.toHaveBeenCalled()
  })

  it('still gates capture on focus unless it is skipped', async () => {
    mocks.targetHasFocus = false
    mocks.services = {
      features: { screencopy: true, desktopCapturerSourcePickerUnsafe: false },
      native: { canCapture: () => true, capture: vi.fn(async () => null) },
    }

    expect(await captureLayerShellGame()).toEqual({ frame: null, failure: 'focus' })
  })
})
