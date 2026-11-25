import type { NativeInputEvent } from 'electron-overlay-window'
import { describe, expect, it, vi } from 'vitest'
import { Key } from '../input'
import { createLayerShellInput } from './input'
import { NativeShortcuts, parseAccelerator } from './shortcuts'

const KEY_LEFTCTRL = 29
const KEY_LEFTSHIFT = 42
const KEY_D = 32

describe('parseAccelerator', () => {
  it('parses modifiers, letters, digits, function keys and numpad tokens', () => {
    expect(parseAccelerator('CommandOrControl+Shift+D')).toEqual({
      keycode: Key.D,
      ctrl: true,
      shift: true,
      alt: false,
    })
    expect(parseAccelerator('Alt+7')).toEqual({ keycode: Key['7'], ctrl: false, shift: false, alt: true })
    expect(parseAccelerator('F24')?.keycode).toBe(Key.F24)
    expect(parseAccelerator('Ctrl+num5')?.keycode).toBe(Key.Numpad5)
    expect(parseAccelerator('Escape')?.keycode).toBe(Key.Escape)
  })

  it('rejects unknown keys and modifiers', () => {
    expect(parseAccelerator('Ctrl+NoSuchKey')).toBeNull()
    expect(parseAccelerator('Hyper+A')).toBeNull()
    expect(parseAccelerator('F25')).toBeNull()
    expect(parseAccelerator('')).toBeNull()
  })
})

describe('NativeShortcuts', () => {
  function setup() {
    let send: (event: NativeInputEvent) => void = () => {}
    const input = createLayerShellInput(
      {
        listen: (listener) => {
          send = listener
          return () => {}
        },
        key: () => true,
        probePointer: async () => null,
      },
      () => null,
    )
    input.start()
    return { shortcuts: new NativeShortcuts(input), send: (event: NativeInputEvent) => send(event) }
  }

  it('fires on an evdev press with exactly the bound modifiers', () => {
    const { shortcuts, send } = setup()
    const callback = vi.fn()
    expect(shortcuts.register('Ctrl+D', callback)).toBe(true)
    send({ type: 'keydown', code: KEY_LEFTCTRL, repeat: false })
    send({ type: 'keydown', code: KEY_LEFTSHIFT, repeat: false })
    send({ type: 'keydown', code: KEY_D, repeat: false })
    expect(callback).not.toHaveBeenCalled()
    send({ type: 'keyup', code: KEY_LEFTSHIFT, repeat: false })
    send({ type: 'keydown', code: KEY_D, repeat: false })
    expect(callback).toHaveBeenCalledOnce()
  })

  it('reports whether a key typed into an overlay matched, so the overlay can swallow it', () => {
    const { shortcuts } = setup()
    shortcuts.register('Escape', () => {})
    expect(shortcuts.dispatch(Key.Escape, { ctrlKey: false, shiftKey: false, altKey: false })).toBe(true)
    expect(shortcuts.dispatch(Key.A, { ctrlKey: false, shiftKey: false, altKey: false })).toBe(false)
  })

  it('refuses duplicate and unparsable accelerators and forgets unregistered ones', () => {
    const { shortcuts } = setup()
    expect(shortcuts.register('Ctrl+D', () => {})).toBe(true)
    expect(shortcuts.register('Ctrl+D', () => {})).toBe(false)
    expect(shortcuts.register('Ctrl+NoSuchKey', () => {})).toBe(false)
    shortcuts.unregister('Ctrl+D')
    expect(shortcuts.isRegistered('Ctrl+D')).toBe(false)
  })
})
