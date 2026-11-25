import { clipboard, globalShortcut } from 'electron'
import type { Clipboard, GlobalShortcuts } from '../types'

export const electronShortcuts: GlobalShortcuts = {
  register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
  unregister: (accelerator) => globalShortcut.unregister(accelerator),
  unregisterAll: () => globalShortcut.unregisterAll(),
  isRegistered: (accelerator) => globalShortcut.isRegistered(accelerator),
}

export const electronClipboard: Clipboard = {
  readText: () => clipboard.readText(),
  readHTML: () => clipboard.readHTML(),
  writeText: (text) => clipboard.writeText(text),
  write: (data) => clipboard.write(data),
  clear: () => clipboard.clear(),
  read: (format) => clipboard.read(format),
  readBuffer: (format) => clipboard.readBuffer(format),
  readImage: () => clipboard.readImage(),
}
