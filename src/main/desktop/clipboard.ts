import { clipboard as electronClipboard } from 'electron'
import { layerShellServices } from './layer-shell-state'

/** Text clipboard for flows that exchange data with the game. On native
 *  Wayland, Chromium only sees the clipboard while one of its windows has
 *  keyboard focus, which is never the case while the game is in front, so
 *  the layer-shell host's data-control connection is used instead. */
function backend(): Pick<typeof electronClipboard, 'readText' | 'readHTML' | 'writeText' | 'write' | 'clear'> {
  const host = layerShellServices()?.clipboard
  return host?.available() ? host : electronClipboard
}

export const clipboard = {
  readText: (): string => backend().readText(),
  readHTML: (): string => backend().readHTML(),
  writeText: (text: string): void => backend().writeText(text),
  write: (data: { text?: string; html?: string }): void => backend().write(data),
  clear: (): void => backend().clear(),
}
