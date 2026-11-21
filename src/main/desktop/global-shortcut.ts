import { globalShortcut as electronGlobalShortcut } from 'electron'
import { layerShellServices } from './layer-shell-state'

type Shortcuts = Pick<typeof electronGlobalShortcut, 'register' | 'unregister' | 'unregisterAll' | 'isRegistered'>

/** Electron's globalShortcut has no native Wayland backend. Under layer-shell
 *  shortcuts are matched against evdev and overlay key presses instead
 *  (see NativeShortcuts). */
function backend(): Shortcuts {
  return layerShellServices()?.globalShortcut ?? electronGlobalShortcut
}

export const globalShortcut: Shortcuts = {
  register: (accelerator, callback) => backend().register(accelerator, callback),
  unregister: (accelerator) => backend().unregister(accelerator),
  unregisterAll: () => backend().unregisterAll(),
  isRegistered: (accelerator) => backend().isRegistered(accelerator),
}
