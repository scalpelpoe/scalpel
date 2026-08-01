import { beforeEach, describe, expect, it, vi } from 'vitest'

const handles = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
const ons = new Map<string, (event: unknown, ...args: unknown[]) => void>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handles.set(channel, fn)
    },
    on: (channel: string, fn: (event: unknown, ...args: unknown[]) => void) => {
      ons.set(channel, fn)
    },
  },
}))
vi.mock('../windowing', () => ({
  getOverlayPinnedForWebContents: vi.fn((wcId: number) => wcId === 7),
  setOverlayPinnedForWebContents: vi.fn(),
}))

import { getOverlayPinnedForWebContents, setOverlayPinnedForWebContents } from '../windowing'
import { register } from './overlay-pin'

describe('overlay-pin IPC', () => {
  beforeEach(() => {
    handles.clear()
    ons.clear()
    vi.clearAllMocks()
    register()
  })

  it('get-pinned resolves by the sender webContents id', () => {
    const result = handles.get('secondary-overlay:get-pinned')?.({ sender: { id: 7 } })
    expect(result).toBe(true)
    expect(getOverlayPinnedForWebContents).toHaveBeenCalledWith(7)
  })

  it('set-pinned forwards the sender id and a coerced boolean', () => {
    ons.get('secondary-overlay:set-pinned')?.({ sender: { id: 9 } }, true)
    expect(setOverlayPinnedForWebContents).toHaveBeenCalledWith(9, true)
    ons.get('secondary-overlay:set-pinned')?.({ sender: { id: 9 } }, 'junk')
    expect(setOverlayPinnedForWebContents).toHaveBeenLastCalledWith(9, false)
  })
})
