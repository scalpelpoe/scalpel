import type { BrowserWindow } from 'electron'
import { afterAll, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  vi.stubGlobal('process', {
    ...process,
    platform: 'linux',
    env: { ...process.env, HYPRLAND_INSTANCE_SIGNATURE: 'test' },
  })
})
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(() => JSON.stringify({ tag: 'v0.56.0' })),
}))
vi.mock('electron', () => ({ app: {}, screen: {} }))
vi.mock('electron-overlay-window', () => ({ OverlayController: {} }))

import { nameHyprlandOverlay } from './hyprland'

afterAll(() => vi.unstubAllGlobals())

it('keeps compositor titles unique when annotation windows load or update the same page title', () => {
  const windows = [1, 2].map((id) => {
    const win = { id, setTitle: vi.fn(), on: vi.fn() }
    nameHyprlandOverlay(win as unknown as BrowserWindow)
    return win
  })
  const titles = () => windows.map((win) => win.setTitle.mock.lastCall![0])
  expect(new Set(titles()).size).toBe(2)
  for (const title of ['Scalpel Plugin Annotation Overlay', 'Updated annotation title']) {
    for (const win of windows) {
      const event = { preventDefault: vi.fn() }
      expect(win.on.mock.lastCall![0]).toBe('page-title-updated')
      win.on.mock.lastCall![1](event, title)
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
    expect(new Set(titles()).size).toBe(2)
    expect(titles().every((value) => value.startsWith('Scalpel Overlay'))).toBe(true)
  }
})
