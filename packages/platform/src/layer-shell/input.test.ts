import type { Point } from 'electron'
import type { NativeInputEvent } from 'electron-overlay-window'
import { describe, expect, it, vi } from 'vitest'
import { Key } from '../input'
import type { InputKeyEvent, InputWheelEvent } from '../types'
import { createLayerShellInput, evdevToKey, keyToEvdev, type NativeInput } from './input'

const KEY_LEFTCTRL = 29
const KEY_LEFTSHIFT = 42
const KEY_C = 46

function setup() {
  let send: (event: NativeInputEvent) => void = () => {}
  const native = {
    listen: vi.fn((listener: (event: NativeInputEvent) => void): (() => void) | null => {
      send = listener
      return () => {}
    }),
    key: vi.fn(() => true),
    probePointer: vi.fn(async (): Promise<Point | null> => ({ x: 40, y: 50 })),
  } satisfies NativeInput
  const input = createLayerShellInput(native, () => null)
  return { input, native, send: (event: NativeInputEvent) => send(event) }
}

describe('key code mapping', () => {
  it('maps scancodes and extended keys both ways', () => {
    expect(keyToEvdev(Key.C)).toBe(KEY_C)
    expect(keyToEvdev(Key.ArrowLeft)).toBe(105)
    expect(evdevToKey(105)).toBe(Key.ArrowLeft)
    expect(evdevToKey(KEY_C)).toBe(Key.C)
  })

  it('reports numpad keys as digits, which evdev cannot tell from navigation', () => {
    expect(keyToEvdev(Key.NumpadArrowLeft)).toBe(75)
    expect(evdevToKey(75)).toBe(Key.Numpad4)
  })

  it('has no code for keys outside the tables', () => {
    expect(evdevToKey(0x2ff)).toBeNull()
    expect(keyToEvdev(0)).toBeNull()
  })
})

describe('layer-shell input', () => {
  it('delivers evdev keys with the held modifiers', () => {
    const { input, send } = setup()
    const keydown = vi.fn<(e: InputKeyEvent) => void>()
    input.on('keydown', keydown)
    input.start()

    send({ type: 'keydown', code: KEY_LEFTCTRL, repeat: false })
    send({ type: 'keydown', code: KEY_C, repeat: false })

    expect(keydown).toHaveBeenLastCalledWith(expect.objectContaining({ keycode: Key.C, ctrlKey: true }))
  })

  it('fails to start without the host', () => {
    const { input, native } = setup()
    native.listen.mockReturnValueOnce(null)
    expect(() => input.start()).toThrow('not running')
  })

  it('types with the virtual keyboard, releasing modifiers last', () => {
    const { input, native } = setup()
    input.keyTap(Key.C, [Key.Ctrl])
    expect(native.key.mock.calls).toEqual([
      [KEY_LEFTCTRL, true],
      [KEY_C, true],
      [KEY_C, false],
      [KEY_LEFTCTRL, false],
    ])
  })

  it('releases a virtually held modifier with the physical key', () => {
    const { input, native, send } = setup()
    input.start()
    input.keyToggle(Key.Ctrl, 'down')
    send({ type: 'keyup', code: KEY_LEFTCTRL, repeat: false })
    send({ type: 'keyup', code: KEY_LEFTCTRL, repeat: false })
    expect(native.key.mock.calls).toEqual([
      [KEY_LEFTCTRL, true],
      [KEY_LEFTCTRL, false],
    ])
  })

  it('applies physically held modifiers to typed keys until the user releases them', () => {
    const { input, native, send } = setup()
    input.start()
    send({ type: 'keydown', code: KEY_LEFTCTRL, repeat: false })
    input.keyTap(Key.C)
    send({ type: 'keyup', code: KEY_LEFTCTRL, repeat: false })
    expect(native.key.mock.calls).toEqual([
      [KEY_LEFTCTRL, true],
      [KEY_C, true],
      [KEY_C, false],
      [KEY_LEFTCTRL, false],
    ])
  })

  it('keeps a modifier released for the game while the user still holds it', () => {
    const { input, native, send } = setup()
    input.start()
    send({ type: 'keydown', code: KEY_LEFTSHIFT, repeat: false })
    input.keyToggle(Key.Shift, 'up')
    input.keyTap(Key.C)
    expect(native.key.mock.calls).toEqual([
      [KEY_C, true],
      [KEY_C, false],
    ])
    expect(input.physicallyHeld(Key.Shift)).toBe(true)
    send({ type: 'keyup', code: KEY_LEFTSHIFT, repeat: false })
    expect(input.physicallyHeld(Key.Shift)).toBe(false)
  })

  it('releases virtual keys when input stops', () => {
    const { input, native } = setup()
    input.start()
    input.keyToggle(Key.Ctrl, 'down')
    input.stop()
    expect(native.key.mock.calls).toEqual([
      [KEY_LEFTCTRL, true],
      [KEY_LEFTCTRL, false],
    ])
  })

  it('flips the wheel direction and only probes the pointer with a modifier held', async () => {
    const { input, native, send } = setup()
    const wheel = vi.fn<(e: InputWheelEvent) => void>()
    input.on('wheel', wheel)
    input.start()

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

  it('forgets the pointer when the compositor does not reveal it', async () => {
    const { input, native } = setup()
    await input.refreshPointer()
    expect(input.lastPointer()).toEqual({ x: 40, y: 50 })
    native.probePointer.mockResolvedValueOnce(null)
    await input.refreshPointer()
    expect(input.lastPointer()).toBeNull()
  })
})
