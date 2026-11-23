/** Layer-shell state without importing the native overlay module, so code
 *  that only needs to branch on it (clipboard, shortcuts, input) stays
 *  loadable without the addon. Set once by `initLayerShell`. */

import type { NativeInputEvent } from 'electron-overlay-window'

export interface LayerShellServices {
  clipboard: {
    available(): boolean
    readText(): string
    readHTML(): string
    writeText(text: string): void
    write(data: { text?: string; html?: string }): void
    clear(): void
  }
  gameHasKeyboardFocus?: () => boolean
  globalShortcut: Pick<Electron.GlobalShortcut, 'register' | 'unregister' | 'unregisterAll' | 'isRegistered'>
  /** Input, pointer and capture for the game, all through the compositor or
   *  evdev, never XWayland. */
  native: {
    listen(listener: (event: NativeInputEvent) => void): (() => void) | null
    inputDevices(): number
    key(code: number, pressed: boolean): boolean
    warpPointer(point: { x: number; y: number }): boolean
    probePointer(): Promise<{ x: number; y: number } | null>
    canCapture(): boolean
    capture(rect: Electron.Rectangle): Promise<{ width: number; height: number; data: Buffer } | null>
  }
  /** Global logical pointer position while it is over an overlay surface. */
  overlayPointer(): { x: number; y: number } | null
}

let services: LayerShellServices | null = null

export function setLayerShellServices(next: LayerShellServices): void {
  services = next
}

/** Overlays are layer-shell surfaces. Their input regions replace uiohook
 *  pointer hit testing, and game input comes from evdev instead of uiohook. */
export function layerShellActive(): boolean {
  return services !== null
}

export function layerShellServices(): LayerShellServices | null {
  return services
}
