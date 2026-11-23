import { UiohookKey, uIOhook } from 'uiohook-napi'
import type { InputEvents, InputHook } from './types'

/** Key codes for `InputHook`: PC scancodes as uiohook reports them. */
export const Key = UiohookKey

const register: { [K in keyof InputEvents]: (listener: InputEvents[K]) => void } = {
  keydown: (listener) => uIOhook.on('keydown', listener),
  keyup: (listener) => uIOhook.on('keyup', listener),
  mousedown: (listener) => uIOhook.on('mousedown', listener),
  mouseup: (listener) => uIOhook.on('mouseup', listener),
  mousemove: (listener) => uIOhook.on('mousemove', listener),
  wheel: (listener) => uIOhook.on('wheel', listener),
}

/** uiohook-napi's global hook. Its listeners also see the keys this process
 *  injects, so it cannot tell physical presses apart. */
export const uiohookInput: InputHook = {
  on: (event, listener) => register[event](listener),
  start: () => uIOhook.start(),
  stop: () => uIOhook.stop(),
  keyTap: (key, modifiers) => uIOhook.keyTap(key, modifiers),
  keyToggle: (key, state) => uIOhook.keyToggle(key, state),
  seesInjectedKeys: true,
  physicallyHeld: () => null,
}
