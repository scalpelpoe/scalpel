import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ host: { evdevDevices: 0, onEvdev: vi.fn(() => () => {}) } }))

vi.mock('electron-overlay-window', () => ({ setLayerShortcutHandler: vi.fn() }))
vi.mock('electron-overlay-window/dist/wayland/host', () => ({ WaylandHost: { get: () => mock.host } }))
vi.mock('../../../common/diagnostics', () => ({ reportBreadcrumb: vi.fn() }))

import { NativeLayerShortcuts } from './native-shortcuts'

/** KEY_D (keysym `d`) and its modifier state as the layer surface reports them. */
const ctrlD = {
  code: 32,
  sym: 0x64,
  mods: { ctrl: true, shift: false, alt: false, meta: false, caps: false, num: false },
}

describe('NativeLayerShortcuts', () => {
  beforeEach(() => {
    mock.host.evdevDevices = 0
  })

  it('keeps layer-surface keys as the fallback while no device is readable', () => {
    const shortcuts = new NativeLayerShortcuts()
    const callback = vi.fn()
    shortcuts.register('Ctrl+D', callback)
    shortcuts.startRawInput()

    expect(shortcuts.handleLayerKey(ctrlD)).toBe(true)
    expect(callback).toHaveBeenCalledOnce()
    shortcuts.dispose()
  })

  it('lets raw evdev own the keys once the host reports a device', () => {
    const shortcuts = new NativeLayerShortcuts()
    const callback = vi.fn()
    shortcuts.register('Ctrl+D', callback)
    shortcuts.startRawInput()
    mock.host.evdevDevices = 1

    expect(shortcuts.handleLayerKey(ctrlD)).toBe(false)
    expect(callback).not.toHaveBeenCalled()
    shortcuts.dispose()
  })
})
