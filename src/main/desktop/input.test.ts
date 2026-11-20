import type { NativeInputEvent } from 'electron-overlay-window'
import { UiohookKey, type UiohookKeyboardEvent, type UiohookWheelEvent } from 'uiohook-napi'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerShellServices } from './layer-shell-state'

const KEY_LEFTCTRL = 29
const KEY_LEFTSHIFT = 42
const KEY_C = 46

async function setup() {
  vi.resetModules()
  const state = await import('./layer-shell-state')
  const input = await import('./input')
  let send: (event: NativeInputEvent) => void = () => {}
  const native = {
    listen: vi.fn((listener: (event: NativeInputEvent) => void) => {
      send = listener
      return () => {}
    }),
    inputDevices: () => 1,
    key: vi.fn(() => true),
    warpPointer: () => true,
    probePointer: vi.fn(async () => ({ x: 40, y: 50 })),
    canCapture: () => true,
    capture: async () => null,
  } satisfies LayerShellServices['native']
  state.setLayerShellServices({
    clipboard: {
      available: () => true,
      readText: () => '',
      readHTML: () => '',
      writeText: () => {},
      write: () => {},
      clear: () => {},
    },
    globalShortcut: {
      register: () => true,
      unregister: () => {},
      unregisterAll: () => {},
      isRegistered: () => false,
    },
    native,
    overlayPointer: () => null,
  })
  return { input, native, send: (event: NativeInputEvent) => send(event) }
}

describe('key code mapping', () => {
  let input: typeof import('./input')
  beforeEach(async () => {
    vi.resetModules()
    input = await import('./input')
  })

  it('maps scancodes and extended keys both ways', () => {
    expect(input.uiohookToEvdev(UiohookKey.C)).toBe(KEY_C)
    expect(input.uiohookToEvdev(UiohookKey.ArrowLeft)).toBe(105)
    expect(input.evdevToUiohook(105)).toBe(UiohookKey.ArrowLeft)
    expect(input.evdevToUiohook(KEY_C)).toBe(UiohookKey.C)
  })

  it('reports numpad keys as digits, which evdev cannot tell from navigation', () => {
    expect(input.uiohookToEvdev(UiohookKey.NumpadArrowLeft)).toBe(75)
    expect(input.evdevToUiohook(75)).toBe(UiohookKey.Numpad4)
  })

  it('has no code for keys outside the tables', () => {
    expect(input.evdevToUiohook(0x2ff)).toBeNull()
    expect(input.uiohookToEvdev(0)).toBeNull()
  })
})

describe('under layer-shell', () => {
  it('delivers evdev keys with the held modifiers', async () => {
    const { input, send } = await setup()
    const keydown = vi.fn<(e: UiohookKeyboardEvent) => void>()
    input.uIOhook.on('keydown', keydown)
    input.uIOhook.start()

    send({ type: 'keydown', code: KEY_LEFTCTRL, repeat: false })
    send({ type: 'keydown', code: KEY_C, repeat: false })

    expect(keydown).toHaveBeenLastCalledWith(expect.objectContaining({ keycode: UiohookKey.C, ctrlKey: true }))
  })

  it('types with the virtual keyboard, releasing modifiers last', async () => {
    const { input, native } = await setup()
    input.uIOhook.keyTap(UiohookKey.C, [UiohookKey.Ctrl])
    expect(native.key.mock.calls).toEqual([
      [KEY_LEFTCTRL, true],
      [KEY_C, true],
      [KEY_C, false],
      [KEY_LEFTCTRL, false],
    ])
  })

  it('releases a virtually held modifier with the physical key', async () => {
    const { input, native, send } = await setup()
    input.uIOhook.start()
    input.uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    send({ type: 'keyup', code: KEY_LEFTCTRL, repeat: false })
    send({ type: 'keyup', code: KEY_LEFTCTRL, repeat: false })
    expect(native.key.mock.calls).toEqual([
      [KEY_LEFTCTRL, true],
      [KEY_LEFTCTRL, false],
    ])
  })

  it('applies physically held modifiers to typed keys until the user releases them', async () => {
    const { input, native, send } = await setup()
    input.uIOhook.start()
    send({ type: 'keydown', code: KEY_LEFTCTRL, repeat: false })
    input.uIOhook.keyTap(UiohookKey.C)
    send({ type: 'keyup', code: KEY_LEFTCTRL, repeat: false })
    expect(native.key.mock.calls).toEqual([
      [KEY_LEFTCTRL, true],
      [KEY_C, true],
      [KEY_C, false],
      [KEY_LEFTCTRL, false],
    ])
  })

  it('keeps a modifier released for the game while the user still holds it', async () => {
    const { input, native, send } = await setup()
    input.uIOhook.start()
    send({ type: 'keydown', code: KEY_LEFTSHIFT, repeat: false })
    input.uIOhook.keyToggle(UiohookKey.Shift, 'up')
    input.uIOhook.keyTap(UiohookKey.C)
    expect(native.key.mock.calls).toEqual([
      [KEY_C, true],
      [KEY_C, false],
    ])
    expect(input.uIOhook.physicallyHeld(UiohookKey.Shift)).toBe(true)
    send({ type: 'keyup', code: KEY_LEFTSHIFT, repeat: false })
    expect(input.uIOhook.physicallyHeld(UiohookKey.Shift)).toBe(false)
  })

  it('releases virtual keys when input stops', async () => {
    const { input, native } = await setup()
    input.uIOhook.start()
    input.uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    input.uIOhook.stop()
    expect(native.key.mock.calls).toEqual([
      [KEY_LEFTCTRL, true],
      [KEY_LEFTCTRL, false],
    ])
  })

  it('flips the wheel direction and only probes the pointer with a modifier held', async () => {
    const { input, native, send } = await setup()
    const wheel = vi.fn<(e: UiohookWheelEvent) => void>()
    input.uIOhook.on('wheel', wheel)
    input.uIOhook.start()

    send({ type: 'wheel', delta: 1, horizontal: false })
    expect(wheel).toHaveBeenLastCalledWith(expect.objectContaining({ rotation: -1, x: 0, y: 0 }))
    expect(native.probePointer).not.toHaveBeenCalled()

    send({ type: 'keydown', code: KEY_LEFTCTRL, repeat: false })
    send({ type: 'wheel', delta: -1, horizontal: false })
    await vi.waitFor(() =>
      expect(wheel).toHaveBeenLastCalledWith(expect.objectContaining({ rotation: 1, x: 40, y: 50, ctrlKey: true })),
    )
    expect(native.probePointer).toHaveBeenCalledOnce()
  })
})
